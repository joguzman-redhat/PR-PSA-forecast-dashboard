// Ejecutar solo contra el PostgreSQL efimero del runner, nunca contra forecast local.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { crearApp } = require('../src/server');
const { pool } = require('../src/db');
let server, base;
const ids = {};
before(async () => {
  assert.equal(process.env.FORECAST_ISOLATED_TEST, 'true', 'Requiere el runner aislado');
  const cargar = async (anio, archivo, hash, pm, commit, previo) => {
    const c = (await pool.query(`INSERT INTO carga(anio_forecast,archivo_id,datos_hash,archivo_nombre)
      VALUES($1,$2,$3,$4) RETURNING id`, [anio, archivo, hash, 'Ficticio FY' + anio])).rows[0].id;
    const p = (await pool.query(`INSERT INTO proyecto(clave,num_pa,nombre,pm_lider,fecha_fin,estado,zona,ultima_carga_id)
      VALUES('pa:123','123','Ficticio',$1,'2028-03-31','In Progress','Demo',$2)
      ON CONFLICT(clave) DO UPDATE SET pm_lider=EXCLUDED.pm_lider,ultima_carga_id=EXCLUDED.ultima_carga_id RETURNING id`, [pm,c])).rows[0].id;
    await pool.query(`INSERT INTO revenue_mes SELECT $1,$2,n,CASE WHEN n=1 THEN $3::numeric ELSE 0 END,0 FROM generate_series(1,12) n`, [c,p,commit]);
    await pool.query('INSERT INTO revenue_anual VALUES($1,$2,1000,$3,$4,$5)', [c,p,previo,1000-previo-commit,previo+commit]);
    return c;
  };
  ids.legacy = await cargar(2026,null,'legacy','PM antiguo',20,5);
  ids.a = await cargar(2026,'source26','a','PM FY26 inicial',100,50);
  ids.b = await cargar(2027,'source27','b','PM FY27 inicial',200,160);
  ids.c = await cargar(2026,'source26','c','PM FY26 actual',110,50);
  ids.d = await cargar(2027,'source27','d','PM FY27 actual',210,160);
  await pool.query("UPDATE carga SET ejecucion_id=CASE WHEN id=ANY($1::bigint[]) THEN 'inicial' ELSE 'actualizacion' END WHERE archivo_id IS NOT NULL",[[ids.a,ids.b]]);
  server = crearApp().listen(0,'127.0.0.1'); await once(server,'listening');
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  if (server) { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
  await pool.end();
});
async function get(path, status=200) {const r=await fetch(base+path);const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}

test('catalogo muestra años, fuentes y el historico de procedencia desconocida', async () => {
  const d=await get('/api/forecasts');assert.deepEqual(d.anios,[2026,2027]);assert.equal(d.fuentes.length,3);
  assert.ok(d.fuentes.some(f=>f.anio_forecast===2026&&f.archivo_id===null));
});
test('por defecto sigue consultando FY26 aunque FY27 sea la carga global mas reciente', async () => {
  const d=await get('/api/proyectos');assert.equal(d.meta.carga_id,ids.c);assert.equal(d.meta.anio_forecast,2026);
  assert.equal(d.proyectos[0].pm_lider,'PM FY26 actual');assert.equal(d.proyectos[0].fecha_fin,'03/31/2028');
});
test('los atributos y el calendario se consultan por año sin usar el ultimo PM global', async () => {
  const a=await get('/api/proyectos?anio=2026');const b=await get('/api/proyectos?anio=2027');
  assert.equal(a.proyectos[0].pm_lider,'PM FY26 actual');assert.equal(b.proyectos[0].pm_lider,'PM FY27 actual');
  const ra=await get('/api/backlog?anio=2026');const rb=await get('/api/backlog?anio=2027');
  assert.equal(ra.backlog[0].enero_fijo,110);assert.equal(rb.backlog[0].enero_fijo,210);
  assert.equal(rb.backlog[0].acumulado_anterior,160);assert.ok(!Object.hasOwn(rb.backlog[0],'acum_2025'));
  assert.equal(rb.backlog[0].q1,210);assert.equal(rb.backlog[0].backlog,630);
});
test('puede elegirse explicitamente el historico legacy sin mezclarlo con la nueva fuente', async () => {
  const d=await get('/api/backlog?anio=2026&archivo_id=');assert.equal(d.meta.carga_id,ids.legacy);assert.equal(d.backlog[0].enero_fijo,20);
});
test('una captura fijada da datos consistentes en los tres endpoints', async () => {
  for(const endpoint of ['proyectos','backlog','historia']){
    const d=await get(`/api/${endpoint}?anio=2026&archivo_id=source26&carga_id=${ids.a}`);
    assert.equal(d.meta.carga_id,ids.a);
    if(endpoint==='proyectos')assert.equal(d.proyectos[0].pm_lider,'PM FY26 inicial');
    if(endpoint==='backlog')assert.equal(d.backlog[0].enero_fijo,100);
    if(endpoint==='historia')assert.equal(d.snapshots.length,1);
  }
});
test('historia y cache mantienen años y fuentes aislados', async () => {
  for(const anio of [2026,2027,2026]){
    const d=await get(`/api/historia?anio=${anio}`);assert.equal(d.snapshots.length,2);assert.equal(d.eventos.length,1);
    assert.ok(d.snapshots.every(s=>s.anio_forecast===anio));assert.equal(d.eventos[0].delta,10);
    assert.equal(d.snapshots.at(-1).totales.acumulado_anterior,anio===2026?50:160);
    assert.equal(d.snapshots.at(-1).totales.fijo,anio===2026?110:210);
  }
});
test('sin datos devuelve vacio explicito y no cae a otro año', async () => {
  for(const endpoint of ['proyectos','backlog','historia']){
    const d=await get(`/api/${endpoint}?anio=2028`);assert.equal(d.meta.estado,'sin_datos');assert.equal(d.meta.anio_forecast,2028);
    assert.equal((d[endpoint]||d.snapshots).length,0);
  }
});
test('rechaza parametros invalidos y cargas de otra fuente', async () => {
  for(const query of ['anio=hola','anio=2026&anio=2027','anio=1999','anio=2026&archivo_id[]=a','carga_id=NaN'])await get('/api/proyectos?'+query,400);
  await get('/api/proyectos?anio=2026&archivo_id=source26&carga_id='+ids.d,404);
});

test('timeline combina 24 meses por PA sin duplicar Booking ni acumulados anuales', async()=>{
  const d=await get('/api/timeline');assert.equal(d.proyectos.length,1);assert.equal(d.backlog.length,1);
  assert.equal(d.meta.periodos.length,24);assert.equal(d.meta.periodos[0],'2026-01');assert.equal(d.meta.periodos.at(-1),'2027-12');
  const b=d.backlog[0];assert.equal(b['2026-01_fijo'],110);assert.equal(b['2027-01_fijo'],210);
  assert.equal(b.valor_of,1000);
  const actual=d.meta.anio_actual;
  if(actual===2026){assert.equal(d.proyectos[0].pm_lider,'PM FY26 actual');assert.equal(b.acumulado_anterior,50);}
  assert.equal(d.historia.snapshots.at(-1).totales.fijo,320);
  assert.equal(new Set(d.historia.snapshots.map(s=>s.etiqueta)).size,d.historia.snapshots.length);
  assert.equal(d.historia.snapshots.length,2);
  assert.ok(d.historia.snapshots.every(s=>!s.etiqueta.includes('FY')&&s.cargas_incluidas.length===2));
  assert.deepEqual(d.historia.snapshots.at(-1).anios_actualizados,[2026,2027]);
  assert.deepEqual(d.historia.eventos.map(e=>[e.campo,e.tipo,e.delta]),[['2026-01','commit',10],['2027-01','commit',10]]);
});
test('rango entre años y quarters conserva fechas completas y valida los limites',async()=>{
  const d=await get('/api/timeline?desde=2026-10&hasta=2027-12');
  assert.equal(d.meta.periodos_seleccionados.length,15);
  assert.equal(d.meta.periodos_seleccionados[0],'2026-10');
  for(const q of ['desde=2027-13','hasta=hola','desde=2027-12&hasta=2026-01','desde[]=2026-01'])await get('/api/timeline?'+q,400);
});
test('atributos priorizan año actual, luego pasado mas cercano y finalmente futuro',()=>{
  const {preferir}=require('../src/timeline');
  const rows=[2028,2025,2027,2026].map(anio_forecast=>({anio_forecast,carga_id:anio_forecast}));
  rows.sort((a,b)=>preferir(a,b,2026));assert.deepEqual(rows.map(r=>r.anio_forecast),[2026,2025,2027,2028]);
  rows.sort((a,b)=>preferir(a,b,2027));assert.equal(rows[0].anio_forecast,2027);
});
test('agregar FY28 extiende el calendario sin volver a cargar FY26/FY27',async()=>{
  const c=(await pool.query("INSERT INTO carga(anio_forecast,archivo_id,datos_hash) VALUES(2028,'source28','timeline28') RETURNING id")).rows[0].id;
  const p=(await pool.query("UPDATE proyecto SET pm_lider='PM futuro FY28',ultima_carga_id=$1 WHERE clave='pa:123' RETURNING id",[c])).rows[0].id;
  await pool.query('INSERT INTO revenue_mes SELECT $1,$2,n,CASE WHEN n=1 THEN 300 ELSE 0 END,0 FROM generate_series(1,12)n',[c,p]);
  await pool.query('INSERT INTO revenue_anual VALUES($1,$2,1500,400,800,700)',[c,p]);
  const d=await get('/api/timeline');assert.equal(d.meta.periodos.length,36);
  const b=d.backlog[0];assert.equal(b['2026-01_fijo'],110);assert.equal(b['2027-01_fijo'],210);assert.equal(b['2028-01_fijo'],300);
  if(d.meta.anio_actual===2026)assert.equal(b.valor_of,1000);
});
test('sin PA se usa Project ID y no se unen proyectos solo por compartir nombre',async()=>{
  const c=(await pool.query("SELECT id FROM carga WHERE archivo_id='source28'")).rows[0].id;
  await pool.query("INSERT INTO proyecto(clave,nombre,project_id,ultima_carga_id) VALUES('pr:a','Nombre igual','PR-A',$1),('pr:b','Nombre igual','PR-B',$1)",[c]);
  const d=await get('/api/timeline');assert.ok(d.proyectos.some(p=>p.clave_timeline==='PR:PR-A'));assert.ok(d.proyectos.some(p=>p.clave_timeline==='PR:PR-B'));
});


test('el timeline no rellena importes ausentes con cifras crudas de Info Proyectos',()=>{
  const {construirEstado}=require('../src/timeline');
  const d=construirEstado([{id:1}], [{carga_id:1,clave_proyecto:'PA:1',anio_forecast:2026,valor_of:null,backlog:null,acumulado_anterior:null,
    atributos:{num_pa:'1',nombre:'Demo',valor_of:9999,ejecucion_deseada:8888,datos_info:{valor_of:7777}}}],[],['2026-01'],2026,'2026-11-22');
  assert.equal(d.proyectos[0].valor_of,null);assert.equal(d.backlog[0].valor_of,null);
  assert.equal(Object.hasOwn(d.proyectos[0],'ejecucion_deseada'),false);assert.equal(d.backlog[0]['2026-01_fijo'],null);
});

// Identidad por Project ID (ADR 0003). Cada prueba usa Años fuente propios para no tocar los demas.
async function cargarProyecto(anio, {clave, pa, pr, nombre, commit}) {
  let c = (await pool.query('SELECT id FROM carga WHERE anio_forecast=$1 AND archivo_id=$2', [anio, 'source' + anio])).rows[0]?.id;
  c ??= (await pool.query("INSERT INTO carga(anio_forecast,archivo_id,datos_hash) VALUES($1,$2,$3) RETURNING id", [anio, 'source' + anio, 'id' + anio])).rows[0].id;
  const p = (await pool.query(`INSERT INTO proyecto(clave,num_pa,project_id,nombre,ultima_carga_id) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(clave) DO UPDATE SET ultima_carga_id=EXCLUDED.ultima_carga_id RETURNING id`, [clave, pa, pr, nombre, c])).rows[0].id;
  await pool.query('INSERT INTO revenue_mes SELECT $1,$2,n,CASE WHEN n=1 THEN $3::numeric ELSE 0 END,0 FROM generate_series(1,12)n', [c, p, commit]);
  await pool.query('INSERT INTO revenue_anual VALUES($1,$2,1000,0,0,0)', [c, p]);
  return c;
}
const porNombre = (d, nombre) => d.proyectos.filter(p => p.nombre_del_proyecto === nombre);
test('el mismo Project ID con distinto PA entre FY29 y FY30 es un solo proyecto', async () => {
  await cargarProyecto(2029, {clave: 'pa:4001', pa: '4001', pr: 'PR-CAMBIA', nombre: 'Cambia de PA', commit: 11});
  await cargarProyecto(2030, {clave: 'pa:4002', pa: '4002', pr: 'pr-cambia ', nombre: 'Cambia de PA', commit: 22});
  const d = await get('/api/timeline');
  const ps = porNombre(d, 'Cambia de PA');
  assert.equal(ps.length, 1);
  assert.equal(ps[0].clave_timeline, 'PR:PR-CAMBIA');
  assert.equal(ps[0].sin_identificar, false);
  const b = d.backlog.find(x => x.clave_timeline === 'PR:PR-CAMBIA');
  assert.equal(b['2029-01_fijo'], 11);assert.equal(b['2030-01_fijo'], 22);
  assert.ok(d.historia.series_por_proyecto['PR:PR-CAMBIA']);
  assert.ok(!d.historia.series_por_proyecto['PA:4001'] && !d.historia.series_por_proyecto['PA:4002']);
});
test('sin Project ID cae al PA; sin ambos queda sin identificar y marcado', async () => {
  await cargarProyecto(2031, {clave: 'pa:4003', pa: '4003', pr: null, nombre: 'Solo PA', commit: 1});
  await cargarProyecto(2031, {clave: 'nombre:huerfano', pa: null, pr: null, nombre: 'Huerfano', commit: 2});
  await pool.query("UPDATE proyecto SET num_pa='#N/A', project_id='  ' WHERE clave='nombre:huerfano'");
  const d = await get('/api/timeline');
  const soloPa = porNombre(d, 'Solo PA')[0], h = porNombre(d, 'Huerfano');
  assert.equal(soloPa.clave_timeline, 'PA:4003');assert.equal(soloPa.sin_identificar, false);
  assert.equal(h.length, 1);assert.match(h[0].clave_timeline, /^SIN_ID:2031:\d+$/);assert.equal(h[0].sin_identificar, true);
  assert.equal(d.backlog.find(b => b.clave_timeline === h[0].clave_timeline).sin_identificar, true);
});
test('un Project ID con dos PA en una Carga es un solo proyecto con el PA de la fila mas reciente', async () => {
  await cargarProyecto(2032, {clave: 'pa:4004', pa: '4004', pr: 'PR-DOBLE', nombre: 'Doble PA', commit: 5});
  await cargarProyecto(2032, {clave: 'pa:4005', pa: '4005', pr: 'PR-DOBLE', nombre: 'Doble PA', commit: 7});
  const d = await get('/api/timeline');
  const ps = porNombre(d, 'Doble PA');
  assert.equal(ps.length, 1);assert.equal(ps[0].clave_timeline, 'PR:PR-DOBLE');assert.equal(ps[0].num_pa, '4005');
  assert.equal(d.backlog.find(b => b.clave_timeline === 'PR:PR-DOBLE')['2032-01_fijo'], 7);
});

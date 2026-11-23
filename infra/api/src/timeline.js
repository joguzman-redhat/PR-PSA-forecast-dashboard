const { pool } = require('./db');
const { proyectoBase, columnasDerivadas } = require('./routes/proyectos');
const { MESES } = require('./dominio');
function error(message) { return Object.assign(new Error(message),{status:400}); }
function validarRango(query) {
  const rango={};
  for(const name of ['desde','hasta']) if(query[name]!==undefined){
    const v=query[name];if(typeof v!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(v))throw error(name+' requiere YYYY-MM');rango[name]=v;
  }
  if(rango.desde && rango.hasta && rango.desde>rango.hasta)throw error('desde no puede ser posterior a hasta');
  return rango;
}
function calendario(desde,hasta) {
  if(!desde||!hasta)return [];
  const [y,m]=desde.split('-').map(Number);let n=y*12+m-1;
  const [fy,fm]=hasta.split('-').map(Number);const fin=fy*12+fm-1;
  if(fin-n>1211)throw error('Rango demasiado amplio');
  const result=[];for(;n<=fin;n++)result.push(`${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`);return result;
}
function ordenAnio(anio,actual){return [anio===actual?0:anio<actual?1:2,Math.abs(anio-actual)];}
function preferir(a,b,actual){const x=ordenAnio(a.anio_forecast,actual),y=ordenAnio(b.anio_forecast,actual);return x[0]-y[0]||x[1]-y[1]||b.carga_id-a.carga_id;}
function construirEstado(cargas,atributos,mensuales,periodos,actual,fecha) {
  const byCarga=new Set(cargas.map(c=>c.id));
  const elegibles=atributos.filter(a=>byCarga.has(a.carga_id));
  const preferred=new Map(), identidades=new Set();
  for(const a of elegibles){
    const identidad=a.carga_id+'|'+a.clave_proyecto;if(identidades.has(identidad))throw new Error('Identidad de proyecto duplicada en captura '+a.carga_id);identidades.add(identidad);const old=preferred.get(a.clave_proyecto);if(!old||preferir(a,old,actual)<0)preferred.set(a.clave_proyecto,a);}
  const porProyecto=new Map();
  for(const r of mensuales)if(byCarga.has(r.carga_id)){
    if(!porProyecto.has(r.clave_proyecto))porProyecto.set(r.clave_proyecto,new Map());
    porProyecto.get(r.clave_proyecto).set(r.periodo,r);
  }
  const proyectos=[],backlog=[];
  for(const [key,a] of preferred){
    const campos=proyectoBase(a.atributos);
    // No se permiten importes crudos de Info Proyectos en la salida consolidada.
    for(const k of ['valor_of','valor_of_anterior','consumido_2025','backlog_2026','acumulado_a_hoy','ejecucion_deseada','diferencias_acumulado_of','consumido_2025_ref','dif_consumido_2025'])delete campos[k];
    const months=porProyecto.get(key)||new Map();
    const serie=periodos.map(periodo=>{const r=months.get(periodo);return {periodo,commit:r?.commit_usd??null,upside:r?.upside_usd??null,disponible:!!r};});
    const mesesActuales=[...months.values()].filter(r=>Number(r.periodo.slice(0,4))===a.anio_forecast&&r.periodo<=fecha.slice(0,7));
    const acumulado=a.acumulado_anterior==null?null:a.acumulado_anterior+mesesActuales.reduce((s,r)=>s+(r.commit_usd||0),0);
    const b={num_pa:campos.num_pa,nombre_del_proyecto:campos.nombre_del_proyecto,_tipo_fila:campos._tipo_fila||'proyecto',
      clave_timeline:key,anio_atributos:a.anio_forecast,valor_of:a.valor_of,acumulado_anterior:a.acumulado_anterior,
      backlog:a.backlog,total_ejecutado_acumulado:a.total_ejecutado_acumulado,acumulado_a_fecha:acumulado,meses:serie};
    for(const r of serie){b[r.periodo+'_fijo']=r.commit;b[r.periodo+'_upside']=r.upside;}
    proyectos.push({...campos,clave_timeline:key,anio_atributos:a.anio_forecast,valor_of:a.valor_of,
      acumulado_anterior:a.acumulado_anterior,backlog:a.backlog,_origen_atributos:a.origen});
    backlog.push(b);
  }
  return {proyectos,backlog};
}
function construirHistoria(cargas,atributos,mensuales,periodos,actual,fecha) {
  // Vector de capturas disponible en cada fecha. Un año aun no cargado queda sin cobertura.
  const years=[...new Set(cargas.map(c=>c.anio_forecast))];
  const latest=new Map(),snapshots=[],series={},eventos=[];let previous=null;
  for(const c of cargas){
    latest.set(c.anio_forecast,c);
    const state=construirEstado([...latest.values()],atributos,mensuales,periodos,actual,fecha);
    const id='t'+c.id,por_mes=Object.fromEntries(periodos.map(p=>[p,{fijo:0,upside:0}]));
    let fijo=0,upside=0,backlog=0,total=0;
    const now=new Map();
    for(const b of state.backlog){
      const meses=b.meses.map(r=>[r.commit,r.upside]);
      const entry={snapshot_id:id,meses,fijo:0,upside:0,total:b.total_ejecutado_acumulado,backlog:b.backlog};
      b.meses.forEach(r=>{entry.fijo+=r.commit||0;entry.upside+=r.upside||0;por_mes[r.periodo].fijo+=r.commit||0;por_mes[r.periodo].upside+=r.upside||0;});
      (series[b.clave_timeline]||= []).push(entry);now.set(b.clave_timeline,entry);
      fijo+=entry.fijo;upside+=entry.upside;backlog+=b.backlog||0;total+=b.total_ejecutado_acumulado||0;
      const old=previous?.get(b.clave_timeline);
      if(old)meses.forEach((par,i)=>{for(const [index,tipo] of [[0,'commit'],[1,'upside']]){
        const before=old.meses[i]?.[index],after=par[index];
        if(before!=null&&after!=null&&Math.abs(after-before)>=.005)eventos.push({snapshot_id:id,timestamp:c.ejecutada_en,
          num_pa:b.clave_timeline,nombre:b.nombre_del_proyecto,campo:periodos[i],tipo,valor_anterior:before,valor_nuevo:after,delta:after-before});
      }});
    }
    snapshots.push({id,timestamp:c.ejecutada_en,etiqueta:c.etiqueta+' · '+id,tipo:c.tipo,anios_disponibles:[...latest.keys()].sort(),proyectos_activos:state.proyectos.length,
      totales:{fijo,upside,backlog,total},por_mes});previous=now;
  }
  return {meta:{total_snapshots:snapshots.length,total_proyectos:Object.keys(series).length,total_eventos:eventos.length,aviso:'Las capturas anteriores al alta de un año no incluyen su revenue; los meses sin cobertura no representan cero.'},snapshots,series_por_proyecto:series,eventos};
}
async function obtenerTimeline(query={}) {
  const rango=validarRango(query);
  const client=await pool.connect();
  try{
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const {rows:cargasActuales}=await client.query('SELECT * FROM v_carga_timeline ORDER BY anio_forecast');
    const clock=(await client.query("SELECT to_char(now() AT TIME ZONE 'America/Bogota','YYYY-MM-DD') AS fecha")).rows[0].fecha;
    const actual=Number(clock.slice(0,4));
    const years=cargasActuales.map(c=>c.anio_forecast);
    const periodos=years.length?calendario(Math.min(...years)+'-01',Math.max(...years)+'-12'):[];
    const desde=rango.desde||periodos[0]||null,hasta=rango.hasta||periodos.at(-1)||null;
    const visibles=periodos.filter(p=>(!desde||p>=desde)&&(!hasta||p<=hasta));
    const {rows:cargas}=await client.query(`SELECT c.* FROM carga c JOIN v_carga_timeline a
      ON a.anio_forecast=c.anio_forecast AND a.archivo_id IS NOT DISTINCT FROM c.archivo_id
      WHERE EXISTS(SELECT 1 FROM proyecto_snapshot s WHERE s.carga_id=c.id) ORDER BY c.id`);
    const ids=cargas.map(c=>c.id);
    const {rows:atributos}=await client.query(`SELECT forecast_clave_timeline(s.atributos,s.proyecto_id,c.anio_forecast) AS clave_proyecto,
      s.atributos,s.origen,s.proyecto_id,c.id AS carga_id,c.anio_forecast,ra.valor_of,ra.acum_2025 AS acumulado_anterior,
      ra.backlog,ra.total_ejecutado_acumulado FROM proyecto_snapshot s JOIN carga c ON c.id=s.carga_id
      LEFT JOIN revenue_anual ra ON ra.carga_id=c.id AND ra.proyecto_id=s.proyecto_id WHERE c.id=ANY($1::bigint[])`,[ids]);
    const {rows:mensuales}=await client.query(`SELECT forecast_clave_timeline(s.atributos,r.proyecto_id,c.anio_forecast) AS clave_proyecto,
      r.carga_id,to_char(make_date(c.anio_forecast,r.mes,1),'YYYY-MM') AS periodo,r.commit_usd,r.upside_usd
      FROM revenue_mes r JOIN carga c ON c.id=r.carga_id JOIN proyecto_snapshot s ON s.carga_id=r.carga_id AND s.proyecto_id=r.proyecto_id
      WHERE c.id=ANY($1::bigint[]) ORDER BY c.id,r.proyecto_id,r.mes`,[ids]);
    const {rows:materializados}=await client.query("SELECT clave_proyecto,carga_id,to_char(periodo,'YYYY-MM') AS periodo,commit_usd,upside_usd FROM v_revenue_timeline");
    const current=construirEstado(cargasActuales,atributos,materializados,periodos,actual,clock);
    const historia=construirHistoria(cargas,atributos,mensuales,periodos,actual,clock);
    await client.query('COMMIT');
    return {meta:{timeline:true,estado:current.proyectos.length?'disponible':'sin_datos',anio_actual:actual,fecha_referencia:clock,
      anios:years,periodos,desde,hasta,periodos_seleccionados:visibles,
      criterio_atributos:'año actual; anterior mas cercano; futuro mas cercano',
      columnas:columnasDerivadas(current.proyectos.filter(p=>p._tipo_fila==='proyecto')).filter(c=>!['clave_timeline','anio_atributos'].includes(c.key)),
      capturas:cargasActuales.map(c=>({anio:c.anio_forecast,carga_id:c.id})),total_proyectos:current.proyectos.length},...current,historia};
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
module.exports={obtenerTimeline,validarRango,calendario,construirEstado,preferir};

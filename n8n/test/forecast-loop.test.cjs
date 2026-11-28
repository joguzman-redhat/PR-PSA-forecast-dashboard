const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { workflow } = require('./forecast-fixture.cjs');

// Ejecuta los nodos reales de control/normalizacion/hash/SQL en el motor n8n.
// Solo Drive, extraccion XLSX y llamadas PostgreSQL se sustituyen por dobles.
// Sin red, credenciales, volumenes ni base SQLite de la instancia del usuario.
const container = 'forecast-loop-test-' + randomUUID();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forecast-loop-'));
fs.chmodSync(dir, 0o755);
let started = false;
let postgresStarted = false;
const postgres = container + '-pg';
function podman(args, input) {
  const r = spawnSync('podman', args, { input, encoding: 'utf8', timeout: 120000, maxBuffer: 24 * 1024 * 1024 });
  if (r.error) throw r.error;
  assert.equal(r.status, 0, (r.stderr + '\n' + r.stdout).slice(-8000));
  return r.stdout;
}
before(async () => {
  podman(['run','-d','--rm','--name',postgres,'--network','none',
    '--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust',
    'docker.io/library/postgres:16-alpine']);
  postgresStarted = true;
  let ready = false;
  for(let i=0;i<100;i++) {
    if(spawnSync('podman',['exec',postgres,'pg_isready','-h','127.0.0.1','-U','postgres']).status===0){ready=true;break;}
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  assert.ok(ready, 'Postgres temporal no disponible');
  podman(['exec','-i',postgres,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres'],
    fs.readFileSync(path.join(__dirname,'../../infra/db/init/01_schema.sql'),'utf8'));
  podman(['run', '-d', '--rm', '--name', container, '--network', 'container:'+postgres,
    '--tmpfs', '/home/node/.n8n:mode=0777',
    '-v', dir + ':/fixtures:ro,z', '-e', 'N8N_RUNNERS_ENABLED=false',
    '-e', 'N8N_DIAGNOSTICS_ENABLED=false', '-e', 'N8N_VERSION_NOTIFICATIONS_ENABLED=false',
    '--entrypoint', 'sh', 'docker.io/n8nio/n8n:latest', '-c', 'sleep 900']);
  started = true;
});
after(() => {
  if (started) podman(['rm', '-f', container]);
  if (postgresStarted) podman(['rm','-f',postgres]);
  fs.rmSync(dir, { recursive: true, force: true });
});
function fixture(changed, validar = false, realPostgres = false) {
  const w = structuredClone(workflow);
  const reachable = new Set();
  function walk(name) {
    if (reachable.has(name)) return;
    reachable.add(name);
    for (const branch of w.connections[name]?.main || []) for (const edge of branch) walk(edge.node);
  }
  walk('Manual Trigger');
  w.nodes = w.nodes.filter(n => reachable.has(n.name));
  w.connections = Object.fromEntries(Object.entries(w.connections).filter(([name]) => reachable.has(name)));
  w.id = randomUUID(); w.active = false; w.pinData = {}; w.settings = { executionOrder: 'v1' };
  function code(name, jsCode) {
    const n = w.nodes.find(n => n.name === name);
    n.type = 'n8n-nodes-base.code'; n.typeVersion = 2;
    n.parameters = { mode: 'runOnceForAllItems', jsCode };
    delete n.credentials;
  }
  if (validar) {
    const n = w.nodes.find(n => n.name === 'Configurar Fuente Forecast');
    n.parameters.jsCode = n.parameters.jsCode.replace("const MODO = 'cargar';", "const MODO = 'validar';");
  }
  code('Descargar data.xlsx de Drive', 'return $input.all();');
  const rows = `const fuente = $json._fuente;
const anio = fuente.anio_forecast;
const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
return Array.from({length:10}, (_,i) => ({json:{
  '# PA': String(100+i), 'Nombre del Proyecto': 'Ficticio '+i, 'PM/Líder': 'PM'+anio,
  'Valor OF': anio, 'Fecha fin':'12/31/2027',
  ...(anio===2026 ? {'Acum 2025':100,'Backlog 2026':1876,'TOTAL EJECUTADO ACUMULADO':150}
    : {'Total Ejecutado Acumulado 2025-2026':200,'Backlog 2027':1777,'TOTAL EJECUTADO ACUMULADO 2025-2026-2027':250}),
  ...Object.fromEntries(meses.map((m,n)=>[m,n?0:50])),
  ...Object.fromEntries(meses.map((m,n)=>[n?'Upside_'+n:'Upside',0])),
},pairedItem:{item:0}}));`;
  code('Extraer Info Proyectos', rows);
  code('Extraer BackLog NOLA', rows);
  // Evalua la misma expresion de parametros que usa el nodo PostgreSQL real.
  const replacement = workflow.nodes.find(n=>n.name==='Obtener Ultimo Hash').parameters.options.queryReplacement;
  const expr = replacement.replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '');
  code('Obtener Ultimo Hash', `const parametros = (${expr});
const data = $('Calcular Hash').item.json;
if (parametros[0] !== data._fuente.anio_forecast || parametros[1] !== data._fuente.archivo_id) throw new Error('Hash consultado para otra fuente');
return [{json:{datos_hash: ${JSON.stringify(changed)}.includes(data._fuente.anio_forecast) ? 'hash-anterior' : data._hash}}];`);
  code('Ejecutar Carga en Postgres', `const data = $('Calcular Hash').item.json;
const anio = data._fuente.anio_forecast;
if (!$json.sql.includes(data._fuente.archivo_id) || !$json.sql.includes('PM'+anio) || $json.sql.includes('PM'+(anio===2026?2027:2026))) throw new Error('SQL de otra iteracion');
return [{json:{carga_id:anio,anio_forecast:anio,archivo_id:data._fuente.archivo_id,archivo_nombre:data._fuente.archivo_nombre,proyectos:10,filas_revenue:120,movimientos:0}}];`);
  if (realPostgres) {
    for (const name of ['Obtener Ultimo Hash','Ejecutar Carga en Postgres']) {
      const original = structuredClone(workflow.nodes.find(n=>n.name===name));
      original.credentials = {postgres:{id:'forecastlooptestpg',name:'Postgres aislado'}};
      w.nodes[w.nodes.findIndex(n=>n.name===name)] = original;
    }
  }
  // Aserciones dentro del motor, sin depender del formato de logs de la CLI.
  const final = w.nodes.find(n=>n.name==='Resumen Actualizacion Forecast');
  final.parameters.jsCode += `
const resumen = $input.all().map(i=>i.json);
if (JSON.stringify(resumen.map(r=>r.anio_forecast)) !== '[2026,2027]') throw new Error('Faltan fuentes o el orden es incorrecto');
for (const r of resumen) {
 const esperado = ${validar} ? 'validar' : ${JSON.stringify(changed)}.includes(r.anio_forecast) ? 'cargado' : 'sin_cambios';
 if ((r.modo || r.estado) !== esperado) throw new Error('Estado incorrecto para '+r.anio_forecast);
 if (!${realPostgres} && r.carga_id != null && r.carga_id !== r.anio_forecast) throw new Error('Carga de otro año');
}
console.log('FORECAST_LOOP_OK');`;
  // El return del codigo original impide aserciones posteriores: trasladarlo al final.
  final.parameters.jsCode = final.parameters.jsCode.replace('return [{ json: { total_fuentes:', 'const salida = [{ json: { total_fuentes:') + '\nreturn salida;';
  return w;
}
for (const [label, changed, validar] of [
  ['ambos cambian', [2026,2027], false],
  ['ninguno cambia', [], false],
  ['solo FY26 cambia', [2026], false],
  ['solo FY27 cambia', [2027], false],
  ['validar ambos sin consultar ni escribir Postgres', [], true],
]) {
  test(label, () => {
    const name = randomUUID()+'.json';
    const w = fixture(changed,validar);
    fs.writeFileSync(path.join(dir,name), JSON.stringify(w), {mode:0o644});
    podman(['exec',container,'n8n','import:workflow','--input=/fixtures/'+name]);
    const output = podman(['exec',container,'n8n','execute','--id='+w.id,'--rawOutput']);
    // El motor devolvio el resumen real, y no solo la primera fuente.
    assert.ok(output.includes('"total_fuentes":2') || output.includes('"total_fuentes": 2'), output.slice(-5000));
    assert.ok(output.includes('"anio_forecast":2027') || output.includes('"anio_forecast": 2027'));
  });
}


test('nodos PostgreSQL reales: carga los dos años y repetir no duplica capturas', () => {
  fs.writeFileSync(path.join(dir,'credencial-prueba.json'),JSON.stringify([{
    id:'forecastlooptestpg',name:'Postgres aislado',type:'postgres',
    data:{host:'127.0.0.1',port:5432,database:'postgres',user:'postgres',password:'',ssl:'disable'},
  }]),{mode:0o644});
  podman(['exec',container,'n8n','import:credentials','--input=/fixtures/credencial-prueba.json']);
  for (const changed of [[2026,2027],[]]) {
    const w=fixture(changed,false,true);
    const name=randomUUID()+'.json';
    fs.writeFileSync(path.join(dir,name),JSON.stringify(w),{mode:0o644});
    podman(['exec',container,'n8n','import:workflow','--input=/fixtures/'+name]);
    const output=podman(['exec',container,'n8n','execute','--id='+w.id,'--rawOutput']);
    assert.ok(output.includes('"total_fuentes":2') || output.includes('"total_fuentes": 2'),output.slice(-7000));
    const expected='"cargas_nuevas":'+changed.length;
    assert.ok(output.replace(/\s/g,'').includes(expected),output.slice(-7000));
  }
  const count=podman(['exec',postgres,'psql','-X','-qAt','-U','postgres','-c',
    "SELECT count(*) || ',' || count(DISTINCT anio_forecast) FROM carga;"]).trim();
  assert.equal(count,'2,2');
});

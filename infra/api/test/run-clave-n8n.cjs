// Seam 3 (ticket 03, ADR 0003): el codigo del nodo «Recalcular Columnas Rotas» del export de n8n,
// evaluado en vm, debe dar la misma clave que forecast_clave_timeline en un Postgres efimero (podman).
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { setTimeout } = require('node:timers/promises');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const container = 'forecast-clave-n8n-test-' + randomUUID();
const ANIO = 2026;

function codigoDelNodo(nombre) {
  const flujo = JSON.parse(fs.readFileSync(path.join(root, 'n8n/n8n_nola_completo.json'), 'utf8'));
  const nodo = flujo.nodes.find(n => n.name === nombre);
  assert.ok(nodo, 'falta el nodo ' + nombre);
  return nodo.parameters.jsCode;
}
// Corre el nodo con una hoja Backlog dada y devuelve su salida; el log del nodo queda en `logs`.
function correrRecalcular(backlog, info = []) {
  const logs = [];
  const consola = { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')) };
  const fn = vm.runInNewContext(`(function($json, console){${codigoDelNodo('Recalcular Columnas Rotas')}\n})`, {});
  const [{ json }] = fn({ _fuente: { anio_forecast: ANIO }, InfoProyectos: info, Backlog: backlog }, consola);
  return { json, logs };
}
const fila = (pa, pid, nombre = 'Proyecto X') => ({ '# PA': pa, 'Project ID': pid, 'Nombre del Proyecto': nombre });

// [nombre, entrada, clave esperada]: literal de la regla del ADR 0003. Si termina en ':' se le suma
// la posicion de fila (+1) en la hoja, que es el id de «sin identificar».
const CASOS = [
  ['PA normal', fila(69412, null), 'PA:69412'],
  ['PA con Project ID', fila(69412, 'PR-061990'), 'PR:PR-061990'],
  ['PA #N/A y Project ID', fila('#N/A', 'pr-061990'), 'PR:PR-061990'],
  ['solo Project ID', fila(null, 'PR-000123'), 'PR:PR-000123'],
  ['PA con espacios y minusculas', fila('  pr-0619a  ', ''), 'PA:PR-0619A'],
  ['Project ID con espacios y minusculas', fila('1', '  pr-00a  '), 'PR:PR-00A'],
  ['Project ID #N/A cae al PA', fila('777', '#N/A'), 'PA:777'],
  ['Project ID N/A cae al PA', fila('777', 'n/a'), 'PA:777'],
  ['ninguno', fila('#N/A', '', 'Sin ids'), 'SIN_ID:2026:'],
];

(async () => {
  // 1) La salida del nodo: una clave por fila, sin respaldo por nombre.
  const backlog = CASOS.map(c => c[1]);
  const { json } = correrRecalcular(backlog);
  const claves = json.Backlog.map(r => r._clave);
  CASOS.forEach(([nombre, , esperada], i) => {
    const real = claves[i];
    assert.equal(real, esperada.endsWith(':') ? esperada + (i + 1) : esperada, nombre);
  });
  assert.ok(claves.every(k => !/^(pa|nombre):/.test(k)), 'no queda el formato viejo ni el respaldo por nombre');

  // 2) Mismo Project ID con dos PA: un solo proyecto, PA de la fila mas reciente, con aviso.
  const dos = correrRecalcular([fila(111, 'PR-9'), fila(500, 'PR-5'), fila(222, 'PR-9')]);
  assert.deepEqual(dos.json.Backlog.map(r => r._clave), ['PR:PR-9', 'PR:PR-5', 'PR:PR-9']);
  assert.deepEqual(dos.json.Backlog.map(r => String(r['# PA'])), ['222', '500', '222'], 'toma el PA de la fila mas reciente');
  assert.equal(dos.json.avisos_identidad.length, 1);
  assert.match(dos.json.avisos_identidad[0], /PR-9.*111.*222/);
  assert.ok(dos.logs.some(l => /PR-9/.test(l)), 'el aviso tambien queda en el log');
  assert.equal(correrRecalcular([fila(111, 'PR-9'), fila(500, 'PR-5')]).json.avisos_identidad.length, 0);

  // 2b) Cruce entre hojas: BackLog NOLA no trae Project ID, solo PA. Se une con Info Proyectos por PA
  // (sin PA, por nombre) y hereda la clave del proyecto de Info. Un PA que Info reemplazo por el de la
  // fila mas reciente del mismo Project ID tambien cruza. Un PA que Info no tiene queda sin cruce.
  const filaBacklog = (pa, nombre) => ({ '# PA': pa, 'Nombre del Proyecto': nombre });
  const infoHoja = [fila(69412, 'PR-061990', 'Telcel'), fila(111, 'PR-9', 'Uno'), fila(222, 'PR-9', 'Uno'),
    fila(333, null, 'Sin PR'), fila('#N/A', 'PR-038290', 'Solo PR sin PA')];
  const backlogHoja = [filaBacklog(69412, 'Telcel'), filaBacklog(111, 'Uno'), filaBacklog(333, 'Sin PR'),
    filaBacklog('#N/A', 'Solo PR sin PA'), filaBacklog(999, 'No esta en Info')];
  const cruce = correrRecalcular(backlogHoja, infoHoja).json;
  assert.deepEqual(cruce.InfoProyectos.map(r => r._clave),
    ['PR:PR-061990', 'PR:PR-9', 'PR:PR-9', 'PA:333', 'PR:PR-038290'], 'claves de Info Proyectos');
  assert.deepEqual(cruce.Backlog.map(r => r._clave),
    ['PR:PR-061990', 'PR:PR-9', 'PA:333', 'PR:PR-038290', 'PA:999'], 'el Backlog hereda la clave del proyecto de Info');
  const clavesInfo = new Set(cruce.InfoProyectos.map(r => r._clave));
  assert.deepEqual(cruce.Backlog.filter(r => !clavesInfo.has(r._clave)).map(r => r._clave), ['PA:999'],
    'solo el PA que Info no tiene queda sin cruce');

  // 2c) Una fila con solo Project ID (sin PA ni nombre) es una fila vacia: no entra como proyecto, en ninguna hoja.
  const vacias = correrRecalcular(
    [filaBacklog(69412, 'Telcel'), filaBacklog(null, '')],
    [fila(69412, 'PR-061990', 'Telcel'), fila(null, 'PR-SOLO-ID', ''), fila('#N/A', 'PR-OTRO', ' '), fila(null, 'PR-CON-NOMBRE', 'Con nombre')]).json;
  assert.deepEqual(vacias.InfoProyectos.map(r => r._clave), ['PR:PR-061990', 'PR:PR-CON-NOMBRE'], 'las filas con solo Project ID se descartan');
  assert.equal(vacias.Backlog.length, 1);
  assert.equal(vacias.filasVaciasDescartadas, 3, 'dos de Info y una de Backlog');

  // 3) Misma clave que la funcion SQL con las mismas entradas.
  let started = false;
  const run = (args, input) => { const r = spawnSync('podman', args, { input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }); if (r.status !== 0) throw Error((r.stdout || '') + (r.stderr || '')); return r.stdout; };
  const psql = sql => run(['exec', '-i', container, 'psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], sql);
  try {
    run(['run', '-d', '--rm', '--name', container, '--network', 'none', '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'docker.io/library/postgres:16-alpine']); started = true;
    let ready = false;
    for (let i = 0; i < 100; i++) { if (spawnSync('podman', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']).status === 0) { ready = true; break; } await setTimeout(150); }
    if (!ready) throw Error('PG temporal no disponible');
    psql(fs.readFileSync(path.join(root, 'infra/db/init/01_schema.sql'), 'utf8'));
    const lit = v => v === null || v === undefined ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'";
    claves.forEach((claveNodo, i) => {
      const f = backlog[i];
      const sql = psql(`SELECT forecast_clave_timeline(jsonb_build_object('project_id',${lit(f['Project ID'])}::text,'num_pa',${lit(f['# PA'])}::text),${i + 1},${ANIO})`).trim();
      assert.equal(claveNodo, sql, 'nodo y SQL difieren en: ' + CASOS[i][0]);
    });
  } finally { if (started) run(['rm', '-f', container]); }
  console.log('clave del nodo de n8n = clave SQL: ok');
})().catch(e => { console.error(e.message); process.exitCode = 1; });

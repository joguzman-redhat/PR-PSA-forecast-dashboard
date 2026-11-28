// Paridad entre el esquema inicial y las migraciones, contra un Postgres efimero (podman).
// 1) Una base creada con 01_schema.sql y otra creada con un esquema anterior (fixtures/esquema-antes-de-cortes.sql)
//    y puesta al dia con TODAS las migraciones en orden deben tener las mismas tablas, vistas y columnas.
// 2) La copia de OpenShift del esquema es identica al original.
// Si falla, una base ya desplegada quedaria distinta de una nueva (como paso con carga.ejecucion_id).
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { setTimeout } = require('node:timers/promises');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const container = 'forecast-esquema-test-' + randomUUID();
const leer = ruta => fs.readFileSync(path.join(root, ruta), 'utf8');
function run(args, input) { const r = spawnSync('podman', args, { input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }); if (r.status !== 0) throw Error((r.stdout || '') + (r.stderr || '')); return r.stdout; }
const psql = (base, sql) => run(['exec', '-i', container, 'psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', base], sql);
const COLUMNAS = `SELECT table_name||'.'||column_name||':'||data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY 1`;

(async () => { let started = false; try {
  assert.equal(leer('openshift/base/postgres/01_schema.sql'), leer('infra/db/init/01_schema.sql'),
    'openshift/base/postgres/01_schema.sql debe ser copia exacta de infra/db/init/01_schema.sql');

  run(['run', '-d', '--rm', '--name', container, '--network', 'none', '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'docker.io/library/postgres:16-alpine']); started = true;
  let listo = false; for (let i = 0; i < 100; i++) { if (spawnSync('podman', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']).status === 0) { listo = true; break; } await setTimeout(150); }
  if (!listo) throw Error('PG temporal no disponible');
  psql('postgres', 'CREATE DATABASE nueva; CREATE DATABASE migrada;');

  psql('nueva', leer('infra/db/init/01_schema.sql'));
  psql('migrada', leer('infra/api/test/fixtures/esquema-antes-de-cortes.sql'));
  const migraciones = fs.readdirSync(path.join(root, 'infra/db/migraciones')).filter(f => f.endsWith('.sql')).sort();
  const comparar = etapa => {
    const nueva = psql('nueva', COLUMNAS).trim().split('\n');
    const migrada = psql('migrada', COLUMNAS).trim().split('\n');
    const faltan = nueva.filter(c => !migrada.includes(c)), sobran = migrada.filter(c => !nueva.includes(c));
    assert.deepEqual({ faltan, sobran }, { faltan: [], sobran: [] },
      etapa + ': una base migrada no coincide con una nueva (faltan o sobran columnas)');
    return nueva.length;
  };
  const aplicar = () => { for (const m of migraciones) psql('migrada', leer('infra/db/migraciones/' + m)); };
  aplicar();
  const columnas = comparar('tras una pasada de migraciones'); // el caso real: una base desplegada las recibe una vez
  aplicar();
  comparar('tras una segunda pasada (idempotencia)');
  console.log('esquema inicial = esquema migrado (' + columnas + ' columnas, ' + migraciones.length + ' migraciones) y copia de OpenShift identica: ok');
} finally { if (started) run(['rm', '-f', container]); } })().catch(e => { console.error(e.message); process.exitCode = 1; });

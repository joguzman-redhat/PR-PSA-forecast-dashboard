// Ticket 04 (ADR 0003): la consulta de Tool_Postgres_Proyectos del export de n8n, ejecutada contra
// un Postgres efimero (podman), devuelve el mismo proyecto buscando por PA o por Project ID.
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { setTimeout } = require('node:timers/promises');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const container = 'forecast-tool-proyectos-test-' + randomUUID();

function consultaFiltrada() {
  const flujo = JSON.parse(fs.readFileSync(path.join(root, 'n8n/n8n_nola_completo.json'), 'utf8'));
  const nodo = flujo.nodes.find(n => n.name === 'Tool_Postgres_Proyectos');
  assert.ok(nodo, 'falta Tool_Postgres_Proyectos');
  const sub = JSON.parse(nodo.parameters.workflowJson);
  const q = sub.nodes.find(n => n.name === 'Query (filtrada)');
  assert.ok(q, 'falta Query (filtrada)');
  assert.match(q.parameters.options.queryReplacement, /\$json\.query\.pa/, 'el parametro $1 es query.pa');
  return q.parameters.query.trim().replace(/;$/, '');
}

(async () => {
  const consulta = consultaFiltrada();
  let started = false;
  const run = (args, input) => { const r = spawnSync('podman', args, { input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }); if (r.status !== 0) throw Error((r.stdout || '') + (r.stderr || '')); return r.stdout; };
  const psql = sql => run(['exec', '-i', container, 'psql', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], sql);
  try {
    run(['run', '-d', '--rm', '--name', container, '--network', 'none', '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'docker.io/library/postgres:16-alpine']); started = true;
    let ready = false;
    for (let i = 0; i < 100; i++) { if (spawnSync('podman', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']).status === 0) { ready = true; break; } await setTimeout(150); }
    if (!ready) throw Error('PG temporal no disponible');
    psql(fs.readFileSync(path.join(root, 'infra/db/init/01_schema.sql'), 'utf8'));
    psql(`
INSERT INTO carga(anio_forecast,archivo_id,datos_hash,archivo_nombre) VALUES (2026,'s26','h1','FY26');
INSERT INTO proyecto(clave,num_pa,project_id,nombre,ultima_carga_id) VALUES
 ('PR:PR-061990','69412','PR-061990','Con ambos',1),('PA:555','555',NULL,'Solo PA',1),('PR:PR-777',NULL,'PR-777','Solo Project ID',1);
-- el trigger trg_proyecto_snapshot captura los atributos de cada proyecto.
`);
    // La consulta del nodo, tal cual, como funcion SQL: su $1 es el parametro (lo que n8n pasa en queryReplacement).
    psql(`CREATE FUNCTION buscar_tool(text) RETURNS jsonb LANGUAGE sql AS $fn$ SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM (${consulta}) t $fn$`);
    const buscar = valor => JSON.parse(psql(`SELECT buscar_tool('${valor.replace(/'/g, "''")}')`).trim());
    const nombres = valor => buscar(valor).map(r => r.nombre);
    assert.deepEqual(nombres('69412'), ['Con ambos'], 'por PA');
    assert.deepEqual(nombres('PR-061990'), ['Con ambos'], 'por Project ID');
    assert.deepEqual(nombres('pr-061990'), ['Con ambos'], 'Project ID sin distinguir mayusculas');
    assert.deepEqual(nombres(' PR-061990 '), ['Con ambos'], 'Project ID con espacios');
    assert.deepEqual(buscar('69412'), buscar('PR-061990'), 'mismo proyecto, mismas columnas, por PA o por Project ID');
    assert.deepEqual(nombres('555'), ['Solo PA']);
    assert.deepEqual(nombres('PR-777'), ['Solo Project ID']);
    assert.deepEqual(nombres('PR-999'), [], 'sin coincidencia no devuelve nada');
    console.log('Tool_Postgres_Proyectos: PA y Project ID devuelven el mismo proyecto: ok');
  } finally { if (started) run(['rm', '-f', container]); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });

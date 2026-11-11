const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout } = require('node:timers/promises');

// node --test n8n/test/carga-sql.test.js
// Usa un Postgres efimero sin red, puertos ni volumenes del stack real.
const container = `forecast-sql-test-${randomUUID()}`;
const root = path.resolve(__dirname, '../..');
const workflow = JSON.parse(fs.readFileSync(path.join(root, 'n8n/n8n_nola_completo.json')));
const code = workflow.nodes.find(n => n.name === 'Construir SQL de Carga').parameters.jsCode;
const construir = new Function('$', code);

function podman(args, input) {
  const result = spawnSync('podman', args, { input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function sql(query) {
  return podman(['exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], query).trim();
}

before(async () => {
  podman(['run', '-d', '--rm', '--name', container, '--network', 'none',
    '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
    'docker.io/library/postgres:16-alpine']);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    const result = spawnSync('podman', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']);
    if (result.status === 0) { ready = true; break; }
    await setTimeout(150);
  }
  assert.ok(ready, 'El Postgres de pruebas no arranco');
  sql(fs.readFileSync(path.join(root, 'infra/db/init/01_schema.sql'), 'utf8'));
});

after(() => { podman(['rm', '-f', container]); });

function cargar(backlog, info = backlog) {
  sql('TRUNCATE movimiento, revenue_mes, revenue_anual, proyecto, carga RESTART IDENTITY CASCADE;');
  const data = { InfoProyectos: info, Backlog: backlog, _hash: randomUUID(), fechaReferencia: '2026-11-10' };
  const [{ json }] = construir(name => {
    assert.equal(name, 'Calcular Hash');
    return { item: { json: data } };
  });
  sql(json.sql);
  return JSON.parse(sql(`SELECT row_to_json(r) FROM (
    SELECT valor_of, acum_2025, backlog, total_ejecutado_acumulado FROM revenue_anual
  ) r;`));
}

test('lee los encabezados actuales y conserva el dinero de BackLog NOLA', () => {
  const result = cargar([{
    _clave: 'prueba', 'Nombre del Proyecto': 'Proyecto ficticio',
    'Valor OF': 1000, 'Acum 2025': 50, 'Backlog 2026': -23.5,
    'TOTAL EJECUTADO ACUMULADO 2025-2026\n(COPIAR)': 200.75,
    Enero: 12, Upside: 7,
  }], [{ _clave: 'prueba', 'Nombre del Proyecto': 'Proyecto ficticio', 'Valor OF': 9999 }]);
  assert.deepEqual(result, { valor_of: 1000, acum_2025: 50, backlog: -23.5, total_ejecutado_acumulado: 200.75 });
  assert.equal(sql('SELECT commit_usd || chr(44) || upside_usd FROM revenue_mes WHERE mes=1;'), '12,7');
});

test('acepta los encabezados anteriores y conserva los ceros', () => {
  const result = cargar([{
    _clave: 'prueba', 'Backlog ': '0', 'TOTAL EJECUTADO ACUMULADO': '100.25',
  }]);
  assert.deepEqual(result, { valor_of: null, acum_2025: null, backlog: 0, total_ejecutado_acumulado: 100.25 });
});

test('carga columnas completamente vacias con tipos numeric, date, integer y boolean', () => {
  const result = cargar([{ _clave: 'prueba' }]);
  assert.deepEqual(result, { valor_of: null, acum_2025: null, backlog: null, total_ejecutado_acumulado: null });
  assert.equal(sql('SELECT count(*) FROM revenue_mes WHERE commit_usd=0 AND upside_usd=0;'), '12');
  assert.equal(sql('SELECT fecha_fin IS NULL AND dias_para_vencimiento IS NULL AND executive_watchlist IS NULL FROM proyecto;'), 't');
});

test('tolera espacios en encabezados y mantiene como NULL los montos invalidos', () => {
  const result = cargar([{
    _clave: 'prueba', 'Valor OF': '#N/A', 'Acum 2025': 100000001,
    '  Backlog 2026  ': 'invalido',
    'TOTAL EJECUTADO ACUMULADO 2025-2026\r\n (COPIAR)': '25.5',
  }]);
  assert.deepEqual(result, { valor_of: null, acum_2025: null, backlog: null, total_ejecutado_acumulado: 25.5 });
});

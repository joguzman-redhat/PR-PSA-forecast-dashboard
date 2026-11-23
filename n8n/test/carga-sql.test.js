const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout } = require('node:timers/promises');
const { normalizar } = require('./forecast-fixture.cjs');

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

function cargar(backlog, info = backlog, limpiar = true, anio = 2026) {
  if (limpiar) sql('TRUNCATE movimiento, revenue_mes, revenue_anual, proyecto, carga RESTART IDENTITY CASCADE;');
  const data = { ...normalizar(backlog, info, anio), _hash: randomUUID(), fechaReferencia: '2026-11-10' };
  const [{ json }] = construir(name => {
    assert.equal(name, 'Calcular Hash');
    return { item: { json: data } };
  });
  sql(json.sql);
  return JSON.parse(sql(`SELECT row_to_json(r) FROM (
    SELECT valor_of, acum_2025, backlog, total_ejecutado_acumulado FROM revenue_anual
     WHERE carga_id = (SELECT max(id) FROM carga)
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

test('el SQL FY26 registra su fuente y conserva atributos por captura', () => {
  cargar([{ _clave: 'prueba', 'PM/Líder': 'PM inicial', 'Backlog ': 100 }]);
  cargar([{ _clave: 'prueba', 'PM/Líder': 'PM siguiente', 'Backlog ': 80 }], undefined, false);
  assert.equal(sql('SELECT count(*) FROM carga WHERE anio_forecast=2026 AND archivo_id IS NOT NULL;'), '2');
  assert.equal(sql("SELECT string_agg(atributos->>'pm_lider', ',' ORDER BY carga_id) FROM proyecto_snapshot;"), 'PM inicial,PM siguiente');
});

test('el SQL compara solo contra su fuente aunque la ultima carga global sea de FY27', () => {
  cargar([{ _clave: 'prueba', Enero: 10 }]);
  sql("INSERT INTO carga(anio_forecast,archivo_id,datos_hash) VALUES (2027,'otro','hash-fy27');");
  cargar([{ _clave: 'prueba', Enero: 30 }], undefined, false);
  assert.equal(sql('SELECT count(*) FROM movimiento;'), '1');
  assert.equal(sql('SELECT c.anio_forecast || chr(44) || p.anio_forecast FROM movimiento m JOIN carga c ON c.id=m.carga_id JOIN carga p ON p.id=m.carga_previa_id;'), '2026,2026');
});


test('carga FY27 con acumulado previo, preserva FY26 y compara movimientos dentro de cada año', () => {
  const row26 = { _clave: 'compartido', '# PA': '123', 'Nombre del Proyecto': 'FY26', 'PM/Líder': 'PM26',
    'Valor OF': 1000, 'Acum 2025': 100, 'Backlog 2026': 800, 'TOTAL EJECUTADO ACUMULADO': 200, Enero: 100 };
  const row27 = { _clave: 'compartido', '# PA': '123', 'Nombre del Proyecto': 'FY27', 'PM/Líder': 'PM27',
    'Valor OF': 2000, 'Total Ejecutado Acumulado 2025-2026': 200,
    'Backlog 2027': 1500, 'TOTAL EJECUTADO ACUMULADO 2025-2026-2027': 500, Enero: 300 };
  cargar([row26]);
  assert.deepEqual(cargar([row27], undefined, false, 2027),
    { valor_of: 2000, acum_2025: 200, backlog: 1500, total_ejecutado_acumulado: 500 });
  assert.equal(sql('SELECT count(*) FROM movimiento;'), '0');
  cargar([{ ...row26, Enero: 110 }], undefined, false, 2026);
  cargar([{ ...row27, Enero: 320 }], undefined, false, 2027);
  assert.equal(sql('SELECT string_agg(c.anio_forecast::text || chr(58) || m.monto::text, chr(44) ORDER BY m.id) FROM movimiento m JOIN carga c ON c.id=m.carga_id;'), '2026:10,2027:20');
  assert.equal(sql("SELECT atributos->>'pm_lider' FROM v_proyecto_por_forecast WHERE anio_forecast=2026;"), 'PM26');
  assert.equal(sql('SELECT acumulado_anterior FROM v_proyecto_por_forecast WHERE anio_forecast=2027;'), '200');
  // Las consultas reales del agente deben seguir en FY26 aunque FY27 sea la ultima carga global.
  for (const tool of workflow.nodes.filter(n => n.name.startsWith('Tool_Postgres_'))) {
    const queries = JSON.parse(tool.parameters.workflowJson).nodes.filter(n => n.type==='n8n-nodes-base.postgres');
    for (const query of queries) {
      const text = query.parameters.query.replaceAll('$1', "'123'");
      const rows = JSON.parse(sql("SELECT coalesce(json_agg(r),'[]'::json) FROM (" + text.replace(/;$/, '') + ') r;'));
      assert.ok(rows.length > 0, tool.name);
      assert.ok(rows.every(r => r.anio_forecast===2026), tool.name);
      if (tool.name==='Tool_Postgres_Proyectos') assert.equal(rows[0].pm_lider, 'PM26');
      if (tool.name==='Tool_Postgres_Metricas') assert.equal(rows[0].acum_2025_total, 100);
    }
  }
});

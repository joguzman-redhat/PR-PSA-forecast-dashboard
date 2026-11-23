const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout } = require('node:timers/promises');
const root = path.resolve(__dirname, '../../..');
const container = 'forecast-year-test-' + randomUUID();
function podman(args, input) {
  const r = spawnSync('podman', args, { input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.error) throw r.error;
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return r.stdout.trim();
}
function sql(query, db = 'forecast_fresh') {
  return podman(['exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', db], query);
}
const migracion = fs.readFileSync(path.join(root, 'infra/db/migraciones/2026-11-14_forecast_por_anio.sql'), 'utf8');
before(async () => {
  podman(['run', '-d', '--rm', '--name', container, '--network', 'none',
    '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
    'docker.io/library/postgres:16-alpine']);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (spawnSync('podman', ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']).status === 0) { ready = true; break; }
    await setTimeout(150);
  }
  assert.ok(ready);
  sql('CREATE DATABASE forecast_fresh; CREATE DATABASE forecast_legacy;', 'postgres');
  sql(fs.readFileSync(path.join(root, 'infra/db/init/01_schema.sql'), 'utf8'));
  sql(migracion);
  sql(fs.readFileSync(path.join(__dirname, 'legacy-forecast.sql'), 'utf8'), 'forecast_legacy');
});
after(() => podman(['rm', '-f', container]));
beforeEach(() => sql('TRUNCATE movimiento, revenue_mes, revenue_anual, proyecto_snapshot, proyecto, carga RESTART IDENTITY CASCADE;'));
function carga(anio, fuente, hash) {
  return sql(`INSERT INTO carga(anio_forecast, archivo_id, datos_hash) VALUES (${anio}, '${fuente}', '${hash}') RETURNING id;`);
}
function proyecto(cargaId, pm = 'PM inicial') {
  return sql(`INSERT INTO proyecto(clave, num_pa, nombre, pm_lider, valor_of, ultima_carga_id)
    VALUES ('pa:123', '123', 'Ficticio', '${pm}', 1000, ${cargaId})
    ON CONFLICT(clave) DO UPDATE SET pm_lider = EXCLUDED.pm_lider, ultima_carga_id = EXCLUDED.ultima_carga_id RETURNING id;`);
}

test('migracion idempotente conserva importes y no inventa ID ni atributos historicos', () => {
  sql(`INSERT INTO carga(datos_hash, archivo_nombre) VALUES ('viejo1','FY26'), ('viejo2','FY26');
    INSERT INTO proyecto(clave,num_pa,pm_lider,ultima_carga_id) VALUES ('pa:123','123','PM actual',2);
    INSERT INTO revenue_anual VALUES (1,1,1000,100,900,100), (2,1,1000,200,800,200);`, 'forecast_legacy');
  sql(migracion, 'forecast_legacy'); sql(migracion, 'forecast_legacy');
  assert.equal(sql('SELECT sum(backlog) FROM revenue_anual;', 'forecast_legacy'), '1700');
  assert.equal(sql('SELECT count(*) FROM carga WHERE anio_forecast=2026 AND archivo_id IS NULL;', 'forecast_legacy'), '2');
  assert.equal(sql('SELECT carga_id || chr(44) || origen FROM proyecto_snapshot;', 'forecast_legacy'), '2,estado_actual_migracion');
  assert.equal(sql('SELECT count(*) FROM v_proyecto_actual;', 'forecast_legacy'), '1');
  assert.equal(sql('SELECT count(*) FROM proyecto_snapshot WHERE carga_id=1;', 'forecast_legacy'), '0');
});

test('deduplicacion se aplica por año y archivo aunque se alternen fuentes', () => {
  carga(2026, 'fuente-a', 'igual'); carga(2027, 'fuente-a', 'igual'); carga(2026, 'fuente-b', 'igual');
  assert.throws(() => carga(2026, 'fuente-a', 'igual'), /Sin cambios/);
  assert.equal(sql('SELECT count(*) FROM carga;'), '3');
});

test('enero FY26 y enero FY27 permanecen separados para el mismo PA', () => {
  const a = carga(2026, 'fy26', 'a'); const p = proyecto(a, 'PM FY26');
  const b = carga(2027, 'fy27', 'b'); proyecto(b, 'PM FY27');
  sql(`INSERT INTO revenue_mes VALUES (${a},${p},1,100,10), (${b},${p},1,250,20);`);
  assert.equal(sql('SELECT string_agg(anio_forecast || chr(58) || commit_usd, chr(44) ORDER BY anio_forecast) FROM v_revenue_mes_por_forecast;'), '2026:100,2027:250');
  assert.equal(sql("SELECT string_agg(anio_forecast || chr(58) || (atributos->>'pm_lider'), chr(44) ORDER BY anio_forecast) FROM v_proyecto_por_forecast;"), '2026:PM FY26,2027:PM FY27');
  assert.equal(sql("SELECT count(*) FROM proyecto_snapshot WHERE atributos ? 'valor_of';"), '0');
});

test('vista de ultima carga separa fuentes y no selecciona una carga sin proyectos', () => {
  const a = carga(2026, 'a', 'a1'); proyecto(a);
  const b = carga(2026, 'b', 'b1'); proyecto(b);
  carga(2026, 'a', 'a-vacia');
  assert.equal(sql('SELECT string_agg(archivo_id || chr(58) || datos_hash, chr(44) ORDER BY archivo_id) FROM v_carga_actual_por_forecast;'), 'a:a1,b:b1');
});

test('rechaza movimientos entre años o fuentes y acepta cambios comparables', () => {
  const a = carga(2026, 'a', 'a1'); const p = proyecto(a);
  const b = carga(2026, 'a', 'a2');
  const c = carga(2027, 'a', 'a3');
  const d = carga(2026, 'b', 'a4');
  const movimiento = (actual, previa) => sql(`INSERT INTO movimiento(carga_id,carga_previa_id,proyecto_id,mes,tipo,monto) VALUES (${actual},${previa},${p},1,'upside_a_commit',10);`);
  movimiento(b, a);
  assert.throws(() => movimiento(c, a), /años o archivos/);
  assert.throws(() => movimiento(d, a), /años o archivos/);
  assert.equal(sql('SELECT count(*) FROM movimiento;'), '1');
});

test('atributos de una captura ya guardada no se sobrescriben', () => {
  const a = carga(2026, 'a', 'a1'); proyecto(a, 'PM capturado');
  proyecto(a, 'PM cambiado despues');
  assert.equal(sql("SELECT atributos->>'pm_lider' FROM proyecto_snapshot;"), 'PM capturado');
  assert.equal(sql('SELECT pm_lider FROM proyecto;'), 'PM cambiado despues');
});

test('funcion legacy abrir_carga conserva su firma y su deduplicacion', () => {
  assert.ok(Number(sql("SELECT abrir_carga('legacy-hash');")) > 0);
  carga(2027, 'otro', 'legacy-hash');
  assert.equal(sql("SELECT abrir_carga('legacy-hash') IS NULL;"), 't');
});

test('la consulta del workflow obtiene el hash del año y archivo solicitado', () => {
  carga(2026, 'fuente-26', 'hash26'); carga(2027, 'fuente-27', 'hash27');
  const w = JSON.parse(fs.readFileSync(path.join(root, 'n8n/n8n_nola_completo.json'), 'utf8'));
  const query = w.nodes.find(n => n.name === 'Obtener Ultimo Hash').parameters.query;
  assert.equal(sql(`PREPARE consulta(int,text) AS ${query} EXECUTE consulta(2026,'fuente-26');`), 'hash26');
});

test('la API tampoco deriva movimientos entre años o archivos distintos', () => {
  const a = carga(2026, 'a', 'a1'); const p = proyecto(a);
  const b = carga(2026, 'b', 'b1'); proyecto(b);
  const c = carga(2026, 'a', 'a2'); proyecto(c);
  const d = carga(2027, 'a', 'a3'); proyecto(d);
  sql(`INSERT INTO revenue_mes VALUES (${a},${p},1,100,0), (${b},${p},1,200,0),
    (${c},${p},1,150,0), (${d},${p},1,300,0);`);
  const source = fs.readFileSync(path.join(root, 'infra/api/src/routes/historia.js'), 'utf8');
  const query = source.match(/`(WITH pares AS \([\s\S]*?ORDER BY s\.carga_id, p\.id, n\.mes)`/)[1]
    .replaceAll('$1', `ARRAY[${a},${b},${c},${d}]::bigint[]`);
  assert.equal(sql(`SELECT count(*) FROM (${query}) q;`), '1');
  assert.equal(sql(`SELECT commit_nuevo - commit_anterior FROM (${query}) q;`), '50');
});

test('la copia de esquema OpenShift es identica al esquema local', () => {
  assert.equal(fs.readFileSync(path.join(root, 'openshift/base/postgres/01_schema.sql'), 'utf8'),
    fs.readFileSync(path.join(root, 'infra/db/init/01_schema.sql'), 'utf8'));
});

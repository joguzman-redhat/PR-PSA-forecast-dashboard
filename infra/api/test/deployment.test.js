const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { crearApp } = require('../src/server');
const { pool } = require('../src/db');

async function iniciar(t, rutaBase, demo = false) {
  const publicDir = await fs.mkdtemp(path.join(os.tmpdir(), 'forecast-public-'));
  const root = path.resolve(__dirname, '../../..');
  for (const file of ['index.html', 'app.js', 'styles.css', 'vendor']) {
    await fs.cp(path.join(root, file), path.join(publicDir, file), { recursive: true });
  }
  const server = crearApp({ rutaBase, publicDir, demo }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(publicDir, { recursive: true, force: true });
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test('dashboard y assets conservan sus rutas con y sin prefijo del proxy', async (t) => {
  const origen = await iniciar(t, '/cloud-forecast');
  for (const prefijo of ['', '/cloud-forecast']) {
    const portada = new URL(`${origen}${prefijo}/`);
    const html = await fetch(portada);
    assert.equal(html.status, 200);
    const texto = await html.text();
    assert.match(texto, /Dashboard de Proyectos/);
    assert.match(texto, /<base href="\/cloud-forecast\/">/);
    const base = new URL('/cloud-forecast/', portada);
    for (const asset of ['app.js', 'styles.css', 'vendor/patternfly.css',
      'vendor/assets/fonts/RedHatText/RedHatTextVF.woff2']) {
      const res = await fetch(new URL(asset, base));
      assert.equal(res.status, 200, `${prefijo}/${asset}`);
      assert.ok(Number(res.headers.get('content-length')) > 0);
    }
    const desconocido = await fetch(new URL('api/no-existe', portada));
    assert.equal(desconocido.status, 404);
    assert.match(desconocido.headers.get('content-type'), /application\/json/);
  }
  const redir = await fetch(`${origen}/cloud-forecast?periodo=q2`, { redirect: 'manual' });
  assert.equal(redir.status, 308);
  assert.equal(redir.headers.get('location'), '/cloud-forecast/?periodo=q2');
});

test('Swagger apunta al mismo despliegue en lugar de localhost', async (t) => {
  const origen = await iniciar(t, '/cloud-forecast');
  for (const prefijo of ['', '/cloud-forecast']) {
    const spec = await fetch(`${origen}${prefijo}/api/openapi.yaml`);
    assert.equal(spec.status, 200);
    assert.match(await spec.text(), /url: "\/cloud-forecast"/);
    const init = await fetch(`${origen}${prefijo}/api/docs/swagger-initializer.js`);
    assert.equal(init.status, 200);
    assert.match(await init.text(), /url: '\.\.\/openapi.yaml'/);
    const docs = await fetch(`${origen}${prefijo}/api/docs?test=1`, { redirect: 'manual' });
    assert.equal(docs.status, 308);
    assert.equal(docs.headers.get('location'), '/cloud-forecast/api/docs/?test=1');
  }
});

test('la sonda de vida funciona aunque Postgres no este disponible', async (t) => {
  const origen = await iniciar(t, '/cloud-forecast');
  const original = pool.query;
  let consultas = 0;
  pool.query = async () => { consultas++; throw new Error('Postgres no disponible'); };
  t.after(() => { pool.query = original; });
  for (const prefijo of ['', '/cloud-forecast']) {
    const vivo = await fetch(`${origen}${prefijo}/health/live`);
    assert.equal(vivo.status, 200);
    assert.deepEqual(await vivo.json(), { ok: true });
  }
  assert.equal(consultas, 0);
  const listo = await fetch(`${origen}/cloud-forecast/health`);
  assert.equal(listo.status, 503);
  assert.equal(consultas, 1);
});

test('la configuracion por defecto sigue sirviendo desde la raiz', async (t) => {
  const origen = await iniciar(t, '');
  assert.equal((await fetch(`${origen}/`)).status, 200);
  const spec = await fetch(`${origen}/api/openapi.yaml`);
  assert.match(await spec.text(), /url: "\/"/);
});

test('una ruta base invalida se rechaza antes de arrancar', () => {
  for (const rutaBase of ['https://example.com', '/a/../b', '//a', '/a?b', '/a#b']) {
    assert.throws(() => crearApp({ rutaBase }), /APP_BASE_PATH/);
  }
});

test('la demo entrega datos ficticios sin consultar PG y marca la interfaz', async (t) => {
  const origen = await iniciar(t, '/cloud-forecast', true);
  const original = pool.query;
  let consultas = 0;
  pool.query = async () => { consultas++; throw new Error('La demo no debe consultar PG'); };
  t.after(() => { pool.query = original; });
  const html = await fetch(`${origen}/cloud-forecast/`);
  const portada = await html.text();
  assert.match(portada, /<title>DEMO ·/);
  assert.match(portada, /class="aviso-demo" role="status"/);
  assert.match(portada, /Datos ficticios/);
  for (const endpoint of ['proyectos', 'backlog', 'historia']) {
    const res = await fetch(`${origen}/cloud-forecast/api/${endpoint}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const datos = await res.json();
    assert.equal(datos.meta.origen, 'demo');
  }
  const salud = await fetch(`${origen}/cloud-forecast/health`);
  assert.equal((await salud.json()).modo, 'demo');
  const spec = await (await fetch(`${origen}/cloud-forecast/api/openapi.yaml`)).json();
  assert.equal(spec.info.title, 'Cloud Forecast DEMO');
  assert.deepEqual(Object.keys(spec.paths).sort(), ['/api/backlog', '/api/historia', '/api/proyectos']);
  const recarga = await fetch(`${origen}/cloud-forecast/api/reload`, { method: 'POST' });
  assert.equal(recarga.status, 409);
  assert.equal(consultas, 0);
});

test('el proceso finaliza limpiamente cuando el contenedor recibe SIGTERM', { timeout: 10000 }, async (t) => {
  const proceso = spawn(process.execPath, [path.resolve(__dirname, '../src/server.js')], {
    env: { ...process.env, FORECAST_DEMO: 'true', PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => { if (proceso.exitCode === null && proceso.signalCode === null) proceso.kill('SIGKILL'); });
  await Promise.race([
    once(proceso.stdout, 'data'),
    once(proceso, 'exit').then(() => { throw new Error('El servidor termino antes de escuchar'); }),
  ]);
  const terminado = once(proceso, 'exit');
  proceso.kill('SIGTERM');
  assert.deepEqual(await terminado, [0, null]);
});

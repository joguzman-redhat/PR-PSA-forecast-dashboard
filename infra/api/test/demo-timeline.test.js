// La demo sirve /api/timeline con datos ficticios y deterministas, con la misma
// forma que el endpoint real, para que el front se pueda ejecutar sin Postgres.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { crearApp } = require('../src/server');
const { pool } = require('../src/db');
const { pagina } = require('./pagina-simulada');
const path = require('node:path');

async function pedirTimeline(t) {
  const original = pool.query;
  let consultas = 0;
  pool.query = async () => { consultas++; throw new Error('La demo no debe consultar PG'); };
  const server = crearApp({ demo: true, publicDir: path.resolve(__dirname, '../../..') }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    pool.query = original;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/timeline`);
  return { res, datos: await res.json(), consultas: () => consultas };
}

test('la demo sirve /api/timeline con la forma del endpoint real y sin consultar PG', async (t) => {
  const { res, datos, consultas } = await pedirTimeline(t);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const { meta, proyectos, backlog, historia } = datos;
  assert.equal(meta.origen, 'demo');
  assert.equal(meta.timeline, true);
  assert.equal(meta.estado, 'disponible');
  assert.equal(meta.anio_actual, 2026);
  assert.equal(meta.fecha_referencia, '2026-11-24');
  assert.equal(meta.periodos.length, 24);
  assert.equal(meta.periodos[0], '2026-01');
  assert.equal(meta.periodos.at(-1), '2027-12');
  assert.equal(meta.desde, '2026-01');
  assert.equal(meta.hasta, '2027-12');
  assert.ok(Array.isArray(meta.columnas) && meta.columnas.length > 0);
  assert.ok(proyectos.length >= 28 && proyectos.length <= 32);
  assert.ok(proyectos.every(p => p._tipo_fila === 'proyecto' && p.clave_timeline && p.num_pa));
  assert.ok(backlog.every(b => b.clave_timeline && Array.isArray(b.meses) && b.meses.length === 24));
  assert.ok(historia.snapshots.length >= 2);
  assert.ok(historia.eventos.length > 0);
  assert.ok(Object.keys(historia.series_por_proyecto).length > 0);
  for (const e of historia.eventos) {
    assert.ok(historia.snapshots.some(s => s.id === e.snapshot_id));
    assert.ok(meta.periodos.includes(e.campo));
    assert.ok(e.campo >= '2026-11', 'un Commit o Upside pasado no cambia');
  }
  assert.equal(consultas(), 0);
});

test('la demo es determinista', async (t) => {
  const a = await pedirTimeline(t);
  const b = await pedirTimeline(t);
  assert.deepEqual(a.datos, b.datos);
});

async function cargarDemo(t) {
  const { datos } = await pedirTimeline(t);
  const p = pagina();
  p.context.fetch = async () => ({ ok: true, json: async () => structuredClone(datos) });
  assert.equal(await p.ui.cargarDatos(), true);
  return { ...p, datos };
}

test('en la demo, Booking = Ejecutado + Commit pendiente + Backlog en todo proyecto con cifras', async (t) => {
  const { ui } = await cargarDemo(t);
  const conCifras = ui.estado.proyectos.filter(p => ui.valorBooking(p) !== null);
  assert.ok(conCifras.length >= 25);
  for (const p of conCifras) {
    const suma = ui.acumuladoHoy(p) + ui.commitPendienteProyecto(p) + ui.backlogHoy(p);
    assert.ok(Math.abs(ui.valorBooking(p) - suma) < 0.01, `PA ${p.num_pa}: ${ui.valorBooking(p)} vs ${suma}`);
  }
});

test('en la demo ningun mes anterior al de referencia tiene Upside', async (t) => {
  const { datos } = await cargarDemo(t);
  for (const b of datos.backlog) {
    for (const m of datos.meta.periodos.filter(x => x < '2026-11')) {
      assert.ok(!b[m + '_upside'], `${b.num_pa} ${m}`);
    }
  }
});

test('la demo cubre los casos que importan', async (t) => {
  const { ui } = await cargarDemo(t);
  const ps = ui.estado.proyectos;
  const vida = ps.map(p => ({ p, v: ui.vidaProyecto(p), b: ui.backlogDe(p) }));
  const ultimoCommit = b => ui.estado.forecast.periodos.filter(m => b[m + '_fijo']).at(-1);
  // Fecha fin posterior al ultimo Commit
  assert.ok(vida.some(({ b, v }) => b && v.fin && v.fin > ultimoCommit(b)));
  // sin Fecha fin
  assert.ok(vida.some(({ p }) => !p.fecha_fin));
  // Commit posterior a la Fecha fin
  assert.ok(vida.some(({ v }) => v.posteriorAFechaFin));
  // solo FY27
  assert.ok(vida.some(({ b }) => b && b.anio_atributos === 2027));
  // nota de credito
  assert.ok(vida.some(({ b }) => b && ui.estado.forecast.periodos.some(m => b[m + '_fijo'] < 0)));
  // sin fila de backlog
  assert.ok(vida.some(({ b }) => !b));
  // Proyectado parcial
  assert.ok(ps.some(p => ui.coberturaProyectado(p) !== null));
  // Handover, Semaforo, estados, PM y paises
  assert.ok(ps.some(p => p.executive_watchlist === true));
  for (const s of ['Red', 'Yellow', 'Green']) assert.ok(ps.some(p => p.project_status === s), s);
  for (const e of ['In Progress', 'On Hold', 'Planned', 'Completed']) assert.ok(ps.some(p => p.estado === e), e);
  assert.ok(new Set(ps.map(p => p.pm_lider)).size >= 4);
  assert.ok(ps.some(p => p.pais === 'Mexico'));
  assert.ok(new Set(ps.map(p => p.pais)).size >= 3);
});

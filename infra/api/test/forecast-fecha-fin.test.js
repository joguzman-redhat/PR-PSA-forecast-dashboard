// Ticket 14 (ADR 0001): Fecha fin en gráficas y proyección.
// Valores esperados: ejemplos trabajados a mano, no recalculos del codigo.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pagina, datosTimeline } = require('./pagina-simulada');

// Un proyecto con fila de BackLog NOLA; los 24 meses cubiertos quedan en 0
// salvo los que fijen `commits` / `upsides`. `sinCobertura` borra meses.
async function cargar({ fin = null, fila = {}, commits = {}, upsides = {}, periodosExtra = [] } = {}) {
  const p = pagina();
  const d = datosTimeline();
  d.meta.fecha_referencia = '2026-11-24';
  d.meta.periodos.push(...periodosExtra);
  d.proyectos[0].fecha_fin = fin;
  d.backlog[0] = { _tipo_fila: 'proyecto', num_pa: '123', clave_timeline: 'PA:123', anio_atributos: 2026, ...fila };
  for (const m of d.meta.periodos) { d.backlog[0][m + '_fijo'] = 0; d.backlog[0][m + '_upside'] = 0; }
  for (const [m, v] of Object.entries(commits)) d.backlog[0][m + '_fijo'] = v;
  for (const [m, v] of Object.entries(upsides)) d.backlog[0][m + '_upside'] = v;
  p.context.fetch = async () => ({ ok: true, json: async () => d });
  await p.ui.cargarDatos();
  return { ...p, d, proyecto: p.ui.estado.proyectos[0] };
}
// Booking 1000, acumulado anterior 100, Commit 2026: mar 200, nov 50, dic 30.
// Backlog de la fuente = 1000 - 100 - 280 = 620. Ejecutado = 350.
const base = {
  fila: { valor_of: 1000, acumulado_anterior: 100, backlog: 620 },
  commits: { '2026-03': 200, '2026-11': 50, '2026-12': 30 },
};

test('con Fecha fin posterior al ultimo Commit, la curva y el calendario llegan hasta ella y muestran el saldo', async () => {
  const { ui, proyecto } = await cargar({ ...base, fin: '06/30/2027' });
  const meses = ui.calendarioVidaProyecto(proyecto);
  assert.equal(meses[0], '2026-03');
  assert.equal(meses.at(-1), '2027-06');
  assert.equal(meses.length, 16);
  const serie = ui.serieSaldoProyecto(proyecto);
  assert.equal(serie.datos['jun 2027']['Saldo contractual'], 620); // 1000 - (100 + 200 + 50 + 30)
  assert.equal(serie.datos['jun 2027']['Revenue acumulado'], 380);
  assert.equal(serie.saldo, 620);
  assert.equal(ui.proyeccionReferencia(proyecto), 380); // Proyectado: nada nuevo despues del ultimo Commit
});

test('sin Fecha fin no se inventa: la vida llega al ultimo mes con Commit', async () => {
  const { ui, proyecto } = await cargar({ ...base, upsides: { '2027-05': 99 } });
  assert.equal(ui.vidaProyecto(proyecto).fin, null);
  const meses = ui.calendarioVidaProyecto(proyecto);
  assert.equal(meses.at(-1), '2026-12'); // el Upside tampoco la alarga
  assert.equal(ui.advertenciaFueraDeFechaFin(proyecto), null);
});

test('un Commit posterior a la Fecha fin se conserva en la curva, el calendario y el Proyectado', async () => {
  const { ui, proyecto } = await cargar({ ...base, fin: '12/31/2026', commits: { ...base.commits, '2027-02': 40 } });
  assert.equal(ui.vidaProyecto(proyecto).fin, '2026-12');
  const meses = ui.calendarioVidaProyecto(proyecto);
  assert.equal(meses.at(-1), '2027-02'); // no se recorta en la Fecha fin
  const serie = ui.serieSaldoProyecto(proyecto);
  assert.equal(serie.datos['feb 2027']['Saldo contractual'], 580);
  assert.equal(ui.proyeccionReferencia(proyecto), 420);
});

test('con la Fecha fin anterior al primer Commit, el Commit registrado tampoco se pierde', async () => {
  const { ui, proyecto } = await cargar({ fila: base.fila, commits: { '2026-03': 200 }, fin: '12/31/2025' });
  const meses = ui.calendarioVidaProyecto(proyecto);
  assert.deepEqual([meses[0], meses.at(-1)], ['2026-03', '2026-03']);
  assert.equal(ui.serieSaldoProyecto(proyecto).datos['mar 2026']['Revenue acumulado'], 300);
});

test('la advertencia nombra el Commit posterior a la Fecha fin con su importe y sin tocarlo', async () => {
  const { ui, proyecto } = await cargar({ ...base, fin: '12/31/2026',
    commits: { ...base.commits, '2027-02': 40, '2027-04': 10 }, upsides: { '2027-02': 5 } });
  const vida = ui.vidaProyecto(proyecto);
  assert.equal(vida.commitPosteriorAFin, 50);
  assert.equal(vida.upsidePosteriorAFin, 5);
  const texto = ui.advertenciaFueraDeFechaFin(proyecto);
  assert.match(texto, /Commit posterior a la Fecha fin \(dic 2026\)/);
  assert.match(texto, /\$50/);
  assert.match(texto, /feb 2027/);
  assert.match(texto, /Upside/);
  assert.doesNotMatch(texto, /vigencia|corte/i);
  assert.equal(ui.proyeccionReferencia(proyecto), 430); // 350 + 30 + 40 + 10
});

test('sin importe posterior a la Fecha fin no hay advertencia', async () => {
  const { ui, proyecto } = await cargar({ ...base, fin: '12/31/2027' });
  assert.equal(ui.advertenciaFueraDeFechaFin(proyecto), null);
});

test('un mes sin cobertura hasta la Fecha fin queda sin dato, no cero', async () => {
  const { ui, proyecto } = await cargar({ ...base, fin: '03/31/2028' });
  const meses = ui.calendarioVidaProyecto(proyecto);
  assert.equal(meses.at(-1), '2028-03'); // la curva llega hasta la Fecha fin
  const serie = ui.serieSaldoProyecto(proyecto);
  assert.equal(serie.datos['dic 2027']['Saldo contractual'], 620);
  assert.equal(serie.datos['mar 2028']['Saldo contractual'], null);
  assert.equal(ui.proyeccionReferencia(proyecto), null);
  assert.equal(ui.serieSaldoProyecto(proyecto).saldo, null);
});

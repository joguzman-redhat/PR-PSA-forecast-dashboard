// Ticket 13 (ADR 0001): Backlog de toda la vida, Ejecutado y Proyectado.
// Valores esperados: ejemplos trabajados a mano, no recalculos del codigo.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pagina, datosTimeline, simularElementos } = require('./pagina-simulada');

// Un proyecto con fila de BackLog NOLA. `commits` fija el Commit de cada mes
// (el resto de los 24 meses cubiertos queda en 0); `upsides` igual para Upside.
async function cargar({ referencia = '2026-11-24', fin = null, fila = {}, commits = {}, upsides = {}, sinCobertura = [] } = {}) {
  const p = pagina();
  const d = datosTimeline();
  d.meta.fecha_referencia = referencia;
  d.proyectos[0].fecha_fin = fin;
  d.backlog[0] = { _tipo_fila: 'proyecto', num_pa: '123', clave_timeline: 'PA:123', anio_atributos: 2026, ...fila };
  for (const m of d.meta.periodos) { d.backlog[0][m + '_fijo'] = 0; d.backlog[0][m + '_upside'] = 0; }
  for (const [m, v] of Object.entries(commits)) d.backlog[0][m + '_fijo'] = v;
  for (const [m, v] of Object.entries(upsides)) d.backlog[0][m + '_upside'] = v;
  for (const m of sinCobertura) { delete d.backlog[0][m + '_fijo']; delete d.backlog[0][m + '_upside']; }
  p.context.fetch = async () => ({ ok: true, json: async () => d });
  await p.ui.cargarDatos();
  return { ...p, d, proyecto: p.ui.estado.proyectos[0] };
}
// Acumulado anterior 100; Commit 2026: mar 200, nov 50, dic 30; 2027: feb 40.
// Backlog de la fuente (FY26) = 1000 - 100 - (200 + 50 + 30) = 620.
const base = {
  fila: { valor_of: 1000, acumulado_anterior: 100, backlog: 620, acumulado_a_fecha: 999999, total_ejecutado_acumulado: 888888 },
  commits: { '2026-03': 200, '2026-11': 50, '2026-12': 30, '2027-02': 40 },
};

test('Ejecutado es el acumulado anterior mas el Commit hasta el mes actual, sin leer la columna de la API', async () => {
  const { ui, proyecto } = await cargar(base);
  assert.equal(ui.acumuladoHoy(proyecto), 350); // 100 + 200 + 50
});

test('Proyectado es Ejecutado mas el Commit de los meses futuros, incluido 2027', async () => {
  const { ui, proyecto } = await cargar(base);
  assert.equal(ui.commitPendienteProyecto(proyecto), 70); // 30 (dic 2026) + 40 (feb 2027)
  assert.equal(ui.proyeccionReferencia(proyecto), 420); // 350 + 70, no 888888 de la API
});

test('el Upside no entra en el Proyectado', async () => {
  const { ui, proyecto } = await cargar({ ...base, upsides: { '2026-12': 5000, '2027-02': 500 } });
  assert.equal(ui.proyeccionReferencia(proyecto), 420);
});

test('un Commit de febrero de 2027 descuenta el Backlog en la curva y en el Proyectado', async () => {
  const { ui, proyecto } = await cargar(base);
  let r = ui.resumenFinanciero([proyecto]);
  assert.equal(r.booking, 1000); // una sola vez
  assert.equal(r.backlog, 620); // el Backlog de la fuente no se toca
  assert.equal(r.proyectado, 420);
  assert.equal(r.backlogSinPlanear, 580); // 620 - 40
  assert.equal(r.diferencia, 0); // 1000 - 420 - 580
  let serie = ui.serieSaldoProyecto(proyecto);
  assert.equal(serie.saldo, 580);
  assert.equal(serie.datos['feb 2027']['Saldo contractual'], 580);
  // Con 90 en lugar de 40 el efecto se ve en los tres sitios.
  const otra = await cargar({ ...base, commits: { ...base.commits, '2027-02': 90 } });
  r = otra.ui.resumenFinanciero([otra.proyecto]);
  assert.equal(r.proyectado, 470);
  assert.equal(r.backlogSinPlanear, 530);
  assert.equal(r.diferencia, 0);
  serie = otra.ui.serieSaldoProyecto(otra.proyecto);
  assert.equal(serie.saldo, 530);
  assert.equal(serie.datos['feb 2027']['Revenue acumulado'], 470);
});

test('la identidad no se fuerza: si el Backlog de la fuente no cuadra, la diferencia lo muestra', async () => {
  const { ui, proyecto } = await cargar({ ...base, fila: { ...base.fila, backlog: 600 } });
  const r = ui.resumenFinanciero([proyecto]);
  assert.equal(r.backlogSinPlanear, 560); // 600 - 40
  assert.equal(r.diferencia, 20); // 1000 - 420 - 560
});

test('cuando el mes actual ya es de 2027 el Ejecutado incluye 2027 sin contar dos veces el arrastre', async () => {
  // Fuente FY27: su acumulado anterior (380) ya incluye 100 + 200 + 50 + 30 de 2026.
  const { ui, proyecto } = await cargar({
    referencia: '2027-02-10',
    fila: { anio_atributos: 2027, valor_of: 1000, acumulado_anterior: 380, backlog: 495, acumulado_a_fecha: 777 },
    commits: { '2026-03': 200, '2026-11': 50, '2026-12': 30, '2027-01': 25, '2027-02': 40, '2027-03': 60 },
  });
  assert.equal(ui.acumuladoHoy(proyecto), 445); // 100 + 280 + 25 + 40
  assert.equal(ui.proyeccionReferencia(proyecto), 505); // 445 + 60
  assert.equal(ui.serieSaldoProyecto(proyecto).saldo, 495); // 1000 - 505
});

test('un mes sin cobertura dentro de la vida deja el Proyectado sin dato, no en cero', async () => {
  const { ui, proyecto } = await cargar({ ...base, fin: '03/31/2027', sinCobertura: ['2027-02'] });
  assert.equal(ui.commitPendienteProyecto(proyecto), null);
  assert.equal(ui.proyeccionReferencia(proyecto), null);
  const r = ui.resumenFinanciero([proyecto]);
  assert.equal(r.proyectado, null);
  assert.equal(r.diferencia, null);
  assert.equal(r.faltantes, 1);
});

test('un Commit posterior a la Fecha fin se cuenta y no se recorta', async () => {
  const { ui, proyecto } = await cargar({ ...base, fin: '01/31/2027', commits: { ...base.commits, '2027-03': 25 } });
  assert.equal(ui.proyeccionReferencia(proyecto), 445); // 350 + 30 + 40 + 25
});

test('los KPIs muestran Proyectado y Commit pendiente sobre toda la vida', async () => {
  const { ui, context } = await cargar(base);
  const textoDe = simularElementos(context);
  ui.calcularKPIs();
  assert.equal(textoDe('kpi-commit-pendiente'), '$70');
  assert.equal(textoDe('kpi-proyectado'), '$420');
  assert.equal(textoDe('kpi-acumulado-hoy'), '$350');
  assert.equal(textoDe('kpi-diferencia-booking'), '$0');
});

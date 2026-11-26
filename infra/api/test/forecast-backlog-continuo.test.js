// Ticket 16 (ADR 0002): el Backlog mostrado es continuo entre años y el
// Proyectado nunca desaparece (se marca parcial). Valores esperados a mano.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pagina, datosTimeline, simularElementos } = require('./pagina-simulada');

async function cargar({ referencia = '2026-11-24', fin = null, fila = {}, commits = {}, sinCobertura = [], periodosExtra = [] } = {}) {
  const p = pagina();
  const d = datosTimeline();
  d.meta.fecha_referencia = referencia;
  d.meta.periodos.push(...periodosExtra);
  d.proyectos[0].fecha_fin = fin;
  d.backlog[0] = { _tipo_fila: 'proyecto', num_pa: '123', clave_timeline: 'PA:123', anio_atributos: 2026, ...fila };
  for (const m of d.meta.periodos) { d.backlog[0][m + '_fijo'] = 0; d.backlog[0][m + '_upside'] = 0; }
  for (const [m, v] of Object.entries(commits)) d.backlog[0][m + '_fijo'] = v;
  for (const m of sinCobertura) { delete d.backlog[0][m + '_fijo']; delete d.backlog[0][m + '_upside']; }
  p.context.fetch = async () => ({ ok: true, json: async () => d });
  await p.ui.cargarDatos();
  return { ...p, d, proyecto: p.ui.estado.proyectos[0] };
}
// Acumulado anterior 100; Commit 2026: mar 200, nov 50, dic 30; 2027: feb 40.
// Backlog de la fuente (FY26) = 1000 - 100 - 280 = 620; continuo = 620 - 40 = 580.
const base = {
  fila: { valor_of: 1000, acumulado_anterior: 100, backlog: 620 },
  commits: { '2026-03': 200, '2026-11': 50, '2026-12': 30, '2027-02': 40 },
};

test('el Backlog mostrado es el de la fuente menos el Commit posterior al Año fuente (PA 66600)', async () => {
  const { ui, proyecto } = await cargar({
    fila: { valor_of: 30000, acumulado_anterior: 4004, backlog: 20996 },
    commits: { '2026-03': 5000, '2027-02': 19975 },
  });
  assert.equal(ui.backlogDeLaFuente(proyecto), 20996);
  assert.equal(ui.backlogHoy(proyecto), 1021); // 20996 - 19975
});

test('sin Commit posterior al Año fuente el Backlog continuo es el de la fuente', async () => {
  const { ui, proyecto } = await cargar({ ...base, commits: { '2026-03': 200, '2026-11': 50, '2026-12': 30 } });
  assert.equal(ui.backlogHoy(proyecto), 620);
});

test('Booking = Ejecutado + Commit pendiente + Backlog continuo', async () => {
  const { ui, proyecto } = await cargar(base);
  const e = ui.acumuladoHoy(proyecto), c = ui.commitPendienteProyecto(proyecto), b = ui.backlogHoy(proyecto);
  assert.deepEqual([e, c, b], [350, 70, 580]);
  assert.equal(ui.valorBooking(proyecto), e + c + b);
  const r = ui.resumenFinanciero([proyecto]);
  assert.equal(r.backlog, 580);
  assert.equal(r.backlogFuente, 620);
  assert.equal(r.diferencia, 0);
});

test('la tarjeta de Backlog muestra el Backlog continuo, no el de la fuente', async () => {
  const { ui, context, proyecto } = await cargar(base);
  const textoDe = simularElementos(context);
  ui.estado.proyectosFiltrados = [proyecto];
  ui.calcularKPIs();
  assert.equal(textoDe('kpi-backlog-2026'), ui.formatearDinero(580));
});

test('un proyecto sin cifras no cuenta como cero en el Backlog ni en el % de ejecucion', async () => {
  const { ui, context, d } = await cargar(base);
  // Segundo proyecto: tiene Booking pero le falta un mes pasado (Ejecutado sin dato) y no tiene Backlog.
  d.proyectos.push({ _tipo_fila: 'proyecto', num_pa: '456', clave_timeline: 'PA:456' });
  const b2 = { _tipo_fila: 'proyecto', num_pa: '456', clave_timeline: 'PA:456', anio_atributos: 2026, valor_of: 1000, acumulado_anterior: 100 };
  for (const m of d.meta.periodos) b2[m + '_fijo'] = 0;
  b2['2026-03_fijo'] = 200;
  delete b2['2026-08_fijo']; // un mes pasado sin dato dentro de la vida
  d.backlog.push(b2);
  await ui.cargarDatos();
  const textoDe = simularElementos(context);
  ui.estado.proyectosFiltrados = ui.estado.proyectos;
  ui.calcularKPIs();
  // Solo el primer proyecto tiene Ejecutado: 350 / 1000, no 350 / 2000.
  assert.equal(textoDe('kpi-pct-ejecucion'), '35.0%');
  // El segundo no tiene Backlog: no suma cero, y el total es el del primero.
  assert.equal(textoDe('kpi-backlog-2026'), ui.formatearDinero(580));
  // Sin ningun proyecto con Backlog el total es "sin dato", no $0.
  ui.estado.proyectosFiltrados = [ui.estado.proyectos[1]];
  ui.calcularKPIs();
  assert.equal(textoDe('kpi-backlog-2026'), '—');
  assert.equal(textoDe('kpi-pct-ejecucion'), '—');
});

test('Fecha fin en 2028 sin cobertura: el Proyectado se calcula con el Commit que existe y se marca parcial', async () => {
  const { ui, proyecto } = await cargar({ ...base, fin: '06/30/2028' });
  assert.equal(ui.commitPendienteProyecto(proyecto), 70); // dic 2026 + feb 2027; 2028 no cuenta como cero
  assert.equal(ui.proyeccionReferencia(proyecto), 420);
  assert.equal(ui.coberturaProyectado(proyecto).hasta, '2027-12');
  assert.deepEqual(Array.from(ui.coberturaProyectado(proyecto).anios), [2028]);
  assert.equal(ui.textoProyectadoParcial(proyecto), 'Proyectado parcial: cubre hasta dic 2027; faltan meses de 2028. Los meses sin cobertura no se cuentan como cero.');
  const r = ui.resumenFinanciero([proyecto]);
  assert.equal(r.proyectado, 420);
  assert.equal(r.pendiente, 70);
  assert.equal(r.parciales, 1);
  assert.equal(r.faltantes, 1); // cifras incompletas: la conciliacion no se afirma
  assert.equal(r.diferencia, null);
});

test('un proyecto con toda la cobertura no se marca parcial', async () => {
  const { ui, proyecto } = await cargar({ ...base, fin: '12/31/2027' });
  assert.equal(ui.coberturaProyectado(proyecto), null);
  assert.equal(ui.textoProyectadoParcial(proyecto), null);
  assert.equal(ui.resumenFinanciero([proyecto]).parciales, 0);
});

test('cuando llega la cobertura de 2028 el Proyectado se completa solo', async () => {
  const periodosExtra = ['2028-01', '2028-02', '2028-03', '2028-04', '2028-05', '2028-06'];
  const { ui, proyecto } = await cargar({ ...base, fin: '06/30/2028', periodosExtra,
    commits: { ...base.commits, '2028-02': 25, '2028-05': 15 } });
  assert.equal(ui.coberturaProyectado(proyecto), null);
  assert.equal(ui.commitPendienteProyecto(proyecto), 110); // 30 + 40 + 25 + 15
  assert.equal(ui.proyeccionReferencia(proyecto), 460);
  assert.equal(ui.backlogHoy(proyecto), 540); // 620 - (40 + 25 + 15)
  const r = ui.resumenFinanciero([proyecto]);
  assert.equal(r.parciales, 0);
  assert.equal(r.diferencia, 0);
});

test('el KPI Proyectado avisa cuantos proyectos son parciales', async () => {
  const { ui, context, proyecto } = await cargar({ ...base, fin: '06/30/2028' });
  const textoDe = simularElementos(context);
  ui.estado.proyectosFiltrados = [proyecto];
  ui.calcularKPIs();
  assert.equal(textoDe('kpi-proyectado'), ui.formatearDinero(420));
  assert.equal(textoDe('kpi-proyectado-aviso'), 'Parcial en 1 de 1 proyectos');
});

test('un mes sin cobertura sigue sin dato en la curva mensual', async () => {
  const { ui, proyecto } = await cargar({ ...base, fin: '06/30/2028' });
  const serie = ui.serieSaldoProyecto(proyecto);
  assert.equal(serie.datos['dic 2027']['Backlog'], 580);
  assert.equal(serie.datos['mar 2028']['Backlog'], null);
});

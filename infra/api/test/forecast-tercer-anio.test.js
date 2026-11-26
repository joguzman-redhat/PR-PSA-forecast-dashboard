// Ticket 17: un tercer Año fuente (2028) funciona sin tocar codigo. La fuente
// sintetica trae TRES años (36 periodos); valores esperados calculados a mano.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { pagina, datosTimeline } = require('./pagina-simulada');

// Acumulado anterior 100; Commit 2026: mar 200, nov 50, dic 30; 2027: feb 40;
// 2028: mar 70, jun 30. Hoy es 2026-11-24, asi que el mes actual es 2026-11.
const COMMITS = { '2026-03': 200, '2026-11': 50, '2026-12': 30, '2027-02': 40, '2028-03': 70, '2028-06': 30 };

async function cargar({ anios = 3, fin = null, fuente = 2026, backlog = 620, search = '', sinDato = [] } = {}) {
  const p = pagina(search);
  const d = datosTimeline(anios);
  d.proyectos[0].fecha_fin = fin;
  d.backlog[0] = { _tipo_fila: 'proyecto', num_pa: '123', clave_timeline: 'PA:123', anio_atributos: fuente,
    valor_of: 1000, acumulado_anterior: 100, backlog };
  for (const m of d.meta.periodos) { d.backlog[0][m + '_fijo'] = COMMITS[m] ?? 0; d.backlog[0][m + '_upside'] = 0; }
  for (const m of sinDato) delete d.backlog[0][m + '_fijo'];
  p.context.fetch = async () => ({ ok: true, json: async () => d });
  await p.ui.cargarDatos();
  return { ...p, d, proyecto: p.ui.estado.proyectos[0] };
}

test('el calendario y los selectores salen de los periodos de la API: 36 meses', async () => {
  const { ui, controles, context } = await cargar();
  context.history = { replaceState(_s, _t, url) { context.location.href = String(url); } };
  context.document.querySelectorAll = () => [];
  vm.runInContext('aplicarFiltros=()=>{};actualizarUI=()=>{};renderizarTrazabilidad=()=>{};renderizarPMs=()=>{};', context);
  ui.configurarSelectorForecast();
  assert.equal(ui.estado.forecast.periodos.length, 36);
  assert.equal(ui.estado.forecast.periodos.at(-1), '2028-12');
  const unidad = controles.get('forecast-unidad');
  assert.equal(controles.get('forecast-desde').opciones.length, 12); // trimestres
  unidad.value = 'meses'; unidad.handlers.change();
  assert.equal(controles.get('forecast-desde').opciones.length, 36);
  assert.equal(controles.get('forecast-hasta').opciones.at(-1).value, '2028-12');
  ui.estado.periodo = 'y2028'; assert.equal(ui.mesesActivos().length, 12);
  ui.estado.periodo = '2028-q4'; assert.equal(ui.mesesActivos().length, 3);
});

test('el rango por defecto va del trimestre actual al ultimo mes que trae la API', async () => {
  const { ui } = await cargar();
  assert.deepEqual({ ...ui.estado.rangoTimeline }, { desde: '2026-10', hasta: '2028-12' });
  assert.equal(ui.periodoActual().meses.length, 27);
});

test('con dos años el rango termina en el ultimo mes de la API', async () => {
  const { ui } = await cargar({ anios: 2 });
  assert.equal(ui.estado.forecast.periodos.length, 24);
  assert.deepEqual({ ...ui.estado.rangoTimeline }, { desde: '2026-10', hasta: '2027-12' });
});

test('con un solo año el calendario no se inventa un segundo año', async () => {
  const { ui } = await cargar({ anios: 1 });
  assert.equal(ui.estado.forecast.periodos.length, 12);
  assert.deepEqual({ ...ui.estado.rangoTimeline }, { desde: '2026-10', hasta: '2026-12' });
});

test('un rango explicito en la URL se respeta con tres años', async () => {
  const { ui } = await cargar({ search: '?desde=2027-01&hasta=2028-06' });
  assert.equal(ui.periodoActual().meses.length, 18);
});

test('el Proyectado de un proyecto que termina en 2028 pasa de parcial a completo al cargar 2028', async () => {
  const antes = await cargar({ anios: 2, fin: '06/30/2028' });
  assert.deepEqual([...antes.ui.coberturaProyectado(antes.proyecto).anios], [2028]);
  assert.match(antes.ui.textoProyectadoParcial(antes.proyecto), /cubre hasta dic 2027; faltan meses de 2028/);
  assert.equal(antes.ui.proyectadaAnio(antes.proyecto), 350 + 70); // Ejecutado + dic 2026 + feb 2027
  const despues = await cargar({ anios: 3, fin: '06/30/2028' });
  assert.equal(despues.ui.coberturaProyectado(despues.proyecto), null);
  assert.equal(despues.ui.textoProyectadoParcial(despues.proyecto), null);
  assert.equal(despues.ui.proyectadaAnio(despues.proyecto), 350 + 170); // + mar y jun 2028
});

test('un mes de 2028 sin dato dentro de la vida deja el Proyectado parcial aunque ya haya tres años', async () => {
  const { ui, proyecto } = await cargar({ fin: '06/30/2028', sinDato: ['2028-05'] });
  assert.deepEqual([...ui.coberturaProyectado(proyecto).faltantes], ['2028-05']);
  assert.equal(ui.proyectadaAnio(proyecto), 350 + 170); // el mes sin dato no se cuenta como cero
});

test('el Backlog continuo descuenta el Commit de 2027 y de 2028 (fuente FY26)', async () => {
  const { ui, proyecto } = await cargar();
  assert.equal(ui.backlogDeLaFuente(proyecto), 620);
  assert.equal(ui.backlogHoy(proyecto), 620 - 40 - 100);
});

test('con fuente FY27 el Backlog continuo solo descuenta lo posterior a 2027', async () => {
  const { ui, proyecto } = await cargar({ fuente: 2027, backlog: 580 });
  assert.equal(ui.backlogHoy(proyecto), 580 - 100);
});

test('Booking se cuenta una sola vez y cierra con Ejecutado + Commit pendiente + Backlog', async () => {
  const { ui, proyecto } = await cargar({ fin: '06/30/2028' });
  const r = ui.resumenFinanciero([proyecto]);
  assert.equal(ui.valorBooking(proyecto), 1000);
  assert.equal(r.booking, 1000);
  assert.equal(ui.acumuladoHoy(proyecto), 350);
  assert.equal(r.pendiente, 170);
  assert.equal(r.backlog, 480);
  assert.equal(350 + r.pendiente + r.backlog, r.booking);
  assert.equal(r.diferencia, 0);
  assert.deepEqual([...r.referencias], [2026]);
});

test('ningun texto ni calculo del front nombra un año fijo', () => {
  const dir = path.join(__dirname, '../../../js');
  const permitidos = new Set(['estado.js']); // valor inicial que carga-datos.js reemplaza por anio_actual
  const hallazgos = [];
  for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.js') && !permitidos.has(n))) {
    const codigo = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1').replaceAll('kpi-backlog-2026', 'kpi-backlog'); // id del DOM, no se muestra
    codigo.split('\n').forEach((l, i) => { if (/(^|[^\w])20[2-3]\d([^\w]|$)/.test(l)) hallazgos.push(`${f}:${i + 1}`); });
  }
  assert.deepEqual(hallazgos, []);
});

// Pruebas de caracterizacion de los calculos de dinero del front (ticket 01).
// Fijan el comportamiento actual, tal como lo exigen docs/REGLAS_DE_DATOS.md y
// GLOSSARY.md, para que el refactor modular no cambie ninguna cifra. Los
// valores esperados son literales de ejemplos trabajados, no recalculos.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pagina, datosTimeline, simularElementos } = require('./pagina-simulada');

// Carga el front con un timeline donde `mutar` ajusta proyectos y filas.
async function cargar(mutar = () => {}) {
  const p = pagina();
  const d = datosTimeline();
  mutar(d);
  p.context.fetch = async () => ({ ok: true, json: async () => d });
  await p.ui.cargarDatos();
  return { ...p, d };
}
// Una fila del timeline: sirve igual para un proyecto de Info y para su fila de BackLog NOLA.
const entidad = (pa, extra) => ({ _tipo_fila: 'proyecto', num_pa: pa, clave_timeline: 'PA:' + pa, ...extra });

test('Booking sale de BackLog NOLA y nunca de Info Proyectos (PA 65006)', async () => {
  const { ui } = await cargar(d => {
    // Info Proyectos trae los montos sin factor de conversion; BackLog NOLA ya convertidos.
    d.proyectos = [entidad('65006', { valor_of: 974930, consumido_2025: 352766, backlog_2026: 622164 })];
    d.backlog = [entidad('65006', { valor_of: 920541, acumulado_anterior: 333086, backlog: 13547 })];
  });
  const p = ui.estado.proyectos[0];
  assert.equal(ui.valorBooking(p), 920541);
  assert.equal(ui.acumuladoAnterior(p), 333086);
  assert.equal(ui.backlogHoy(p), 13547);
});

test('un proyecto sin fila en BackLog NOLA no tiene cifras y no cae a los valores de Info', async () => {
  const { ui } = await cargar(d => {
    d.proyectos.push(entidad('999', { valor_of: 500000, consumido_2025: 100000 }));
  });
  const sinBacklog = ui.estado.proyectos.find(p => p.num_pa === '999');
  assert.equal(ui.valorBooking(sinBacklog), null);
  assert.equal(ui.backlogHoy(sinBacklog), null);
  assert.equal(ui.acumuladoHoy(sinBacklog), null);
  assert.equal(ui.acumuladoAnterior(sinBacklog), null);
  assert.equal(ui.revenuePeriodo(sinBacklog), null);
  assert.equal(ui.upsidePeriodo(sinBacklog), null);
  assert.equal(ui.porcentajeEjecucionProyecto(sinBacklog), null);
});

test('un importe que no es numero (N/A, texto) se trata como ausente, no como cero', async () => {
  const { ui } = await cargar(d => {
    d.proyectos = [entidad('1')];
    d.backlog = [entidad('1', { valor_of: 'N/A', backlog: '#N/A', acumulado_anterior: 'N/A' })];
  });
  const p = ui.estado.proyectos[0];
  assert.equal(ui.valorBooking(p), null);
  assert.equal(ui.backlogHoy(p), null);
  assert.equal(ui.acumuladoAnterior(p), null);
});

test('Backlog es la columna del Excel tal cual, no Booking menos acumulado', async () => {
  const { ui } = await cargar(d => {
    d.backlog = [entidad('123', { valor_of: 920541, acumulado_a_fecha: 333086, backlog: 13547 })];
  });
  const p = ui.estado.proyectos[0];
  assert.equal(ui.backlogHoy(p), 13547); // 920541 - 333086 daria 587455
});

test('Ejecutado se lee de la fila cuando no hay meses, y el Proyectado ya no se lee de la API, sin completarlos desde Info', async () => {
  const { ui } = await cargar(d => {
    d.proyectos = [entidad('123', { consumido_2025: 1 })];
    d.backlog = [entidad('123', { valor_of: 920541, acumulado_a_fecha: 880000, total_ejecutado_acumulado: 906994, backlog: 13547 })];
  });
  const p = ui.estado.proyectos[0];
  assert.equal(ui.acumuladoHoy(p), 880000);
  // ADR 0001: Proyectado se calcula sobre toda la vida; total_ejecutado_acumulado (906994) solo llega al fin del Año fuente.
  assert.equal(ui.proyectadaAnio(p), null);
});

test('el porcentaje de ejecucion es Ejecutado sobre Booking y falta sin Booking positivo', async () => {
  const { ui } = await cargar(d => {
    d.proyectos = [entidad('1'), entidad('2'), entidad('3')];
    d.backlog = [
      entidad('1', { valor_of: 2000, acumulado_a_fecha: 500 }),
      entidad('2', { valor_of: 0, acumulado_a_fecha: 0 }),
      entidad('3', { valor_of: 1000 }),
    ];
  });
  const [a, b, c] = ui.estado.proyectos;
  assert.equal(ui.porcentajeEjecucionProyecto(a), 25);
  assert.equal(ui.porcentajeEjecucionProyecto(b), null); // Booking cero
  assert.equal(ui.porcentajeEjecucionProyecto(c), null); // sin Ejecutado
});

test('Commit pendiente son los meses posteriores al mes actual del Año fuente', async () => {
  // fecha_referencia 2026-11-24: el mes actual es noviembre, solo diciembre esta pendiente.
  const { ui } = await cargar(d => {
    d.backlog = [entidad('123', { anio_atributos: 2026, '2026-11_fijo': 700, '2026-12_fijo': 30 })];
  });
  assert.equal(ui.corteFinanciero(), '2026-11');
  assert.equal(ui.commitPendienteProyecto(ui.estado.proyectos[0]), 30);
});

test('con una fuente de 2027 todo ese año esta pendiente', async () => {
  const { ui } = await cargar(d => {
    const extra = { anio_atributos: 2027 };
    for (let m = 1; m <= 12; m++) extra['2027-' + String(m).padStart(2, '0') + '_fijo'] = 10;
    d.backlog = [entidad('123', extra)];
  });
  assert.equal(ui.commitPendienteProyecto(ui.estado.proyectos[0]), 120);
});

test('Commit pendiente queda sin dato si falta un mes pendiente, no se cuenta como cero', async () => {
  const { ui } = await cargar(d => {
    d.backlog = [entidad('123', { anio_atributos: 2026, '2026-11_fijo': 700 })]; // falta diciembre
  });
  const p = ui.estado.proyectos[0];
  assert.equal(ui.commitPendienteProyecto(p), null);
  assert.equal(ui.proyeccionReferencia(p), null);
});

test('el Proyectado de referencia es Ejecutado mas Commit pendiente', async () => {
  const { ui } = await cargar(d => {
    d.backlog = [entidad('123', { anio_atributos: 2026, acumulado_a_fecha: 880000, '2026-12_fijo': 27000 })];
  });
  assert.equal(ui.proyeccionReferencia(ui.estado.proyectos[0]), 907000);
});

test('Booking = Ejecutado + Commit pendiente + Backlog concilia a cero (cifras de PA 65006)', async () => {
  // 880.000 + 27.000 + 13.541 = 920.541
  const { ui } = await cargar(d => {
    d.backlog = [entidad('123', { anio_atributos: 2026, valor_of: 920541, acumulado_a_fecha: 880000, backlog: 13541, '2026-12_fijo': 27000 })];
  });
  const r = ui.resumenFinanciero(ui.estado.proyectos);
  assert.equal(r.booking, 920541);
  assert.equal(r.backlog, 13541);
  assert.equal(r.proyectado, 907000);
  assert.equal(r.diferencia, 0);
});

test('Commit y Upside del periodo suman solo los meses del rango', async () => {
  const { ui } = await cargar(d => {
    d.backlog = [entidad('123', {
      '2026-10_fijo': 1000, '2026-11_fijo': 100, '2026-12_fijo': 50, '2027-01_fijo': 25, '2027-02_fijo': 9999,
      '2026-11_upside': 7, '2026-12_upside': 3, '2027-01_upside': 1,
    })];
  });
  ui.estado.periodo = 'rango';
  ui.estado.rangoTimeline = { desde: '2026-11', hasta: '2027-01' };
  const p = ui.estado.proyectos[0];
  assert.equal(ui.revenuePeriodo(p), 175);
  assert.equal(ui.upsidePeriodo(p), 11);
});

test('los KPIs ponderan por monto, ignoran proyectos sin cifras y no los cuentan como cero', async () => {
  const { ui, context } = await cargar(d => {
    d.proyectos = [entidad('A'), entidad('B'), entidad('C')];
    d.backlog = [
      entidad('A', { anio_atributos: 2026, valor_of: 2000000, acumulado_a_fecha: 1000000, backlog: 1000000,
        '2026-11_fijo': 5000, '2026-12_fijo': 500, '2026-11_upside': 1000 }),
      entidad('B', { anio_atributos: 2026, valor_of: 20000, acumulado_a_fecha: 20000, backlog: 0, '2026-12_fijo': 2500 }),
    ]; // C no tiene fila en BackLog NOLA
  });
  const textoDe = simularElementos(context);
  ui.calcularKPIs();
  assert.equal(textoDe('kpi-total-proyectos'), '3');
  assert.equal(textoDe('kpi-valor-of-total'), '$2.02M');
  assert.equal(textoDe('kpi-acumulado-hoy'), '$1.02M');
  assert.equal(textoDe('kpi-backlog-2026'), '$1.00M');
  // Ponderado: 1.020.000 / 2.020.000 = 50,5 %. El promedio de porcentajes daria 75,0 %.
  assert.equal(textoDe('kpi-pct-ejecucion'), '50.5%');
  assert.equal(textoDe('kpi-revenue-periodo'), '$8.0K');
  assert.equal(textoDe('kpi-upside-periodo'), '$1.0K');
  assert.equal(textoDe('kpi-commit-pendiente'), '$3.0K');
  assert.equal(textoDe('kpi-proyectado'), '$1.02M');
  assert.equal(textoDe('kpi-diferencia-booking'), '—'); // C tiene cifras incompletas
});

test('el dinero se abrevia con signo aparte y el exacto no redondea mal las notas de credito', () => {
  const { ui } = pagina();
  assert.equal(ui.formatearDinero(0), '$0');
  assert.equal(ui.formatearDinero(999), '$999');
  assert.equal(ui.formatearDinero(1500), '$1.5K');
  assert.equal(ui.formatearDinero(14179), '$14K');
  assert.equal(ui.formatearDinero(1500000), '$1.50M');
  assert.equal(ui.formatearDinero(-1792.5), '-$1.8K');
  assert.equal(ui.formatearDinero(null), '—');
  assert.equal(ui.formatearDinero(undefined), '—');
  assert.equal(ui.formatearDineroExacto(41541), '$41,541');
  assert.equal(ui.formatearDineroExacto(-1234.4), '−$1,234');
  assert.equal(ui.formatearDineroExacto(null), '—');
  assert.equal(ui.formatearPorcentaje(0.811), '81.1%');
  assert.equal(ui.formatearPorcentaje(null), '—');
});

test('Fecha fin se lee de ISO, formato americano y serial de Excel, y una fecha inexistente es ausente', () => {
  const { ui } = pagina();
  assert.equal(ui.periodoFinProyecto({ fecha_fin: '12/31/2027' }), '2027-12');
  assert.equal(ui.periodoFinProyecto({ fecha_fin: '2027-12-31T00:00:00.000Z' }), '2027-12');
  assert.equal(ui.periodoFinProyecto({ fecha_fin: 46752 }), '2027-12');
  assert.equal(ui.periodoFinProyecto({ fecha_fin: '02/30/2027' }), null);
  assert.equal(ui.periodoFinProyecto({ fecha_fin: 'pronto' }), null);
  assert.equal(ui.periodoFinProyecto({ fecha_fin: '' }), null);
  assert.equal(ui.periodoFinProyecto({}), null);
});

test('la vida empieza en el primer Commit distinto de cero, cuenta creditos y nunca inventa Fecha fin', async () => {
  const { ui } = await cargar(d => {
    d.backlog = [entidad('123', { '2026-01_fijo': 0, '2026-02_fijo': 0, '2026-03_fijo': 100 })];
  });
  const p = ui.estado.proyectos[0];
  let vida = ui.vidaProyecto(p);
  assert.equal(vida.inicio, '2026-03');
  assert.equal(vida.fin, null); // sin Fecha fin no se deriva del Commit
  assert.equal(vida.fueraDeVigencia, false);
  ui.estado.backlog[0]['2026-01_fijo'] = -20; // una nota de credito es actividad registrada
  assert.equal(ui.vidaProyecto(p).inicio, '2026-01');
});

test('un Commit o Upside posterior a la Fecha fin se marca fuera de la Vida del proyecto sin tocar el importe', async () => {
  const { ui } = await cargar(d => {
    d.proyectos = [entidad('123', { fecha_fin: '12/31/2026' })];
    d.backlog = [entidad('123', { '2026-03_fijo': 100, '2027-02_upside': 50 })];
  });
  const p = ui.estado.proyectos[0];
  assert.equal(ui.vidaProyecto(p).fueraDeVigencia, true);
  assert.equal(ui.vidaProyecto(p).inicio, '2026-03'); // el Upside no define el inicio
  ui.estado.periodo = 'rango';
  ui.estado.rangoTimeline = { desde: '2027-02', hasta: '2027-02' };
  assert.equal(ui.upsidePeriodo(p), 50); // el importe no se recorta
});

test('el acumulado anterior acepta el nombre anterior acum_2025', async () => {
  const { ui } = await cargar(d => {
    d.proyectos = [entidad('1')];
    d.backlog = [entidad('1', { acum_2025: 333086 })];
  });
  assert.equal(ui.acumuladoAnterior(ui.estado.proyectos[0]), 333086);
});

test('la fila de BackLog se une por clave, luego por PA y luego por nombre, nunca por posicion', async () => {
  const { ui } = await cargar(d => {
    d.proyectos = [entidad('555')];
    d.backlog = [entidad('555', { nombre_del_proyecto: 'Proyecto Ñandú', valor_of: 42 })];
  });
  const esperada = ui.estado.backlog[0];
  assert.equal(ui.backlogDe({ clave_timeline: 'PA:555' }), esperada);
  assert.equal(ui.backlogDe({ num_pa: 555 }), esperada);
  assert.equal(ui.backlogDe({ nombre_del_proyecto: 'PROYECTO NANDU' }), esperada);
  assert.equal(ui.backlogDe({ num_pa: 999, nombre_del_proyecto: 'otro proyecto' }), null);
  // Con una clave que no existe no se rescata por PA: evita mezclar proyectos distintos.
  assert.equal(ui.backlogDe({ clave_timeline: 'PA:000', num_pa: 555 }), null);
});

test('el periodo por trimestre, año, mes o todo el historico suma solo sus meses', async () => {
  const { ui } = await cargar(d => {
    d.backlog = [entidad('123', {
      '2026-10_fijo': 10, '2026-11_fijo': 20, '2026-12_fijo': 30, '2027-01_fijo': 40, '2027-03_fijo': 5,
    })];
  });
  const p = ui.estado.proyectos[0];
  const suma = periodo => { ui.estado.periodo = periodo; return ui.revenuePeriodo(p); };
  assert.equal(suma('2026-q4'), 60);
  assert.equal(suma('2027-q1'), 45);
  assert.equal(suma('y2027'), 45);
  assert.equal(suma('2026-11'), 20);
  assert.equal(suma('todos'), 105);
  assert.equal(suma('periodo-inexistente'), 105); // un periodo desconocido cae a todo el historico
  ui.estado.periodo = '2026-q4';
  assert.equal(ui.periodoActual().meses.length, 3);
});

test('la Diferencia del KPI muestra el importe sin conciliar y cero cuando concilia', async () => {
  const { ui, context } = await cargar(d => {
    d.backlog = [entidad('123', { anio_atributos: 2026, valor_of: 1000, acumulado_a_fecha: 700, backlog: 270, '2026-12_fijo': 10 })];
  });
  const textoDe = simularElementos(context);
  ui.calcularKPIs();
  assert.equal(textoDe('kpi-diferencia-booking'), '$20'); // 1000 - 270 - 710: 20 sin conciliar
  ui.estado.backlog[0]['2026-12_fijo'] = 30;
  ui.calcularKPIs();
  assert.equal(textoDe('kpi-diferencia-booking'), '$0'); // 1000 - 270 - 730
});

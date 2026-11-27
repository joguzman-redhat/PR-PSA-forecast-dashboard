// Respuesta de /api/timeline para el modo demo: misma forma que timeline.js,
// con datos 100% ficticios y deterministas (sin azar ni reloj). No lee Excel,
// Postgres ni credenciales. Sirve para ejecutar el front sin la base real.
const FECHA_REFERENCIA = '2026-11-24';
const MES_REFERENCIA = FECHA_REFERENCIA.slice(0, 7);
const PERIODOS = Array.from({ length: 24 }, (_, i) => `${2026 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`);
const IDX_REF = PERIODOS.indexOf(MES_REFERENCIA);
const CORTES = [
  { id: 't1', timestamp: '2026-10-26T09:00:00Z', etiqueta: 'DEMO · corte 1' },
  { id: 't2', timestamp: '2026-11-09T09:00:00Z', etiqueta: 'DEMO · corte 2' },
  { id: 't3', timestamp: '2026-11-23T09:00:00Z', etiqueta: 'DEMO · corte 3' },
];
const CLIENTES = ['Alfa', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'];
const PMS = ['PM Ficticio A', 'PM Ficticio B', 'PM Ficticio C', 'PM Ficticio D', 'PM Ficticio E'];
const PAISES = ['Mexico', 'Mexico', 'Colombia', 'Chile', 'Peru', 'Argentina'];

// Cada fila: [estado, semaforo, handover, fecha_fin, mes_inicio, mes_fin_commit, base, acumulado_anterior, backlog_continuo, extras]
// Los meses son indices de PERIODOS (0 = 2026-01, 23 = 2027-12). extras: anio (Año fuente),
// notas (indice -> importe negativo), sinBacklog, sinCobertura2027.
const ESPECIFICACIONES = [
  ['In Progress', 'Green', true, '2027-03-31', 0, 14, 8000, 12000, 0, {}],
  ['In Progress', 'Yellow', false, '2026-12-31', 0, 11, 6000, 3000, 0, {}],
  ['In Progress', 'Red', false, '2027-12-31', 2, 14, 5000, 0, 24000, {}], // Fecha fin posterior al ultimo Commit
  ['In Progress', 'Green', false, null, 1, 16, 7000, 5000, 9000, {}], // sin Fecha fin
  ['In Progress', 'Yellow', true, '2026-09-30', 0, 11, 4000, 1000, 0, {}], // Commit posterior a la Fecha fin
  ['In Progress', 'Green', false, '2027-06-30', 4, 17, 9000, 20000, 15000, {}],
  ['In Progress', 'Red', false, '2026-12-31', 3, 11, 3500, 0, 6000, {}],
  ['In Progress', 'Green', false, '2027-12-31', 0, 22, 6500, 8000, 0, {}],
  ['In Progress', 'Yellow', false, '2027-02-28', 2, 13, 5500, 4500, 3000, {}],
  ['In Progress', 'Green', true, '2026-11-30', 0, 10, 12000, 30000, 0, {}],
  ['In Progress', 'Green', false, '2027-09-30', 6, 20, 4800, 0, 12000, {}],
  ['In Progress', 'Red', false, null, 0, 12, 3000, 2000, 5000, {}],
  ['In Progress', 'Green', false, '2027-05-31', 1, 16, 7200, 9000, 4000, { notas: { 5: -6000 } }], // nota de credito
  ['In Progress', 'Yellow', false, '2027-12-31', 8, 23, 4000, 0, 30000, {}],
  ['In Progress', 'Green', false, '2027-10-31', 0, 21, 5200, 6000, 0, { sinCobertura2027: true }], // Proyectado parcial
  ['On Hold', 'Red', false, '2026-12-31', 0, 8, 2500, 1500, 12000, {}],
  ['On Hold', 'Yellow', true, '2027-03-31', 0, 9, 3200, 0, 20000, {}],
  ['On Hold', 'Red', false, null, 2, 7, 2000, 500, 18000, {}],
  ['On Hold', 'Yellow', false, '2026-10-31', 0, 6, 2800, 0, 7000, {}],
  ['Planned', 'Green', false, '2027-12-31', 12, 23, 6000, 0, 8000, { anio: 2027 }], // solo FY27
  ['Planned', 'Yellow', false, '2027-08-31', 11, 19, 5000, 0, 12000, {}],
  ['Planned', 'Green', false, null, 13, 20, 4500, 0, 10000, {}],
  ['Planned', 'Green', false, '2026-12-31', 11, 11, 15000, 0, 30000, {}],
  ['Completed', 'Green', false, '2026-08-31', 0, 7, 6000, 10000, 0, {}],
  ['Completed', 'Green', true, '2026-06-30', 0, 5, 5000, 0, 0, {}],
  ['Completed', 'Green', false, '2026-10-31', 1, 9, 4500, 7000, 0, { notas: { 8: -3000 } }],
  ['In Progress', 'Green', false, '2027-01-31', 0, 12, 9000, 14000, 2000, {}],
  ['In Progress', 'Yellow', false, '2027-12-31', 5, 17, 4200, 0, 16000, {}],
  ['In Progress', 'Green', false, '2026-12-31', 0, 11, 5800, 2500, 0, { sinBacklog: true }], // sin fila de backlog
  ['Planned', 'Yellow', false, '2027-04-30', 14, 16, 8000, 0, 5000, {}],
];

const redondear = (n) => Math.round(n / 100) * 100;
const pa = (k) => `DEMO-${String(k + 1).padStart(3, '0')}`;

// Commit y Upside por periodo (null = sin cobertura). Variacion fija por indice.
function serieMensual(k, [, , , , ini, fin, base, , , extras]) {
  const anio = extras.anio || 2026;
  return PERIODOS.map((periodo, i) => {
    if (Number(periodo.slice(0, 4)) < anio) return { commit: null, upside: null };
    if (extras.sinCobertura2027 && i >= 12) return { commit: null, upside: null };
    const dentro = i >= ini && i <= fin;
    let commit = dentro ? redondear(base * (1 + ((i * 3 + k) % 4) / 10)) : 0;
    if (extras.notas?.[i] !== undefined) commit = extras.notas[i];
    const upside = dentro && i >= IDX_REF && k % 3 === 0 ? redondear(commit * 0.3) : 0;
    return { commit, upside };
  });
}

function construirProyectos() {
  return ESPECIFICACIONES.map((esp, k) => {
    const [estado, semaforo, handover, fin, , , , acumulado, continuo, extras] = esp;
    const anio = extras.anio || 2026;
    const meses = serieMensual(k, esp).map((m, i) => ({ periodo: PERIODOS[i], ...m, disponible: m.commit !== null }));
    const suma = (filtro) => meses.filter(filtro).reduce((a, m) => a + (m.commit || 0), 0);
    const delAnio = suma(m => Number(m.periodo.slice(0, 4)) === anio);
    const posterior = suma(m => Number(m.periodo.slice(0, 4)) > anio);
    // Booking = Ejecutado + Commit pendiente + Backlog continuo.
    const booking = acumulado + delAnio + posterior + continuo;
    return {
      pa: pa(k), k, estado, semaforo, handover, fin, anio, acumulado, meses,
      booking, backlogFuente: booking - acumulado - delAnio,
      totalEjecutado: acumulado + delAnio, sinBacklog: !!extras.sinBacklog,
    };
  });
}

function filaInfo(e) {
  const i = e.k;
  return {
    _tipo_fila: 'proyecto', _fila_excel: i + 2, _errores: {}, _recalculado: {},
    num_pa: e.pa, project_id: `PR-${e.pa}`, num_opp: `OPP-${e.pa}`,
    nombre_del_proyecto: `DEMO · Proyecto ficticio ${String(i + 1).padStart(2, '0')}`,
    cliente: `Cliente Ficticio ${CLIENTES[i % CLIENTES.length]}`,
    pm_lider: PMS[i % PMS.length], pm_lider_psa: PMS[i % PMS.length],
    estado: e.estado, zona: i % 2 ? 'Demo Sur' : 'Demo Norte', pais: PAISES[i % PAISES.length],
    vendedor: `Vendedor Ficticio ${i % 2 ? 'B' : 'A'}`, tsm: 'TSM Ficticio Demo',
    billing_type: i % 2 ? 'Time and Materials' : 'Fixed Price',
    billing_arrangement: i % 2 ? 'Monthly' : 'Milestone',
    executive_watchlist: e.handover, project_status: e.semaforo, start_at_risk: e.semaforo === 'Red',
    fecha_fin: e.fin, estado_contrato: e.fin ? 'Contrato vigente' : null,
    estatus: 'DEMO · ejemplo ficticio', actions: 'DEMO · sin acciones operativas',
    clave_timeline: `PA:${e.pa}`, anio_atributos: e.anio, _origen_atributos: 'demo',
  };
}

function filaBacklog(e, info) {
  const fila = {
    num_pa: e.pa, nombre_del_proyecto: info.nombre_del_proyecto, _tipo_fila: 'proyecto',
    clave_timeline: info.clave_timeline, anio_atributos: e.anio, valor_of: e.booking,
    acumulado_anterior: e.acumulado, backlog: e.backlogFuente,
    total_ejecutado_acumulado: e.totalEjecutado, acumulado_a_fecha: null, meses: e.meses,
  };
  for (const m of e.meses) { fila[`${m.periodo}_fijo`] = m.commit; fila[`${m.periodo}_upside`] = m.upside; }
  return fila;
}

// Los cortes anteriores difieren del actual solo de noviembre en adelante.
function ajusteCorte(corte, e, i) {
  const m = e.meses[i];
  if (m.commit === null || i < IDX_REF || e.k % 4 !== 0) return [m.commit, m.upside];
  const f = [0.8, 0.9, 1][corte];
  return [redondear(m.commit * f), i % 2 ? redondear(m.upside * f) : m.upside];
}

function construirHistoria(estados) {
  const series = {}, eventos = [];
  const snapshots = CORTES.map((c, corte) => {
    const por_mes = Object.fromEntries(PERIODOS.map(p => [p, { fijo: 0, upside: 0 }]));
    let fijo = 0, upside = 0, backlog = 0, total = 0;
    for (const e of estados.filter(x => !x.sinBacklog)) {
      const meses = e.meses.map((_, i) => ajusteCorte(corte, e, i));
      const entry = { snapshot_id: c.id, meses, fijo: 0, upside: 0, total: e.totalEjecutado, backlog: e.backlogFuente };
      meses.forEach(([cm, up], i) => {
        entry.fijo += cm || 0; entry.upside += up || 0;
        por_mes[PERIODOS[i]].fijo += cm || 0; por_mes[PERIODOS[i]].upside += up || 0;
        const anterior = series[`PA:${e.pa}`]?.at(-1)?.meses[i];
        if (!anterior) return;
        for (const [j, tipo] of [[0, 'commit'], [1, 'upside']]) {
          if (anterior[j] === null || [cm, up][j] === null || [cm, up][j] === anterior[j]) continue;
          eventos.push({ snapshot_id: c.id, timestamp: c.timestamp, num_pa: `PA:${e.pa}`,
            nombre: `DEMO · Proyecto ficticio ${String(e.k + 1).padStart(2, '0')}`, campo: PERIODOS[i], tipo,
            valor_anterior: anterior[j], valor_nuevo: [cm, up][j], delta: [cm, up][j] - anterior[j] });
        }
      });
      (series[`PA:${e.pa}`] ||= []).push(entry);
      fijo += entry.fijo; upside += entry.upside; backlog += e.backlogFuente; total += e.totalEjecutado;
    }
    return { id: c.id, timestamp: c.timestamp, etiqueta: c.etiqueta, ejecucion_id: `demo-${c.id}`,
      ejecucion_identificada: true, cargas_incluidas: [corte + 1], anios_actualizados: [2026], tipo: 'etl',
      anios_disponibles: [2026, 2027], proyectos_activos: estados.length,
      totales: { fijo, upside, backlog, total }, por_mes };
  });
  return { meta: { total_snapshots: snapshots.length, total_proyectos: Object.keys(series).length,
    total_eventos: eventos.length, aviso: 'DEMO: cortes ficticios.' }, snapshots, eventos, series_por_proyecto: series };
}

function crearTimelineDemo(query = {}) {
  const estados = construirProyectos();
  const infos = estados.map(filaInfo);
  const backlog = estados.map((e, i) => (e.sinBacklog ? null : filaBacklog(e, infos[i]))).filter(Boolean);
  const desde = query.desde || PERIODOS[0], hasta = query.hasta || PERIODOS.at(-1);
  const columnas = Object.keys(infos[0]).filter(k => !k.startsWith('_') && !['clave_timeline', 'anio_atributos'].includes(k))
    .map(key => ({ key, label: key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()), verde: true, recalculado: false }));
  return {
    meta: { timeline: true, origen: 'demo', demo: true, aviso: 'DEMO: datos 100% sinteticos, sin informacion de clientes reales.',
      estado: 'disponible', anio_actual: 2026, fecha_referencia: FECHA_REFERENCIA, anios: [2026, 2027],
      periodos: PERIODOS, desde, hasta, periodos_seleccionados: PERIODOS.filter(p => p >= desde && p <= hasta),
      criterio_atributos: 'año actual; anterior mas cercano; futuro mas cercano', columnas,
      capturas: [{ anio: 2026, carga_id: 1 }, { anio: 2027, carga_id: 2 }], total_proyectos: infos.length },
    proyectos: infos, backlog, historia: construirHistoria(estados),
  };
}

module.exports = { crearTimelineDemo };

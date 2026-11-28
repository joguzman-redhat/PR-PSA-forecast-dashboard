const { MESES, mesesAClaves } = require('./dominio');

// Fixture de navegacion: no lee Excel, Postgres, credenciales ni datos del ETL.
// Los nombres, identificadores, montos y cortes son completamente ficticios.
function crearDatosDemo() {
  const aviso = 'DEMO: datos 100% sinteticos, sin informacion de clientes reales.';
  const cortes = [
    { id: 'demo-s01', timestamp: '2026-11-02T09:00:00', etiqueta: 'DEMO · corte 1', tipo: 'etl' },
    { id: 'demo-s02', timestamp: '2026-11-09T09:00:00', etiqueta: 'DEMO · corte 2', tipo: 'etl' },
  ];
  const ceros = () => Array(12).fill(0);
  const ejemplos = [
    {
      pa: 'DEMO-001', nombre: 'DEMO · Plataforma ficticia Alfa', cliente: 'Cliente Ficticio Alfa',
      pm: 'PM Ficticio A', zona: 'Demo Norte', pais: 'Pais Ficticio A',
      estado: 'In Progress', semaforo: 'Green', handover: true, riesgo: false,
      fin: '2026-12-31', dias: 52, contrato: 'Contrato finaliza en menos de 60dias', ritmo: 'Normal',
      booking: 120000, acum2025: 20000, backlog: [27000, 25000],
      commit: [
        [4000, 4000, 4000, 5000, 5000, 5000, 6000, 6000, 6000, 6000, 8000, 14000],
        [4000, 4000, 4000, 5000, 5000, 5000, 6000, 6000, 6000, 8000, 10000, 12000],
      ],
      upside: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 3000, 4000, 6000],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 2000, 3000, 5000],
      ],
    },
    {
      pa: 'DEMO-002', nombre: 'DEMO · Automatizacion ficticia Alfa', cliente: 'Cliente Ficticio Alfa',
      pm: 'PM Ficticio B', zona: 'Demo Norte', pais: 'Pais Ficticio A',
      estado: 'On Hold', semaforo: 'Red', handover: false, riesgo: false,
      fin: '2026-10-31', dias: -9, contrato: 'Contrato vencido', ritmo: 'Muy Baja',
      booking: 60000, acum2025: 5000, backlog: [35500, 41500],
      commit: [
        [1000, 1000, 1000, 1500, 1500, 1500, 2000, 2000, 2000, 2000, 2000, 2000],
        [1000, 1000, 1000, 1500, 1500, 1500, 2000, 2000, 2000, 0, 0, 0],
      ],
      upside: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4000],
        ceros(),
      ],
    },
    {
      pa: 'DEMO-003', nombre: 'DEMO · Proyecto planificado ficticio Beta', cliente: 'Cliente Ficticio Beta',
      pm: 'PM Ficticio B', zona: 'Demo Sur', pais: 'Pais Ficticio B',
      estado: 'Planned', semaforo: 'Yellow', handover: false, riesgo: true,
      fin: '2026-11-30', dias: 21, contrato: 'Contrato vence en menos de 30dias', ritmo: 'Baja',
      booking: 30000, acum2025: 0, backlog: [26000, 24000],
      commit: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4000, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6000, 0],
      ],
      upside: [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 12000, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10000, 0],
      ],
    },
    {
      pa: 'DEMO-004', nombre: 'DEMO · Proyecto cancelado ficticio Beta', cliente: 'Cliente Ficticio Beta',
      pm: 'PM Ficticio A', zona: 'Demo Sur', pais: 'Pais Ficticio B',
      estado: 'Canceled', semaforo: 'Green', handover: false, riesgo: false,
      fin: '2026-08-31', dias: -70, contrato: 'Contrato vencido', ritmo: 'Normal',
      booking: 0, acum2025: 0, backlog: [0, 0],
      commit: [ceros(), ceros()], upside: [ceros(), ceros()],
    },
  ];

  const proyectos = ejemplos.map((e, i) => ({
    _tipo_fila: 'proyecto', _fila_excel: i + 2, _errores: {}, _recalculado: {},
    num_pa: e.pa, project_id: `PR-${e.pa}`, num_opp: `OPP-${e.pa}`,
    nombre_del_proyecto: e.nombre, cliente: e.cliente, pm_lider: e.pm, pm_lider_psa: e.pm,
    estado: e.estado, zona: e.zona, pais: e.pais,
    vendedor: `Vendedor Ficticio ${i % 2 ? 'B' : 'A'}`, tsm: 'TSM Ficticio Demo',
    billing_type: i % 2 ? 'Time and Materials' : 'Fixed Price',
    billing_arrangement: i % 2 ? 'Monthly' : 'Milestone',
    executive_watchlist: e.handover, project_status: e.semaforo, start_at_risk: e.riesgo,
    fecha_fin: e.fin, finalizacion: e.fin, ano_de_finalizacion: 2026,
    estado_contrato: e.contrato, dias_para_vencimiento: e.dias,
    meses_transcurridos: e.estado === 'Planned' ? 0 : 10, tipo_de_ejecucion: e.ritmo,
    estatus: 'DEMO · ejemplo ficticio', actions: 'DEMO · sin acciones operativas',
    q_del_clawback: null,
    // Las cifras del dashboard salen del bloque BackLog, no de Info Proyectos.
    valor_of: null, acumulado_a_hoy: null, consumido_2025: null, backlog_2026: null,
    valor_of_anterior: null, ejecucion_deseada: null, diferencias_acumulado_of: null,
    consumido_2025_ref: null, dif_consumido_2025: null,
    pct_ejecucion_actual: null, pct_peso_contrato: null,
  }));
  const verdes = new Set([
    'estado', 'nombre_del_proyecto', 'cliente', 'pm_lider', 'zona', 'pais',
    'valor_of', 'acumulado_a_hoy', 'backlog_2026', 'executive_watchlist', 'project_status',
  ]);
  const etiquetas = {
    nombre_del_proyecto: 'Proyecto', pm_lider: 'PM/Lider', valor_of: 'Valor Booking',
    acumulado_a_hoy: 'Revenue acumulado a hoy', backlog_2026: 'Backlog',
    executive_watchlist: 'Handover', project_status: 'Semaforo',
  };
  const columnas = Object.keys(proyectos[0]).filter(k => !k.startsWith('_')).map(key => ({
    key, label: etiquetas[key] || key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()),
    verde: verdes.has(key), recalculado: false,
  }));
  const meta = {
    origen: 'demo', demo: true, aviso, fecha_referencia: '2026-11-09',
    carga_id: 2, carga_etiqueta: cortes[1].etiqueta, carga_ejecutada_en: cortes[1].timestamp,
    total_filas: proyectos.length,
  };

  // Solo se adapta la forma del contrato; no se modifica ningun calculo real.
  const series_por_proyecto = Object.fromEntries(ejemplos.map(e => [e.pa, cortes.map((c, i) => {
    const fijo = e.commit[i].reduce((a, b) => a + b, 0);
    return {
      snapshot_id: c.id, fijo, upside: e.upside[i].reduce((a, b) => a + b, 0),
      total: e.acum2025 + fijo, backlog: e.backlog[i],
      meses: MESES.map((_m, mes) => [e.commit[i][mes], e.upside[i][mes]]),
    };
  })]));
  const backlog = ejemplos.map((e, i) => ({
    _tipo_fila: 'proyecto', _fila_excel: i + 2,
    num_pa: e.pa, num_opp: proyectos[i].num_opp, nombre_del_proyecto: e.nombre,
    estado: e.estado, pm_lider: e.pm,
    billing_type: proyectos[i].billing_type, billing_arrangement: proyectos[i].billing_arrangement,
    valor_of: e.booking, acum_2025: e.acum2025, backlog: e.backlog[1],
    total_ejecutado_acumulado: series_por_proyecto[e.pa][1].total,
    ...mesesAClaves(MESES.map((_m, mes) => ({
      mes: mes + 1, commit_usd: e.commit[1][mes], upside_usd: e.upside[1][mes],
    }))),
  }));
  const snapshots = cortes.map((c, i) => {
    const por_mes = Object.fromEntries(MESES.map((m, mes) => [m, {
      fijo: ejemplos.reduce((a, e) => a + e.commit[i][mes], 0),
      upside: ejemplos.reduce((a, e) => a + e.upside[i][mes], 0),
    }]));
    const fijo = Object.values(por_mes).reduce((a, m) => a + m.fijo, 0);
    const acum2025 = ejemplos.reduce((a, e) => a + e.acum2025, 0);
    const quarters = mesesAClaves(MESES.map((m, mes) => ({
      mes: mes + 1, commit_usd: por_mes[m].fijo, upside_usd: por_mes[m].upside,
    })));
    return {
      ...c, proyectos_activos: proyectos.length, por_mes,
      totales: {
        fijo, upside: Object.values(por_mes).reduce((a, m) => a + m.upside, 0),
        acum_2025: acum2025, total: fijo + acum2025,
        backlog: ejemplos.reduce((a, e) => a + e.backlog[i], 0),
        q1: quarters.q1, q2: quarters.q2, q3: quarters.q3, q4: quarters.q4,
      },
    };
  });
  const eventos = ejemplos.flatMap(e => MESES.flatMap((campo, mes) =>
    ['commit', 'upside'].flatMap(tipo => {
      const anterior = e[tipo][0][mes];
      const nuevo = e[tipo][1][mes];
      if (anterior === nuevo) return [];
      return [{
        snapshot_id: cortes[1].id, timestamp: cortes[1].timestamp,
        num_pa: e.pa, nombre: e.nombre, tipo, campo,
        valor_anterior: anterior, valor_nuevo: nuevo, delta: nuevo - anterior,
      }];
    })));

  return {
    proyectos: {
      meta: { ...meta, hoja: 'DEMO · Info Proyectos', columnas,
        orden_estado: ['Planned', 'In Progress', 'On Hold', 'Completed', 'Canceled'] },
      proyectos,
    },
    backlog: { meta: { ...meta, hoja: 'DEMO · BackLog NOLA' }, backlog },
    historia: {
      meta: { ...meta, total_snapshots: snapshots.length, total_proyectos: proyectos.length,
        total_eventos: eventos.length, tipos_evento: ['commit', 'upside'], umbral_evento_usd: 0.5 },
      snapshots, series_por_proyecto, eventos,
    },
  };
}

module.exports = { crearDatosDemo };

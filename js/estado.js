// Estado compartido del dashboard. Un solo objeto mutable que las vistas leen
// y los filtros y la carga de datos modifican.

export const estado = {
  forecast: { anio: 2026, archivoId: null, catalogo: null },
  proyectos: [],
  backlog: [],
  historia: null,
  filtros: {
    estado: [],
    zona: [],
    pais: [],
    billing_type: [],
    billing_arrangement: [],
    pm_lider: [],
    vendedor: [],
    tsm: [],
    estado_contrato: [],
    tipo_de_ejecucion: [],
    periodo_fin: [],
    cliente: [],
    riesgo: [],
    executive_watchlist: [],
    project_status: [],
    texto: '',
  },
  // Los cancelados se esconden por defecto: ensucian conteos y gráficas, y
  // los 24 que hay valen $0 de Valor OF. El interruptor los trae de vuelta.
  territorio: 'todos',
  incluirCancelados: false,
  incluirCompletados: false,
  proyectosFiltrados: [],
  proyectoSeleccionado: null,
  expandedPMs: new Set(),
  metadataProyectos: null,
  metadataBacklog: null,
  backlogPorPA: null,
  backlogPorNombre: null,

  // Periodo del calendario de revenue que se está mirando. Es un eje distinto
  // al de los snapshots: aquí se elige "qué meses del año", allá "en qué
  // momento se tomó la foto". Vale para todas las pestañas.
  periodo: 'anio',
  // Rango de snapshots a comparar (índices). null = desde el primero al último.
  rangoSnapshots: null,
};

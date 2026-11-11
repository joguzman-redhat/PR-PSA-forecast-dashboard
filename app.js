/**
 * Dashboard de Proyectos - Red Hat LATAM
 * Aplicación principal en JavaScript vanilla
 */

// ============================================================================
// ESTADO GLOBAL
// ============================================================================

const estado = {
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
    ano_de_finalizacion: [],
    cliente: [],
    riesgo: [],
    executive_watchlist: [],
    project_status: [],
    texto: '',
  },
  // Los cancelados se esconden por defecto: ensucian conteos y gráficas, y
  // los 24 que hay valen $0 de Valor OF. El interruptor los trae de vuelta.
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

// ============================================================================
// FUNCIONES DE FORMATEO
// ============================================================================

function formatearDinero(valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return '—';
  const num = parseFloat(valor);
  if (num === 0) return '$0';
  // Hay notas de credito: sin tratar el signo aparte, -1792.5 salia como
  // '$-1793' en vez de '-$1.8K'.
  const signo = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  if (abs >= 1000000) return signo + '$' + (abs / 1000000).toFixed(2) + 'M';
  if (abs >= 10000) return signo + '$' + (abs / 1000).toFixed(0) + 'K';
  if (abs >= 1000) return signo + '$' + (abs / 1000).toFixed(1) + 'K';
  return signo + '$' + abs.toFixed(0);
}

function formatearNumero(valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return '—';
  return Math.round(parseFloat(valor)).toLocaleString('es-CO');
}

/**
 * Dinero al dólar exacto. La versión abreviada ($42K) es cómoda para leer de
 * lejos pero no se puede sumar: 14.179 y 27.361 se muestran como $14K y $27K,
 * que suman 41K, mientras su total 41.541 se muestra como $42K. Donde el
 * usuario está auditando cifras hay que dar el número completo.
 */
function formatearDineroExacto(valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return '—';
  const num = Math.round(parseFloat(valor));
  return (num < 0 ? '−$' : '$') + Math.abs(num).toLocaleString('en-US');
}

function formatearPorcentaje(valor) {
  if (valor === null || valor === undefined || isNaN(valor)) return '—';
  return (parseFloat(valor) * 100).toFixed(1) + '%';
}

function formatearFecha(valor) {
  if (!valor) return '—';
  try {
    const fecha = new Date(valor);
    return fecha.toLocaleDateString('es-CO');
  } catch {
    return valor;
  }
}

function normalizarValor(valor) {
  if (valor === null || valor === undefined || valor === '' || valor === 'N/A') {
    return null;
  }
  return valor;
}

function obtenerEtiquetaValor(valor) {
  if (valor === null || valor === undefined || valor === '' || valor === 'N/A') {
    return '—';
  }
  return String(valor);
}

// ============================================================================
// FUNCIONES DE CARGA DE DATOS
// ============================================================================

// El backend sirve el dashboard y la API desde el mismo origen, asi que la
// ruta es relativa: no hay CORS ni host que configurar.
const API = './api';

async function cargarDatos() {
  try {
    // Cargar proyectos
    const respProyectos = await fetch(`${API}/proyectos`);
    if (!respProyectos.ok) throw new Error('No se pudo cargar /api/proyectos');
    const datosProyectos = await respProyectos.json();
    estado.metadataProyectos = datosProyectos.meta;
    estado.proyectos = datosProyectos.proyectos.filter(p => p._tipo_fila === 'proyecto');

    // Cargar backlog
    const respBacklog = await fetch(`${API}/backlog`);
    if (!respBacklog.ok) throw new Error('No se pudo cargar /api/backlog');
    const datosBacklog = await respBacklog.json();
    estado.metadataBacklog = datosBacklog.meta;
    estado.backlog = datosBacklog.backlog.filter(b => b._tipo_fila === 'proyecto');
    // Las dos hojas NO van fila a fila: en el libro FY26, 299 de 349 filas
    // estan desalineadas. Unirlas por posicion le asigna a un proyecto el
    // revenue de otro sin que se note, asi que se une por PA y, si falta,
    // por nombre normalizado.
    estado.backlogPorPA = new Map();
    estado.backlogPorNombre = new Map();
    estado.backlog.forEach(b => {
      if (b.num_pa !== null && b.num_pa !== undefined && b.num_pa !== '') {
        const k = String(b.num_pa);
        if (!estado.backlogPorPA.has(k)) estado.backlogPorPA.set(k, b);
      }
      const n = normalizarNombre(b.nombre_del_proyecto);
      if (n && !estado.backlogPorNombre.has(n)) estado.backlogPorNombre.set(n, b);
    });

    // Intentar cargar historia (con tolerancia si no existe)
    try {
      const respHistoria = await fetch(`${API}/historia`);
      if (respHistoria.ok) {
        estado.historia = await respHistoria.json();
      }
    } catch (e) {
      console.log('Historia de revenue no disponible (aún no generada)');
    }

    // Filtrar a proyectos activos
    estado.proyectosFiltrados = [...estado.proyectos];

    return true;
  } catch (err) {
    console.error('Error cargando datos:', err);
    alert('Error al cargar los datos: ' + err.message);
    return false;
  }
}

// ============================================================================
// FUNCIONES DE FILTRADO
// ============================================================================

// ============================================================================
// KPIs
// ============================================================================

/**
 * Los KPIs se recalculan sobre los proyectos filtrados, no sobre el total:
 * el punto de filtrar es ver los números de ese recorte.
 *
 * Los nulos se ignoran en vez de contarse como cero. Con 26 proyectos que
 * traen #N/A del Excel, tratarlos como cero bajaría los promedios y daría
 * una lectura falsa.
 */
/** Revenue fijo de un proyecto en el periodo elegido, desde BackLog NOLA. */
function normalizarNombre(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^0-9a-z]+/g, '');
}

// Devuelve null si no hay match. Antes caia de vuelta al numero de fila, que
// es justamente lo que mezclaba el revenue entre proyectos distintos.
function backlogDe(proyecto) {
  if (!proyecto) return null;
  const pa = proyecto.num_pa;
  if (pa !== null && pa !== undefined && pa !== '') {
    const porPA = estado.backlogPorPA && estado.backlogPorPA.get(String(pa));
    if (porPA) return porPA;
  }
  const n = normalizarNombre(proyecto.nombre_del_proyecto);
  if (n && estado.backlogPorNombre) return estado.backlogPorNombre.get(n) || null;
  return null;
}

/**
 * Valor Booking de un proyecto. TODA LA PLATA viene de BackLog NOLA, nunca de
 * Info Proyectos: los campos p.valor_of / p.acumulado_a_hoy / p.consumido_2025
 * / p.backlog_2026 NO están convertidos (carecen del factor de conversión).
 * Se reconstruye como lo calcula el propio Excel: Valor OF = Backlog + Total
 * Ejecutado Acumulado, las dos ya convertidas. Va primero porque las cargas
 * anteriores al arreglo del ETL guardaron en fila.valor_of el OF de Info (sin
 * convertir); fila.valor_of queda solo de respaldo.
 */
function valorBooking(proyecto) {
  const fila = backlogDe(proyecto);
  if (!fila) return null;
  if (typeof fila.backlog === 'number' && typeof fila.total_ejecutado_acumulado === 'number') {
    return fila.backlog + fila.total_ejecutado_acumulado;
  }
  return typeof fila.valor_of === 'number' ? fila.valor_of : null;
}

/** Acumulado del año pasado (2025), desde BackLog NOLA. */
function acum2025(proyecto) {
  const fila = backlogDe(proyecto);
  return (fila && typeof fila.acum_2025 === 'number') ? fila.acum_2025 : null;
}

function revenuePeriodo(proyecto) {
  const fila = backlogDe(proyecto);
  if (!fila) return null;
  return mesesActivos().reduce((acc, i) => {
    const v = fila[MESES_ES[i] + '_fijo'];
    return acc + (typeof v === 'number' ? v : 0);
  }, 0);
}

/** Upside de un proyecto en el periodo elegido. Hermano de revenuePeriodo. */
function upsidePeriodo(proyecto) {
  const fila = backlogDe(proyecto);
  if (!fila) return null;
  return mesesActivos().reduce((acc, i) => {
    const v = fila[MESES_ES[i] + '_upside'];
    return acc + (typeof v === 'number' ? v : 0);
  }, 0);
}

/**
 * Revenue acumulado a hoy de un proyecto. acum_2025 es el saldo arrastrado del
 * año anterior; los meses de enero a hoy del año en curso suman el resto.
 * TODA LA PLATA viene de BackLog NOLA: si no hay fila de backlog, el proyecto
 * no tiene cifras de revenue (se muestra "—" en vez de cero).
 */
function acumuladoHoy(proyecto) {
  const fila = backlogDe(proyecto);
  if (!fila) return null;
  const acum2025 = typeof fila.acum_2025 === 'number' ? fila.acum_2025 : 0;
  // Enero hasta el mes en curso, inclusive.
  const commitHastaHoy = MESES_ES.slice(0, new Date().getMonth() + 1).reduce((acc, m) => {
    const v = fila[m + '_fijo'];
    return acc + (typeof v === 'number' ? v : 0);
  }, 0);
  return acum2025 + commitHastaHoy;
}

/**
 * Backlog de un proyecto: la columna "Backlog" de BackLog NOLA, tal cual. El
 * Excel lo calcula como Valor OF − Acum 2025 − commit de los 12 meses, o sea,
 * ya descuenta lo planeado para el resto del año. Es el número de las tablas
 * dinámicas del negocio, así que manda sobre cualquier cálculo propio.
 * Consecuencia: Booking = Acumulado a hoy + commit planeado resto del año + Backlog.
 */
function backlogHoy(proyecto) {
  const fila = backlogDe(proyecto);
  return fila && typeof fila.backlog === 'number' ? fila.backlog : null;
}

/**
 * Ejecución proyectada al cierre del año = acum_2025 + suma de los 12 meses fijo.
 */
function proyectadaAnio(proyecto) {
  const fila = backlogDe(proyecto);
  if (!fila) return null;
  const acum2025 = typeof fila.acum_2025 === 'number' ? fila.acum_2025 : 0;
  const totalFijo = MESES_ES.reduce((acc, m) => {
    const v = fila[m + '_fijo'];
    return acc + (typeof v === 'number' ? v : 0);
  }, 0);
  return acum2025 + totalFijo;
}

// El calendario fuente trae Acum 2025 y los doce meses de 2026.
const ANIO_REVENUE = 2026;

/** Fecha fin de Info Proyectos, sin desplazar días/meses por la zona horaria. */
function mesFinalizacion(proyecto) {
  const valor = proyecto.fecha_fin;
  let anio, mes, dia;
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    const fecha = new Date(Date.UTC(1899, 11, 30) + Math.floor(valor) * 86400000);
    anio = fecha.getUTCFullYear(); mes = fecha.getUTCMonth() + 1; dia = fecha.getUTCDate();
  } else if (typeof valor === 'string') {
    const iso = valor.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
    const americana = valor.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (iso) [, anio, mes, dia] = iso.map(Number);
    else if (americana) { mes = +americana[1]; dia = +americana[2]; anio = +americana[3]; }
    else return null;
  } else return null;
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null;
  return anio * 12 + mes - 1;
}

function etiquetaMesRevenue(indice) {
  const mes = MESES_ES[indice % 12];
  return `${mes.charAt(0).toUpperCase() + mes.slice(1, 3)} ${Math.floor(indice / 12)}`;
}

/** Calendario de 2026 y reparto uniforme del Backlog fuente hasta cada fecha fin futura. */
function serieBacklogRevenuePorMes(proyectos) {
  let valorOfTotal = 0;
  let acum2025Total = 0;
  const commitPorMes = new Array(12).fill(0);
  const diciembre = ANIO_REVENUE * 12 + 11;
  const proyecciones = [];
  let ultimoMes = diciembre;
  proyectos.forEach(p => {
    const booking = valorBooking(p);
    const acum = acum2025(p);
    valorOfTotal += booking || 0;
    acum2025Total += acum || 0;
    const fila = backlogDe(p);
    if (!fila) return;
    const fin = mesFinalizacion(p);
    if (fin !== null && fin > diciembre) {
      ultimoMes = Math.max(ultimoMes, fin);
      const saldo = backlogHoy(p);
      if (Number.isFinite(saldo)) proyecciones.push({ saldo, meses: fin - diciembre });
    }
    MESES_ES.forEach((m, i) => {
      const v = fila[m + '_fijo'];
      commitPorMes[i] += typeof v === 'number' ? v : 0;
    });
  });

  const datos = {};
  let acumulado = 0;
  MESES_ES.forEach((m, i) => {
    acumulado += commitPorMes[i];
    const etiqueta = etiquetaMesRevenue(ANIO_REVENUE * 12 + i);
    datos[etiqueta] = { Commit: acumulado, Backlog: valorOfTotal - acum2025Total - acumulado };
  });
  const commitAnual = acumulado;
  const backlogDiciembre = valorOfTotal - acum2025Total - commitAnual;
  for (let mes = diciembre + 1; mes <= ultimoMes; mes++) {
    const transcurridos = mes - diciembre;
    const estimado = proyecciones.reduce((suma, p) => suma +
      (transcurridos >= p.meses ? p.saldo : p.saldo * transcurridos / p.meses), 0);
    datos[etiquetaMesRevenue(mes)] = {
      Commit: commitAnual + estimado,
      Backlog: backlogDiciembre - estimado,
    };
  }
  return datos;
}

function pintarProyeccionBacklogRevenue(svg, proyectos, nota) {
  const datos = serieBacklogRevenuePorMes(proyectos);
  const tieneEstimacion = Object.keys(datos).length > 12;
  crearGraficaLinea(svg, datos, {
    ejeX: 'categoria', desdeEstimado: tieneEstimacion ? 12 : null,
    unidad: 'Backlog y Commit acumulado desde enero de 2026',
  });
  if (nota) {
    nota.textContent = 'Fecha de inicio aún no cargada: calendario desde enero de 2026. '
      + 'El Commit es acumulado y el Backlog de diciembre corresponde al de BackLog NOLA. '
      + (tieneEstimacion ? 'Desde enero de 2027, las líneas discontinuas muestran el reparto uniforme estimado del backlog hasta la fecha fin de cada proyecto. ' : '')
      + (proyectos.some(p => Number.isFinite(backlogHoy(p)) && backlogHoy(p) !== 0 &&
        (mesFinalizacion(p) === null || mesFinalizacion(p) <= ANIO_REVENUE * 12 + 11))
        ? 'Los proyectos sin fecha fin posterior a 2026 conservan su backlog pendiente.' : '');
  }
}

function calcularKPIs() {
  const proyectos = estado.proyectosFiltrados;
  const sumaCalculado = fn => proyectos.reduce((acc, p) => {
    const v = fn(p);
    return acc + (typeof v === 'number' ? v : 0);
  }, 0);

  const booking = sumaCalculado(valorBooking);
  const acumulado = sumaCalculado(acumuladoHoy);
  const backlog = sumaCalculado(backlogHoy);

  const texto = (id, valor) => {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
  };

  texto('kpi-total-proyectos', proyectos.length.toLocaleString('es'));
  texto('kpi-valor-of-total', formatearDinero(booking));
  texto('kpi-acumulado-hoy', formatearDinero(acumulado));
  texto('kpi-backlog-2026', formatearDinero(backlog));
  // Ejecución global = lo ejecutado sobre lo contratado, no el promedio de
  // los porcentajes: un proyecto de 2 millones no pesa igual que uno de 20 mil.
  texto('kpi-pct-ejecucion', booking > 0 ? (acumulado / booking * 100).toFixed(1) + '%' : '—');

  const rev = proyectos.reduce((acc, p) => acc + (revenuePeriodo(p) || 0), 0);
  texto('kpi-revenue-periodo', formatearDinero(rev));
  texto('kpi-revenue-periodo-etq', `Revenue Commit · ${periodoActual().etiqueta}`);
}

// ============================================================================
// FILTROS
// ============================================================================

// Dimensiones filtrables, en el orden en que aparecen en la barra.
const DIMENSIONES = [
  { campo: 'estado', etiqueta: 'Estado' },
  { campo: 'cliente', etiqueta: 'Cliente' },
  { campo: 'zona', etiqueta: 'Zona' },
  { campo: 'pais', etiqueta: 'País' },
  { campo: 'billing_type', etiqueta: 'Billing Type' },
  { campo: 'billing_arrangement', etiqueta: 'Billing Arrangement' },
  { campo: 'pm_lider', etiqueta: 'PM/Líder' },
  { campo: 'vendedor', etiqueta: 'Vendedor' },
  { campo: 'tsm', etiqueta: 'TSM' },
  { campo: 'estado_contrato', etiqueta: 'Estado contrato' },
  { campo: 'tipo_de_ejecucion', etiqueta: 'Tipo de ejecución' },
  { campo: 'ano_de_finalizacion', etiqueta: 'Año fin' },
  { campo: 'riesgo', etiqueta: 'Riesgo' },
  { campo: 'executive_watchlist', etiqueta: 'Handover' },
  { campo: 'project_status', etiqueta: 'Project Status' },
];

const SIN_DATO = '(sin dato)';

// ---------------------------------------------------------------------------
// Periodos del calendario de revenue
// ---------------------------------------------------------------------------

const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const PERIODOS = [
  { id: 'anio', etiqueta: 'Todo el año', meses: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { id: 'q1', etiqueta: 'Q1 · ene-mar', meses: [0, 1, 2] },
  { id: 'q2', etiqueta: 'Q2 · abr-jun', meses: [3, 4, 5] },
  { id: 'q3', etiqueta: 'Q3 · jul-sep', meses: [6, 7, 8] },
  { id: 'q4', etiqueta: 'Q4 · oct-dic', meses: [9, 10, 11] },
  ...MESES_ES.map((m, i) => ({
    id: m, etiqueta: m.charAt(0).toUpperCase() + m.slice(1), meses: [i],
  })),
];

function periodoActual() {
  return PERIODOS.find(p => p.id === estado.periodo) || PERIODOS[0];
}

/** Índices de mes que entran en el periodo elegido. */
function mesesActivos() {
  return periodoActual().meses;
}

/** Suma fijo y upside de un tramo `meses` (12 pares [fijo, upside]). */
function sumarMeses(pares, indices) {
  let fijo = 0, upside = 0;
  (indices || mesesActivos()).forEach(i => {
    const par = pares[i];
    if (!par) return;
    fijo += par[0] || 0;
    upside += par[1] || 0;
  });
  return { fijo, upside };
}

/**
 * Selector de periodo. Se dibuja en varias pestañas pero todas comparten el
 * mismo estado, para que cambiar de vista no pierda lo que ya elegiste.
 */
function construirSelectorPeriodo(alCambiar) {
  const cont = document.createElement('div');
  cont.className = 'selector-periodo';

  const lbl = document.createElement('label');
  lbl.textContent = 'Periodo de revenue:';
  const sel = document.createElement('select');
  sel.className = 'select-periodo';
  PERIODOS.forEach(pr => {
    const o = document.createElement('option');
    o.value = pr.id;
    o.textContent = pr.etiqueta;
    if (pr.id === estado.periodo) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', () => {
    estado.periodo = sel.value;
    // Mantener sincronizados los selectores de las otras pestañas.
    document.querySelectorAll('.select-periodo').forEach(s2 => { s2.value = sel.value; });
    alCambiar();
  });

  cont.append(lbl, sel);
  return cont;
}

// Qué columnas son plata y cuáles porcentaje. Sin esto el detalle muestra
// cosas como "7610377.23" en vez de "$7.61M".
const CAMPOS_DINERO = new Set([
  'valor_of', 'valor_of_anterior', 'ejecucion_deseada', 'ejecucion_acumulada',
  'acumulado_a_hoy', 'diferencias_acumulado_of', 'consumido_2025',
  'backlog_2026', 'consumido_2025_ref', 'dif_consumido_2025',
]);
const CAMPOS_PORCENTAJE = new Set(['pct_ejecucion_actual', 'pct_peso_contrato']);
const CAMPOS_ID = new Set(['num_pa', 'num_opp', 'project_id']);

/**
 * Con qué número se identifica un proyecto. El negocio usa el PA, pero
 * mientras no se lo asignan se guían por el PR. En la hoja hay 22 proyectos
 * cuyo "# PA" trae en realidad un PR, y 14 sin PA (13 de ellos cancelados).
 */
/**
 * Llave para cruzar un proyecto entre las tres fuentes. No se puede usar
 * num_pa a secas: 14 proyectos lo tienen en null y `find(b => b.num_pa ===
 * null)` devolvía SIEMPRE la primera fila nula, así que esos 14 mostraban
 * todos el mismo revenue. Las dos hojas están alineadas fila a fila
 * (304/304 con el mismo nombre), así que la fila de Excel es la red de
 * seguridad.
 */
function claveProyecto(p) {
  if (p.num_pa !== null && p.num_pa !== undefined && p.num_pa !== '') {
    return String(p.num_pa);
  }
  // La historia se genera desde BackLog NOLA, asi que para los proyectos sin
  // PA la clave es el numero de fila DE ESA hoja, que no es el de esta.
  const enBacklog = backlogDe(p);
  return `fila-${enBacklog ? enBacklog._fila_excel : p._fila_excel}`;
}

function identificador(p) {
  const pa = p.num_pa;
  if (pa !== null && pa !== undefined && !String(pa).startsWith('PR')) {
    return { valor: 'PA ' + pa, tipo: 'PA' };
  }
  const pr = (pa && String(pa).startsWith('PR')) ? String(pa) : p.project_id;
  return pr ? { valor: String(pr), tipo: 'PR' } : { valor: '—', tipo: null };
}

/** Semáforo de vencimiento. El color nunca va solo: la celda muestra los días
    y el title explica el estado, para quien no distingue los colores. */
function claseVencimiento(dias) {
  if (typeof dias !== 'number') return '';
  if (dias <= 0) return 'venc-critico';
  if (dias <= 30) return 'venc-serio';
  if (dias < 60) return 'venc-advertencia';
  return 'venc-bueno';
}

// Muchos campos vienen nulos por los errores del Excel. En vez de esconder
// esos proyectos, se agrupan bajo una opción propia: "no sabemos" también
// es una respuesta que el negocio necesita poder filtrar.
function valorDimension(proyecto, campo) {
  if (campo === 'riesgo') {
    return proyecto.start_at_risk ? 'Start at risk' : 'Sin marca de riesgo';
  }
  if (campo === 'executive_watchlist') {
    const v = proyecto[campo];
    if (v === null || v === undefined) return SIN_DATO;
    return v ? 'Sí' : 'No';
  }
  if (campo === 'project_status') {
    const v = proyecto[campo];
    if (v === null || v === undefined || v === '') return SIN_DATO;
    // Map internal values to Spanish display
    const mapa = { 'Red': 'Rojo', 'Yellow': 'Amarillo', 'Green': 'Verde' };
    return mapa[v] || String(v);
  }
  const v = proyecto[campo];
  return (v === null || v === undefined || v === '') ? SIN_DATO : String(v);
}

function pasaDimension(proyecto, campo) {
  const marcados = estado.filtros[campo];
  if (!marcados || marcados.length === 0) return true;
  return marcados.includes(valorDimension(proyecto, campo));
}

function pasaTexto(proyecto) {
  const texto = (estado.filtros.texto || '').trim().toLowerCase();
  if (texto === '') return true;
  return [
    proyecto.cliente, proyecto.nombre_del_proyecto,
    proyecto.num_pa, proyecto.project_id,
  ].map(v => String(v ?? '')).join(' ').toLowerCase().includes(texto);
}

function pasaFiltroCompletados(proyecto) {
  return estado.incluirCompletados || proyecto?.estado !== 'Completed';
}

function clavesCompletadosOcultos() {
  return new Set(estado.incluirCompletados ? [] : estado.proyectos
    .filter(p => !pasaFiltroCompletados(p)).map(claveProyecto));
}

function sincronizarMostrarCompletados() {
  document.querySelectorAll('[data-mostrar-completados]').forEach(chk => {
    chk.checked = estado.incluirCompletados;
  });
}

function cambiarMostrarCompletados(incluir) {
  estado.incluirCompletados = incluir;
  sincronizarMostrarCompletados();
  aplicarFiltros();
  const vista = document.querySelector('.pestana-contenido.activa')?.id;
  if (vista === 'pestana-detalle') renderizarDetalle();
  if (vista === 'pestana-trazabilidad') renderizarTrazabilidad();
  if (vista === 'pestana-pms') renderizarPMs();
}

function aplicarFiltros() {
  estado.proyectosFiltrados = estado.proyectos.filter(p => {
    if (!pasaFiltroCompletados(p)) return false;
    if (!estado.incluirCancelados && p.estado === 'Canceled') return false;
    return DIMENSIONES.every(d => pasaDimension(p, d.campo)) && pasaTexto(p);
  });
  DIMENSIONES.forEach(d => refrescarConteos(d.campo));
  renderizarChips();
  actualizarUI();
}

/**
 * Conteos de una dimensión aplicando todos los demás filtros MENOS el suyo.
 * Así el número junto a cada opción dice cuántos proyectos quedarían si la
 * marcas, no el total global. Sin esto los conteos mienten en cuanto hay
 * dos filtros puestos.
 */
function conteosDe(campo) {
  const conteos = new Map();
  estado.proyectos.forEach(p => {
    if (!pasaFiltroCompletados(p)) return;
    if (!estado.incluirCancelados && p.estado === 'Canceled' && campo !== 'estado') return;
    const pasa = DIMENSIONES.every(d => d.campo === campo || pasaDimension(p, d.campo));
    if (!pasa || !pasaTexto(p)) return;
    const v = valorDimension(p, campo);
    conteos.set(v, (conteos.get(v) || 0) + 1);
  });
  return conteos;
}

function opcionesDe(campo) {
  const vistos = new Set();
  estado.proyectos.forEach(p => vistos.add(valorDimension(p, campo)));
  const lista = Array.from(vistos);
  // El estado sigue el flujo del negocio, no el alfabeto.
  const orden = (estado.metadataProyectos || {}).orden_estado;
  if (campo === 'estado' && orden) {
    return lista.sort((a, b) => {
      const ia = orden.indexOf(a), ib = orden.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }
  // (sin dato) siempre al final; el resto alfabético, con los años al revés.
  lista.sort((a, b) => {
    if (a === SIN_DATO) return 1;
    if (b === SIN_DATO) return -1;
    return a.localeCompare(b, 'es', { numeric: true });
  });
  return lista;
}

function inicializarFiltros() {
  const fila = document.getElementById('fila-dropdowns');
  fila.innerHTML = '';
  DIMENSIONES.forEach(dim => fila.appendChild(construirDropdown(dim)));

  document.getElementById('filtro-texto').addEventListener('input', e => {
    estado.filtros.texto = e.target.value;
    aplicarFiltros();
  });

  document.getElementById('btn-limpiar-filtros').addEventListener('click', limpiarFiltros);

  sincronizarMostrarCompletados();
  // Delegación para incluir el control que se crea al abrir Otros proyectos del cliente.
  document.addEventListener('change', e => {
    if (!e.target.matches('[data-mostrar-completados]')) return;
    const id = e.target.id;
    cambiarMostrarCompletados(e.target.checked);
    document.getElementById(id)?.focus({ preventScroll: true });
  });

  const chk = document.getElementById('incluir-cancelados');
  if (chk) {
    chk.checked = estado.incluirCancelados;
    chk.addEventListener('change', () => {
      estado.incluirCancelados = chk.checked;
      aplicarFiltros();
    });
  }

  const anfitrion = document.getElementById('periodo-listado');
  if (anfitrion && !anfitrion.children.length) {
    anfitrion.appendChild(construirSelectorPeriodo(actualizarUI));
  }

  // Un clic fuera cierra cualquier dropdown abierto.
  document.addEventListener('click', e => {
    if (!e.target.closest('.dropdown-filtro')) cerrarDropdowns();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') cerrarDropdowns();
  });

  aplicarFiltros();
}

function cerrarDropdowns(excepto) {
  document.querySelectorAll('.dropdown-filtro.abierto').forEach(d => {
    if (d !== excepto) {
      d.classList.remove('abierto');
      d.querySelector('.dropdown-boton').setAttribute('aria-expanded', 'false');
    }
  });
}

function construirDropdown(dim) {
  const cont = document.createElement('div');
  cont.className = 'dropdown-filtro';
  cont.dataset.campo = dim.campo;

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'dropdown-boton';
  boton.setAttribute('aria-expanded', 'false');
  boton.setAttribute('aria-controls', `opciones-${dim.campo}`);
  boton.innerHTML = `<span class="dropdown-etiqueta">${dim.etiqueta}</span>
                     <span class="dropdown-badge"></span>
                     <span class="dropdown-flecha" aria-hidden="true">▾</span>`;
  boton.addEventListener('click', e => {
    e.stopPropagation();
    const abierto = cont.classList.contains('abierto');
    cerrarDropdowns(cont);
    cont.classList.toggle('abierto', !abierto);
    boton.setAttribute('aria-expanded', String(!abierto));
  });

  const panel = document.createElement('div');
  panel.className = 'dropdown-panel';
  panel.id = `opciones-${dim.campo}`;

  const opciones = opcionesDe(dim.campo);
  if (opciones.length > 10) {
    const buscador = document.createElement('input');
    buscador.type = 'text';
    buscador.className = 'dropdown-buscar';
    buscador.placeholder = 'Filtrar opciones...';
    buscador.setAttribute('aria-label', `Buscar opciones de ${dim.etiqueta}`);
    buscador.addEventListener('click', e => e.stopPropagation());
    buscador.addEventListener('input', () => {
      const q = buscador.value.toLowerCase();
      panel.querySelectorAll('.dropdown-opcion').forEach(fila => {
        fila.style.display = fila.dataset.valor.toLowerCase().includes(q) ? '' : 'none';
      });
    });
    panel.appendChild(buscador);
  }

  const lista = document.createElement('div');
  lista.className = 'dropdown-lista';
  opciones.forEach(valor => {
    const fila = document.createElement('label');
    fila.className = 'dropdown-opcion';
    fila.dataset.valor = valor;
    fila.innerHTML = `<input type="checkbox" value="${valor.replace(/"/g, '&quot;')}">
                      <span class="opcion-texto">${valor}</span>
                      <span class="opcion-conteo" data-conteo-de="${valor.replace(/"/g, '&quot;')}"></span>`;
    fila.querySelector('input').addEventListener('change', ev => {
      const marcados = estado.filtros[dim.campo];
      if (ev.target.checked) marcados.push(valor);
      else marcados.splice(marcados.indexOf(valor), 1);
      aplicarFiltros();
    });
    lista.appendChild(fila);
  });
  panel.appendChild(lista);

  const pie = document.createElement('button');
  pie.type = 'button';
  pie.className = 'dropdown-limpiar';
  pie.textContent = 'Quitar selección';
  pie.addEventListener('click', e => {
    e.stopPropagation();
    estado.filtros[dim.campo] = [];
    aplicarFiltros();
  });
  panel.appendChild(pie);

  cont.appendChild(boton);
  cont.appendChild(panel);
  return cont;
}

function refrescarConteos(campo) {
  const cont = document.querySelector(`.dropdown-filtro[data-campo="${campo}"]`);
  if (!cont) return;
  const conteos = conteosDe(campo);
  const marcados = estado.filtros[campo];

  cont.querySelectorAll('.dropdown-opcion').forEach(fila => {
    const valor = fila.dataset.valor;
    const n = conteos.get(valor) || 0;
    fila.querySelector('.opcion-conteo').textContent = n;
    fila.querySelector('input').checked = marcados.includes(valor);
    // Una opción que no sumaría nada se atenúa, pero sigue marcable.
    fila.classList.toggle('vacia', n === 0 && !marcados.includes(valor));
  });

  const badge = cont.querySelector('.dropdown-badge');
  badge.textContent = marcados.length ? marcados.length : '';
  cont.classList.toggle('activo', marcados.length > 0);
}

function renderizarChips() {
  const zona = document.getElementById('chips-activos');
  if (!zona) return;
  const chips = [];
  DIMENSIONES.forEach(dim => {
    estado.filtros[dim.campo].forEach(valor => {
      chips.push({ campo: dim.campo, etiqueta: dim.etiqueta, valor });
    });
  });

  zona.innerHTML = '';
  if (chips.length === 0) { zona.classList.add('vacio'); return; }
  zona.classList.remove('vacio');

  chips.forEach(c => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.innerHTML = `<span class="chip-dim">${c.etiqueta}</span>
                      <span class="chip-valor">${c.valor}</span>
                      <span class="chip-x" aria-hidden="true">×</span>`;
    chip.title = `Quitar filtro ${c.etiqueta}: ${c.valor}`;
    chip.addEventListener('click', () => {
      const m = estado.filtros[c.campo];
      m.splice(m.indexOf(c.valor), 1);
      aplicarFiltros();
    });
    zona.appendChild(chip);
  });
}

function limpiarFiltros() {
  DIMENSIONES.forEach(d => { estado.filtros[d.campo] = []; });
  estado.filtros.texto = '';
  document.getElementById('filtro-texto').value = '';
  aplicarFiltros();
}

// ============================================================================
// RENDERIZADO DE TABLA
// ============================================================================

function renderizarTabla() {
  const tabla = document.getElementById('tabla-proyectos');
  const thead = tabla.querySelector('thead tr');
  const tbody = tabla.querySelector('tbody');

  // Limpiar
  thead.innerHTML = '';
  tbody.innerHTML = '';

  // Determinar columnas verdes
  const columnasVerdes = estado.metadataProyectos.columnas
    .filter(c => c.verde)
    .map(c => c.key);

  // Headers
  const COL_ID = '__identificador';
  const COL_REVENUE = '__revenue_periodo';
  const columnasResumen = new Set([COL_ID, 'estado', 'nombre_del_proyecto', 'pm_lider', 'valor_of', 'backlog_2026', COL_REVENUE]);
  columnasVerdes.unshift(COL_ID);
  columnasVerdes.push(COL_REVENUE);
  columnasVerdes.forEach((key) => {
    const col = estado.metadataProyectos.columnas.find(c => c.key === key)
      || { label: key === COL_ID ? 'PA / PR' : `Revenue · ${periodoActual().etiqueta}` };
    const th = document.createElement('th');
    const ord = estado.orden || {};
    const etiqueta = ({ valor_of: 'Valor Booking', backlog_2026: 'Backlog', pm_lider: 'PM/Líder' })[key] || col.label;
    th.textContent = etiqueta + (ord.columna === key ? (ord.desc ? '  ↓' : '  ↑') : '');
    th.dataset.columna = key;
    if (!columnasResumen.has(key)) th.classList.add('columna-secundaria');
    th.title = `Ordenar por ${col.label}`;
    if (ord.columna === key) th.classList.add('col-ordenada');
    th.addEventListener('click', () => ordenarTabla(key));
    thead.appendChild(th);
  });

  // Rows
  estado.proyectosFiltrados.forEach((proyecto, idx) => {
    const tr = document.createElement('tr');
    tr.addEventListener('click', () => abrirDetalle(proyecto));

    columnasVerdes.forEach(key => {
      const td = document.createElement('td');
      let valor;
      if (key === COL_REVENUE) {
        valor = revenuePeriodo(proyecto);
      } else if (key === 'valor_of') {
        valor = valorBooking(proyecto);
      } else if (key === 'acumulado_a_hoy') {
        valor = acumuladoHoy(proyecto);
      } else if (key === 'consumido_2025') {
        valor = acum2025(proyecto);
      } else if (key === 'backlog_2026') {
        valor = backlogHoy(proyecto);
      } else {
        valor = proyecto[key];
      }

      // Formatos especiales
      if (key === COL_ID) {
        const id = identificador(proyecto);
        td.textContent = id.valor;
        td.className = 'celda-id';
        if (id.tipo === 'PR') td.title = 'Todavía sin PA asignado: se identifica por el PR';
        if (proyecto.start_at_risk) {
          const b = document.createElement('span');
          b.className = 'badge-riesgo';
          b.textContent = 'riesgo';
          b.title = 'Start at risk (dato simulado en el PoC)';
          td.appendChild(document.createTextNode(' '));
          td.appendChild(b);
        }
        // "sin backlog" chip si no hay fila de backlog
        if (!backlogDe(proyecto)) {
          const chip = document.createElement('span');
          chip.className = 'chip-sin-backlog';
          chip.textContent = 'sin backlog';
          chip.title = 'Este proyecto no tiene fila en BackLog NOLA: las cifras de revenue son nulas';
          td.appendChild(document.createTextNode(' '));
          td.appendChild(chip);
        }
      } else if (key === COL_REVENUE) {
        td.textContent = valor === null ? '—' : formatearDinero(valor);
        td.className = 'celda-numero';
      } else if (key === 'executive_watchlist') {
        td.style.textAlign = 'center';
        if (proyecto.executive_watchlist) {
          const chip = document.createElement('span');
          chip.className = 'chip-dato chip-bueno';
          chip.textContent = '✓';
          chip.style.fontSize = '0.75rem';
          chip.style.padding = '2px 6px';
          td.appendChild(chip);
        } else {
          td.textContent = '';
        }
      } else if (key === 'project_status') {
        if (proyecto.project_status) {
          const statusMap = { 'Red': 'Rojo', 'Yellow': 'Amarillo', 'Green': 'Verde' };
          const statusColor = { 'Red': '#c9190b', 'Yellow': '#f0ab00', 'Green': '#3e8635' };
          const dot = document.createElement('span');
          dot.style.cssText = `display:inline-block;width:8px;height:8px;border-radius:50%;background:${statusColor[proyecto.project_status] || '#8a8d90'};margin-right:4px;`;
          td.appendChild(dot);
          td.appendChild(document.createTextNode(statusMap[proyecto.project_status] || proyecto.project_status));
        } else {
          td.textContent = '—';
        }
        td.style.fontSize = '0.8125rem';
      } else if (CAMPOS_DINERO.has(key)) {
        td.textContent = formatearDinero(valor);
        td.className = 'celda-numero';
      } else if (CAMPOS_PORCENTAJE.has(key)) {
        td.textContent = formatearPorcentaje(valor);
        td.className = 'celda-numero';
      } else if (CAMPOS_ID.has(key)) {
        // Son identificadores, no cantidades: sin separador de miles.
        // "62.249" en vez de "62249" confunde y no se puede buscar.
        td.textContent = normalizarValor(valor) ? String(valor) : '—';
        td.className = 'celda-id';
      } else if (key === 'dias_para_vencimiento') {
        td.textContent = normalizarValor(valor) ? formatearNumero(valor) : '—';
        td.className = 'celda-numero ' + claseVencimiento(valor);
      } else if (key === 'estado') {
        td.textContent = obtenerEtiquetaValor(valor);
        td.className = 'celda-estado';
      } else {
        td.textContent = obtenerEtiquetaValor(valor);
        td.title = obtenerEtiquetaValor(valor);
      }

      if (!normalizarValor(valor)) {
        td.className += ' celda-nulo';
      }

      if (!columnasResumen.has(key)) td.classList.add('columna-secundaria');
      tr.appendChild(td);
    });

    // Apply subtle row tinting based on project_status
    if (proyecto.project_status === 'Red') {
      tr.classList.add('fila-status-red');
    } else if (proyecto.project_status === 'Yellow') {
      tr.classList.add('fila-status-yellow');
    }

    tbody.appendChild(tr);
  });

  // Actualizar indicador
  document.getElementById('indicador-proyectos').textContent =
    `${estado.proyectosFiltrados.length} de ${estado.proyectos.filter(pasaFiltroCompletados).length} proyectos`;
}

function ordenarTabla(columna) {
  // Segundo clic en la misma columna = invierte el orden.
  const orden = estado.orden || {};
  const desc = orden.columna === columna ? !orden.desc : true;
  estado.orden = { columna, desc };

  // El tipo se decide mirando TODA la columna, no la primera fila: muchas
  // traen null arriba por los errores del Excel y eso haría ordenar
  // números como si fueran texto.
  // La columna de revenue del periodo no vive en el proyecto: se calcula.
  const leer = p => {
    if (columna === '__revenue_periodo') return revenuePeriodo(p);
    if (columna === '__identificador') return identificador(p).valor;
    if (columna === 'valor_of') return valorBooking(p);
    if (columna === 'acumulado_a_hoy') return acumuladoHoy(p);
    if (columna === 'consumido_2025') return acum2025(p);
    if (columna === 'backlog_2026') return backlogHoy(p);
    return p[columna];
  };
  const esNumerica = estado.proyectosFiltrados.some(p => typeof leer(p) === 'number');

  estado.proyectosFiltrados.sort((a, b) => {
    const va = leer(a), vb = leer(b);
    // Los sin dato siempre al final, suba o baje el orden: no son "el menor",
    // son una ausencia, y arriba solo estorban.
    const na = va === null || va === undefined || va === '';
    const nb = vb === null || vb === undefined || vb === '';
    if (na && nb) return 0;
    if (na) return 1;
    if (nb) return -1;

    const cmp = esNumerica
      ? (Number(va) || 0) - (Number(vb) || 0)
      : String(va).localeCompare(String(vb), 'es', { numeric: true });
    return desc ? -cmp : cmp;
  });

  renderizarTabla();
}

// ============================================================================
// GRÁFICAS (SVG inline)
// ============================================================================

// ---------------------------------------------------------------------------
// Tooltip compartido por todas las gráficas
// ---------------------------------------------------------------------------

let _tooltipEl = null;

function tooltipEl() {
  if (!_tooltipEl) {
    _tooltipEl = document.createElement('div');
    _tooltipEl.className = 'viz-tooltip';
    document.body.appendChild(_tooltipEl);
  }
  return _tooltipEl;
}

/** `filas` = [{color, etiqueta, valor}]. `color` opcional. */
function mostrarTooltip(evento, titulo, filas) {
  const tt = tooltipEl();
  const cuerpo = (filas || []).map(f => `
    <div class="tt-fila">
      ${f.color ? `<span class="tt-marca" style="background:${f.color}"></span>` : ''}
      <span class="tt-etiqueta">${f.etiqueta}</span>
      <span class="tt-valor">${f.valor}</span>
    </div>`).join('');
  tt.innerHTML = `<div class="tt-titulo">${titulo}</div>${cuerpo}`;
  tt.style.display = 'block';
  moverTooltip(evento);
}

function moverTooltip(evento) {
  const tt = tooltipEl();
  const margen = 14;
  const ancho = tt.offsetWidth;
  const alto = tt.offsetHeight;
  // Se voltea al otro lado si no cabe, para no salirse de la ventana.
  let x = evento.clientX + margen;
  let y = evento.clientY + margen;
  if (x + ancho > window.innerWidth - 8) x = evento.clientX - ancho - margen;
  if (y + alto > window.innerHeight - 8) y = evento.clientY - alto - margen;
  tt.style.left = Math.max(8, x) + 'px';
  tt.style.top = Math.max(8, y) + 'px';
}

function ocultarTooltip() {
  if (_tooltipEl) _tooltipEl.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Gráfica de barras
// ---------------------------------------------------------------------------

const FORMATOS = {
  dinero: v => formatearDinero(v),
  conteo: v => String(Math.round(v)),
  porcentaje: v => v.toFixed(1) + '%',
};

// Paleta de 4 colores para las series de comparación (Booking, Acumulado, Proyectada, Backlog)
const COLORES_SERIES_COMPARACION = {
  booking: 'var(--series-1)',
  acumulado: 'var(--series-3)',
  proyectada: 'var(--series-4)',
  backlog: 'var(--series-7)',
};

// El color sigue a la entidad, no a su posición en el ranking: si un filtro
// cambia el orden de las barras, cada categoría conserva su color.
const _coloresEntidad = new Map();

function colorDeEntidad(campo, valor) {
  // "(sin dato)" no es una categoría del negocio, es una ausencia: va en gris
  // para que no compita visualmente con las categorías reales.
  if (valor === SIN_DATO) return 'var(--series-otros)';
  const clave = campo + '|' + valor;
  if (!_coloresEntidad.has(clave)) {
    const usados = Array.from(_coloresEntidad.keys()).filter(k => k.startsWith(campo + '|')).length;
    _coloresEntidad.set(clave, usados < 8 ? `var(--series-${usados + 1})` : 'var(--series-otros)');
  }
  return _coloresEntidad.get(clave);
}

/** Reserva los colores de una dimensión en un orden fijo, antes de dibujar. */
function fijarColores(campo, valores) {
  valores.forEach(v => colorDeEntidad(campo, v));
}

/** Escala del tamaño de fuente en gráficas respecto al root (16px). */
function escalaTexto() {
  if (document.body.classList.contains('preparando-reporte')) return 1;
  return parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;
}

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs || {}).forEach(([k, v]) => {
    // Escalar font-size en SVG con el factor de escala del root
    if (k === 'font-size' && typeof v === 'number') {
      el.setAttribute(k, String(Math.max(12, v) * escalaTexto()));
    } else {
      el.setAttribute(k, String(v));
    }
  });
  return el;
}

/**
 * opciones = {
 *   formato: 'dinero' | 'conteo' | 'porcentaje',
 *   campoColor: nombre de dimensión -> una color por categoría,
 *               o null -> una sola serie en azul (lo normal cuando el eje
 *               X ya identifica cada barra y el color no aporta nada),
 *   unidad: texto que acompaña el valor en el tooltip
 * }
 */
function crearGraficaBarrasSimple(svgId, datos, opciones) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  registrarGrafica(svg, () => crearGraficaBarrasSimple(svgId, datos, opciones));
  svg.innerHTML = '';
  svg.style.removeProperty('height');

  const op = opciones || {};
  const fmt = FORMATOS[op.formato] || FORMATOS.dinero;

  if (!datos.length) {
    svg.style.height = '120px';
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Gráfica sin datos');
    svg.setAttribute('viewBox', '0 0 600 120');
    const t = svgEl('text', { x: 300, y: 60, 'text-anchor': 'middle',
      'font-size': 13, fill: 'var(--text-dim)' });
    t.textContent = 'Sin datos para los filtros aplicados';
    svg.appendChild(t);
    return;
  }

  const ancho = Math.max(300, svg.clientWidth || 300);
  const pasoPrevio = Math.max(1, (ancho - 78) / datos.length);
  const etiquetasLargas = datos.some(d => String(d.etiqueta).length > 9 || String(d.etiqueta).length * 7 > pasoPrevio);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', op.unidad ? `Gráfica de ${op.unidad}` : 'Gráfica de barras');
  svg.setAttribute('title', op.unidad ? `Gráfica de ${op.unidad}` : 'Gráfica de barras');
  if (etiquetasLargas) {
    const fila = 28;
    const alto = Math.max(120, datos.length * fila + 24);
    const margen = { top: 12, right: 18, bottom: 12, left: Math.min(190, Math.max(105, Math.round(ancho * 0.34))) };
    svg.dataset.reporteCabecera = String(margen.top);
    svg.dataset.reporteCortes = JSON.stringify(datos.map((_, i) => ({ inicio: margen.top + i * fila, fin: margen.top + (i + 1) * fila })));
    const areaAncho = Math.max(90, ancho - margen.left - margen.right);
    const maxValor = Math.max(...datos.map(d => d.valor), 0) || 1;
    const maxCaracteres = Math.max(8, Math.floor((margen.left - 12) / 6.3));
    svg.style.height = `${alto}px`;
    svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
    const g = svgEl('g', { transform: `translate(${margen.left},${margen.top})` });
    datos.forEach((d, i) => {
      const y = i * fila + 4;
      const texto = String(d.etiqueta);
      const label = svgEl('text', { x: -8, y: y + 8, 'font-size': 11, 'text-anchor': 'end', fill: 'var(--text-secondary)' });
      label.textContent = texto.length > maxCaracteres ? texto.slice(0, maxCaracteres - 1) + '…' : texto;
      const title = svgEl('title', {}); title.textContent = texto; label.appendChild(title); g.appendChild(label);
      const barW = Math.max(1, d.valor / maxValor * areaAncho);
      const bar = svgEl('rect', { x: 0, y, width: barW, height: 14, rx: 2, fill: op.campoColor ? colorDeEntidad(op.campoColor, d.etiqueta) : 'var(--series-1)' });
      g.appendChild(bar);
      const cercaDelBorde = barW > areaAncho - 52;
      const value = svgEl('text', { x: cercaDelBorde ? areaAncho - 3 : Math.min(barW + 5, areaAncho - 2), y: y + 11, 'font-size': 10, 'text-anchor': cercaDelBorde ? 'end' : 'start', fill: 'var(--text-primary)', 'font-variant-numeric': 'tabular-nums' });
      value.textContent = fmt(d.valor); g.appendChild(value);
      const hit = svgEl('rect', { x: 0, y: y - 2, width: areaAncho, height: 18, fill: 'transparent' });
      hit.addEventListener('mouseenter', e => mostrarTooltip(e, texto, [{ color: bar.getAttribute('fill'), etiqueta: op.unidad || 'Valor', valor: d.exacto || fmt(d.valor) }]));
      hit.addEventListener('mousemove', moverTooltip); hit.addEventListener('mouseleave', ocultarTooltip); g.appendChild(hit);
    });
    svg.appendChild(g);
    return;
  }
  // Las categorías cortas conservan las barras verticales.
  const alto = 280;
  const margen = {
    top: 16, right: 16,
    bottom: 44,
    left: 62,
  };
  const areaAncho = Math.max(80, ancho - margen.left - margen.right);
  const areaAlto = alto - margen.top - margen.bottom;

  svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
  svg.style.height = `${alto}px`;
  const g = svgEl('g', { transform: `translate(${margen.left},${margen.top})` });

  const maxValor = Math.max(...datos.map(d => d.valor), 0) || 1;
  const paso = areaAncho / datos.length;
  const anchoBarra = Math.max(6, Math.min(54, paso - 8)); // deja 2px+ entre barras

  // Rejilla y eje Y, recesivos.
  const lineas = 4;
  for (let i = 0; i <= lineas; i++) {
    const y = areaAlto - (areaAlto / lineas) * i;
    g.appendChild(svgEl('line', {
      x1: 0, y1: y, x2: areaAncho, y2: y,
      stroke: i === 0 ? 'var(--baseline-color)' : 'var(--grid-color)', 'stroke-width': 1,
    }));
    const lbl = svgEl('text', {
      x: -9, y: y + 4, 'font-size': 13, 'text-anchor': 'end',
      fill: 'var(--text-secondary)', 'font-variant-numeric': 'tabular-nums',
    });
    lbl.textContent = fmt((maxValor / lineas) * i);
    g.appendChild(lbl);
  }

  datos.forEach((d, i) => {
    const x = i * paso + (paso - anchoBarra) / 2;
    const altura = Math.max(1, (d.valor / maxValor) * areaAlto);
    const color = op.campoColor ? colorDeEntidad(op.campoColor, d.etiqueta) : 'var(--series-1)';

    // Esquinas redondeadas solo en el extremo del dato; la base queda anclada.
    const r = Math.min(4, anchoBarra / 2, altura);
    const y = areaAlto - altura;
    const barra = svgEl('path', {
      d: `M${x},${areaAlto} L${x},${y + r} Q${x},${y} ${x + r},${y}
          L${x + anchoBarra - r},${y} Q${x + anchoBarra},${y} ${x + anchoBarra},${y + r}
          L${x + anchoBarra},${areaAlto} Z`,
      fill: color,
    });
    g.appendChild(barra);

    // Etiqueta de valor sobre la barra
    const valorLbl = svgEl('text', {
      x: x + anchoBarra / 2,
      y: y - 5,
      'text-anchor': 'middle',
      'font-size': 11,
      'font-weight': 600,
      fill: 'var(--text-primary)',
      'font-variant-numeric': 'tabular-nums',
    });
    valorLbl.textContent = fmt(d.valor);
    g.appendChild(valorLbl);

    // El área sensible al mouse es toda la columna, no solo la barra.
    const zona = svgEl('rect', {
      x: i * paso, y: 0, width: paso, height: areaAlto, fill: 'transparent',
    });
    zona.style.cursor = 'pointer';
    zona.addEventListener('mouseenter', e => {
      barra.setAttribute('opacity', '0.78');
      mostrarTooltip(e, d.etiqueta, [{
        color, etiqueta: op.unidad || 'Valor', valor: d.exacto || fmt(d.valor),
      }]);
    });
    zona.addEventListener('mousemove', moverTooltip);
    zona.addEventListener('mouseleave', () => {
      barra.removeAttribute('opacity');
      ocultarTooltip();
    });
    g.appendChild(zona);

    const texto = String(d.etiqueta);
    const lbl = svgEl('text', {
      'font-size': 12, fill: 'var(--text-secondary)',
    });
    {
      lbl.setAttribute('x', i * paso + paso / 2);
      lbl.setAttribute('y', areaAlto + 16);
      lbl.setAttribute('text-anchor', 'middle');
      lbl.textContent = texto;
    }
    const titulo = svgEl('title', {});
    titulo.textContent = texto;
    lbl.appendChild(titulo);
    g.appendChild(lbl);
  });

  svg.appendChild(g);
}

/**
 * Gráfica de barras agrupadas horizontal. Para comparar múltiples series por categoría.
 * datos = [{ etiqueta, lineasEtiqueta?, zona, series: [{ nombre, valor, color },...] }]
 */
function crearGraficaBarrasAgrupadasHorizontal(svgId, datos, opciones) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  registrarGrafica(svg, () => crearGraficaBarrasAgrupadasHorizontal(svgId, datos, opciones));
  svg.innerHTML = '';
  svg.style.removeProperty('height');

  const op = opciones || {};
  const fmt = FORMATOS[op.formato] || FORMATOS.dinero;
  const fmtValor = op.formato === 'dinero' ? formatearDineroExacto : fmt;
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', op.unidad || 'Gráfica de barras agrupadas');

  if (!datos.length) {
    svg.style.height = '120px';
    svg.setAttribute('viewBox', '0 0 600 120');
    const t = svgEl('text', { x: 300, y: 60, 'text-anchor': 'middle',
      'font-size': 13, fill: 'var(--text-dim)' });
    t.textContent = 'Sin datos para los filtros aplicados';
    svg.appendChild(t);
    return;
  }

  const ancho = Math.max(300, svg.clientWidth || 300);
  const escala = escalaTexto();
  const fuente = 12 * escala;
  const contextoTexto = document.createElement('canvas').getContext('2d');
  const familia = getComputedStyle(svg).fontFamily;
  const medirTexto = (texto, peso = 400) => {
    contextoTexto.font = `${peso} ${fuente}px ${familia}`;
    return contextoTexto.measureText(String(texto)).width;
  };
  const recortarTexto = (texto, maxAncho, peso = 400) => {
    let corto = String(texto);
    if (medirTexto(corto, peso) <= maxAncho) return corto;
    while (corto && medirTexto(corto + '…', peso) > maxAncho) corto = corto.slice(0, -1);
    return corto + '…';
  };
  const nSeriesGlobal = Math.max(...datos.map(d => d.series.length));
  const alturaBarra = Math.ceil(fuente + 2);
  const espacioEntreSeries = Math.ceil(7 * escala);
  const alturaPorGrupo = nSeriesGlobal * (alturaBarra + espacioEntreSeries) - espacioEntreSeries;
  const margenGrupo = Math.ceil(24 * escala);
  const alturaZona = Math.ceil(24 * escala);
  const zonas = [...new Set(datos.map(d => d.zona ?? null))];
  const seriesLeyenda = datos[0].series;
  const margenIzq = Math.min(230, Math.max(95, Math.round(ancho * 0.28)));
  const anchoValor = Math.max(...datos.flatMap(d => d.series.map(s => medirTexto(fmtValor(s.valor), 600))));
  const anchoMaxLeyenda = ancho - 16;
  const altoFilaLeyenda = Math.ceil(24 * escala);
  let leyendaFilas = 1, anchoFilaLeyenda = 0;
  seriesLeyenda.forEach(s => {
    const w = 40 + medirTexto(s.nombre);
    if (anchoFilaLeyenda && anchoFilaLeyenda + w > anchoMaxLeyenda) { leyendaFilas++; anchoFilaLeyenda = 0; }
    anchoFilaLeyenda += w;
  });
  const margenTop = Math.ceil(40 * escala) + leyendaFilas * altoFilaLeyenda;
  let altoTotal = margenTop;
  zonas.forEach(z => {
    const enZona = datos.filter(d => z === null ? d.zona == null : d.zona === z);
    altoTotal += (z !== null && z !== '' ? alturaZona : 0) + enZona.length * (alturaPorGrupo + margenGrupo);
  });
  const margen = { top: margenTop, right: Math.ceil(anchoValor + 16), bottom: 16, left: margenIzq };
  const alto = Math.max(120, altoTotal + margen.bottom);
  const areaAncho = Math.max(40, ancho - margen.left - margen.right);
  const areaAlto = alto - margen.top - margen.bottom;

  svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
  svg.style.height = alto + 'px';
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', op.unidad || 'Gráfica de barras agrupadas');
  svg.setAttribute('title', op.unidad || 'Gráfica de barras agrupadas');
  const g = svgEl('g', { transform: `translate(${margen.left},${margen.top})` });

  const valores = datos.flatMap(d => d.series.map(s => s.valor)).filter(Number.isFinite);
  const minValor = Math.min(0, ...valores);
  const maxValor = Math.max(0, ...valores) || 1;
  const escalaX = valor => (valor - minValor) / (maxValor - minValor) * areaAncho;

  // Leyenda envuelta dentro del ancho disponible.
  if (datos.length && datos[0].series.length) {
    let offsetX = 0, filaLeyenda = 0;
    const leyenda = svgEl('g', { class: 'leyenda-comparacion', transform: 'translate(8,12)' });
    seriesLeyenda.forEach(s => {
      const anchoLeyenda = 40 + medirTexto(s.nombre);
      if (offsetX && offsetX + anchoLeyenda > anchoMaxLeyenda) { offsetX = 0; filaLeyenda++; }
      const gLey = svgEl('g', {});
      gLey.appendChild(svgEl('rect', {
        x: offsetX, y: filaLeyenda * altoFilaLeyenda, width: 11, height: 11, rx: 2, fill: s.color,
      }));
      const t = svgEl('text', {
        x: offsetX + 16, y: filaLeyenda * altoFilaLeyenda + 10, 'font-size': 12, fill: 'var(--text-secondary)',
      });
      t.textContent = s.nombre;
      gLey.appendChild(t);
      leyenda.appendChild(gLey);
      offsetX += anchoLeyenda;
    });
    svg.appendChild(leyenda);
  }

  // Rejilla
  const anchoTick = Math.max(medirTexto(fmt(minValor)), medirTexto(fmt(maxValor))) + 20;
  const lineas = Math.max(1, Math.min(4, Math.floor(areaAncho / anchoTick)));
  for (let i = 0; i <= lineas; i++) {
    const x = (areaAncho / lineas) * i;
    g.appendChild(svgEl('line', {
      x1: x, y1: 0, x2: x, y2: areaAlto,
      stroke: 'var(--grid-color)', 'stroke-width': 1,
    }));
    const lbl = svgEl('text', {
      x, y: -8, 'font-size': 11, 'text-anchor': 'middle',
      fill: 'var(--text-secondary)', 'font-variant-numeric': 'tabular-nums',
    });
    lbl.textContent = fmt(minValor + (maxValor - minValor) / lineas * i);
    g.appendChild(lbl);
  }

  // Dibujar grupos por zona
  let offsetY = 0;
  const cortesReporte = [];
  zonas.forEach(zona => {
    const gruposZona = datos.filter(d => zona === null ? d.zona == null : d.zona === zona);
    if (gruposZona.length === 0) return;

    // Etiqueta de zona
    if (zona !== null && zona !== '') {
      const lblZona = svgEl('text', {
        x: -10, y: offsetY + fuente, 'font-size': 12, 'text-anchor': 'end',
        fill: 'var(--text-dim)', 'font-weight': 600, 'text-transform': 'uppercase',
      });
      lblZona.textContent = recortarTexto(zona, margen.left - 20, 600);
      const tituloZona = svgEl('title', {});
      tituloZona.textContent = zona;
      lblZona.appendChild(tituloZona);
      g.appendChild(lblZona);
      offsetY += alturaZona;
    }

    gruposZona.forEach((grupo, indiceGrupo) => {
      cortesReporte.push({
        inicio: margen.top + offsetY - (indiceGrupo === 0 && zona !== null && zona !== '' ? alturaZona : 0),
        fin: margen.top + offsetY + alturaPorGrupo + margenGrupo,
        zona,
      });
      const nSeries = grupo.series.length;
      const alturaGrupo = nSeries * alturaBarra + (nSeries - 1) * espacioEntreSeries;
      const yBase = offsetY + (alturaPorGrupo - alturaGrupo) / 2;

      // PA y nombre van en líneas separadas para distinguir proyectos de una misma cuenta.
      const lineasEtiqueta = grupo.lineasEtiqueta || [grupo.etiqueta];
      lineasEtiqueta.forEach((linea, i) => {
        const peso = grupo.lineasEtiqueta && i === 0 ? 600 : 400;
        const lblGrupo = svgEl('text', {
          class: 'etiqueta-grupo', x: -10,
          y: offsetY + alturaPorGrupo / 2 + (i - (lineasEtiqueta.length - 1) / 2) * (fuente + 5),
          'font-size': 12, 'font-weight': peso,
          'text-anchor': 'end', fill: 'var(--text-primary)', 'dominant-baseline': 'middle',
        });
        lblGrupo.textContent = recortarTexto(linea, margen.left - 20, peso);
        const titulo = svgEl('title', {});
        titulo.textContent = grupo.etiqueta;
        lblGrupo.appendChild(titulo);
        g.appendChild(lblGrupo);
      });

      // Barras
      grupo.series.forEach((serie, si) => {
        const yBarra = yBase + si * (alturaBarra + espacioEntreSeries);
        const valor = Number.isFinite(serie.valor) ? serie.valor : 0;
        const xBarra = escalaX(Math.min(0, valor));
        const anchoBarra = Math.abs(escalaX(valor) - escalaX(0));

        const barra = svgEl('rect', {
          x: xBarra, y: yBarra, width: anchoBarra, height: alturaBarra,
          fill: serie.color, rx: 1.5,
        });
        g.appendChild(barra);

        // Las cuatro series muestran el importe completo, también acumulado y proyectada.
        const lblValor = svgEl('text', {
          class: 'valor-serie', x: xBarra + anchoBarra + 6, y: yBarra + alturaBarra / 2,
          'font-size': 12, 'font-weight': 600, 'dominant-baseline': 'middle',
          fill: 'var(--text-primary)', 'font-variant-numeric': 'tabular-nums',
        });
        lblValor.textContent = fmtValor(serie.valor);
        g.appendChild(lblValor);

        // Tooltip
        const zona = svgEl('rect', {
          x: xBarra, y: yBarra, width: Math.max(anchoBarra, 30), height: alturaBarra,
          fill: 'transparent',
        });
        zona.style.cursor = 'pointer';
        if (op.alClickar) {
          zona.setAttribute('role', 'button'); zona.setAttribute('tabindex', '0');
          zona.setAttribute('aria-label', `${grupo.etiqueta}: ${serie.nombre}, ${fmt(serie.valor)}. Filtrar por ${grupo.etiqueta}`);
          zona.addEventListener('click', () => op.alClickar(grupo.etiqueta));
          zona.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); op.alClickar(grupo.etiqueta); } });
        }
        zona.addEventListener('mouseenter', e => {
          barra.setAttribute('opacity', '0.78');
          mostrarTooltip(e, grupo.etiqueta, [{
            color: serie.color,
            etiqueta: serie.nombre,
            valor: fmtValor(serie.valor),
          }]);
        });
        zona.addEventListener('mousemove', moverTooltip);
        zona.addEventListener('mouseleave', () => {
          barra.removeAttribute('opacity');
          ocultarTooltip();
        });
        g.appendChild(zona);
      });

      offsetY += alturaPorGrupo + margenGrupo;
    });
  });

  svg.appendChild(g);
  svg.dataset.reporteCabecera = String(margen.top);
  svg.dataset.reporteCortes = JSON.stringify(cortesReporte);
}

/**
 * Gráfica de barras agrupadas vertical. Similar a horizontal pero con barras verticales.
 * datos = [{ etiqueta, series: [{ nombre, valor, color },...] }]
 * opciones.alClickar: callback(etiqueta) cuando se hace clic en un grupo
 */
function crearGraficaBarrasAgrupadasVertical(svgId, datos, opciones) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  registrarGrafica(svg, () => crearGraficaBarrasAgrupadasVertical(svgId, datos, opciones));
  svg.innerHTML = '';
  svg.style.removeProperty('height');

  const op = opciones || {};
  const fmt = FORMATOS[op.formato] || FORMATOS.dinero;

  if (!datos.length) {
    svg.style.height = '120px';
    svg.setAttribute('viewBox', '0 0 600 120');
    const t = svgEl('text', { x: 300, y: 60, 'text-anchor': 'middle',
      'font-size': 13, fill: 'var(--text-dim)' });
    t.textContent = 'Sin datos para los filtros aplicados';
    svg.appendChild(t);
    return;
  }

  const ancho = svg.clientWidth || 900;
  const alto = 340;
  // Arriba: leyenda y, debajo, las etiquetas rotadas de la barra más alta.
  const margen = { top: 100, right: 16, bottom: 70, left: 70 };
  const areaAncho = ancho - margen.left - margen.right;
  const areaAlto = alto - margen.top - margen.bottom;

  svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
  svg.style.height = alto + 'px';
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Gráfica de barras agrupadas verticales');
  svg.setAttribute('title', 'Gráfica de barras agrupadas verticales');
  const g = svgEl('g', { transform: `translate(${margen.left},${margen.top})` });

  const maxValor = Math.max(...datos.flatMap(d => d.series.map(s => s.valor)), 1);
  const pasoGrupo = areaAncho / datos.length;
  const nSeries = datos.length ? datos[0].series.length : 0;
  const anchoBarra = Math.min(16, (pasoGrupo - 16) / nSeries);

  // Rejilla y eje Y
  const lineas = 4;
  for (let i = 0; i <= lineas; i++) {
    const y = areaAlto - (areaAlto / lineas) * i;
    g.appendChild(svgEl('line', {
      x1: 0, y1: y, x2: areaAncho, y2: y,
      stroke: i === 0 ? 'var(--baseline-color)' : 'var(--grid-color)', 'stroke-width': 1,
    }));
    const lbl = svgEl('text', {
      x: -9, y: y + 4, 'font-size': 13, 'text-anchor': 'end',
      fill: 'var(--text-secondary)', 'font-variant-numeric': 'tabular-nums',
    });
    lbl.textContent = fmt((maxValor / lineas) * i);
    g.appendChild(lbl);
  }

  // Grupos
  datos.forEach((grupo, ig) => {
    const xGrupo = ig * pasoGrupo + pasoGrupo / 2;
    const anchoTotal = nSeries * anchoBarra + (nSeries - 1) * 3;
    const xBase = xGrupo - anchoTotal / 2;

    grupo.series.forEach((serie, is) => {
      const xBarra = xBase + is * (anchoBarra + 3);
      const altura = Math.max(1, (serie.valor / maxValor) * areaAlto);
      const yBarra = areaAlto - altura;

      const barra = svgEl('rect', {
        x: xBarra, y: yBarra, width: anchoBarra, height: altura,
        fill: serie.color, rx: 2,
      });
      g.appendChild(barra);

      // Valor rotado -90, positioned ABOVE bar top
      const lblValor = svgEl('text', {
        'font-size': 10, 'font-weight': 600,
        fill: 'var(--text-primary)',
        'font-variant-numeric': 'tabular-nums',
        transform: `translate(${xBarra + anchoBarra / 2},${yBarra - 3}) rotate(-90)`,
        'text-anchor': 'start',  // start makes text go UP from rotation point
      });
      lblValor.textContent = fmt(serie.valor);
      g.appendChild(lblValor);

      // Tooltip
      const zona = svgEl('rect', {
        x: xBarra, y: 0, width: anchoBarra, height: areaAlto,
        fill: 'transparent',
      });
      zona.style.cursor = 'pointer';
      zona.addEventListener('mouseenter', e => {
        barra.setAttribute('opacity', '0.78');
        mostrarTooltip(e, grupo.etiqueta, [{
          color: serie.color,
          etiqueta: serie.nombre,
          valor: '$' + serie.valor.toLocaleString('en-US', { maximumFractionDigits: 0 }),
        }]);
      });
      zona.addEventListener('mousemove', moverTooltip);
      zona.addEventListener('mouseleave', () => {
        barra.removeAttribute('opacity');
        ocultarTooltip();
      });
      // El clic va en la misma zona del tooltip: una capa aparte encima del
      // grupo tapaba los tooltips de cada barra.
      if (op.alClickar) {
        zona.setAttribute('role', 'button'); zona.setAttribute('tabindex', '0');
        zona.setAttribute('aria-label', `Filtrar por vendedor ${grupo.etiqueta}: ${serie.nombre}, ${fmt(serie.valor)}`);
        zona.addEventListener('click', () => op.alClickar(grupo.etiqueta));
        zona.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); op.alClickar(grupo.etiqueta); } });
      }
      g.appendChild(zona);
    });

    // Etiqueta del eje X (2 líneas si es largo)
    const texto = String(grupo.etiqueta);
    if (texto.length > 10) {
      const mitad = Math.floor(texto.length / 2);
      const espacio = texto.lastIndexOf(' ', mitad);
      const corte = espacio > mitad - 5 && espacio < mitad + 5 ? espacio : mitad;
      const linea1 = texto.slice(0, corte).trim();
      const linea2 = texto.slice(corte).trim();

      const lbl1 = svgEl('text', {
        x: xGrupo, y: areaAlto + 16, 'font-size': 10,
        'text-anchor': 'middle', fill: 'var(--text-secondary)',
      });
      lbl1.textContent = linea1.length > 12 ? linea1.slice(0, 11) + '…' : linea1;
      g.appendChild(lbl1);

      const lbl2 = svgEl('text', {
        x: xGrupo, y: areaAlto + 28, 'font-size': 10,
        'text-anchor': 'middle', fill: 'var(--text-secondary)',
      });
      lbl2.textContent = linea2.length > 12 ? linea2.slice(0, 11) + '…' : linea2;
      const titulo = svgEl('title', {});
      titulo.textContent = texto;
      lbl2.appendChild(titulo);
      g.appendChild(lbl2);
    } else {
      const lbl = svgEl('text', {
        x: xGrupo, y: areaAlto + 16, 'font-size': 10,
        'text-anchor': 'middle', fill: 'var(--text-secondary)',
      });
      lbl.textContent = texto;
      const titulo = svgEl('title', {});
      titulo.textContent = texto;
      lbl.appendChild(titulo);
      g.appendChild(lbl);
    }
  });

  // Leyenda arriba
  if (datos.length && datos[0].series.length) {
    let offset = 0;
    datos[0].series.forEach(s => {
      const gLey = svgEl('g', {});
      gLey.appendChild(svgEl('rect', {
        x: offset, y: -92, width: 11, height: 11, rx: 2, fill: s.color,
      }));
      const t = svgEl('text', {
        x: offset + 16, y: -83, 'font-size': 11, fill: 'var(--text-secondary)',
      });
      t.textContent = s.nombre;
      gLey.appendChild(t);
      g.appendChild(gLey);
      offset += 16 + s.nombre.length * 7.2 * escalaTexto() + 18;
    });
  }

  svg.appendChild(g);
}

/**
 * Gráfica de barras apiladas horizontal. Para mostrar composición por categoría.
 * datos = [{ etiqueta, segmentos: [{ nombre, valor, color },...] }]
 */
function crearGraficaBarrasApiladas(svgId, datos, opciones) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  registrarGrafica(svg, () => crearGraficaBarrasApiladas(svgId, datos, opciones));
  svg.innerHTML = '';
  svg.style.removeProperty('height');

  const op = opciones || {};

  if (!datos.length) {
    svg.style.height = '120px';
    svg.setAttribute('viewBox', '0 0 600 120');
    const t = svgEl('text', { x: 300, y: 60, 'text-anchor': 'middle',
      'font-size': 13, fill: 'var(--text-dim)' });
    t.textContent = 'Sin datos para los filtros aplicados';
    svg.appendChild(t);
    return;
  }

  const ancho = Math.max(300, svg.clientWidth || 300);
  const alturaPorBarra = 32;
  const margenBarra = 12;
  const segmentosLeyenda = op.todosSegmentos || (datos.length && datos[0].segmentos) || [];
  const anchoLeyenda = Math.max(120, ancho - 24);
  let filasLeyenda = 1, anchoFila = 0;
  segmentosLeyenda.forEach(s => {
    const w = 34 + s.nombre.length * 7.2 * escalaTexto();
    if (anchoFila && anchoFila + w > anchoLeyenda) { filasLeyenda++; anchoFila = 0; }
    anchoFila += w;
  });
  const margenTop = 24 + filasLeyenda * 18;
  const alto = Math.max(160, datos.length * (alturaPorBarra + margenBarra) + margenTop + 36);
  const margen = { top: margenTop, right: 50, bottom: 20, left: Math.round(140 * escalaTexto()) };  // right margin for total label
  svg.dataset.reporteCabecera = String(margen.top);
  svg.dataset.reporteCortes = JSON.stringify(datos.map((_, i) => ({
    inicio: margen.top + i * (alturaPorBarra + margenBarra),
    fin: margen.top + (i + 1) * (alturaPorBarra + margenBarra),
  })));
  const espacioTotal = 36;  // reserve space for total label at end of bar
  const areaAncho = ancho - margen.left - margen.right - espacioTotal;
  const areaAlto = alto - margen.top - margen.bottom;

  svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
  svg.style.height = alto + 'px';
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', op.unidad || 'Gráfica de barras apiladas');
  svg.setAttribute('title', op.unidad || 'Gráfica de barras apiladas');
  const g = svgEl('g', { transform: `translate(${margen.left},${margen.top})` });

  // Valor máximo = suma de segmentos de cada barra
  const maxTotal = Math.max(...datos.map(d =>
    d.segmentos.reduce((a, s) => a + s.valor, 0)), 1);

  // Dibujar barras
  datos.forEach((fila, i) => {
    const yBarra = i * (alturaPorBarra + margenBarra);
    const total = fila.segmentos.reduce((a, s) => a + s.valor, 0);

    // Etiqueta
    const lbl = svgEl('text', {
      x: -10, y: yBarra + alturaPorBarra / 2, 'font-size': 12,
      'text-anchor': 'end', fill: 'var(--text-primary)',
      'dominant-baseline': 'middle',
    });
    const texto = String(fila.etiqueta);
    lbl.textContent = texto.length > 18 ? texto.slice(0, 17) + '…' : texto;
    const titulo = svgEl('title', {});
    titulo.textContent = texto;
    lbl.appendChild(titulo);
    g.appendChild(lbl);

    // Segmentos
    let offsetX = 0;
    fila.segmentos.forEach((seg, si) => {
      const ancho = Math.max(0, (seg.valor / maxTotal) * areaAncho);

      const rect = svgEl('rect', {
        x: offsetX, y: yBarra, width: ancho, height: alturaPorBarra,
        fill: seg.color, rx: si === 0 ? 2 : 0,
      });
      if (si === fila.segmentos.length - 1) rect.setAttribute('rx', 2);
      g.appendChild(rect);

      // Valor dentro del segmento si cabe
      if (ancho > 30 && seg.valor > 0) {
        const lblSeg = svgEl('text', {
          x: offsetX + ancho / 2, y: yBarra + alturaPorBarra / 2,
          'font-size': 11, 'font-weight': 600,
          'text-anchor': 'middle', 'dominant-baseline': 'middle',
          fill: '#ffffff',
          'font-variant-numeric': 'tabular-nums',
        });
        lblSeg.textContent = String(seg.valor);
        g.appendChild(lblSeg);
      }

      // Tooltip
      const zona = svgEl('rect', {
        x: offsetX, y: yBarra, width: ancho, height: alturaPorBarra,
        fill: 'transparent',
      });
      zona.style.cursor = 'pointer';
      zona.addEventListener('mouseenter', e => {
        rect.setAttribute('opacity', '0.78');
        mostrarTooltip(e, fila.etiqueta, [{
          color: seg.color,
          etiqueta: seg.nombre,
          valor: `${seg.valor} proyecto${seg.valor === 1 ? '' : 's'}`,
        }]);
      });
      zona.addEventListener('mousemove', moverTooltip);
      zona.addEventListener('mouseleave', () => {
        rect.removeAttribute('opacity');
        ocultarTooltip();
      });
      g.appendChild(zona);

      offsetX += ancho;
    });

    // Total al final
    const lblTotal = svgEl('text', {
      x: offsetX + 8, y: yBarra + alturaPorBarra / 2,
      'font-size': 11, 'font-weight': 600,
      'dominant-baseline': 'middle',
      fill: 'var(--text-primary)',
      'font-variant-numeric': 'tabular-nums',
    });
    lblTotal.textContent = String(total);
    g.appendChild(lblTotal);
  });

  // Leyenda envuelta arriba, con espacio reservado en el SVG.
  if (segmentosLeyenda.length) {
    let offset = -margen.left + 8, filaLeyenda = 0;
    segmentosLeyenda.forEach(s => {
      const anchoItem = 34 + s.nombre.length * 7.2 * escalaTexto();
      if (offset > -margen.left + 8 && offset + anchoItem > ancho - margen.left - 8) { offset = -margen.left + 8; filaLeyenda++; }
      const gLey = svgEl('g', {});
      gLey.appendChild(svgEl('rect', {
        x: offset, y: -margenTop + 12 + filaLeyenda * 18, width: 11, height: 11, rx: 2, fill: s.color,
      }));
      const t = svgEl('text', {
        x: offset + 16, y: -margenTop + 21 + filaLeyenda * 18, 'font-size': 11, fill: 'var(--text-secondary)',
      });
      t.textContent = s.nombre;
      gLey.appendChild(t);
      g.appendChild(gLey);
      offset += anchoItem;
    });
  }

  svg.appendChild(g);
}

// ============================================================================
// ACTUALIZACIÓN DE GRÁFICAS
// ============================================================================

/**
 * Semáforo de proyectos: resumen de Red/Yellow/Green/Sin dato como pills
 * clickables. Clic en uno aplica (o quita) el filtro de Project Status.
 */
function renderizarSemaforoProyectos(proyectos) {
  let contenedor = document.getElementById('card-semaforo-proyectos');
  if (!contenedor) return;

  // Get the card body, or use the container itself
  const cardBody = contenedor.querySelector('.pf-v6-c-card__body');
  if (cardBody) contenedor = cardBody;

  // Contar por status
  const conteos = { 'Rojo': 0, 'Amarillo': 0, 'Verde': 0, 'Sin dato': 0 };
  proyectos.forEach(p => {
    const val = valorDimension(p, 'project_status');
    if (val === '(sin dato)') conteos['Sin dato']++;
    else if (conteos[val] !== undefined) conteos[val]++;
  });

  contenedor.innerHTML = '';

  const titulo = document.createElement('h4');
  titulo.className = 'semaforo-titulo';
  titulo.textContent = 'Semáforo de proyectos';
  contenedor.appendChild(titulo);

  const pills = document.createElement('div');
  pills.className = 'semaforo-pills';

  const statusConfig = [
    { key: 'Rojo', color: '#c9190b', internal: 'Rojo' },
    { key: 'Amarillo', color: '#f0ab00', internal: 'Amarillo' },
    { key: 'Verde', color: '#3e8635', internal: 'Verde' },
    { key: 'Sin dato', color: '#8a8d90', internal: SIN_DATO },
  ];

  statusConfig.forEach(({ key, color, internal }) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'semaforo-pill';

    const activo = estado.filtros.project_status.includes(internal);
    if (activo) pill.classList.add('activo');

    const dot = document.createElement('span');
    dot.className = 'semaforo-dot';
    dot.style.background = color;

    const label = document.createElement('span');
    label.className = 'semaforo-label';
    label.textContent = key;

    const count = document.createElement('span');
    count.className = 'semaforo-count';
    count.textContent = conteos[key];

    pill.append(dot, label, count);
    pill.title = `${activo ? 'Quitar' : 'Aplicar'} filtro: Project Status = ${key}`;

    pill.addEventListener('click', () => {
      const filtro = estado.filtros.project_status;
      const idx = filtro.indexOf(internal);
      if (idx >= 0) {
        filtro.splice(idx, 1);
      } else {
        filtro.push(internal);
      }
      aplicarFiltros();
    });

    pills.appendChild(pill);
  });

  contenedor.appendChild(pills);
}

/** Resumen del único PM seleccionado, usando el mismo conjunto filtrado que el listado. */
function renderizarResumenPM(proyectos) {
  const tarjeta = document.getElementById('card-pm-resumen');
  if (!tarjeta) return;
  const pm = estado.filtros.pm_lider.length === 1 ? estado.filtros.pm_lider[0] : null;
  tarjeta.style.display = pm === null ? 'none' : 'block';
  if (pm === null) return;

  const portafolio = proyectos.filter(p => valorDimension(p, 'pm_lider') === pm);
  const sumar = medida => {
    const valores = portafolio.map(medida).filter(Number.isFinite);
    // Una selección vacía suma cero; proyectos sin cifras disponibles muestran ausencia.
    return valores.length || !portafolio.length ? valores.reduce((a, b) => a + b, 0) : null;
  };
  const booking = sumar(valorBooking);
  const acumulado = sumar(acumuladoHoy);
  const backlog = sumar(backlogHoy);
  const porcentaje = booking > 0 && acumulado !== null ? acumulado / booking * 100 : null;

  document.getElementById('pm-nombre').textContent = pm;
  document.getElementById('pm-n-proyectos').textContent = formatearNumero(portafolio.length);
  [['booking', booking], ['acumulado', acumulado], ['backlog', backlog]].forEach(([campo, valor]) => {
    const el = document.getElementById(`pm-${campo}`);
    el.textContent = formatearDinero(valor);
    el.title = formatearDineroExacto(valor);
  });
  const ejecucion = document.getElementById('pm-pct-ejec');
  ejecucion.textContent = porcentaje === null ? '—' : porcentaje.toFixed(1) + '%';
  ejecucion.title = 'Revenue acumulado / Booking total; ponderado por monto, no promedio de porcentajes.';

  const estados = new Map();
  const semaforo = new Map([['Rojo', 0], ['Amarillo', 0], ['Verde', 0], [SIN_DATO, 0]]);
  portafolio.forEach(p => {
    const est = valorDimension(p, 'estado');
    estados.set(est, (estados.get(est) || 0) + 1);
    const status = valorDimension(p, 'project_status');
    const clave = semaforo.has(status) ? status : SIN_DATO;
    semaforo.set(clave, semaforo.get(clave) + 1);
  });
  const contenedorEstados = document.getElementById('pm-por-estado');
  contenedorEstados.replaceChildren();
  contenedorEstados.className = 'hero-chips';
  const orden = estado.metadataProyectos?.orden_estado || [];
  [...estados].sort(([a], [b]) => {
    const ia = orden.indexOf(a), ib = orden.indexOf(b);
    return (ia < 0 ? orden.length : ia) - (ib < 0 ? orden.length : ib) || a.localeCompare(b, 'es');
  }).forEach(([est, n]) => contenedorEstados.appendChild(chip(`${est}: ${n}`, 'chip-estado')));
  if (!estados.size) contenedorEstados.textContent = '—';

  const contenedorSemaforo = document.getElementById('pm-semaforo');
  contenedorSemaforo.replaceChildren();
  contenedorSemaforo.className = 'hero-chips';
  const clases = { Rojo: 'chip-critico', Amarillo: 'chip-advertencia', Verde: 'chip-bueno' };
  semaforo.forEach((n, status) => {
    const etiqueta = status === SIN_DATO ? 'Sin dato' : status;
    contenedorSemaforo.appendChild(chip(`${etiqueta}: ${n}`, clases[status]));
  });

  const completos = portafolio.filter(p =>
    [valorBooking(p), acumuladoHoy(p), backlogHoy(p)].every(Number.isFinite)).length;
  const faltantes = portafolio.length - completos;
  document.getElementById('pm-cobertura').textContent = !portafolio.length
    ? 'No hay proyectos para este PM con los filtros activos.'
    : `${completos} de ${portafolio.length} proyectos con cifras completas de BackLog NOLA.`
      + (faltantes ? ` ${faltantes} sin backlog o con cifras incompletas; los totales incluyen solo los importes disponibles.` : '');
}

function actualizarGraficas() {
  const proyectos = estado.proyectosFiltrados;

  const agrupar = (campo, medida) => {
    const acum = new Map();
    proyectos.forEach(p => {
      const k = valorDimension(p, campo);
      acum.set(k, (acum.get(k) || 0) + medida(p));
    });
    return Array.from(acum, ([etiqueta, valor]) => ({ etiqueta, valor }))
      .sort((a, b) => b.valor - a.valor);
  };
  const dinero = v => `$${(v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  // Semáforo de proyectos
  renderizarSemaforoProyectos(proyectos);

  // Verificar si hay exactamente un vendedor filtrado
  const vendedorUnico = estado.filtros.vendedor.length === 1 ? estado.filtros.vendedor[0] : null;
  const cardVendedor = document.getElementById('card-vendedor-resumen');
  if (vendedorUnico && cardVendedor) {
    cardVendedor.style.display = 'block';
    // Calcular estadísticas del vendedor
    const proysVendedor = proyectos.filter(p => valorDimension(p, 'vendedor') === vendedorUnico);
    const bookingTotal = proysVendedor.reduce((a, p) => a + (valorBooking(p) || 0), 0);
    const acum = proysVendedor.reduce((a, p) => a + (acumuladoHoy(p) || 0), 0);
    const backlogTotal = proysVendedor.reduce((a, p) => a + (backlogHoy(p) || 0), 0);
    const pctEjec = bookingTotal > 0 ? (acum / bookingTotal * 100).toFixed(1) : '—';

    const porEstado = new Map();
    proysVendedor.forEach(p => {
      const est = p.estado || SIN_DATO;
      porEstado.set(est, (porEstado.get(est) || 0) + 1);
    });

    const topClientes = new Map();
    proysVendedor.forEach(p => {
      const cli = p.cliente || SIN_DATO;
      topClientes.set(cli, (topClientes.get(cli) || 0) + (valorBooking(p) || 0));
    });
    const top5 = Array.from(topClientes, ([cli, val]) => ({ cli, val }))
      .sort((a, b) => b.val - a.val).slice(0, 5);

    document.getElementById('vendedor-nombre').textContent = vendedorUnico;
    document.getElementById('vendedor-n-proyectos').textContent = proysVendedor.length;
    document.getElementById('vendedor-booking').textContent = formatearDinero(bookingTotal);
    document.getElementById('vendedor-acumulado').textContent = formatearDinero(acum);
    document.getElementById('vendedor-backlog').textContent = formatearDinero(backlogTotal);
    document.getElementById('vendedor-pct-ejec').textContent = pctEjec + (pctEjec === '—' ? '' : '%');

    let htmlEstados = '';
    ['In Progress', 'On Hold', 'Planned', 'Completed'].forEach(est => {
      const n = porEstado.get(est) || 0;
      if (n > 0) htmlEstados += `<span class="vendedor-badge">${est}: ${n}</span> `;
    });
    document.getElementById('vendedor-por-estado').innerHTML = htmlEstados || '—';

    let htmlClientes = '';
    top5.forEach(({ cli, val }) => {
      htmlClientes += `<div class="vendedor-cliente">${cli}: ${formatearDinero(val)}</div>`;
    });
    document.getElementById('vendedor-top-clientes').innerHTML = htmlClientes || '—';
  } else if (cardVendedor) {
    cardVendedor.style.display = 'none';
  }

  renderizarResumenPM(proyectos);

  // 1. Proyectos por estado
  const ordenEstado = (estado.metadataProyectos || {}).orden_estado || [];
  fijarColores('estado', ordenEstado);
  const porEstado = agrupar('estado', () => 1)
    .sort((a, b) => {
      const ia = ordenEstado.indexOf(a.etiqueta), ib = ordenEstado.indexOf(b.etiqueta);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  porEstado.forEach(d => { d.exacto = `${d.valor} proyecto${d.valor === 1 ? '' : 's'}`; });
  crearGraficaBarrasSimple('grafica-estado', porEstado, {
    formato: 'conteo', campoColor: 'estado', unidad: 'Proyectos',
  });

  // 2. Valor Booking por Zona
  const porZona = agrupar('zona', p => valorBooking(p) || 0);
  porZona.forEach(d => { d.exacto = dinero(d.valor); });
  crearGraficaBarrasSimple('grafica-zona', porZona, {
    formato: 'dinero', unidad: 'Valor Booking',
  });

  // 3. Top 10 Países
  const porPais = agrupar('pais', p => valorBooking(p) || 0).slice(0, 10);
  porPais.forEach(d => { d.exacto = dinero(d.valor); });
  crearGraficaBarrasSimple('grafica-paises', porPais, {
    formato: 'dinero', unidad: 'Valor Booking',
  });

  // 4. Ejecución por PM (recalculado: acumuladoHoy / valorBooking)
  const suma = new Map(), cuenta = new Map();
  proyectos.forEach(p => {
    if (!p.pm_lider) return;
    const booking = valorBooking(p);
    const acum = acumuladoHoy(p);
    if (booking === null || acum === null || booking <= 0) return;
    const pct = acum / booking;
    const k = String(p.pm_lider);
    suma.set(k, (suma.get(k) || 0) + pct);
    cuenta.set(k, (cuenta.get(k) || 0) + 1);
  });
  const porPM = Array.from(suma, ([etiqueta, s]) => ({
    etiqueta,
    valor: (s / cuenta.get(etiqueta)) * 100,
    n: cuenta.get(etiqueta),
  })).sort((a, b) => b.valor - a.valor).slice(0, 10);
  porPM.forEach(d => { d.exacto = `${d.valor.toFixed(1)}%  (${d.n} proyectos)`; });
  crearGraficaBarrasSimple('grafica-pm', porPM, {
    formato: 'porcentaje', unidad: 'Ejecución promedio',
  });

  // 5. Ejecutado vs. planeado por cliente (horizontal grouped bars)
  const porCliente = new Map();
  proyectos.forEach(p => {
    const cli = p.cliente || SIN_DATO;
    const zona = p.zona || SIN_DATO;
    if (!porCliente.has(cli)) {
      porCliente.set(cli, { booking: 0, acumulado: 0, proyectada: 0, backlog: 0, zona });
    }
    const acc = porCliente.get(cli);
    acc.booking += valorBooking(p) || 0;
    acc.acumulado += acumuladoHoy(p) || 0;
    acc.proyectada += proyectadaAnio(p) || 0;
    acc.backlog += backlogHoy(p) || 0;
  });
  const datosCliente = Array.from(porCliente, ([cli, vals]) => ({
    etiqueta: cli,
    zona: vals.zona,
    booking: vals.booking,
    series: [
      { nombre: 'Valor Booking', valor: vals.booking, color: COLORES_SERIES_COMPARACION.booking },
      { nombre: 'Revenue acumulado a hoy', valor: vals.acumulado, color: COLORES_SERIES_COMPARACION.acumulado },
      { nombre: 'Ejecución proyectada', valor: vals.proyectada, color: COLORES_SERIES_COMPARACION.proyectada },
      { nombre: 'Backlog', valor: vals.backlog, color: COLORES_SERIES_COMPARACION.backlog },
    ],
  })).sort((a, b) => b.booking - a.booking).slice(0, 10);

  // Ordenar por zona, luego por booking
  datosCliente.sort((a, b) => {
    if (a.zona !== b.zona) return a.zona.localeCompare(b.zona, 'es');
    return b.booking - a.booking;
  });

  crearGraficaBarrasAgrupadasHorizontal('grafica-ejecutado-cliente', datosCliente, {
    formato: 'dinero', unidad: 'Ejecutado vs. planeado por cliente',
  });

  // Cada proyecto conserva sus cifras, aunque comparta cliente con otros.
  const datosProyecto = proyectos.map(p => {
    const id = identificador(p);
    const nombre = p.nombre_del_proyecto || 'Proyecto sin nombre';
    return {
      etiqueta: id.tipo ? `${id.valor} · ${nombre}` : nombre,
      lineasEtiqueta: id.tipo ? [id.valor, nombre] : [nombre],
      zona: p.zona || SIN_DATO,
      booking: valorBooking(p),
      series: [
        { nombre: 'Valor Booking', valor: valorBooking(p), color: COLORES_SERIES_COMPARACION.booking },
        { nombre: 'Revenue acumulado a hoy', valor: acumuladoHoy(p), color: COLORES_SERIES_COMPARACION.acumulado },
        { nombre: 'Ejecución proyectada', valor: proyectadaAnio(p), color: COLORES_SERIES_COMPARACION.proyectada },
        { nombre: 'Backlog', valor: backlogHoy(p), color: COLORES_SERIES_COMPARACION.backlog },
      ],
    };
  }).sort((a, b) => (b.booking || 0) - (a.booking || 0)).slice(0, 10);
  datosProyecto.sort((a, b) => a.zona.localeCompare(b.zona, 'es') || (b.booking || 0) - (a.booking || 0));
  crearGraficaBarrasAgrupadasHorizontal('grafica-ejecutado-proyecto', datosProyecto, {
    formato: 'dinero', unidad: 'Ejecutado vs. planeado por proyecto',
  });

  // 6. Booking vs. ejecución por vendedor (barras horizontales, con filtro al hacer clic)
  const porVendedor = new Map();
  proyectos.forEach(p => {
    const vend = valorDimension(p, 'vendedor');
    if (!porVendedor.has(vend)) {
      porVendedor.set(vend, { booking: 0, acumulado: 0, proyectada: 0, backlog: 0 });
    }
    const acc = porVendedor.get(vend);
    acc.booking += valorBooking(p) || 0;
    acc.acumulado += acumuladoHoy(p) || 0;
    acc.proyectada += proyectadaAnio(p) || 0;
    acc.backlog += backlogHoy(p) || 0;
  });
  const datosVendedor = Array.from(porVendedor, ([vend, vals]) => ({
    etiqueta: vend,
    booking: vals.booking,
    series: [
      { nombre: 'Valor Booking', valor: vals.booking, color: COLORES_SERIES_COMPARACION.booking },
      { nombre: 'Revenue acumulado a hoy', valor: vals.acumulado, color: COLORES_SERIES_COMPARACION.acumulado },
      { nombre: 'Ejecución proyectada', valor: vals.proyectada, color: COLORES_SERIES_COMPARACION.proyectada },
      { nombre: 'Backlog', valor: vals.backlog, color: COLORES_SERIES_COMPARACION.backlog },
    ],
  })).filter(d => d.etiqueta !== SIN_DATO)
    .sort((a, b) => b.booking - a.booking).slice(0, 6);

  crearGraficaBarrasAgrupadasHorizontal('grafica-booking-vendedor', datosVendedor, {
    formato: 'dinero',
    unidad: 'Booking y ejecución por vendedor',
    alClickar: (vendedor) => {
      // Aplicar filtro de vendedor y refrescar
      DIMENSIONES.forEach(d => { estado.filtros[d.campo] = []; });
      estado.filtros.texto = '';
      estado.filtros.vendedor = [vendedor];
      const texto = document.getElementById('filtro-texto');
      if (texto) texto.value = '';
      aplicarFiltros();
    },
  });

  // 7. Estado de ejecución por vendedor (stacked horizontal bars)
  const vendedorEstado = new Map();
  proyectos.forEach(p => {
    const vend = valorDimension(p, 'vendedor');
    const est = p.estado || SIN_DATO;
    if (!vendedorEstado.has(vend)) vendedorEstado.set(vend, new Map());
    const mapa = vendedorEstado.get(vend);
    mapa.set(est, (mapa.get(est) || 0) + 1);
  });
  const datosVendedorEstado = Array.from(vendedorEstado, ([vend, mapa]) => {
    const total = Array.from(mapa.values()).reduce((a, v) => a + v, 0);
    return { etiqueta: vend, total, mapa };
  }).filter(d => d.etiqueta !== SIN_DATO)  // excluir (sin dato)
    .sort((a, b) => b.total - a.total).slice(0, 10);

  // Todos los estados que existen en los datos (para la leyenda)
  const todosEstados = new Set();
  datosVendedorEstado.forEach(d => d.mapa.forEach((v, est) => todosEstados.add(est)));

  // Ordenar estados: primero los del orden de negocio, luego los demás
  const estadosOrdenados = ordenEstado.filter(e => todosEstados.has(e));
  Array.from(todosEstados).forEach(e => {
    if (!estadosOrdenados.includes(e)) estadosOrdenados.push(e);
  });

  datosVendedorEstado.forEach(d => {
    d.segmentos = estadosOrdenados.map(est => ({
      nombre: est,
      valor: d.mapa.get(est) || 0,
      color: colorDeEntidad('estado', est),
    })).filter(s => s.valor > 0);  // solo segmentos con valor para ESTE vendedor
  });

  crearGraficaBarrasApiladas('grafica-estado-vendedor', datosVendedorEstado, {
    todosSegmentos: estadosOrdenados.map(est => ({
      nombre: est, color: colorDeEntidad('estado', est)
    }))
  });

  // 8. Tabla de proyectos no iniciados / on hold
  renderizarTablaNoIniciados();
}

/**
 * Tabla de proyectos no iniciados o en espera
 */
function renderizarTablaNoIniciados() {
  const tabla = document.getElementById('tabla-no-iniciados');
  if (!tabla) return;

  const tbody = tabla.querySelector('tbody');
  const tfoot = tabla.querySelector('tfoot');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (tfoot) tfoot.replaceChildren();
  const estadoElegido = document.getElementById('filtro-no-iniciados-estado')?.value || '';
  const noIniciados = estado.proyectosFiltrados.filter(p =>
    (p.estado === 'On Hold' || p.estado === 'Planned') && (!estadoElegido || p.estado === estadoElegido));

  if (noIniciados.length === 0) {
    const fila = document.createElement('tr');
    const celda = document.createElement('td');
    celda.colSpan = 7;
    celda.className = 'tabla-no-iniciados-vacia';
    celda.textContent = 'No hay proyectos para el estado y los filtros seleccionados';
    fila.appendChild(celda);
    tbody.appendChild(fila);
    return;
  }

  // Ordenar por backlog desc
  const ordenados = noIniciados.slice().sort((a, b) => {
    const ba = backlogHoy(a) || 0;
    const bb = backlogHoy(b) || 0;
    return bb - ba;
  });

  // El denominador es el total de esta tabla, después del selector y los filtros globales.
  const importes = ordenados.map(backlogHoy).filter(Number.isFinite);
  const totalBacklog = importes.length ? importes.reduce((a, b) => a + b, 0) : null;
  const sinCifra = ordenados.length - importes.length;
  ordenados.forEach(p => {
    const tr = document.createElement('tr');
    tr.className = 'fila-clicable';
    tr.addEventListener('click', () => abrirDetalle(p));

    const nombre = p.nombre_del_proyecto || identificador(p).valor;
    const pm = p.pm_lider || '—';
    const cli = p.cliente || '—';
    const dias = p.dias_para_vencimiento;
    const meses = p.meses_transcurridos;
    const bl = backlogHoy(p);
    const porcentaje = Number.isFinite(bl) && totalBacklog !== null && totalBacklog !== 0
      ? bl / totalBacklog * 100 : null;
    const etiquetaPorcentaje = porcentaje === null ? '—' : porcentaje.toFixed(1) + '%';

    const tdEstado = document.createElement('td');
    tdEstado.appendChild(chip(p.estado, p.estado === 'On Hold' ? 'chip-advertencia' : 'chip-estado',
      p.estado === 'Planned' ? 'Planned: proyecto no iniciado' : 'On Hold: proyecto en espera'));
    tr.appendChild(tdEstado);

    [[nombre, 'celda-nombre'], [pm, ''], [cli, ''],
      [dias !== null && dias !== undefined ? formatearNumero(dias) : '—', 'celda-numero'],
      [meses !== null && meses !== undefined ? formatearNumero(meses) : '—', 'celda-numero'],
    ].forEach(([txt, cls], idx) => {
      const td = document.createElement('td');
      td.textContent = txt;
      if (cls) td.className = cls;
      if (idx === 0 || idx === 1 || idx === 2) td.title = txt;  // title for Proyecto, PM, Cliente
      tr.appendChild(td);
    });

    // Columna de backlog con barra y valor
    const tdBl = document.createElement('td');
    tdBl.className = 'celda-backlog-barra';

    const wrapper = document.createElement('div');
    wrapper.className = 'backlog-participacion';

    const divBarra = document.createElement('div');
    divBarra.className = 'inline-backlog-barra-container';
    const contexto = porcentaje === null
      ? (bl === null ? 'Sin cifra de BackLog NOLA.' : 'El backlog total visible es cero; no se puede calcular la participación.')
      : `${etiquetaPorcentaje} del backlog total visible (${formatearDineroExacto(bl)} / ${formatearDineroExacto(totalBacklog)}).`;
    divBarra.title = contexto;
    divBarra.setAttribute('aria-label', `Participación de ${nombre} en el backlog visible. ${contexto}`);
    if (porcentaje !== null) {
      divBarra.setAttribute('role', 'meter');
      divBarra.setAttribute('aria-valuemin', '0');
      divBarra.setAttribute('aria-valuemax', '100');
      divBarra.setAttribute('aria-valuenow', String(Math.max(0, Math.min(100, porcentaje))));
      divBarra.setAttribute('aria-valuetext', contexto);
    } else {
      divBarra.setAttribute('role', 'img');
    }

    const relleno = document.createElement('div');
    relleno.className = 'inline-backlog-relleno';
    relleno.style.width = `${porcentaje === null ? 0 : Math.max(0, Math.min(100, porcentaje))}%`;
    const lblPorcentaje = document.createElement('span');
    lblPorcentaje.className = 'inline-backlog-porcentaje';
    lblPorcentaje.textContent = etiquetaPorcentaje;

    divBarra.append(relleno, lblPorcentaje);

    const lblValor = document.createElement('span');
    lblValor.className = 'inline-backlog-valor';
    lblValor.textContent = formatearDinero(bl);
    lblValor.title = bl === null ? 'Sin cifra de BackLog NOLA' : formatearDineroExacto(bl);

    wrapper.appendChild(divBarra);
    wrapper.appendChild(lblValor);
    tdBl.appendChild(wrapper);
    tr.appendChild(tdBl);

    tbody.appendChild(tr);
  });

  // Fila total
  if (tfoot) {
    tfoot.innerHTML = '';
    const trTotal = document.createElement('tr');
    const tdEtq = document.createElement('td');
    trTotal.className = 'no-iniciados-total';
    tdEtq.colSpan = 6;
    tdEtq.textContent = `Total (${ordenados.length} proyecto${ordenados.length === 1 ? '' : 's'})`;
    if (sinCifra) tdEtq.textContent += ` · ${sinCifra} sin cifra de backlog`;
    trTotal.appendChild(tdEtq);
    const tdTotal = document.createElement('td');
    tdTotal.className = 'celda-numero';
    tdTotal.textContent = formatearDinero(totalBacklog);
    tdTotal.title = formatearDineroExacto(totalBacklog);
    trTotal.appendChild(tdTotal);
    tfoot.appendChild(trTotal);
  }
}


// ============================================================================
// VISTA DE DETALLE
// ============================================================================

function abrirDetalle(proyecto) {
  estado.proyectoSeleccionado = proyecto;
  cambiarPestana('detalle');
}

function renderizarDetalle() {
  const contenedor = document.getElementById('detalle-contenedor');
  const proyecto = estado.proyectoSeleccionado;
  if (!proyecto) return;

  contenedor.innerHTML = '';
  renderizarEncabezadoProyecto(contenedor, proyecto);

  // Buscar datos de backlog asociados
  const datosBacklog = backlogDe(proyecto);

  // La información secundaria ocupa una sola franja plegable, por debajo del resumen.
  const informacion = document.createElement('details');
  informacion.className = 'detalle-informacion';
  const tituloInformacion = document.createElement('summary');
  tituloInformacion.textContent = 'Información del proyecto';
  informacion.appendChild(tituloInformacion);
  const filaSecciones = document.createElement('div');
  filaSecciones.className = 'detalle-secciones-inline';

  const secciones = [
    {
      titulo: 'Datos Comerciales',
      campos: ['pm_lider', 'vendedor', 'tsm', 'zona', 'pais', 'billing_type', 'billing_arrangement', 'estado_contrato'],
    },
    {
      titulo: 'Fechas y Contrato',
      campos: ['finalizacion', 'fecha_fin', 'ano_de_finalizacion', 'dias_para_vencimiento', 'meses_transcurridos', 'tipo_de_ejecucion'],
    },
    {
      titulo: 'Otros valores',
      campos: ['ejecucion_deseada', 'diferencias_acumulado_of', 'consumido_2025_ref', 'dif_consumido_2025', 'valor_of_anterior', 'pct_peso_contrato', 'q_del_clawback', 'pm_lider_psa'],
    },
    {
      titulo: 'Estatus',
      campos: ['estado', 'project_status', 'estatus', 'actions'],
    },
  ];

  const crearCampo = campo => {
    const col = estado.metadataProyectos.columnas.find(c => c.key === campo)
      || (campo === 'project_status' ? { label: 'Semáforo' } : null);
    if (!col) return null;

    const divCampo = document.createElement('div');
    divCampo.className = 'campo-detalle';

    const etiqueta = document.createElement('div');
    etiqueta.className = 'etiqueta-campo';
    etiqueta.textContent = campo === 'project_status' ? 'Semáforo' : col.label;

    const valor = document.createElement('div');
    valor.className = 'valor-campo';

    const contenido = proyecto[campo];

    // Formateos especiales
    if (campo === 'project_status') {
      const status = valorDimension(proyecto, campo);
      const clases = { Rojo: 'chip-critico', Amarillo: 'chip-advertencia', Verde: 'chip-bueno' };
      valor.appendChild(chip(status === SIN_DATO ? 'Sin dato' : status, clases[status]));
    } else if (CAMPOS_DINERO.has(campo)) {
      valor.textContent = formatearDinero(contenido);
    } else if (CAMPOS_PORCENTAJE.has(campo)) {
      valor.textContent = formatearPorcentaje(contenido);
    } else if (campo === 'finalizacion' || campo === 'fecha_fin') {
      valor.textContent = formatearFecha(contenido);
    } else if (campo === 'meses_transcurridos') {
      valor.textContent = formatearNumero(contenido);
    } else {
      valor.textContent = obtenerEtiquetaValor(contenido);
    }

    // Verificar si es recalculado
    if (col.recalculado && proyecto._recalculado && proyecto._recalculado[campo]) {
      const badge = document.createElement('span');
      badge.className = 'badge-recalculado';
      badge.title = 'El Excel traía un error aquí. Este valor se recalculó a partir de Fecha fin.';
      badge.textContent = 'recalculado';
      valor.appendChild(badge);
    }

    // Verificar si hubo error
    if (proyecto._errores && proyecto._errores[campo]) {
      const badge = document.createElement('span');
      badge.className = 'badge-error';
      badge.title = 'Error original: ' + proyecto._errores[campo];
      badge.textContent = 'error';
      valor.appendChild(badge);
    }

    if (normalizarValor(contenido) === null) {
      valor.classList.add('nulo');
    }

    divCampo.appendChild(etiqueta);
    divCampo.appendChild(valor);
    return divCampo;
  };

  secciones.forEach(seccion => {
    const div = document.createElement('section');
    div.className = 'seccion-detalle';
    const h4 = document.createElement('h4');
    h4.textContent = seccion.titulo;
    div.appendChild(h4);
    seccion.campos.forEach(campo => {
      const divCampo = crearCampo(campo);
      if (divCampo) div.appendChild(divCampo);
    });
    filaSecciones.appendChild(div);
  });
  informacion.appendChild(filaSecciones);

  const identificacion = document.createElement('details');
  identificacion.className = 'detalle-identificacion';
  const tituloIdentificacion = document.createElement('summary');
  tituloIdentificacion.textContent = 'Identificación y referencias';
  identificacion.appendChild(tituloIdentificacion);
  const camposIdentificacion = document.createElement('div');
  camposIdentificacion.className = 'detalle-identificacion-campos';
  ['project_id', 'num_pa', 'num_opp'].forEach(campo => {
    const divCampo = crearCampo(campo);
    if (divCampo) camposIdentificacion.appendChild(divCampo);
  });
  identificacion.appendChild(camposIdentificacion);
  informacion.appendChild(identificacion);
  contenedor.appendChild(informacion);

  // Sección de Revenue (si existe backlog)
  if (datosBacklog) {
    const divRevenue = document.createElement('div');
    divRevenue.className = 'detalle-revenue';

    const h4 = document.createElement('h4');
    h4.textContent = `Revenue detallado · ${periodoActual().etiqueta}`;
    divRevenue.appendChild(h4);
    divRevenue.appendChild(construirSelectorPeriodo(renderizarDetalle));

    // Gráfica de barras apiladas (fijo vs upside), solo los meses del periodo
    const meses = mesesActivos().map(i => MESES_ES[i]);

    const datosGrafica = {};
    meses.forEach(mes => {
      datosGrafica[mes] = {
        'Commit': parseFloat(datosBacklog[mes + '_fijo']) || 0,
        'Upside': parseFloat(datosBacklog[mes + '_upside']) || 0,
      };
    });

    const tendencia = document.createElement('figure');
    tendencia.className = 'revenue-tendencia';
    const tituloTendencia = document.createElement('figcaption');
    tituloTendencia.textContent = 'Tendencia mensual de Commit y Upside';
    tendencia.appendChild(tituloTendencia);
    const svgTendencia = svgEl('svg', { id: 'grafica-revenue-tendencia', class: 'grafica-svg' });
    svgTendencia.dataset.tituloReporte = `${tituloTendencia.textContent} · ${periodoActual().etiqueta}`;
    tendencia.appendChild(svgTendencia);
    divRevenue.appendChild(tendencia);
    const datosTendencia = Object.fromEntries(meses.map(mes => [
      mes.charAt(0).toUpperCase() + mes.slice(1), datosGrafica[mes],
    ]));
    crearGraficaLinea(svgTendencia, datosTendencia, {
      ejeX: 'categoria', unidad: 'Tendencia mensual de Commit y Upside',
    });

    const svgRevenue = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgRevenue.id = 'grafica-revenue-barras';
    svgRevenue.dataset.tituloReporte = `Revenue mensual · barras de Commit y Upside · ${periodoActual().etiqueta}`;
    svgRevenue.setAttribute('class', 'grafica-revenue-proyecto');
    svgRevenue.setAttribute('viewBox', '0 0 800 300');
    svgRevenue.style.width = '100%';
    svgRevenue.style.height = 'auto';
    svgRevenue.style.minHeight = '250px';

    // Crear gráfica simple
    crearGraficaRevenueProyecto(svgRevenue, datosGrafica, meses);
    divRevenue.appendChild(svgRevenue);

    // Stats de revenue
    const divStats = document.createElement('div');
    divStats.style.marginTop = 'var(--spacing-lg)';
    divStats.style.display = 'grid';
    divStats.style.gridTemplateColumns = 'repeat(4, 1fr)';
    divStats.style.gap = 'var(--spacing-lg)';

    // Los tiles siguen al periodo: el año abre en quarters, un quarter abre
    // en sus meses, un mes muestra fijo vs upside de ese mes.
    const num = v => (typeof v === 'number' ? v : 0);
    const fijoDe = m => num(datosBacklog[m + '_fijo']);
    let stats;
    if (estado.periodo === 'anio') {
      stats = [
        { label: 'Q1', valor: num(datosBacklog.q1) },
        { label: 'Q2', valor: num(datosBacklog.q2) },
        { label: 'Q3', valor: num(datosBacklog.q3) },
        { label: 'Q4', valor: num(datosBacklog.q4) },
      ];
    } else if (mesesActivos().length === 1) {
      const m = MESES_ES[mesesActivos()[0]];
      stats = [
        { label: m + ' · fijo', valor: fijoDe(m) },
        { label: m + ' · upside', valor: num(datosBacklog[m + '_upside']) },
        { label: 'Total del mes', valor: fijoDe(m) + num(datosBacklog[m + '_upside']) },
      ];
    } else {
      stats = mesesActivos().map(i => ({ label: MESES_ES[i], valor: fijoDe(MESES_ES[i]) }));
      stats.push({
        label: periodoActual().etiqueta.split(' ')[0] + ' · total',
        valor: stats.reduce((a, x) => a + x.valor, 0),
      });
    }
    divStats.style.gridTemplateColumns = `repeat(${stats.length}, 1fr)`;

    stats.forEach(stat => {
      const div = document.createElement('div');
      div.style.textAlign = 'center';
      div.style.backgroundColor = 'var(--surface-page)';
      div.style.padding = 'var(--spacing-md)';
      div.style.borderRadius = 'var(--radius-sm)';

      const label = document.createElement('div');
      label.style.fontSize = '0.8125rem';
      label.style.color = 'var(--text-dim)';
      label.style.textTransform = 'uppercase';
      label.textContent = stat.label;

      const valor = document.createElement('div');
      valor.style.fontSize = '1.125rem';
      valor.style.fontWeight = 'bold';
      valor.style.marginTop = 'var(--spacing-sm)';
      valor.style.color = 'var(--series-1)';
      valor.textContent = formatearDinero(stat.valor);

      div.appendChild(label);
      div.appendChild(valor);
      divStats.appendChild(div);
    });

    divRevenue.appendChild(divStats);
    contenedor.appendChild(divRevenue);
  }

  renderizarHermanosDeCliente(contenedor, proyecto);

  // Sección de trazabilidad del proyecto
  renderizarTrazabilidadProyecto(contenedor, proyecto);
}

/**
 * Revenue mensual de un proyecto: Fijo y Upside apilados.
 *
 * Soporta valores negativos: 9 de los 304 proyectos traen meses en negativo
 * (notas crédito y reversiones del Excel). Cuando los hay, el eje baja del
 * cero y esas barras se dibujan hacia abajo.
 */
function crearGraficaRevenueProyecto(svg, datos, meses) {
  if (!svg) return;
  registrarGrafica(svg, () => crearGraficaRevenueProyecto(svg, datos, meses));
  svg.innerHTML = '';
  svg.style.removeProperty('height');

  const SERIES = ['Commit', 'Upside'];
  const ancho = Math.max(300, svg.clientWidth || 300);
  const alto = 320;
  const margen = { top: 34, right: 18, bottom: 46, left: 72 };
  const areaAncho = ancho - margen.left - margen.right;
  const areaAlto = alto - margen.top - margen.bottom;
  svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
  svg.style.height = `${alto}px`;
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Revenue mensual del proyecto');
  svg.setAttribute('title', 'Revenue mensual del proyecto');

  const g = svgEl('g', { transform: `translate(${margen.left},${margen.top})` });

  // Los topes se calculan sobre el apilado, separando lo positivo de lo
  // negativo: si no, un mes con crédito descuadra la escala.
  let maxPos = 0, minNeg = 0;
  meses.forEach(m => {
    let pos = 0, neg = 0;
    SERIES.forEach(s => {
      const v = (datos[m] || {})[s] || 0;
      if (v >= 0) pos += v; else neg += v;
    });
    maxPos = Math.max(maxPos, pos);
    minNeg = Math.min(minNeg, neg);
  });
  if (maxPos === 0 && minNeg === 0) maxPos = 1;

  const rango = maxPos - minNeg;
  const y = v => areaAlto - ((v - minNeg) / rango) * areaAlto;
  const yCero = y(0);

  // Rejilla
  const lineas = 4;
  for (let i = 0; i <= lineas; i++) {
    const v = minNeg + (rango / lineas) * i;
    const vy = y(v);
    g.appendChild(svgEl('line', {
      x1: 0, y1: vy, x2: areaAncho, y2: vy,
      stroke: 'var(--grid-color)', 'stroke-width': 1,
    }));
    const lbl = svgEl('text', {
      x: -9, y: vy + 4, 'font-size': 11, 'text-anchor': 'end',
      fill: 'var(--text-dim)', 'font-variant-numeric': 'tabular-nums',
    });
    lbl.textContent = formatearDinero(v);
    g.appendChild(lbl);
  }
  // Línea del cero, más marcada cuando hay negativos.
  g.appendChild(svgEl('line', {
    x1: 0, y1: yCero, x2: areaAncho, y2: yCero,
    stroke: 'var(--baseline-color)', 'stroke-width': minNeg < 0 ? 1.5 : 1,
  }));

  const paso = areaAncho / meses.length;
  const anchoBarra = Math.min(46, paso - 10);

  meses.forEach((m, i) => {
    const x = i * paso + (paso - anchoBarra) / 2;
    const vals = SERIES.map(s => (datos[m] || {})[s] || 0);
    let acumPos = 0, acumNeg = 0;

    SERIES.forEach((s, si) => {
      const v = vals[si];
      if (!v) return;
      let y0, y1;
      if (v > 0) { y0 = y(acumPos + v); y1 = y(acumPos); acumPos += v; }
      else { y0 = y(acumNeg); y1 = y(acumNeg + v); acumNeg += v; }
      const h = Math.max(1, Math.abs(y1 - y0) - (si > 0 ? 2 : 0)); // 2px de aire
      g.appendChild(svgEl('rect', {
        x, y: Math.min(y0, y1), width: anchoBarra, height: h,
        fill: `var(--series-${si + 1})`, rx: 2,
      }));
    });

    // Zona sensible: toda la columna, no solo la barra.
    const zona = svgEl('rect', { x: i * paso, y: 0, width: paso, height: areaAlto, fill: 'transparent' });
    zona.style.cursor = 'pointer';
    zona.addEventListener('mouseenter', ev => mostrarTooltip(ev,
      m.charAt(0).toUpperCase() + m.slice(1),
      SERIES.map((s, si) => ({
        color: `var(--series-${si + 1})`,
        etiqueta: s,
        valor: '$' + vals[si].toLocaleString('en-US', { maximumFractionDigits: 0 }),
      }))));
    zona.addEventListener('mousemove', moverTooltip);
    zona.addEventListener('mouseleave', ocultarTooltip);
    g.appendChild(zona);

    const lbl = svgEl('text', {
      x: i * paso + paso / 2, y: areaAlto + 16,
      'font-size': 10, 'text-anchor': 'middle', fill: 'var(--text-dim)',
    });
    lbl.textContent = m.slice(0, 3);
    g.appendChild(lbl);
  });

  // Leyenda arriba, fuera del área de datos.
  let off = 0;
  SERIES.forEach((s, si) => {
    g.appendChild(svgEl('rect', {
      x: off, y: -26, width: 11, height: 11, rx: 2, fill: `var(--series-${si + 1})`,
    }));
    const t = svgEl('text', { x: off + 16, y: -17, 'font-size': 11, fill: 'var(--text-secondary)' });
    t.textContent = s;
    g.appendChild(t);
    off += 16 + s.length * 7.2 * escalaTexto() + 18;
  });

  svg.appendChild(g);
}

/**
 * Gráfica de línea multiserie.
 *
 * `datos` = { "etiqueta del punto": { "Serie A": n, "Serie B": n }, ... }
 */
function crearGraficaLinea(svg, datos, opciones) {
  if (!svg) return;
  registrarGrafica(svg, () => crearGraficaLinea(svg, datos, opciones));
  svg.innerHTML = '';
  svg.style.removeProperty('height');
  const op = opciones || {};

  const puntos = Object.keys(datos);
  const series = puntos.length ? Object.keys(datos[puntos[0]]) : [];

  // Con una sola carga no hay linea que dibujar, pero el dato SI existe.
  // Decir "sin historico" se lee como "no hay datos" y manda a buscar un fallo
  // que no esta: se muestran los valores de esa carga y por que falta la linea.
  if (puntos.length === 1 && series.length && op.ejeX !== 'categoria') {
    svg.style.height = '130px';
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Valores de la única carga disponible');
    svg.setAttribute('viewBox', '0 0 600 130');
    const etq = svgEl('text', { x: 300, y: 26, 'text-anchor': 'middle',
      'font-size': 12, fill: 'var(--text-dim)' });
    etq.textContent = `Una sola carga (${puntos[0]}) · la línea aparece desde la segunda`;
    svg.appendChild(etq);
    const paso = 600 / (series.length + 1);
    series.forEach((nombre, i) => {
      const x = paso * (i + 1);
      const valor = svgEl('text', { x, y: 76, 'text-anchor': 'middle',
        'font-size': 20, fill: `var(--series-${(i % 8) + 1})`,
        'font-variant-numeric': 'tabular-nums' });
      valor.textContent = formatearDinero(datos[puntos[0]][nombre] || 0);
      svg.appendChild(valor);
      const lab = svgEl('text', { x, y: 100, 'text-anchor': 'middle',
        'font-size': 11, fill: 'var(--text-dim)' });
      lab.textContent = nombre;
      svg.appendChild(lab);
    });
    return;
  }

  if (!puntos.length || !series.length) {
    svg.style.height = '120px';
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Sin histórico disponible');
    svg.setAttribute('viewBox', '0 0 600 120');
    const t = svgEl('text', { x: 300, y: 60, 'text-anchor': 'middle',
      'font-size': 13, fill: 'var(--text-dim)' });
    t.textContent = 'Sin histórico disponible';
    svg.appendChild(t);
    return;
  }

  const ancho = Math.max(300, svg.clientWidth || 300);
  // Se calcula el número real de filas de leyenda con el mismo algoritmo que
  // dibuja los elementos, dejando el área del gráfico libre.
  const margenIzq = Math.min(100, Math.round(ancho * 0.24));
  const anchoLeyenda = Math.max(100, ancho - margenIzq - 44);
  let leyendaFilas = 1, anchoFilaLeyenda = 0;
  series.forEach(s => {
    const w = 19 + s.length * 7.2 * escalaTexto() + 16;
    if (anchoFilaLeyenda && anchoFilaLeyenda + w > anchoLeyenda) { leyendaFilas++; anchoFilaLeyenda = 0; }
    anchoFilaLeyenda += w;
  });
  const margen = { top: 24 + leyendaFilas * 18, right: 44, bottom: 40, left: margenIzq };
  const alto = Math.max(340, margen.top + margen.bottom + 200);
  const areaAncho = Math.max(120, ancho - margen.left - margen.right);
  const areaAlto = alto - margen.top - margen.bottom;
  svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
  svg.style.height = `${alto}px`;
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', op.unidad || 'Evolución de revenue');
  svg.setAttribute('title', op.unidad || 'Evolución de revenue');

  const g = svgEl('g', { transform: `translate(${margen.left},${margen.top})` });

  const todos = puntos.flatMap(p => series.map(s => datos[p][s] || 0));
  const maxV = Math.max(...todos, 0) || 1;
  const minV = Math.min(...todos, 0);
  const x = i => puntos.length === 1 ? areaAncho / 2 : (areaAncho / (puntos.length - 1)) * i;
  const y = v => areaAlto - ((v - minV) / (maxV - minV || 1)) * areaAlto;
  const colorSerie = i => `var(--series-${Math.min(i + 1, 8)})`;
  const desdeEstimado = Number.isInteger(op.desdeEstimado) && op.desdeEstimado >= 0 && op.desdeEstimado < puntos.length
    ? op.desdeEstimado : null;
  const esEstimado = i => desdeEstimado !== null && i >= desdeEstimado;
  if (desdeEstimado !== null) {
    const inicio = desdeEstimado ? (x(desdeEstimado - 1) + x(desdeEstimado)) / 2 : 0;
    g.appendChild(svgEl('rect', {
      x: inicio, y: 0, width: areaAncho - inicio, height: areaAlto,
      fill: 'var(--series-1)', opacity: 0.06,
    }));
    const aviso = svgEl('text', {
      x: areaAncho, y: -8, 'font-size': 12, 'text-anchor': 'end', fill: 'var(--text-secondary)',
    });
    aviso.textContent = 'Proyección estimada';
    g.appendChild(aviso);
  }

  // Rejilla + eje Y
  const lineas = 4;
  for (let i = 0; i <= lineas; i++) {
    const vy = areaAlto - (areaAlto / lineas) * i;
    g.appendChild(svgEl('line', {
      x1: 0, y1: vy, x2: areaAncho, y2: vy,
      stroke: i === 0 ? 'var(--baseline-color)' : 'var(--grid-color)', 'stroke-width': 1,
    }));
    const lbl = svgEl('text', {
      x: -9, y: vy + 4, 'font-size': 11, 'text-anchor': 'end',
      fill: 'var(--text-dim)', 'font-variant-numeric': 'tabular-nums',
    });
    lbl.textContent = formatearDinero(minV + ((maxV - minV) / lineas) * i);
    g.appendChild(lbl);
  }

  // Eje X: fecha breve y horizontal; el title conserva la etiqueta exacta.
  const maxTicks = Math.max(2, Math.min(6, Math.floor(areaAncho / 76)));
  const salto = Math.max(1, Math.ceil((puntos.length - 1) / (maxTicks - 1)));
  puntos.forEach((p, i) => {
    if (i % salto !== 0 && i !== puntos.length - 1) return;
    const lbl = svgEl('text', {
      'font-size': 10, fill: 'var(--text-dim)',
      x: x(i), y: areaAlto + 24, 'text-anchor': 'middle',
    });
    const fecha = new Date(p);
    const fechaValida = !Number.isNaN(fecha.getTime());
    const tieneHora = /(?:T|\s)\d{1,2}:\d{2}/.test(p);
    lbl.textContent = op.ejeX === 'categoria' ? p : fechaValida
      ? new Intl.DateTimeFormat('es-CO', tieneHora
        ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }
        : { day: '2-digit', month: 'short' }).format(fecha).replace(',', '')
      : (p.length > 12 ? p.slice(0, 11) + '…' : p);
    const fechaCompleta = svgEl('title', {}); fechaCompleta.textContent = p; lbl.appendChild(fechaCompleta);
    g.appendChild(lbl);
  });

  // Líneas
  const trazos = {};
  series.forEach((s, si) => {
    const segmentos = desdeEstimado === null
      ? [{ inicio: 0, fin: puntos.length, estimado: false }]
      : [{ inicio: 0, fin: desdeEstimado, estimado: false },
        { inicio: Math.max(0, desdeEstimado - 1), fin: puntos.length, estimado: true }];
    trazos[s] = [];
    segmentos.forEach(segmento => {
      if (segmento.fin <= segmento.inicio) return;
      const d = puntos.slice(segmento.inicio, segmento.fin)
        .map((p, i) => `${i ? 'L' : 'M'}${x(i + segmento.inicio)},${y(datos[p][s] || 0)}`).join(' ');
      const trazo = svgEl('path', {
        d, fill: 'none', stroke: colorSerie(si), 'stroke-width': 2,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      });
      if (segmento.estimado) { trazo.setAttribute('stroke-dasharray', '6 4'); trazo.dataset.estimado = 'true'; }
      trazos[s].push(trazo);
      g.appendChild(trazo);
    });
    // Con `soloCambios`, el punto se dibuja unicamente donde el valor se
    // movio. Es lo que hace legible "aqui cambio": entre un cambio y otro la
    // linea va limpia, y cada marca es una fecha en la que paso algo.
    puntos.forEach((p, i) => {
      const v = datos[p][s] || 0;
      const cambio = i === 0 || Math.abs(v - (datos[puntos[i - 1]][s] || 0)) > 0.5;
      if (op.soloCambios && !cambio) return;
      const punto = svgEl('circle', {
        cx: x(i), cy: y(v), r: op.soloCambios ? 5 : 4,
        fill: esEstimado(i) ? 'var(--surface-1)' : colorSerie(si),
        stroke: esEstimado(i) ? colorSerie(si) : 'var(--surface-1)', 'stroke-width': 2,
      });
      trazos[s].push(punto);
      g.appendChild(punto);
    });
  });

  // Leyenda arriba, fuera del área de datos para no taparlos.
  const leyenda = svgEl('g', {});
  const etiquetasLeyenda = [];
  let offset = 0, filaLeyenda = 0;
  series.forEach((s, si) => {
    const anchoItem = 19 + s.length * 7.2 * escalaTexto() + 16;
    if (offset && offset + anchoItem > anchoLeyenda) { offset = 0; filaLeyenda++; }
    const item = svgEl('g', {});
    item.setAttribute('transform', `translate(${offset},${-margen.top + 16 + filaLeyenda * 18})`);
    item.appendChild(svgEl('line', {
      x1: 0, y1: -4, x2: 14, y2: -4,
      stroke: colorSerie(si), 'stroke-width': 2, 'stroke-linecap': 'round',
    }));
    const t = svgEl('text', {
      x: 19, y: 0, 'font-size': 11, fill: 'var(--text-secondary)',
    });
    t.textContent = s;
    item.appendChild(t);
    leyenda.appendChild(item);
    etiquetasLeyenda.push(item);
    offset += anchoItem;
  });
  g.appendChild(leyenda);

  // --- crosshair + tooltip ---
  const guia = svgEl('line', {
    y1: 0, y2: areaAlto, stroke: 'var(--baseline-color)',
    'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0,
  });
  g.appendChild(guia);
  const marcas = series.map((_, si) => {
    const c = svgEl('circle', {
      r: 6, fill: colorSerie(si), stroke: 'var(--surface-1)',
      'stroke-width': 2, opacity: 0,
    });
    g.appendChild(c);
    return c;
  });

  const captura = svgEl('rect', {
    x: 0, y: 0, width: areaAncho, height: areaAlto, fill: 'transparent',
  });
  captura.addEventListener('mousemove', ev => {
    const caja = svg.getBoundingClientRect();
    // El SVG escala con viewBox: hay que pasar de píxeles de pantalla a
    // coordenadas del lienzo antes de buscar el punto más cercano.
    const escala = ancho / caja.width;
    const px = (ev.clientX - caja.left) * escala - margen.left;
    const i = Math.max(0, Math.min(puntos.length - 1,
      Math.round(px / (areaAncho / Math.max(1, puntos.length - 1)))));

    guia.setAttribute('x1', x(i));
    guia.setAttribute('x2', x(i));
    guia.setAttribute('opacity', 1);
    series.forEach((s, si) => {
      marcas[si].setAttribute('cx', x(i));
      marcas[si].setAttribute('cy', y(datos[puntos[i]][s] || 0));
      marcas[si].setAttribute('opacity', 1);
    });
    mostrarTooltip(ev, puntos[i] + (esEstimado(i) ? ' · Estimado' : ''), series.map((s, si) => ({
      color: colorSerie(si),
      etiqueta: s,
      valor: '$' + (datos[puntos[i]][s] || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }),
    })));
  });
  captura.addEventListener('mouseleave', () => {
    guia.setAttribute('opacity', 0);
    marcas.forEach(m => m.setAttribute('opacity', 0));
    ocultarTooltip();
  });
  g.appendChild(captura);

  svg.appendChild(g);

  // Con muchas líneas juntas, saber cuál es cuál solo por la leyenda es
  // difícil. Esto deja atenuar todas menos una desde fuera (la tabla).
  return {
    destacar(serie) {
      series.forEach(s => {
        const activa = !serie || s === serie;
        trazos[s].forEach(el => {
          el.setAttribute('opacity', activa ? 1 : 0.12);
          if (el.tagName === 'path') {
            el.setAttribute('stroke-width', serie && s === serie ? 3.5 : 2);
          }
        });
      });
      etiquetasLeyenda.forEach((el, i) => {
        el.setAttribute('opacity', !serie || series[i] === serie ? 1 : 0.25);
      });
    },
  };
}


// ============================================================================
// VISTA DE TRAZABILIDAD GLOBAL
// ============================================================================


/**
 * Un cliente casi nunca tiene un solo proyecto: 63 clientes concentran 197 de
 * los 304. Ver los hermanos desde el detalle evita tener que volver al listado
 * y filtrar a mano para responder "¿qué más tenemos con esta cuenta?".
 */

// ---------------------------------------------------------------------------
// Encabezado del proyecto
// ---------------------------------------------------------------------------

const ESTADO_CONTRATO_NIVEL = {
  'Contrato vigente': 'bueno',
  'Contrato finaliza en menos de 60dias': 'advertencia',
  'Contrato vence en menos de 30dias': 'serio',
  'Contrato vencido': 'critico',
};

function chip(texto, clase, titulo) {
  const el = document.createElement('span');
  el.className = 'chip-dato ' + (clase || '');
  el.textContent = texto;
  if (titulo) el.title = titulo;
  return el;
}

/**
 * Cabecera del detalle: de quién es el proyecto y cómo va, en una sola mirada.
 *
 * Antes esta información estaba repartida en cuadrículas de etiqueta/valor,
 * todas con el mismo peso visual. Lo que el negocio mira primero —cuánto vale,
 * cuánto se ejecutó y cuánto queda— tiene que verse primero.
 */
function renderizarEncabezadoProyecto(contenedor, proyecto) {
  const booking = valorBooking(proyecto);
  const acum = acumuladoHoy(proyecto);
  const backlog = backlogHoy(proyecto);
  const consumido = acum2025(proyecto);
  const pct = (booking && acum !== null) ? (acum / booking) * 100 : null;

  const hero = document.createElement('div');
  hero.className = 'hero-proyecto';

  // --- título e identidad ---
  const cab = document.createElement('div');
  cab.className = 'hero-cabecera';
  const cli = document.createElement('div');
  cli.className = 'hero-cliente';
  cli.textContent = proyecto.cliente || 'Cliente sin dato';
  const nom = document.createElement('h2');
  nom.className = 'hero-nombre';
  nom.textContent = proyecto.nombre_del_proyecto || identificador(proyecto).valor;
  cab.append(cli, nom);

  const chips = document.createElement('div');
  chips.className = 'hero-chips';
  const id = identificador(proyecto);
  chips.appendChild(chip(id.valor, 'chip-id',
    id.tipo === 'PR' ? 'Todavía sin PA asignado: se identifica por el PR' : 'Número de PA'));
  if (proyecto.estado) chips.appendChild(chip(proyecto.estado, 'chip-estado'));
  if (proyecto.billing_type) chips.appendChild(chip(proyecto.billing_type));
  if (proyecto.zona) chips.appendChild(chip(proyecto.zona));
  if (proyecto.pais) chips.appendChild(chip(proyecto.pais));
  if (proyecto.start_at_risk) {
    chips.appendChild(chip('Start at risk', 'chip-critico',
      'Dato simulado en el PoC: no viene del Excel'));
  }
  const ec = proyecto.estado_contrato;
  if (ec) chips.appendChild(chip(ec, 'chip-' + (ESTADO_CONTRATO_NIVEL[ec] || '')));
  // Handover y Project Status
  if (proyecto.executive_watchlist) chips.appendChild(chip('Handover', 'chip-bueno'));
  if (proyecto.project_status) {
    const statusMap = { 'Red': 'Rojo', 'Yellow': 'Amarillo', 'Green': 'Verde' };
    const statusDisplay = statusMap[proyecto.project_status] || proyecto.project_status;
    const statusClass = proyecto.project_status === 'Green' ? 'chip-bueno'
      : proyecto.project_status === 'Yellow' ? 'chip-advertencia' : 'chip-critico';
    chips.appendChild(chip(statusDisplay, statusClass));
  }
  cab.appendChild(chips);
  hero.appendChild(cab);

  // --- cifras grandes ---
  const cifras = document.createElement('div');
  cifras.className = 'hero-cifras';
  [
    ['Valor Booking', booking, 'Por cuánto se vendió el proyecto'],
    ['Revenue acumulado a hoy', acum, 'Revenue ya ejecutado'],
    ['Backlog', backlog, 'Lo que queda por ejecutar'],
    ['Consumido 2025', consumido, 'Revenue ejecutado durante 2025'],
  ].forEach(([et, v, tip]) => {
    const d = document.createElement('div');
    d.className = 'hero-cifra';
    d.title = tip;
    const n = document.createElement('div');
    n.className = 'hero-cifra-valor';
    n.textContent = v === null ? '—' : formatearDinero(v);
    const l = document.createElement('div');
    l.className = 'hero-cifra-etq';
    l.textContent = et;
    d.append(n, l);
    cifras.appendChild(d);
  });
  hero.appendChild(cifras);

  // --- barra de ejecución ---
  if (booking && acum !== null) {
    const bloque = document.createElement('div');
    bloque.className = 'hero-avance';

    const fila = document.createElement('div');
    fila.className = 'hero-avance-cab';
    const izq = document.createElement('span');
    izq.innerHTML = `Ejecución del contrato · <strong>${pct.toFixed(1)}%</strong>`;
    const der = document.createElement('span');
    der.className = 'hero-avance-nota';
    der.textContent = `${formatearDinero(acum)} de ${formatearDinero(booking)}`;
    fila.append(izq, der);

    const barra = document.createElement('div');
    barra.className = 'barra-avance';
    const relleno = document.createElement('div');
    // Por encima del 100% se marca distinto: ejecutar de más no es "ir bien".
    relleno.className = 'barra-avance-relleno' + (pct > 100 ? ' excedido' : '');
    relleno.style.width = Math.min(100, Math.max(0, pct)) + '%';
    barra.appendChild(relleno);
    bloque.append(fila, barra);

    const tipo = proyecto.tipo_de_ejecucion;
    if (tipo) {
      const nivel = { Normal: 'bueno', Baja: 'advertencia', 'Muy Baja': 'critico' }[tipo] || '';
      const pie = document.createElement('div');
      pie.className = 'hero-avance-pie';
      pie.appendChild(chip('Ritmo: ' + tipo, 'chip-' + nivel,
        'Compara lo ejecutado contra lo que debería llevar a estas alturas'));
      const dias = proyecto.dias_para_vencimiento;
      if (typeof dias === 'number') {
        pie.appendChild(chip(
          dias < 0 ? `Venció hace ${Math.abs(dias)} días` : `Quedan ${dias} días`,
          'chip-' + (ESTADO_CONTRATO_NIVEL[ec] || ''),
          'Calculado desde Fecha fin'));
      }
      bloque.appendChild(pie);
    }
    hero.appendChild(bloque);
  }

  contenedor.appendChild(hero);
}

function renderizarHermanosDeCliente(contenedor, proyecto) {
  if (!proyecto.cliente) return;
  const todosHermanos = estado.proyectos.filter(
    p => p.cliente === proyecto.cliente && p !== proyecto);
  // Mantener el bloque si todos los hermanos están ocultos para poder mostrarlos.
  if (!todosHermanos.length) return;
  const hermanos = todosHermanos.filter(pasaFiltroCompletados);

  const div = document.createElement('div');
  div.className = 'detalle-trazabilidad otros-proyectos-cliente';
  const h4 = document.createElement('h4');
  h4.textContent = `Otros proyectos de ${proyecto.cliente} (${hermanos.length})`;
  div.appendChild(h4);

  const control = document.createElement('label');
  control.className = 'check-inline';
  const chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.id = 'chk-completados-detalle';
  chk.dataset.mostrarCompletados = '';
  chk.checked = estado.incluirCompletados;
  control.append(chk, document.createTextNode('Mostrar completados'));
  div.appendChild(control);

  const totalCliente = [proyecto, ...todosHermanos].filter(pasaFiltroCompletados)
    .reduce((a, p) => a + (valorBooking(p) || 0), 0);
  const nota = document.createElement('p');
  nota.className = 'nota-tabla';
  nota.textContent = `Valor Booking de la cuenta con los estados visibles: ${formatearDinero(totalCliente)}`;
  div.appendChild(nota);

  const t = document.createElement('table');
  t.className = 'tabla-eventos-proyecto';
  const th = document.createElement('thead');
  const trh = document.createElement('tr');
  ['PA / PR', 'Proyecto', 'Estado', 'PM/Líder', 'Valor Booking', `Revenue · ${periodoActual().etiqueta}`]
    .forEach(x => { const e = document.createElement('th'); e.textContent = x; trh.appendChild(e); });
  th.appendChild(trh); t.appendChild(th);

  const tb = document.createElement('tbody');
  if (!hermanos.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.textContent = 'No hay otros proyectos con los estados visibles. Activa Mostrar completados para incluirlos.';
    tr.appendChild(td);
    tb.appendChild(tr);
  }
  hermanos
    .sort((a, b) => (valorBooking(b) || 0) - (valorBooking(a) || 0))
    .forEach(h => {
      const tr = document.createElement('tr');
      tr.className = 'fila-clicable';
      tr.addEventListener('click', () => abrirDetalle(h));
      const rev = revenuePeriodo(h);
      const booking = valorBooking(h);
      [[identificador(h).valor, 'celda-id'],
        [h.nombre_del_proyecto || '—', 'celda-nombre'],
        [h.estado || '—', ''],
        [h.pm_lider || '—', ''],
        [booking === null ? '—' : formatearDinero(booking), 'celda-numero'],
        [rev === null ? '—' : formatearDinero(rev), 'celda-numero'],
      ].forEach(([txt, c], i) => {
        const td = document.createElement('td');
        td.textContent = txt;
        td.className = c;
        if (i === 1) td.title = txt;
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
  t.appendChild(tb);
  div.appendChild(t);
  contenedor.appendChild(div);
}

// ---------------------------------------------------------------------------
// Trazabilidad de UN proyecto
// ---------------------------------------------------------------------------

/**
 * Tres bloques, de lo general a lo específico:
 *   1. cómo evolucionó el revenue total del proyecto
 *   2. mes a mes, cuánto había antes y cuánto hay ahora (el delta)
 *   3. el registro de los movimientos concretos, con fecha
 */
function renderizarTrazabilidadProyecto(contenedor, proyecto) {
  const hist = estado.historia;
  const pa = claveProyecto(proyecto);
  const serie = hist && hist.series_por_proyecto && hist.series_por_proyecto[pa];

  const div = document.createElement('div');
  div.className = 'detalle-trazabilidad';
  const h4 = document.createElement('h4');
  h4.textContent = `Trazabilidad de Revenue · ${periodoActual().etiqueta}`;
  div.appendChild(h4);

  // --- Backlog vs. Revenue, mes a mes del año actual. Va antes del resto a
  // propósito: solo necesita el estado actual (BackLog NOLA), no el
  // histórico de snapshots, así que se ve aunque el proyecto no tenga
  // histórico todavía.
  if (backlogDe(proyecto)) {
    const divBVR = document.createElement('div');
    divBVR.className = 'detalle-revenue';
    const h4bvr = document.createElement('h4');
    h4bvr.textContent = 'Backlog vs. Revenue · mes a mes';
    divBVR.appendChild(h4bvr);
    const notaBVR = document.createElement('p');
    notaBVR.className = 'nota-grafica';
    divBVR.appendChild(notaBVR);
    const svgBVR = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgBVR.id = 'grafica-backlog-proyecto';
    svgBVR.setAttribute('class', 'grafica-svg');
    divBVR.appendChild(svgBVR);
    pintarProyeccionBacklogRevenue(svgBVR, [proyecto], notaBVR);
    div.appendChild(divBVR);
  }

  if (!serie || serie.length < 2) {
    const p = document.createElement('p');
    p.className = 'aviso-sin-datos';
    p.textContent = 'Este proyecto no tiene histórico en el dataset simulado.';
    div.appendChild(p);
    contenedor.appendChild(div);
    return;
  }

  const etiquetaDe = id => {
    const s = hist.snapshots.find(x => x.id === id);
    return s ? s.etiqueta : id;
  };

  // --- 1. evolución del total (el movimiento: Commit vs Upside) ---
  const evolucion = {};
  serie.forEach(s => {
    const t = sumarMeses(s.meses);          // solo los meses del periodo
    evolucion[etiquetaDe(s.snapshot_id)] = { 'Commit': t.fijo, 'Upside': t.upside };
  });
  // ¿Hubo algún movimiento en el periodo elegido? Una línea plana no comunica
  // nada: si el dato nunca se movió, es más honesto decirlo con palabras.
  const etiquetas = Object.keys(evolucion);
  const valores = Object.values(evolucion);
  const fechasCambio = etiquetas.filter((_, i) => i > 0 && (
    Math.abs(valores[i].Commit - valores[i - 1].Commit) > 0.5 ||
    Math.abs(valores[i].Upside - valores[i - 1].Upside) > 0.5));

  const resumen = document.createElement('p');
  resumen.className = 'resumen-cambios';
  div.appendChild(resumen);

  if (!fechasCambio.length) {
    const t = sumarMeses(serie[serie.length - 1].meses);
    resumen.innerHTML = (Math.abs(t.fijo) < 1 && Math.abs(t.upside) < 1)
      ? `Este proyecto no tiene revenue en <strong>${periodoActual().etiqueta}</strong>.`
      : `El revenue de <strong>${periodoActual().etiqueta}</strong> nunca se movió: ` +
        `${formatearDinero(t.fijo)} en Commit desde el primer corte hasta hoy.`;
  } else {
    resumen.innerHTML = `<strong>${fechasCambio.length}</strong> ` +
      `movimiento${fechasCambio.length === 1 ? '' : 's'} en ` +
      `<strong>${periodoActual().etiqueta}</strong> · ` +
      `${fechasCambio.slice(0, 6).join(' · ')}${fechasCambio.length > 6 ? ' …' : ''}`;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.className.baseVal = 'grafica-svg';
    div.appendChild(svg);
    // soloCambios: el punto se dibuja donde pasó algo, no en los 32 cortes.
    crearGraficaLinea(svg, evolucion, { soloCambios: true });
  }

  // --- 2. comparador mes a mes ---
  const comp = document.createElement('div');
  comp.className = 'comparador-meses';

  const selA = document.createElement('select');
  const selB = document.createElement('select');
  serie.forEach((s, i) => {
    [selA, selB].forEach((sel, k) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = etiquetaDe(s.snapshot_id);
      if ((k === 0 && i === 0) || (k === 1 && i === serie.length - 1)) o.selected = true;
      sel.appendChild(o);
    });
  });

  const lbl = document.createElement('span');
  lbl.className = 'comparador-texto';
  lbl.textContent = 'Comparar revenue mes a mes entre';
  const lbl2 = document.createElement('span');
  lbl2.className = 'comparador-texto';
  lbl2.textContent = 'y';
  comp.append(lbl, selA, lbl2, selB);
  div.appendChild(comp);

  const tablaMeses = document.createElement('table');
  tablaMeses.className = 'tabla-meses';
  div.appendChild(tablaMeses);

  const idxMeses = mesesActivos();

  function pintarTablaMeses() {
    const a = serie[Number(selA.value)];
    const b = serie[Number(selB.value)];
    tablaMeses.innerHTML = '';

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    ['Mes', `Commit · ${etiquetaDe(a.snapshot_id)}`, `Commit · ${etiquetaDe(b.snapshot_id)}`,
      'Δ Commit', `Upside · ${etiquetaDe(a.snapshot_id)}`, `Upside · ${etiquetaDe(b.snapshot_id)}`, 'Δ Upside']
      .forEach(t => { const th = document.createElement('th'); th.textContent = t; trh.appendChild(th); });
    thead.appendChild(trh);
    tablaMeses.appendChild(thead);

    const tbody = document.createElement('tbody');
    let tfa = 0, tfb = 0, tua = 0, tub = 0;

    idxMeses.forEach(i => {
      const m = MESES_ES[i];
      const [fa, ua] = a.meses[i] || [0, 0];
      const [fb, ub] = b.meses[i] || [0, 0];
      tfa += fa; tfb += fb; tua += ua; tub += ub;
      // Los meses que nunca tuvieron plata solo alargan la tabla.
      if (!fa && !fb && !ua && !ub) return;

      const tr = document.createElement('tr');
      const celda = (txt, clase) => {
        const td = document.createElement('td');
        td.textContent = txt;
        if (clase) td.className = clase;
        tr.appendChild(td);
      };
      celda(m.charAt(0).toUpperCase() + m.slice(1));
      celda(formatearDinero(fa), 'celda-numero');
      celda(formatearDinero(fb), 'celda-numero');
      celda(delta(fb - fa), 'celda-numero ' + claseDelta(fb - fa));
      celda(formatearDinero(ua), 'celda-numero');
      celda(formatearDinero(ub), 'celda-numero');
      celda(delta(ub - ua), 'celda-numero ' + claseDelta(ub - ua, true));
      tbody.appendChild(tr);
    });

    const trt = document.createElement('tr');
    trt.className = 'fila-total';
    [['Total', ''], [formatearDinero(tfa), 'celda-numero'], [formatearDinero(tfb), 'celda-numero'],
      [delta(tfb - tfa), 'celda-numero ' + claseDelta(tfb - tfa)],
      [formatearDinero(tua), 'celda-numero'], [formatearDinero(tub), 'celda-numero'],
      [delta(tub - tua), 'celda-numero ' + claseDelta(tub - tua, true)]]
      .forEach(([t, c]) => { const td = document.createElement('td'); td.textContent = t; td.className = c; trt.appendChild(td); });
    tbody.appendChild(trt);

    tablaMeses.appendChild(tbody);
  }

  function delta(v) {
    if (Math.abs(v) < 0.5) return '—';
    return (v > 0 ? '+' : '−') + formatearDinero(Math.abs(v)).replace('$', '$');
  }
  // Para el revenue fijo, subir es bueno. Para el upside es al revés: que baje
  // significa que se confirmó, que suba significa que algo se desconfirmó.
  function claseDelta(v, invertido) {
    if (Math.abs(v) < 0.5) return '';
    const bueno = invertido ? v < 0 : v > 0;
    return bueno ? 'delta-positivo' : 'delta-negativo';
  }

  selA.addEventListener('change', pintarTablaMeses);
  selB.addEventListener('change', pintarTablaMeses);
  pintarTablaMeses();

  // --- 3. movimientos registrados ---
  // Ojo: num_pa es número en proyectos.json y texto en la historia.
  const mesesOk = new Set(idxMeses.map(i => MESES_ES[i]));
  const eventos = hist.eventos.filter(
    e => String(e.num_pa) === pa && (!e.campo || mesesOk.has(e.campo)));
  const h5 = document.createElement('h5');
  h5.className = 'subtitulo-eventos';
  h5.textContent = `Movimientos registrados (${eventos.length})`;
  div.appendChild(h5);

  if (!eventos.length) {
    const p = document.createElement('p');
    p.className = 'aviso-sin-datos';
    p.textContent = 'Sin movimientos por encima del umbral de ' +
      formatearDinero(hist.meta.umbral_evento_usd) + '. La tabla de arriba muestra el detalle completo.';
    div.appendChild(p);
  } else {
    const t = document.createElement('table');
    t.className = 'tabla-eventos-proyecto';
    const th = document.createElement('thead');
    const trh = document.createElement('tr');
    ['Fecha', 'Mes afectado', 'Tipo', 'Anterior', 'Nuevo', 'Delta']
      .forEach(x => { const e = document.createElement('th'); e.textContent = x; trh.appendChild(e); });
    th.appendChild(trh); t.appendChild(th);

    const tb = document.createElement('tbody');
    eventos.slice()
      .sort((x, y) => Math.abs(y.delta || 0) - Math.abs(x.delta || 0))
      .slice(0, 40)
      .forEach(ev => {
        const tr = document.createElement('tr');
        const fecha = new Date(ev.timestamp).toLocaleDateString('es-CO',
          { day: '2-digit', month: 'short', year: 'numeric' });
        const campo = ev.campo ? ev.campo.charAt(0).toUpperCase() + ev.campo.slice(1) : '—';
        [[fecha, ''], [campo, ''], [ev.tipo.replace(/_/g, ' '), ''],
          [formatearDinero(ev.valor_anterior), 'celda-numero'],
          [formatearDinero(ev.valor_nuevo), 'celda-numero'],
          [delta(ev.delta || 0), 'celda-numero ' + claseDelta(ev.delta || 0)]]
          .forEach(([txt, c]) => {
            const td = document.createElement('td'); td.textContent = txt; td.className = c; tr.appendChild(td);
          });
        tb.appendChild(tr);
      });
    t.appendChild(tb);
    div.appendChild(t);
  }

  contenedor.appendChild(div);
}

/** Meses de cada corte sin los proyectos actualmente Completed; conserva el histórico original. */
function mesesVisiblesPorSnapshot() {
  const hist = estado.historia;
  const porSnapshot = new Map(hist.snapshots.map(s => [s.id,
    Object.fromEntries(Object.entries(s.por_mes).map(([mes, valores]) => [mes, { ...valores }]))]));
  clavesCompletadosOcultos().forEach(clave => {
    (hist.series_por_proyecto[clave] || []).forEach(entrada => {
      const meses = porSnapshot.get(entrada.snapshot_id);
      if (!meses) return;
      MESES_ES.forEach((mes, i) => {
        if (!meses[mes]) return;
        meses[mes].fijo -= entrada.meses?.[i]?.[0] || 0;
        meses[mes].upside -= entrada.meses?.[i]?.[1] || 0;
      });
    });
  });
  return porSnapshot;
}

/** Refresca opciones dependientes del conjunto visible, conservando la selección del usuario. */
function actualizarOpcionesFiltro(selector, valores) {
  const seleccion = selector.value;
  const unicos = new Set(valores);
  if (seleccion) unicos.add(seleccion);
  const inicial = selector.options[0].cloneNode(true);
  inicial.selected = false;
  selector.replaceChildren(inicial);
  [...unicos].sort((a, b) => a.localeCompare(b, 'es')).forEach(valor => {
    const opt = document.createElement('option');
    opt.value = valor;
    opt.textContent = valor;
    selector.appendChild(opt);
  });
  selector.value = seleccion;
}

function renderizarTrazabilidad() {
  if (!estado.historia) {
    const panel = document.getElementById('pestana-trazabilidad');
    const notificacion = panel.querySelector('.panel-trazabilidad') || panel;
    const control = panel.querySelector('[data-mostrar-completados]')?.closest('label');
    notificacion.innerHTML = '<div style="padding: var(--spacing-lg); color: var(--text-secondary);">' +
      'Historial de revenue no disponible (aún no generado).</div>';
    if (control) notificacion.prepend(control);
    return;
  }

  // El selector de periodo se monta una sola vez, arriba de las gráficas.
  const anfitrion = document.getElementById('periodo-trazabilidad');
  if (anfitrion && !anfitrion.children.length) {
    anfitrion.appendChild(construirSelectorPeriodo(renderizarTrazabilidad));
  }

  const snaps = estado.historia.snapshots;
  const mesesPorSnapshot = mesesVisiblesPorSnapshot();
  const meses = mesesActivos();
  const periodo = periodoActual();

  // --- gráfica 1: revenue del periodo elegido, a lo largo de los snapshots ---
  const serieTotal = {};
  snaps.forEach(snap => {
    let fijo = 0, upside = 0;
    meses.forEach(i => {
      const m = mesesPorSnapshot.get(snap.id)[MESES_ES[i]];
      if (!m) return;
      fijo += m.fijo || 0;
      upside += m.upside || 0;
    });
    serieTotal[snap.etiqueta] = { 'Commit': fijo, 'Upside': upside };
  });
  crearGraficaLinea(document.getElementById('grafica-revenue-tiempo'), serieTotal);

  // --- gráfica 2: se abre al nivel de detalle que siga al periodo elegido ---
  // Todo el año -> los 4 quarters. Un quarter -> sus 3 meses. Un mes -> ese mes.
  let desglose;
  if (periodo.id === 'anio') {
    desglose = [['Q1', [0, 1, 2]], ['Q2', [3, 4, 5]], ['Q3', [6, 7, 8]], ['Q4', [9, 10, 11]]];
  } else {
    desglose = meses.map(i => [MESES_ES[i].charAt(0).toUpperCase() + MESES_ES[i].slice(1), [i]]);
  }
  const serieDesglose = {};
  snaps.forEach(snap => {
    const fila = {};
    desglose.forEach(([nombre, idxs]) => {
      fila[nombre] = idxs.reduce((acc, i) => acc + ((mesesPorSnapshot.get(snap.id)[MESES_ES[i]] || {}).fijo || 0), 0);
    });
    serieDesglose[snap.etiqueta] = fila;
  });
  crearGraficaLinea(document.getElementById('grafica-quarterly'), serieDesglose);

  // --- gráfica 3: Backlog vs Revenue, global o de un PM ---
  const selectorBVR = document.getElementById('selector-backlog-vs-revenue');
  if (selectorBVR && !selectorBVR.children.length) {
    const lbl = document.createElement('label');
    lbl.textContent = 'Ver: ';
    lbl.className = 'comparador-texto';
    const sel = document.createElement('select');
    sel.id = 'select-pm-backlog-revenue';
    const optTodos = document.createElement('option');
    optTodos.value = '';
    optTodos.textContent = 'Todos los proyectos (global)';
    sel.appendChild(optTodos);
    [...new Set(estado.proyectos.map(p => p.pm_lider).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'es'))
      .forEach(pm => {
        const o = document.createElement('option');
        o.value = pm;
        o.textContent = pm;
        sel.appendChild(o);
      });
    sel.addEventListener('change', renderizarTrazabilidad);
    selectorBVR.append(lbl, sel);
  }
  actualizarOpcionesFiltro(document.getElementById('select-pm-backlog-revenue'),
    estado.proyectos.filter(pasaFiltroCompletados).map(p => p.pm_lider).filter(Boolean));
  renderizarGraficaBacklogVsRevenue();

  const tituloDesglose = document.getElementById('titulo-desglose');
  if (tituloDesglose) {
    tituloDesglose.textContent = periodo.id === 'anio'
      ? 'Revenue Commit por quarter'
      : `Revenue Commit por mes · ${periodo.etiqueta}`;
  }
  const tituloTotal = document.getElementById('titulo-revenue-tiempo');
  if (tituloTotal) {
    tituloTotal.textContent = periodo.id === 'anio'
      ? 'Revenue total en el tiempo'
      : `Revenue en el tiempo · ${periodo.etiqueta}`;
  }

  // --- selectores de snapshot para la tabla por proyecto ---
  const selA = document.getElementById('select-snap-a');
  const selB = document.getElementById('select-snap-b');
  if (!selA.options.length) {
    snaps.forEach((snap, i) => {
      [selA, selB].forEach((sel, k) => {
        const o = document.createElement('option');
        o.value = i;
        o.textContent = snap.etiqueta;
        if ((k === 0 && i === 0) || (k === 1 && i === snaps.length - 1)) o.selected = true;
        sel.appendChild(o);
      });
    });
    // El rango manda sobre las dos tablas: la de proyectos y la de movimientos.
    const alCambiarRango = () => { renderizarResumenProyectos(); actualizarTablaEventos(); };
    selA.addEventListener('change', alCambiarRango);
    selB.addEventListener('change', alCambiarRango);

    const chk = document.getElementById('chk-solo-cambios');
    if (chk) chk.addEventListener('change', renderizarResumenProyectos);

    document.querySelectorAll('.atajo-rango').forEach(btn => {
      btn.addEventListener('click', () => {
        const [a, b] = rangoPredefinido(btn.dataset.rango, snaps);
        selA.value = a;
        selB.value = b;
        document.querySelectorAll('.atajo-rango').forEach(o => o.classList.remove('activo'));
        btn.classList.add('activo');
        alCambiarRango();
      });
    });
  }
  renderizarResumenProyectos();

  // --- filtros de la tabla de movimientos ---
  const filtroTipoEvento = document.getElementById('filtro-tipo-evento');
  if (!filtroTipoEvento.options.length) {
    filtroTipoEvento.innerHTML = '<option value="">Todos los tipos</option>';
    [...new Set(estado.historia.eventos.map(e => e.tipo))].forEach(tipo => {
      const opt = document.createElement('option');
      opt.value = tipo || '';
      opt.textContent = (TIPO_MOVIMIENTO[tipo] || { texto: tipo || 'sin tipo' }).texto;
      filtroTipoEvento.appendChild(opt);
    });
    filtroTipoEvento.addEventListener('change', actualizarTablaEventos);
    document.getElementById('buscar-evento-proyecto')
      .addEventListener('input', actualizarTablaEventos);
    document.getElementById('limitar-por-proyecto')
      .addEventListener('change', actualizarTablaEventos);
    document.querySelectorAll('#tabla-eventos-cambio thead th[data-columna]').forEach(th => {
      th.addEventListener('click', () => ordenarTablaEventos(th.dataset.columna));
      th.style.cursor = 'pointer';
    });
  }
  actualizarTablaEventos();
}

/**
 * Backlog vs Revenue, calendario de ejecución (no por snapshot/movimiento:
 * eso ya lo muestran las otras gráficas de esta pestaña). Global por
 * defecto; si se elige un PM, solo entre sus proyectos. Ver
 * serieBacklogRevenuePorMes() para la cuenta exacta.
 */
function renderizarGraficaBacklogVsRevenue() {
  const svg = document.getElementById('grafica-backlog-vs-revenue');
  if (!svg) return;
  const sel = document.getElementById('select-pm-backlog-revenue');
  const pmElegido = sel ? sel.value : '';

  const proyectos = estado.proyectos.filter(p => pasaFiltroCompletados(p) && (!pmElegido || p.pm_lider === pmElegido));
  pintarProyeccionBacklogRevenue(svg, proyectos, document.getElementById('nota-backlog-vs-revenue'));

  const titulo = document.getElementById('titulo-backlog-vs-revenue');
  if (titulo) {
    titulo.textContent = pmElegido
      ? `Backlog vs. Revenue · ${pmElegido}`
      : 'Backlog vs. Revenue · todo el portafolio';
  }
}

/** Clic en una columna de "Movimientos registrados" ordena por ella; un
 * segundo clic en la misma invierte el orden. Por defecto se ordena por el
 * delta más grande, que es como se leía antes de que esto existiera. */
function ordenarTablaEventos(columna) {
  const orden = estado.ordenEventos || {};
  const desc = orden.columna === columna ? !orden.desc : true;
  estado.ordenEventos = { columna, desc };
  actualizarTablaEventos();
}

/**
 * "¿Qué cambió entre dos fechas?" — la pregunta real del negocio no es
 * cuánto hay en commit y cuánto en upside, sino QUIÉN se movió y hacia
 * dónde. Esta vista responde eso para cualquier par de snapshots: resumen
 * del rango, las curvas de los que más se movieron, y la lista completa.
 */

const MAX_LINEAS_CAMBIO = 8;

/** Atajos del selector de rango. Devuelve [indiceDesde, indiceHasta]. */
function rangoPredefinido(clave, snaps) {
  const ultimo = snaps.length - 1;
  if (clave === 'todo') return [0, ultimo];
  if (clave === 'semana') {
    const intra = snaps.map((s, i) => [s, i]).filter(([s]) => s.tipo === 'intradia');
    return intra.length ? [intra[0][1] - 1, intra[intra.length - 1][1]] : [0, ultimo];
  }
  if (clave === 'mes') {
    const corte = new Date(snaps[ultimo].timestamp).getTime() - 31 * 864e5;
    const desde = snaps.findIndex(s => new Date(s.timestamp).getTime() >= corte);
    return [Math.max(0, desde - 1), ultimo];
  }
  // 'ultimo': el par de snapshots más reciente en el que de verdad pasó algo.
  const ocultos = clavesCompletadosOcultos();
  const conEventos = new Set(estado.historia.eventos.filter(e => !ocultos.has(String(e.num_pa))).map(e => e.snapshot_id));
  for (let i = ultimo; i > 0; i--) {
    if (conEventos.has(snaps[i].id)) return [i - 1, i];
  }
  return [Math.max(0, ultimo - 1), ultimo];
}

// Un movimiento por debajo de este monto es ruido de redondeo, no una
// decisión de negocio.
const MINIMO_CAMBIO = 0.5;

let graficaQueCambio = null;

function rangoSnapshots() {
  const snaps = estado.historia.snapshots;
  const selA = document.getElementById('select-snap-a');
  const selB = document.getElementById('select-snap-b');
  let iA = Number(selA && selA.value);
  let iB = Number(selB && selB.value);
  if (!Number.isFinite(iA)) iA = 0;
  if (!Number.isFinite(iB)) iB = snaps.length - 1;
  // Si el usuario invierte el orden, se corrige en vez de mostrar vacío.
  return iA <= iB ? [iA, iB] : [iB, iA];
}

function calcularCambios() {
  const hist = estado.historia;
  const snaps = hist.snapshots;
  const [iA, iB] = rangoSnapshots();
  const idA = snaps[iA].id, idB = snaps[iB].id;

  const porProyecto = new Map(estado.proyectos.map(p => [claveProyecto(p), p]));
  const ocultos = clavesCompletadosOcultos();
  const mesesOk = new Set(mesesActivos().map(i => MESES_ES[i]));

  // Eventos del rango, agrupados por proyecto. Commit y Upside se tratan
  // independientes: la magnitud real de cada uno sale de dFijo/dUpside (la
  // resta entre snapshots), no de sumar montos de eventos por "dirección".
  const porPA = new Map();
  hist.eventos.forEach(e => {
    if (ocultos.has(String(e.num_pa))) return;
    if (e.campo && !mesesOk.has(e.campo)) return;
    const i = snaps.findIndex(s => s.id === e.snapshot_id);
    if (i <= iA || i > iB) return;
    const k = String(e.num_pa);
    if (!porPA.has(k)) porPA.set(k, { n: 0, nuevo: false, lista: [] });
    const acc = porPA.get(k);
    acc.n += 1;
    acc.lista.push({ ev: e, snapshot: snaps[i] });
    if (e.tipo === 'alta_proyecto') acc.nuevo = true;
  });

  const filas = [];
  Object.entries(hist.series_por_proyecto).forEach(([pa, serie]) => {
    if (ocultos.has(pa)) return;
    const a = serie.find(s => s.snapshot_id === idA);
    const b = serie.find(s => s.snapshot_id === idB);
    if (!b) return;
    const proy = porProyecto.get(pa);
    const sa = a ? sumarMeses(a.meses) : { fijo: 0, upside: 0 };
    const sb = sumarMeses(b.meses);
    const ev = porPA.get(pa) || { n: 0, nuevo: false, lista: [] };
    const dFijo = sb.fijo - sa.fijo;
    filas.push({
      pa,
      nombre: (proy && proy.nombre_del_proyecto) || `PA ${pa}`,
      etiquetaCorta: proy ? identificador(proy).valor : `PA ${pa}`,
      pm: (proy && proy.pm_lider) || '—',
      fijoA: sa.fijo, fijoB: sb.fijo,
      dFijo, dUpside: sb.upside - sa.upside,
      nuevo: !a || ev.nuevo,
      eventos: ev.n,
      lista: ev.lista,
      cambio: Math.abs(dFijo) >= MINIMO_CAMBIO || ev.n > 0,
      proyecto: proy,
    });
  });
  filas.sort((x, y) => Math.abs(y.dFijo) - Math.abs(x.dFijo));
  return { filas, iA, iB, snaps };
}

// Commit y Upside son dos datos independientes: un proyecto puede subir en
// los dos, bajar en los dos, o moverse distinto en cada uno. No se asume que
// lo que baja de un lado "se fue" al otro.
function direccionDe(f) {
  if (f.nuevo) return { texto: 'Entró al backlog', clase: 'mov-nuevo' };
  const subeFijo = f.dFijo > MINIMO_CAMBIO;
  const bajaFijo = f.dFijo < -MINIMO_CAMBIO;
  const subeUpside = f.dUpside > MINIMO_CAMBIO;
  const bajaUpside = f.dUpside < -MINIMO_CAMBIO;
  const partes = [];
  if (subeFijo) partes.push('Commit subió');
  if (bajaFijo) partes.push('Commit bajó');
  if (subeUpside) partes.push('Upside subió');
  if (bajaUpside) partes.push('Upside bajó');
  if (!partes.length) return { texto: 'Sin movimiento', clase: 'mov-nada' };
  const clase = subeFijo && !bajaFijo ? 'mov-confirma'
    : bajaFijo && !subeFijo ? 'mov-desconfirma'
    : 'mov-mixto';
  return { texto: partes.join(' · '), clase };
}

function renderizarKpisRango(filas, snaps, iA, iB) {
  const cont = document.getElementById('kpis-rango');
  if (!cont) return;
  const movidos = filas.filter(f => f.cambio);
  // Commit que subió y Commit que bajó se miran por separado: no se asume
  // que lo uno explica lo otro (ver direccionDe más arriba).
  const subioCommit = filas.reduce((a, f) => a + (f.dFijo > 0 ? f.dFijo : 0), 0);
  const bajoCommit = filas.reduce((a, f) => a + (f.dFijo < 0 ? -f.dFijo : 0), 0);
  const neto = filas.reduce((a, f) => a + f.dFijo, 0);
  const nuevos = filas.filter(f => f.nuevo).length;
  const pct = filas.length ? Math.round(movidos.length / filas.length * 100) : 0;

  cont.innerHTML = '';

  const encabezado = document.createElement('div');
  encabezado.className = 'resumen-rango-titulo';
  encabezado.innerHTML =
    `Entre <strong>${snaps[iA].etiqueta}</strong> y <strong>${snaps[iB].etiqueta}</strong>` +
    `<span class="resumen-rango-periodo">revenue de ${periodoActual().etiqueta}</span>`;
  cont.appendChild(encabezado);

  const fila = document.createElement('div');
  fila.className = 'resumen-rango-fila';
  cont.appendChild(fila);

  // El valor y la etiqueta se separan en dos lineas con tamanos muy
  // distintos: la cifra se lee de lejos y el texto solo si hace falta.
  const tarjeta = (op) => {
    const d = document.createElement('div');
    d.className = 'tarjeta-rango' + (op.tono ? ' tono-' + op.tono : '') +
      (op.destacada ? ' destacada' : '');

    if (op.icono) {
      const ic = document.createElement('span');
      ic.className = 'tarjeta-rango-icono';
      ic.textContent = op.icono;
      ic.setAttribute('aria-hidden', 'true');
      d.appendChild(ic);
    }

    const cuerpo = document.createElement('div');
    cuerpo.className = 'tarjeta-rango-cuerpo';

    const v = document.createElement('div');
    v.className = 'tarjeta-rango-valor';
    v.textContent = op.valor;
    cuerpo.appendChild(v);

    const e = document.createElement('div');
    e.className = 'tarjeta-rango-etq';
    e.textContent = op.etiqueta;
    cuerpo.appendChild(e);

    if (op.detalle) {
      const s = document.createElement('div');
      s.className = 'tarjeta-rango-detalle';
      s.textContent = op.detalle;
      cuerpo.appendChild(s);
    }
    if (op.barra !== undefined) {
      const barra = document.createElement('div');
      barra.className = 'tarjeta-rango-barra';
      const relleno = document.createElement('span');
      relleno.style.width = Math.max(2, op.barra) + '%';
      barra.appendChild(relleno);
      cuerpo.appendChild(barra);
    }
    d.appendChild(cuerpo);
    fila.appendChild(d);
    return d;
  };

  const operador = (signo) => {
    const s = document.createElement('div');
    s.className = 'resumen-rango-operador';
    s.textContent = signo;
    s.setAttribute('aria-hidden', 'true');
    fila.appendChild(s);
  };

  tarjeta({
    valor: `${movidos.length}`,
    etiqueta: 'proyectos se movieron',
    detalle: `de ${filas.length} · ${pct}% del portafolio`,
    barra: pct,
  });

  tarjeta({
    icono: '↑', tono: 'bueno',
    valor: formatearDinero(subioCommit),
    etiqueta: 'Commit que subió',
    detalle: 'suma de los proyectos donde subió',
  });

  operador('−');

  tarjeta({
    icono: '↓', tono: 'malo',
    valor: formatearDinero(bajoCommit),
    etiqueta: 'Commit que bajó',
    detalle: 'suma de los proyectos donde bajó',
  });

  operador('=');

  tarjeta({
    destacada: true, tono: neto >= 0 ? 'bueno' : 'malo',
    valor: (neto >= 0 ? '+' : '−') + formatearDinero(Math.abs(neto)),
    etiqueta: 'variación neta del Commit',
    detalle: nuevos > 0 ? `incluye ${nuevos} proyecto${nuevos === 1 ? '' : 's'} nuevo${nuevos === 1 ? '' : 's'}` : 'sin proyectos nuevos',
  });

  const titulo = document.getElementById('titulo-que-cambio');
  if (titulo) {
    titulo.textContent = `Commit de los que más se movieron · ${snaps[iA].etiqueta} → ${snaps[iB].etiqueta}`;
  }
}

function renderizarGraficaCambios(filas, snaps, iA, iB) {
  const svg = document.getElementById('grafica-que-cambio');
  const nota = document.getElementById('nota-que-cambio');
  if (!svg) return;
  registrarGrafica(svg, () => renderizarGraficaCambios(filas, snaps, iA, iB));
  graficaQueCambio = null;

  const movidos = filas.filter(f => f.cambio).slice(0, MAX_LINEAS_CAMBIO);
  if (!movidos.length || iB - iA < 1) {
    svg.innerHTML = '';
    svg.style.height = '110px';
    svg.setAttribute('viewBox', '0 0 600 90');
    const t = svgEl('text', { x: 300, y: 50, 'text-anchor': 'middle',
      'font-size': 13, fill: 'var(--text-dim)' });
    t.textContent = iB - iA < 1
      ? 'Elige dos fechas distintas para comparar'
      : 'Ningún proyecto se movió en este rango';
    svg.appendChild(t);
    if (nota) nota.textContent = '';
    return;
  }

  // Etiqueta corta y única: dos proyectos del mismo cliente comparten PA
  // truncado, así que se desempata con el nombre.
  const usadas = new Set();
  movidos.forEach(f => {
    let etq = f.etiquetaCorta;
    let n = 2;
    while (usadas.has(etq)) etq = `${f.etiquetaCorta} (${n++})`;
    usadas.add(etq);
    f.serie = etq;
  });

  const datos = {};
  for (let i = iA; i <= iB; i++) {
    const fila = {};
    movidos.forEach(f => {
      const s = estado.historia.series_por_proyecto[f.pa]
        .find(x => x.snapshot_id === snaps[i].id);
      fila[f.serie] = s ? sumarMeses(s.meses).fijo : 0;
    });
    datos[snaps[i].etiqueta] = fila;
  }
  graficaQueCambio = crearGraficaLinea(svg, datos, { soloCambios: true });

  if (nota) {
    const resto = filas.filter(f => f.cambio).length - movidos.length;
    nota.textContent = `Los ${movidos.length} proyectos con mayor variación de Commit. ` +
      (resto > 0 ? `Otros ${resto} también se movieron: están en la tabla. ` : '') +
      'Pasa el mouse por un renglón de la tabla para resaltar su línea.';
  }
}

function capitalizar(t) {
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

// Qué campo cambió, no "hacia dónde se movió": commit y upside se tratan
// como dos datos independientes, no como un cupo que se transfiere entre
// los dos (un commit que baja no implica que el upside haya subido).
const TIPO_MOVIMIENTO = {
  commit: { texto: 'Commit', clase: 'mov-campo-commit' },
  upside: { texto: 'Upside', clase: 'mov-campo-upside' },
  alta_proyecto: { texto: 'Entró al backlog', clase: 'mov-nuevo' },
  baja_proyecto: { texto: 'Salió del backlog', clase: 'mov-desconfirma' },
};

/**
 * La fila que se despliega bajo un proyecto: un renglón por movimiento, con
 * el mes afectado, la fecha, la dirección y cuánto se movió el Commit de ese
 * mes. Es lo que convierte "13 movimientos" en información.
 */
function filaDetalleMovimientos(f) {
  const tr = document.createElement('tr');
  tr.className = 'fila-detalle-mov';
  const td = document.createElement('td');
  td.colSpan = 8;

  const caja = document.createElement('div');
  caja.className = 'detalle-mov-caja';

  const titulo = document.createElement('div');
  titulo.className = 'detalle-mov-titulo';
  titulo.textContent = `Qué se movió en ${f.nombre}`;
  caja.appendChild(titulo);

  const tabla = document.createElement('table');
  tabla.className = 'detalle-mov-tabla';
  tabla.innerHTML = '<thead><tr>' +
    '<th>Cuándo</th><th>Mes afectado</th><th>Campo</th>' +
    '<th>Delta</th><th>Antes → Después</th></tr></thead>';
  const tbody = document.createElement('tbody');

  const ordenados = [...f.lista].sort(
    (a, b) => String(a.ev.timestamp).localeCompare(String(b.ev.timestamp)));

  ordenados.forEach(({ ev, snapshot }) => {
    const fila = document.createElement('tr');
    const tipo = TIPO_MOVIMIENTO[ev.tipo] || { texto: ev.tipo, clase: 'mov-nada' };
    const celdas = [
      { txt: snapshot.etiqueta },
      { txt: capitalizar(ev.campo) || '—' },
      { chip: tipo },
      {
        txt: (ev.delta >= 0 ? '+' : '−') + formatearDineroExacto(Math.abs(ev.delta || 0)),
        clase: 'celda-numero ' + (ev.delta >= 0 ? 'delta-positivo' : 'delta-negativo'),
      },
      {
        txt: `${formatearDineroExacto(ev.valor_anterior)} → ${formatearDineroExacto(ev.valor_nuevo)}`,
        clase: 'celda-numero',
      },
    ];
    celdas.forEach(c => {
      const celda = document.createElement('td');
      if (c.chip) {
        const span = document.createElement('span');
        span.className = 'chip-movimiento ' + c.chip.clase;
        span.textContent = c.chip.texto;
        celda.appendChild(span);
      } else {
        celda.textContent = c.txt;
      }
      if (c.clase) celda.className = c.clase;
      fila.appendChild(celda);
    });
    tbody.appendChild(fila);
  });

  // Un total por campo, no uno solo: sumar un delta de Commit con uno de
  // Upside en la misma cifra mezclaría dos datos independientes.
  const pie = document.createElement('tfoot');
  const porTipo = new Map();
  ordenados.forEach(({ ev }) => {
    if (!porTipo.has(ev.tipo)) porTipo.set(ev.tipo, []);
    porTipo.get(ev.tipo).push(ev);
  });
  porTipo.forEach((evs, tipo) => {
    const total = evs.reduce((acc, ev) => acc + (ev.delta || 0), 0);
    const etiquetaTipo = (TIPO_MOVIMIENTO[tipo] || { texto: tipo }).texto;
    const trTotal = document.createElement('tr');
    const tdEtq = document.createElement('td');
    tdEtq.colSpan = 3;
    tdEtq.textContent = `Total ${etiquetaTipo} · ${evs.length} movimiento${evs.length === 1 ? '' : 's'}`;
    trTotal.appendChild(tdEtq);
    const tdTot = document.createElement('td');
    tdTot.className = 'celda-numero ' + (total >= 0 ? 'delta-positivo' : 'delta-negativo');
    tdTot.textContent = (total >= 0 ? '+' : '−') + formatearDineroExacto(Math.abs(total));
    trTotal.appendChild(tdTot);
    const tdNota = document.createElement('td');
    tdNota.className = 'detalle-mov-nota';
    tdNota.textContent = `abreviado: ${(total >= 0 ? '+' : '−') + formatearDinero(Math.abs(total))}`;
    trTotal.appendChild(tdNota);
    pie.appendChild(trTotal);
  });

  tabla.appendChild(tbody);
  tabla.appendChild(pie);
  caja.appendChild(tabla);
  td.appendChild(caja);
  tr.appendChild(td);
  return tr;
}

function renderizarResumenProyectos() {
  const tbody = document.querySelector('#tabla-resumen-proyectos tbody');
  if (!tbody || !estado.historia) return;
  const { filas, iA, iB, snaps } = calcularCambios();

  renderizarKpisRango(filas, snaps, iA, iB);
  renderizarGraficaCambios(filas, snaps, iA, iB);

  // Los Completed pueden revelar PMs y movimientos nuevos al activar el control.
  const filtroPM = document.getElementById('filtro-resumen-pm');
  actualizarOpcionesFiltro(filtroPM, filas.map(f => f.pm).filter(Boolean));

  const filtroQuePaso = document.getElementById('filtro-resumen-que-paso');
  actualizarOpcionesFiltro(filtroQuePaso, filas.map(f => direccionDe(f).texto));
  if (!filtroQuePaso.dataset.wireado) {
    filtroQuePaso.dataset.wireado = '1';
    // Wire up filter events
    const filtroTexto = document.getElementById('filtro-resumen-texto');
    filtroTexto.addEventListener('input', renderizarResumenProyectos);
    filtroPM.addEventListener('change', renderizarResumenProyectos);
    filtroQuePaso.addEventListener('change', renderizarResumenProyectos);
  }

  // Apply filters
  const textoFiltro = (document.getElementById('filtro-resumen-texto').value || '').trim().toLowerCase();
  const pmFiltro = document.getElementById('filtro-resumen-pm').value;
  const quePasoFiltro = document.getElementById('filtro-resumen-que-paso').value;
  const soloCambios = document.getElementById('chk-solo-cambios');
  
  let visibles = (soloCambios && soloCambios.checked)
    ? filas.filter(f => f.cambio) : filas;

  // Apply text filter
  if (textoFiltro) {
    visibles = visibles.filter(f =>
      (f.nombre || '').toLowerCase().includes(textoFiltro) ||
      (f.pa || '').toLowerCase().includes(textoFiltro)
    );
  }

  // Apply PM filter
  if (pmFiltro) {
    visibles = visibles.filter(f => f.pm === pmFiltro);
  }

  // Apply "Qué pasó" filter
  if (quePasoFiltro) {
    visibles = visibles.filter(f => direccionDe(f).texto === quePasoFiltro);
  }

  // Update indicator
  const indicador = document.getElementById('indicador-resumen-proyectos');
  if (indicador) {
    const total = soloCambios.checked ? filas.filter(f => f.cambio).length : filas.length;
    indicador.textContent = `${visibles.length} de ${total}`;
  }

  tbody.innerHTML = '';
  visibles.forEach(f => {
    const tr = document.createElement('tr');
    tr.className = 'fila-clicable';
    tr.title = 'Ver la trazabilidad de este proyecto';
    if (f.proyecto) tr.addEventListener('click', () => abrirDetalle(f.proyecto));
    if (f.serie && graficaQueCambio) {
      tr.addEventListener('mouseenter', () => graficaQueCambio.destacar(f.serie));
      tr.addEventListener('mouseleave', () => graficaQueCambio.destacar(null));
      tr.classList.add('fila-en-grafica');
    }

    const celda = (txt, clase, titulo) => {
      const td = document.createElement('td');
      td.textContent = txt;
      if (clase) td.className = clase;
      if (titulo) td.title = titulo;
      tr.appendChild(td);
      return td;
    };
    const signo = v => (Math.abs(v) < MINIMO_CAMBIO ? '—'
      : (v > 0 ? '+' : '−') + formatearDinero(Math.abs(v)));
    const clase = (v, invertido) => (Math.abs(v) < MINIMO_CAMBIO ? ''
      : ((invertido ? v < 0 : v > 0) ? 'delta-positivo' : 'delta-negativo'));

    celda(f.nombre, 'celda-nombre', f.nombre);
    celda(f.pm);
    // Las cifras se abrevian para que la tabla se lea, pero el valor exacto
    // queda en el tooltip: abreviado no se puede auditar una suma.
    celda(f.nuevo ? '—' : formatearDinero(f.fijoA), 'celda-numero',
      f.nuevo ? '' : formatearDineroExacto(f.fijoA));
    celda(formatearDinero(f.fijoB), 'celda-numero', formatearDineroExacto(f.fijoB));
    celda(signo(f.dFijo), 'celda-numero ' + clase(f.dFijo), formatearDineroExacto(f.dFijo));
    celda(signo(f.dUpside), 'celda-numero ' + clase(f.dUpside, true),
      formatearDineroExacto(f.dUpside));
    const dir = direccionDe(f);
    const td = celda('', 'celda-movimiento');
    const chip = document.createElement('span');
    chip.className = 'chip-movimiento ' + dir.clase;
    chip.textContent = dir.texto;
    td.appendChild(chip);
    const meses = [...new Set(f.lista.map(x => x.ev.campo).filter(Boolean))];
    if (meses.length) {
      const sub = document.createElement('div');
      sub.className = 'celda-submeses';
      sub.textContent = meses.length <= 3
        ? meses.map(capitalizar).join(', ')
        : `${meses.slice(0, 2).map(capitalizar).join(', ')} y ${meses.length - 2} meses más`;
      sub.title = meses.map(capitalizar).join(', ');
      td.appendChild(sub);
    }

    // "13 movimientos" no dice nada por si solo. El boton abre el detalle:
    // que mes, en que fecha, en que direccion y cuanto.
    const tdMov = celda('', 'celda-numero celda-detalle');
    if (f.eventos > 0) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'boton-detalle-mov';
      btn.innerHTML = `<span>${f.eventos}</span> <span class="chevron">▾</span>`;
      btn.title = 'Ver qué se movió exactamente';
      btn.addEventListener('click', ev => {
        ev.stopPropagation();
        const abierta = tr.nextSibling && tr.nextSibling.classList
          && tr.nextSibling.classList.contains('fila-detalle-mov');
        if (abierta) {
          tr.nextSibling.remove();
          btn.classList.remove('abierto');
          return;
        }
        tr.after(filaDetalleMovimientos(f));
        btn.classList.add('abierto');
      });
      tdMov.appendChild(btn);
    } else {
      tdMov.textContent = '—';
    }
    tbody.appendChild(tr);
  });

  const nota = document.getElementById('nota-tabla-cambios');
  if (nota) {
    const conCambio = filas.filter(f => f.cambio).length;
    nota.textContent = `${conCambio} de ${filas.length} proyectos se movieron entre ` +
      `${snaps[iA].etiqueta} y ${snaps[iB].etiqueta} · revenue de ${periodoActual().etiqueta}. ` +
      'Clic en un renglón para abrir su trazabilidad.';
  }
}


function actualizarTablaEventos() {
  const hist = estado.historia;
  const tabla = document.querySelector('#tabla-eventos-cambio tbody');
  if (!tabla) return;
  tabla.innerHTML = '';

  const tipo = document.getElementById('filtro-tipo-evento').value;
  const busca = (document.getElementById('buscar-evento-proyecto').value || '')
    .trim().toLowerCase();
  const limitar = document.getElementById('limitar-por-proyecto').checked;
  const ocultos = clavesCompletadosOcultos();

  // Initialize PM filter
  const filtroPMEvento = document.getElementById('filtro-eventos-pm');
  if (filtroPMEvento) {
    const nombreDe = new Map(estado.proyectos.map(
      p => [claveProyecto(p), p.pm_lider || SIN_DATO]));
    actualizarOpcionesFiltro(filtroPMEvento, hist.eventos.filter(e => !ocultos.has(String(e.num_pa)))
      .map(e => nombreDe.get(String(e.num_pa))).filter(Boolean));
    if (!filtroPMEvento.dataset.wireado) {
      filtroPMEvento.dataset.wireado = '1';
      filtroPMEvento.addEventListener('change', actualizarTablaEventos);
    }
  }
  const pmEvento = filtroPMEvento ? filtroPMEvento.value : '';

  // Initialize Mes filter
  const filtroMesEvento = document.getElementById('filtro-eventos-mes');
  if (filtroMesEvento && filtroMesEvento.options.length === 1) {
    MESES_ES.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m.charAt(0).toUpperCase() + m.slice(1);
      filtroMesEvento.appendChild(opt);
    });
    filtroMesEvento.addEventListener('change', actualizarTablaEventos);
  }
  const mesEvento = filtroMesEvento ? filtroMesEvento.value : '';

  const nombreDe = new Map(estado.proyectos.map(
    p => [claveProyecto(p), p.nombre_del_proyecto || identificador(p).valor]));
  const pmDe = new Map(estado.proyectos.map(
    p => [claveProyecto(p), p.pm_lider || SIN_DATO]));

  const mesesOk = new Set(mesesActivos().map(i => MESES_ES[i]));
  // Solo los movimientos del rango "Desde / hasta": cada evento lleva la fecha
  // del snapshot que lo detectó, así que entra si cae en (Desde, hasta].
  const [iA, iB] = rangoSnapshots();
  const desde = new Date(hist.snapshots[iA].timestamp);
  const hasta = new Date(hist.snapshots[iB].timestamp);
  const enRango = hist.eventos.filter(e => {
    if (ocultos.has(String(e.num_pa))) return false;
    const t = new Date(e.timestamp);
    return t > desde && t <= hasta;
  });
  // Base del contador "N de M": los movimientos del rango y del periodo, sin los filtros de la tabla.
  const totalPeriodo = enRango.filter(e => !e.campo || mesesOk.has(e.campo)).length;
  let eventos = enRango.filter(e => {
    if (e.campo && !mesesOk.has(e.campo)) return false;   // mes fuera del periodo
    if (tipo && e.tipo !== tipo) return false;
    if (pmEvento) {
      const pmProyecto = pmDe.get(String(e.num_pa));
      if (pmProyecto !== pmEvento) return false;
    }
    if (mesEvento && e.campo !== mesEvento) return false;
    if (!busca) return true;
    const nombre = nombreDe.get(String(e.num_pa)) || e.nombre || '';
    return (nombre + ' ' + e.num_pa).toLowerCase().includes(busca);
  });

  const ordenEv = estado.ordenEventos;
  if (ordenEv && ordenEv.columna) {
    const leer = (e) => {
      if (ordenEv.columna === 'nombre') return nombreDe.get(String(e.num_pa)) || e.nombre || '';
      if (ordenEv.columna === 'tipo') return (TIPO_MOVIMIENTO[e.tipo] || { texto: e.tipo || '' }).texto;
      const v = e[ordenEv.columna];
      return v === null || v === undefined ? '' : v;
    };
    eventos = eventos.slice().sort((a, b) => {
      const va = leer(a), vb = leer(b);
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb : String(va).localeCompare(String(vb));
      return ordenEv.desc ? -cmp : cmp;
    });
  } else {
    eventos = eventos.slice().sort((a, b) => Math.abs(b.delta || 0) - Math.abs(a.delta || 0));
  }

  document.querySelectorAll('#tabla-eventos-cambio thead th[data-columna]').forEach(th => {
    const activa = ordenEv && ordenEv.columna === th.dataset.columna;
    th.classList.toggle('col-ordenada', !!activa);
    const base = th.textContent.replace(/\s*[↑↓]\s*$/, '');
    th.textContent = base + (activa ? (ordenEv.desc ? '  ↓' : '  ↑') : '');
  });

  // Sin este tope, el proyecto más grande del portafolio se queda con todas
  // las filas y la tabla deja de ser una vista global.
  if (limitar) {
    const vistos = new Map();
    eventos = eventos.filter(e => {
      const n = (vistos.get(e.num_pa) || 0) + 1;
      vistos.set(e.num_pa, n);
      return n <= 2;
    });
  }

  const mostrados = eventos.slice(0, 80);
  mostrados.forEach(ev => {
    const tr = document.createElement('tr');
    const proy = estado.proyectos.find(p => claveProyecto(p) === String(ev.num_pa));
    if (proy) {
      tr.className = 'fila-clicable';
      tr.title = 'Ver la trazabilidad de este proyecto';
      tr.addEventListener('click', () => abrirDetalle(proy));
    }
    const nombre = (proy && proy.nombre_del_proyecto) || ev.nombre || '—';
    const pm = (proy && proy.pm_lider) || pmDe.get(String(ev.num_pa)) || '—';
    const fecha = new Date(ev.timestamp).toLocaleDateString('es-CO',
      { day: '2-digit', month: 'short', year: 'numeric' });
    const d = ev.delta || 0;
    const signo = Math.abs(d) < 0.5 ? '—' : (d > 0 ? '+' : '−') + formatearDinero(Math.abs(d));

    [[fecha, ''], [nombre, 'celda-nombre'], [pm, ''],
      [(TIPO_MOVIMIENTO[ev.tipo] || { texto: ev.tipo || '' }).texto, ''],
      [ev.campo ? ev.campo.charAt(0).toUpperCase() + ev.campo.slice(1) : '—', ''],
      [formatearDinero(ev.valor_anterior), 'celda-numero'],
      [formatearDinero(ev.valor_nuevo), 'celda-numero'],
      [signo, 'celda-numero ' + (Math.abs(d) < 0.5 ? '' : d > 0 ? 'delta-positivo' : 'delta-negativo')],
    ].forEach(([txt, c], i) => {
      const td = document.createElement('td');
      td.textContent = txt;
      td.className = c;
      if (i === 1 || i === 2) td.title = txt;  // title for Proyecto and PM columns
      tr.appendChild(td);
    });
    tabla.appendChild(tr);
  });

  const distintos = new Set(mostrados.map(e => e.num_pa)).size;
  const indicador = document.getElementById('indicador-eventos');
  if (indicador) {
    indicador.textContent = `${mostrados.length} de ${totalPeriodo}`;
  }
  let pie = document.getElementById('pie-eventos');
  if (!pie) {
    pie = document.createElement('p');
    pie.id = 'pie-eventos';
    pie.className = 'nota-tabla';
    document.querySelector('#tabla-eventos-cambio').after(pie);
  }
  pie.textContent = `Mostrando ${mostrados.length} de ${eventos.length} movimientos ` +
    `de ${distintos} proyectos distintos · revenue de ${periodoActual().etiqueta}.`;
}


// PMs
// ============================================================================

/**
 * Backlog por PM, igual a la tabla de negocio: se parte por estado (In
 * Progress / On Hold / Planned) porque esos 3 son los que de verdad tienen
 * backlog pendiente. Completed y Canceled no suman aquí (si suman $0, no
 * aportan nada a la vista y solo le agregan columnas vacías).
 * Commit, Upside y Total Ejecutado sí cuentan TODOS los proyectos activos
 * del PM: ahí no se trata de backlog pendiente sino de cuánto ha movido.
 */
const CLAVE_ESTADO_PM = { 'In Progress': 'inProgreso', 'On Hold': 'onHold', 'Planned': 'planned', 'Completed': 'completed' };

function calcularPMs() {
  const porPM = new Map();
  estado.proyectos.forEach(p => {
    if (!pasaFiltroCompletados(p)) return;
    if (!estado.incluirCancelados && p.estado === 'Canceled') return;
    const pm = p.pm_lider || SIN_DATO;
    if (!porPM.has(pm)) {
      porPM.set(pm, {
        pm,
        inProgresoN: 0, inProgresoBacklog: 0,
        onHoldN: 0, onHoldBacklog: 0,
        plannedN: 0, plannedBacklog: 0,
        completedN: 0,
        totalN: 0, totalBacklog: 0,
        commit: 0, upside: 0, totalEjecutado: 0,
        proyectos: [],
      });
    }
    const acc = porPM.get(pm);
    acc.proyectos.push(p);
    acc.commit += revenuePeriodo(p) || 0;
    acc.upside += upsidePeriodo(p) || 0;

    const fila = backlogDe(p);
    acc.totalEjecutado += (fila && typeof fila.total_ejecutado_acumulado === 'number')
      ? fila.total_ejecutado_acumulado : 0;

    const estadoBacklog = (fila && fila.estado) || p.estado;
    const clave = CLAVE_ESTADO_PM[estadoBacklog];
    if (clave) {
      if (clave === 'completed') {
        // Completed no tiene backlog, solo cuenta
        acc.completedN += 1;
      } else {
        const backlogValor = backlogHoy(p);
        acc[clave + 'N'] += 1;
        acc[clave + 'Backlog'] += (typeof backlogValor === 'number' ? backlogValor : 0);
        acc.totalN += 1;
        acc.totalBacklog += (typeof backlogValor === 'number' ? backlogValor : 0);
      }
    }
  });

  const nMeses = mesesActivos().length || 1;
  return [...porPM.values()].map(f => ({
    ...f,
    nProyectos: f.proyectos.length,
    promedioMensual: f.commit / nMeses,
    promedioProyecto: f.proyectos.length ? f.commit / f.proyectos.length : 0,
  }));
}

const COLUMNAS_PM_DINERO = new Set([
  // completedN is NOT money, it's a count
  'inProgresoBacklog', 'onHoldBacklog', 'plannedBacklog', 'totalBacklog',
  'commit', 'upside', 'totalEjecutado', 'promedioMensual', 'promedioProyecto',
]);

function ordenarTablaPMs(columna) {
  const orden = estado.ordenPMs || {};
  const desc = orden.columna === columna ? !orden.desc : true;
  estado.ordenPMs = { columna, desc };
  renderizarPMs();
}

/**
 * Tres gráficas que responden de un vistazo lo que antes solo se veía
 * ordenando la tabla: quién mueve más plata, quién tiene más backlog
 * pendiente, y quién carga más proyectos. Cada una ordena su propio top,
 * sin importar cómo esté ordenada la tabla en ese momento.
 */
function renderizarGraficasPMs(filas) {
  const top = (campo, n, formato) => filas
    .slice()
    .sort((a, b) => b[campo] - a[campo])
    .slice(0, n)
    .filter(f => f[campo])
    .map(f => ({
      etiqueta: f.pm,
      valor: f[campo],
      exacto: formato === 'dinero' ? formatearDineroExacto(f[campo]) : formatearNumero(f[campo]),
    }));

  crearGraficaBarrasSimple('grafica-pm-commit', top('commit', 10, 'dinero'), {
    formato: 'dinero', unidad: 'Commit',
  });
  crearGraficaBarrasSimple('grafica-pm-backlog', top('totalBacklog', 10, 'dinero'), {
    formato: 'dinero', unidad: 'Backlog total',
  });
  crearGraficaBarrasSimple('grafica-pm-proyectos', top('nProyectos', 15, 'conteo'), {
    formato: 'conteo', unidad: 'Proyectos',
  });
}

function renderizarPMs() {
  const anfitrion = document.getElementById('periodo-pms');
  if (anfitrion && !anfitrion.children.length) {
    anfitrion.appendChild(construirSelectorPeriodo(renderizarPMs));
  }

  const thead = document.querySelector('#tabla-pms > thead tr');
  if (thead && !thead.dataset.wireado) {
    thead.dataset.wireado = '1';
    thead.querySelectorAll('th[data-columna]').forEach(th => {
      th.style.cursor = 'pointer';
      th.title = `Ordenar por ${th.textContent}`;
      th.addEventListener('click', () => ordenarTablaPMs(th.dataset.columna));
    });
  }

  let filas = calcularPMs();

  // Renderizar KPIs resumen
  const kpisData = {
    totalPMs: filas.length,
    inProgress: filas.reduce((a, f) => a + f.inProgresoN, 0),
    onHold: filas.reduce((a, f) => a + f.onHoldN, 0),
    planned: filas.reduce((a, f) => a + f.plannedN, 0),
    completed: filas.reduce((a, f) => a + f.completedN, 0),
    totalBooking: filas.reduce((a, f) => a + f.proyectos.reduce((s, p) => s + (valorBooking(p) || 0), 0), 0),
    // Total Backlog KPI: sum backlogHoy over all projects (same as main tab)
    totalBacklog: filas.reduce((a, f) => a + f.proyectos.reduce((s, p) => s + (backlogHoy(p) || 0), 0), 0),
  };
  document.getElementById('kpi-pms-total').textContent = kpisData.totalPMs;
  document.getElementById('kpi-pms-in-progress').textContent = kpisData.inProgress;
  document.getElementById('kpi-pms-on-hold').textContent = kpisData.onHold;
  document.getElementById('kpi-pms-planned').textContent = kpisData.planned;
  document.getElementById('kpi-pms-completed').textContent = kpisData.completed;
  document.getElementById('kpi-pms-total-booking').textContent = formatearDinero(kpisData.totalBooking);
  document.getElementById('kpi-pms-total-backlog').textContent = formatearDinero(kpisData.totalBacklog);

  renderizarGraficasPMs(filas);

  // Por defecto, el que más Commit tiene primero: es la pregunta más
  // frecuente ("¿quién tiene más plata?").
  const orden = estado.ordenPMs || { columna: 'commit', desc: true };
  filas = filas.slice().sort((a, b) => {
    const va = a[orden.columna], vb = b[orden.columna];
    const cmp = typeof va === 'number' && typeof vb === 'number'
      ? va - vb : String(va || '').localeCompare(String(vb || ''), 'es');
    return orden.desc ? -cmp : cmp;
  });

  thead && thead.querySelectorAll('th[data-columna]').forEach(th => {
    const activa = orden.columna === th.dataset.columna;
    th.classList.toggle('col-ordenada', activa);
    const base = th.textContent.replace(/\s*[↑↓]\s*$/, '');
    th.textContent = base + (activa ? (orden.desc ? '  ↓' : '  ↑') : '');
  });

  const fmt = (col, v) => (COLUMNAS_PM_DINERO.has(col) ? formatearDinero(v) : formatearNumero(v));

  const tbody = document.querySelector('#tabla-pms > tbody');
  tbody.innerHTML = '';
  const columnas = ['inProgresoN', 'inProgresoBacklog', 'onHoldN', 'onHoldBacklog',
    'plannedN', 'plannedBacklog', 'completedN', 'totalN', 'totalBacklog',
    'commit', 'upside', 'totalEjecutado', 'promedioMensual', 'promedioProyecto'];

  filas.forEach(f => {
    const tr = document.createElement('tr');
    tr.className = 'fila-pm-principal';
    tr.dataset.pm = f.pm;

    // Toggle button column
    const tdToggle = document.createElement('td');
    tdToggle.className = 'celda-toggle';
    const btnToggle = document.createElement('button');
    btnToggle.type = 'button';
    btnToggle.className = 'btn-toggle-pm pf-v6-c-button pf-m-plain pf-m-small';
    btnToggle.innerHTML = '<span class="chevron-pm">›</span>';
    btnToggle.title = 'Ver proyectos de este PM';
    btnToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleProyectosPM(f.pm);
    });
    tdToggle.appendChild(btnToggle);
    tr.appendChild(tdToggle);

    // PM name column - clickable for navigation to listado
    const tdPM = document.createElement('td');
    tdPM.textContent = f.pm;
    tdPM.className = 'celda-nombre celda-pm-nombre';
    tdPM.title = `Ver los proyectos de ${f.pm} en Listado de Proyectos`;
    tdPM.style.cursor = 'pointer';
    tdPM.addEventListener('click', () => irAProyectosDePM(f.pm));
    tr.appendChild(tdPM);

    columnas.forEach(col => {
      const td = document.createElement('td');
      td.className = 'celda-numero';
      const v = f[col];
      td.textContent = fmt(col, v);
      if (COLUMNAS_PM_DINERO.has(col)) td.title = formatearDineroExacto(v);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);

    // If this PM is expanded, render the sub-table
    if (estado.expandedPMs.has(f.pm)) {
      tbody.appendChild(crearFilaProyectosPM(f));
      btnToggle.classList.add('expandido');
      btnToggle.querySelector('.chevron-pm').textContent = '▾';
    }
  });

  // Fila de totales, igual a "Total Result" de la tabla de negocio.
  const tfoot = document.querySelector('#tabla-pms > tfoot');
  tfoot.innerHTML = '';
  if (filas.length) {
    const trTotal = document.createElement('tr');
    const tdVacio = document.createElement('td'); // toggle column
    trTotal.appendChild(tdVacio);
    const tdEtq = document.createElement('td');
    tdEtq.textContent = `Total (${filas.length} PM${filas.length === 1 ? '' : 's'})`;
    tdEtq.className = 'celda-nombre';
    trTotal.appendChild(tdEtq);
    const totalProyectos = filas.reduce((a, f) => a + f.nProyectos, 0);
    const totalCommit = filas.reduce((a, f) => a + f.commit, 0);
    const nMeses = mesesActivos().length || 1;
    columnas.forEach(col => {
      const td = document.createElement('td');
      td.className = 'celda-numero';
      let v;
      if (col === 'promedioMensual') v = totalCommit / nMeses;
      else if (col === 'promedioProyecto') v = totalProyectos ? totalCommit / totalProyectos : 0;
      else v = filas.reduce((a, f) => a + (f[col] || 0), 0);
      td.textContent = fmt(col, v);
      trTotal.appendChild(td);
    });
    tfoot.appendChild(trTotal);
  }
}

function toggleProyectosPM(pm) {
  if (estado.expandedPMs.has(pm)) {
    estado.expandedPMs.delete(pm);
  } else {
    estado.expandedPMs.add(pm);
  }
  renderizarPMs();
}

function crearFilaProyectosPM(filaPM) {
  const tr = document.createElement('tr');
  tr.className = 'fila-proyectos-pm-expandida';
  const td = document.createElement('td');
  td.colSpan = 16; // all columns

  const cont = document.createElement('div');
  cont.className = 'contenedor-proyectos-pm';

  const tabla = document.createElement('table');
  tabla.className = 'tabla-proyectos-pm pf-v6-c-table pf-m-compact';

  // Header
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  ['PA', 'Proyecto', 'Cliente', 'Estado', 'Handover', 'Status', 'Valor Booking', 'Revenue acum.', 'Backlog', '% ejecución']
    .forEach(txt => {
      const th = document.createElement('th');
      th.textContent = txt;
      trh.appendChild(th);
    });
  thead.appendChild(trh);
  tabla.appendChild(thead);

  // Sort projects: by estado order, then backlog desc
  const ordenEstado = (estado.metadataProyectos || {}).orden_estado || [];
  const proyectos = filaPM.proyectos.slice().sort((a, b) => {
    const iaEst = ordenEstado.indexOf(a.estado);
    const ibEst = ordenEstado.indexOf(b.estado);
    const estCmp = (iaEst < 0 ? 99 : iaEst) - (ibEst < 0 ? 99 : ibEst);
    if (estCmp !== 0) return estCmp;
    const blA = backlogHoy(a) || 0;
    const blB = backlogHoy(b) || 0;
    return blB - blA;
  });

  const tbody = document.createElement('tbody');
  proyectos.forEach(p => {
    const trp = document.createElement('tr');
    trp.className = 'fila-proyecto-pm';
    trp.addEventListener('click', () => abrirDetalle(p));

    const booking = valorBooking(p) || 0;
    const acum = acumuladoHoy(p) || 0;
    const backlog = backlogHoy(p) || 0;
    const pctEjec = booking > 0 ? (acum / booking * 100) : 0;

    // PA
    const tdPA = document.createElement('td');
    tdPA.textContent = identificador(p).valor;
    tdPA.className = 'celda-id';
    trp.appendChild(tdPA);

    // Proyecto name - ellipsis + title
    const tdNom = document.createElement('td');
    tdNom.textContent = p.nombre_del_proyecto || '—';
    tdNom.className = 'celda-nombre';
    tdNom.title = p.nombre_del_proyecto || '';
    trp.appendChild(tdNom);

    // Cliente
    const tdCli = document.createElement('td');
    tdCli.textContent = p.cliente || '—';
    trp.appendChild(tdCli);

    // Estado - colored chip
    const tdEst = document.createElement('td');
    const chipEst = document.createElement('span');
    chipEst.className = 'chip-estado-pm';
    chipEst.textContent = p.estado || '—';
    chipEst.style.color = colorDeEntidad('estado', p.estado || '—');
    tdEst.appendChild(chipEst);
    trp.appendChild(tdEst);

    // Handover
    const tdHandover = document.createElement('td');
    tdHandover.style.textAlign = 'center';
    if (p.executive_watchlist) {
      const span = document.createElement('span');
      span.className = 'chip-dato chip-bueno';
      span.textContent = '✓';
      span.style.fontSize = '0.875rem';
      tdHandover.appendChild(span);
    }
    trp.appendChild(tdHandover);

    // Project Status
    const tdStatus = document.createElement('td');
    if (p.project_status) {
      const statusMap = { 'Red': 'Rojo', 'Yellow': 'Amarillo', 'Green': 'Verde' };
      const statusColor = { 'Red': '#c9190b', 'Yellow': '#f0ab00', 'Green': '#3e8635' };
      const dot = document.createElement('span');
      dot.style.cssText = `display:inline-block;width:8px;height:8px;border-radius:50%;background:${statusColor[p.project_status] || '#8a8d90'};margin-right:4px;`;
      tdStatus.appendChild(dot);
      tdStatus.appendChild(document.createTextNode(statusMap[p.project_status] || p.project_status));
    } else {
      tdStatus.textContent = '—';
    }
    tdStatus.style.fontSize = '0.8125rem';
    trp.appendChild(tdStatus);

    // Valor Booking
    const tdBooking = document.createElement('td');
    tdBooking.textContent = formatearDinero(booking);
    tdBooking.className = 'celda-numero';
    trp.appendChild(tdBooking);

    // Revenue acum
    const tdAcum = document.createElement('td');
    tdAcum.textContent = formatearDinero(acum);
    tdAcum.className = 'celda-numero';
    trp.appendChild(tdAcum);

    // Backlog
    const tdBacklog = document.createElement('td');
    tdBacklog.textContent = formatearDinero(backlog);
    tdBacklog.className = 'celda-numero';
    trp.appendChild(tdBacklog);

    // % ejecución
    const tdPct = document.createElement('td');
    tdPct.textContent = pctEjec.toFixed(1) + '%';
    tdPct.className = 'celda-numero';
    trp.appendChild(tdPct);

    tbody.appendChild(trp);
  });
  tabla.appendChild(tbody);

  // Footer with link to Listado
  const tfoot = document.createElement('tfoot');
  const trf = document.createElement('tr');
  const tdf = document.createElement('td');
  tdf.colSpan = 10;  // updated for new columns
  tdf.style.textAlign = 'center';
  tdf.style.padding = 'var(--spacing-sm)';
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'pf-v6-c-button pf-m-link pf-m-small';
  link.textContent = 'Ver en Listado de Proyectos';
  link.addEventListener('click', (e) => {
    e.stopPropagation();
    irAProyectosDePM(filaPM.pm);
  });
  tdf.appendChild(link);
  trf.appendChild(tdf);
  tfoot.appendChild(trf);
  tabla.appendChild(tfoot);

  cont.appendChild(tabla);
  td.appendChild(cont);
  tr.appendChild(td);
  return tr;
}


function irAProyectosDePM(pm) {
  DIMENSIONES.forEach(d => { estado.filtros[d.campo] = []; });
  estado.filtros.texto = '';
  estado.filtros.pm_lider = [pm];
  const texto = document.getElementById('filtro-texto');
  if (texto) texto.value = '';
  aplicarFiltros();
  cambiarPestana('listado');
}

// ============================================================================
// COLUMNAS REDIMENSIONABLES
// ============================================================================

// Storage: Map<tableKey + '|' + colIndex, width>
const anchosColumnasGuardados = new Map();
// Control de drag
let dragInfo = null;
// Hasta cuándo se ignora el click en encabezados que sigue a un arrastre
let suprimirClickHasta = 0;
// Debounce para MutationObserver
let mutationTimeout;

/**
 * Extrae una clave única para una tabla (id o su primera clase)
 */
function obtenerTabllaKey(tabla) {
  return tabla.id || (tabla.className.split(' ')[0] || 'tabla-sin-id');
}

/**
 * Carga los anchos guardados de localStorage
 */
function cargarAnchosDeStorage() {
  const stored = localStorage.getItem('anchosColumnas');
  if (!stored) return;
  try {
    const obj = JSON.parse(stored);
    for (const [k, v] of Object.entries(obj)) {
      anchosColumnasGuardados.set(k, v);
    }
  } catch (e) {
    console.warn('Error cargando anchosColumnas:', e);
  }
}

/**
 * Guarda los anchos en localStorage
 */
function guardarAnchosEnStorage() {
  const obj = {};
  for (const [k, v] of anchosColumnasGuardados) {
    obj[k] = v;
  }
  localStorage.setItem('anchosColumnas', JSON.stringify(obj));
}

/**
 * Añade resizers a los th de una tabla y reaplica anchos guardados
 */
function asegurarResizers(tabla) {
  if (!tabla || !tabla.tagName || tabla.tagName !== 'TABLE') return;

  const tableKey = obtenerTabllaKey(tabla);
  const thead = tabla.querySelector('thead');
  if (!thead) return;

  // Buscar la última fila de headers
  const headerRows = thead.querySelectorAll('tr');
  if (!headerRows.length) return;
  const lastHeaderRow = headerRows[headerRows.length - 1];

  // Añadir resizers a los th que no los tengan
  lastHeaderRow.querySelectorAll('th').forEach((th, colIndex) => {
    if (!th.querySelector('.col-resizer')) {
      const resizer = document.createElement('span');
      resizer.className = 'col-resizer';
      th.appendChild(resizer);
    }
  });

  // Reaplica los anchos guardados
  const tBodyRows = tabla.querySelectorAll('tbody tr');
  lastHeaderRow.querySelectorAll('th').forEach((th, colIndex) => {
    const key = `${tableKey}|${colIndex}`;
    const savedWidth = anchosColumnasGuardados.get(key);
    if (savedWidth) {
      th.style.width = savedWidth + 'px';
      th.style.minWidth = savedWidth + 'px';
      th.style.maxWidth = savedWidth + 'px';

      // Aplicar el mismo ancho a las celdas del tbody
      tBodyRows.forEach(row => {
        const cells = row.querySelectorAll('td, th');
        if (cells.length === lastHeaderRow.children.length && cells[colIndex]) {
          cells[colIndex].style.width = savedWidth + 'px';
          cells[colIndex].style.minWidth = savedWidth + 'px';
          cells[colIndex].style.maxWidth = savedWidth + 'px';
        }
      });
    }
  });
}

/**
 * Evento delegado: pointerdown en .col-resizer
 */
document.addEventListener('pointerdown', (e) => {
  if (!e.target.classList.contains('col-resizer')) return;

  e.preventDefault();
  e.stopPropagation();

  const th = e.target.closest('th');
  if (!th) return;

  const tabla = th.closest('table');
  if (!tabla) return;

  const thead = tabla.querySelector('thead');
  const lastHeaderRow = thead.querySelector('tr:last-child');
  const headerCells = lastHeaderRow.querySelectorAll('th');
  let colIndex = -1;
  for (let i = 0; i < headerCells.length; i++) {
    if (headerCells[i] === th) { colIndex = i; break; }
  }
  if (colIndex === -1) return;

  const startX = e.clientX;
  const startWidth = th.offsetWidth;

  dragInfo = {
    tabla,
    tableKey: obtenerTabllaKey(tabla),
    colIndex,
    startX,
    startWidth,
    th,
    lastHeaderRow,
    headerCells,
  };

  document.body.classList.add('dragging-col-resizer');

  const onMove = (e) => {
    if (!dragInfo) return;
    const delta = e.clientX - dragInfo.startX;
    const newWidth = Math.max(60, dragInfo.startWidth + delta);

    // Actualizar header
    dragInfo.th.style.width = newWidth + 'px';
    dragInfo.th.style.minWidth = newWidth + 'px';
    dragInfo.th.style.maxWidth = newWidth + 'px';

    // Actualizar celdas del tbody
    const tbody = dragInfo.tabla.querySelector('tbody');
    if (tbody) {
      const rows = tbody.querySelectorAll('tr');
      rows.forEach(row => {
        const cells = row.querySelectorAll('td, th');
        if (cells.length === dragInfo.headerCells.length && cells[dragInfo.colIndex]) {
          cells[dragInfo.colIndex].style.width = newWidth + 'px';
          cells[dragInfo.colIndex].style.minWidth = newWidth + 'px';
          cells[dragInfo.colIndex].style.maxWidth = newWidth + 'px';
        }
      });
    }
  };

  const onUp = (e) => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.body.classList.remove('dragging-col-resizer');

    if (!dragInfo) return;

    const finalWidth = Math.max(60, dragInfo.startWidth + (e.clientX - dragInfo.startX));
    const key = `${dragInfo.tableKey}|${dragInfo.colIndex}`;
    anchosColumnasGuardados.set(key, finalWidth);
    guardarAnchosEnStorage();

    // El click que el navegador dispara al soltar no debe ordenar la columna.
    suprimirClickHasta = Date.now() + 400;

    dragInfo = null;
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
});

document.addEventListener('click', (e) => {
  if (Date.now() < suprimirClickHasta && e.target.closest('th')) {
    e.preventDefault();
    e.stopPropagation();
    suprimirClickHasta = 0;
  }
}, true);

/**
 * Double-click en resizer: resetea el ancho de la columna
 */
document.addEventListener('dblclick', (e) => {
  if (!e.target.classList.contains('col-resizer')) return;

  e.preventDefault();
  e.stopPropagation();

  const th = e.target.closest('th');
  if (!th) return;

  const tabla = th.closest('table');
  if (!tabla) return;

  const thead = tabla.querySelector('thead');
  const lastHeaderRow = thead.querySelector('tr:last-child');
  const headerCells = lastHeaderRow.querySelectorAll('th');
  let colIndex = -1;
  for (let i = 0; i < headerCells.length; i++) {
    if (headerCells[i] === th) { colIndex = i; break; }
  }
  if (colIndex === -1) return;

  const tableKey = obtenerTabllaKey(tabla);
  const key = `${tableKey}|${colIndex}`;

  // Quitar estilos inline
  th.style.width = '';
  th.style.minWidth = '';
  th.style.maxWidth = '';

  const tbody = tabla.querySelector('tbody');
  if (tbody) {
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td, th');
      if (cells[colIndex]) {
        cells[colIndex].style.width = '';
        cells[colIndex].style.minWidth = '';
        cells[colIndex].style.maxWidth = '';
      }
    });
  }

  // Quitar del storage
  anchosColumnasGuardados.delete(key);
  guardarAnchosEnStorage();
});

/**
 * MutationObserver para detectar cambios en el DOM y reaplica resizers
 */
function setupMutationObserver() {
  const observer = new MutationObserver(() => {
    if (mutationTimeout) clearTimeout(mutationTimeout);
    mutationTimeout = requestAnimationFrame(() => {
      document.querySelectorAll('table').forEach(tabla => {
        asegurarResizers(tabla);
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// ============================================================================
// NAVEGACIÓN
// ============================================================================

// Cada SVG conserva su función de dibujo. El observador solo reacciona al
// ancho: abrir un panel o cambiar su altura no crea un bucle de renderizado.
const graficasRegistradas = new WeakMap();
const graficasPendientes = new Set();
let ajusteGraficasPendiente = 0;
const observadorGraficas = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(entradas => {
  entradas.forEach(({ target, contentRect }) => {
    if (!target.isConnected) {
      observadorGraficas.unobserve(target);
      graficasRegistradas.delete(target);
      return;
    }
    const registro = graficasRegistradas.get(target);
    if (registro && contentRect.width > 0 && Math.abs(target.clientWidth - registro.ancho) > 1) {
      graficasPendientes.add(target);
    }
  });
  if (!graficasPendientes.size || ajusteGraficasPendiente) return;
  ajusteGraficasPendiente = requestAnimationFrame(() => {
    ajusteGraficasPendiente = 0;
    const pendientes = [...graficasPendientes];
    graficasPendientes.clear();
    pendientes.forEach(svg => {
      if (svg.isConnected && svg.clientWidth > 0) graficasRegistradas.get(svg)?.pintar();
    });
  });
});

function registrarGrafica(svg, pintar) {
  if (!svg) return;
  delete svg.dataset.reporteCabecera;
  delete svg.dataset.reporteCortes;
  svg.style.minHeight = '0';
  const nuevo = !graficasRegistradas.has(svg);
  graficasRegistradas.set(svg, {
    pintar: () => {
      const controlador = pintar();
      if (svg.id === 'grafica-que-cambio' && controlador) graficaQueCambio = controlador;
    },
    ancho: svg.clientWidth,
  });
  if (nuevo) observadorGraficas?.observe(svg);
}

function ajustarGraficasVisibles() {
  ocultarTooltip();
  document.querySelectorAll('.pestana-contenido.activa svg').forEach(svg => {
    if (svg.clientWidth > 0 && svg.getClientRects().length) graficasRegistradas.get(svg)?.pintar();
  });
}

// Reporte independiente del layout del dashboard. Los SVG siguen siendo
// vectoriales al guardar el resultado desde la impresión del navegador.
let detallesAntesDeImprimir = [];
let scrollAntesDelReporte = 0;

const ANCHO_GRAFICA_REPORTE = 960;
const ALTO_GRAFICA_REPORTE = 440;
let identificadorRecorteReporte = 0;

function crearPaginaReporte() {
  const pagina = document.createElement('section');
  pagina.className = 'reporte-pagina';
  const marca = document.createElement('header');
  marca.className = 'reporte-marca';
  const identidad = document.createElement('div');
  identidad.className = 'reporte-marca-identidad';
  const logo = document.querySelector('.rh-masthead .rh-logo')?.cloneNode(true);
  if (logo) {
    logo.setAttribute('class', 'reporte-logo');
    logo.removeAttribute('style');
    identidad.appendChild(logo);
  }
  const nombre = document.createElement('strong');
  nombre.textContent = 'Red Hat';
  identidad.appendChild(nombre);
  const producto = document.createElement('span');
  producto.className = 'reporte-producto';
  producto.textContent = 'LATAM Projects' + (estado.metadataProyectos?.demo ? ' - DEMO' : '');
  marca.append(identidad, producto);
  const contenido = document.createElement('main');
  contenido.className = 'reporte-contenido';
  const pie = document.createElement('footer');
  pie.className = 'reporte-pie';
  const periodo = document.createElement('span');
  periodo.textContent = `Revenue: ${periodoActual().etiqueta} - USD`;
  pie.append(periodo, document.createElement('span'));
  pagina.append(marca, contenido, pie);
  return { pagina, contenido };
}

function construirResumenReporte(contenido, vista, nombreVista, partes) {
  const titulo = document.createElement('h1');
  titulo.textContent = `${nombreVista} - Informe de revenue`;
  const contexto = document.createElement('p');
  contexto.className = 'reporte-contexto';
  contexto.textContent = partes.join(' · ');
  contenido.append(titulo, contexto);

  const proyectos = vista.id === 'pestana-listado' ? estado.proyectosFiltrados
    : vista.id === 'pestana-detalle' ? [estado.proyectoSeleccionado].filter(Boolean)
    : vista.id === 'pestana-pms' ? calcularPMs().flatMap(f => f.proyectos)
    : estado.proyectos.filter(pasaFiltroCompletados);
  const sumar = fn => {
    const valores = proyectos.map(fn).filter(Number.isFinite);
    return valores.length || !proyectos.length ? valores.reduce((s, v) => s + v, 0) : null;
  };
  const booking = sumar(valorBooking), acumulado = sumar(acumuladoHoy);
  const perfiles = [];
  if (vista.id === 'pestana-listado') {
    if (estado.filtros.pm_lider.length === 1) perfiles.push(`PM: ${estado.filtros.pm_lider[0]}`);
    if (estado.filtros.vendedor.length === 1) perfiles.push(`Vendedor: ${estado.filtros.vendedor[0]}`);
  } else if (vista.id === 'pestana-detalle') {
    const p = estado.proyectoSeleccionado;
    perfiles.push(`${identificador(p).valor} - ${p.nombre_del_proyecto || 'Proyecto'}`);
    perfiles.push(`PM: ${p.pm_lider || 'Sin dato'} · Vendedor: ${p.vendedor || 'Sin dato'}`);
  } else if (vista.id === 'pestana-pms') {
    perfiles.push(`${new Set(proyectos.map(p => p.pm_lider || SIN_DATO)).size} PMs en el portafolio`);
  }
  if (perfiles.length) {
    const perfil = document.createElement('h2');
    perfil.className = 'reporte-perfiles';
    perfil.textContent = perfiles.join(' · ');
    contenido.appendChild(perfil);
  }
  const kpis = document.createElement('div');
  kpis.className = 'reporte-kpis';
  const metricas = [
    ['Proyectos', formatearNumero(proyectos.length)],
    ['Booking', formatearDineroExacto(booking)],
    ['Revenue acumulado', formatearDineroExacto(acumulado)],
    ['Backlog', formatearDineroExacto(sumar(backlogHoy))],
    ['Ejecución', booking > 0 && acumulado !== null ? (acumulado / booking * 100).toFixed(1) + '%' : '—'],
    [`Commit · ${periodoActual().etiqueta}`, formatearDineroExacto(sumar(revenuePeriodo))],
  ];
  metricas.forEach(([etiqueta, valor]) => {
    const celda = document.createElement('div');
    celda.className = 'reporte-kpi';
    const cifra = document.createElement('strong');
    cifra.textContent = valor;
    const label = document.createElement('span');
    label.textContent = etiqueta;
    celda.append(cifra, label);
    kpis.appendChild(celda);
  });
  contenido.appendChild(kpis);

  const desglose = document.createElement('div');
  desglose.className = 'reporte-desglose';
  const bloque = (titulo, lineas) => {
    const seccion = document.createElement('section');
    const h2 = document.createElement('h2');
    h2.textContent = titulo;
    seccion.appendChild(h2);
    lineas.forEach(texto => {
      const p = document.createElement('p');
      p.textContent = texto;
      seccion.appendChild(p);
    });
    desglose.appendChild(seccion);
  };
  const estados = new Map();
  const status = new Map();
  proyectos.forEach(p => {
    const e = valorDimension(p, 'estado'), s = valorDimension(p, 'project_status');
    estados.set(e, (estados.get(e) || 0) + 1);
    status.set(s, (status.get(s) || 0) + 1);
  });
  bloque('Proyectos por estado', [...estados].map(([e, n]) => `${e}: ${n}`));
  const completos = proyectos.filter(p => [valorBooking(p), acumuladoHoy(p), backlogHoy(p)].every(Number.isFinite)).length;
  bloque('Semáforo y cobertura del dato', [
    ...[...status].map(([s, n]) => `${s === SIN_DATO ? 'Sin semáforo' : s}: ${n}`),
    `${completos} de ${proyectos.length} proyectos con cifras completas de BackLog NOLA.`,
  ]);
  contenido.appendChild(desglose);
  if (vista.id === 'pestana-trazabilidad' && estado.historia) {
    const { filas } = calcularCambios();
    const p = document.createElement('p');
    p.className = 'reporte-nota';
    p.textContent = `Variación neta del Commit en el rango seleccionado: ${formatearDineroExacto(filas.reduce((s, f) => s + f.dFijo, 0))}. Los indicadores superiores describen el portafolio actual.`;
    contenido.appendChild(p);
  }
}

/** Mantener el mismo tamaño de texto, repartiendo gráficas altas por filas completas. */
function paginarGraficaReporte(svg) {
  const base = svg.cloneNode(true);
  base.removeAttribute('id');
  base.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  base.querySelectorAll('[tabindex]').forEach(el => el.removeAttribute('tabindex'));
  base.querySelectorAll('[role="button"]').forEach(el => el.removeAttribute('role'));
  const caja = svg.viewBox.baseVal;
  const ancho = caja.width || ANCHO_GRAFICA_REPORTE;
  const alto = ALTO_GRAFICA_REPORTE * ancho / ANCHO_GRAFICA_REPORTE;
  const cabecera = Number(svg.dataset.reporteCabecera) || 0;
  const espacioCuerpo = alto - cabecera;
  const cortes = JSON.parse(svg.dataset.reporteCortes || '[]');
  const segmentos = [];
  if (caja.height <= alto) segmentos.push({ inicio: cabecera, fin: caja.height });
  else if (cortes.length) {
    cortes.forEach(corte => {
      const anterior = segmentos[segmentos.length - 1];
      if (anterior && corte.fin - anterior.inicio <= espacioCuerpo) anterior.fin = corte.fin;
      else segmentos.push({ inicio: corte.inicio, fin: corte.fin });
    });
  } else {
    for (let inicio = cabecera; inicio < caja.height; inicio += espacioCuerpo) {
      segmentos.push({ inicio, fin: Math.min(inicio + espacioCuerpo, caja.height) });
    }
  }
  return segmentos.map(segmento => {
    const copia = svgEl('svg', {
      viewBox: `0 0 ${ancho} ${alto}`, preserveAspectRatio: 'xMidYMid meet',
      role: 'img', 'aria-label': svg.getAttribute('aria-label') || 'Gráfica de revenue',
    });
    const uid = `recorte-reporte-${++identificadorRecorteReporte}`;
    const defs = svgEl('defs');
    [['cabecera', 0, cabecera], ['cuerpo', cabecera, Math.min(espacioCuerpo, segmento.fin - segmento.inicio)]].forEach(([nombre, y, altura]) => {
      const recorte = svgEl('clipPath', { id: `${uid}-${nombre}` });
      recorte.appendChild(svgEl('rect', { x: 0, y, width: ancho, height: Math.max(0, altura) }));
      defs.appendChild(recorte);
    });
    copia.appendChild(defs);
    if (cabecera) {
      const superior = svgEl('g', { 'clip-path': `url(#${uid}-cabecera)` });
      [...base.childNodes].forEach(el => superior.appendChild(el.cloneNode(true)));
      copia.appendChild(superior);
    }
    const cuerpo = svgEl('g', { 'clip-path': `url(#${uid}-cuerpo)` });
    const interior = svgEl('g', { transform: `translate(0,${cabecera - segmento.inicio})` });
    [...base.childNodes].forEach(el => interior.appendChild(el.cloneNode(true)));
    cuerpo.appendChild(interior);
    copia.appendChild(cuerpo);
    return copia;
  });
}

function prepararReporteGraficas() {
  const vista = document.querySelector('.pestana-contenido.activa');
  if (!vista) return;
  cerrarDropdowns();
  document.body.classList.add('preparando-reporte');
  detallesAntesDeImprimir = [...vista.querySelectorAll('details:not([open])')];
  detallesAntesDeImprimir.forEach(detalle => { detalle.open = true; });
  ajustarGraficasVisibles();

  const reporte = document.getElementById('reporte-graficas') || document.createElement('section');
  reporte.id = 'reporte-graficas';
  reporte.replaceChildren();
  const barra = document.createElement('div');
  barra.className = 'reporte-acciones';
  const volver = document.createElement('button');
  volver.type = 'button';
  volver.className = 'pf-v6-c-button pf-m-secondary';
  volver.textContent = 'Volver al dashboard';
  volver.addEventListener('click', cerrarReporteGraficas);
  const imprimir = document.createElement('button');
  imprimir.type = 'button';
  imprimir.className = 'pf-v6-c-button pf-m-primary';
  imprimir.textContent = 'Imprimir / guardar como PDF';
  imprimir.addEventListener('click', () => window.print());
  barra.append(volver, imprimir);
  reporte.appendChild(barra);

  const nombreVista = document.querySelector('.pestana-btn.activa')?.textContent.trim() || 'Dashboard';
  const partes = [new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }), `Periodo de revenue: ${periodoActual().etiqueta}`];
  partes.push(estado.incluirCompletados ? 'Incluye completados' : 'Excluye completados');
  if (vista.id === 'pestana-listado') {
    DIMENSIONES.forEach(dim => {
      if (estado.filtros[dim.campo].length) partes.push(`${dim.etiqueta}: ${estado.filtros[dim.campo].join(', ')}`);
    });
    if (estado.filtros.texto) partes.push(`Búsqueda: ${estado.filtros.texto}`);
    partes.push(estado.incluirCancelados ? 'Incluye cancelados' : 'Excluye cancelados');
    partes.push(document.getElementById('indicador-proyectos').textContent);
  } else if (vista.id === 'pestana-trazabilidad') {
    ['select-snap-a', 'select-snap-b'].forEach((id, i) => {
      const selector = document.getElementById(id);
      if (selector?.selectedOptions.length) partes.push(`${i ? 'Hasta' : 'Desde'}: ${selector.selectedOptions[0].textContent}`);
    });
  } else if (vista.id === 'pestana-detalle' && estado.proyectoSeleccionado) {
    partes.push(estado.proyectoSeleccionado.nombre_del_proyecto || identificador(estado.proyectoSeleccionado).valor);
  }
  const paginas = [];
  const portada = crearPaginaReporte();
  construirResumenReporte(portada.contenido, vista, nombreVista, partes);
  paginas.push(portada.pagina);
  const estilosAnteriores = [];
  try {
    vista.querySelectorAll('svg').forEach(svg => {
      if (!graficasRegistradas.has(svg) || !svg.children.length) return;
      estilosAnteriores.push({ svg, width: svg.style.width, maxWidth: svg.style.maxWidth });
      svg.style.width = `${ANCHO_GRAFICA_REPORTE}px`;
      svg.style.maxWidth = 'none';
      graficasRegistradas.get(svg).pintar();
      const contenedor = svg.closest('.grafica-contenedor, .detalle-revenue, .detalle-trazabilidad');
      const titulo = svg.dataset.tituloReporte || contenedor?.querySelector('h3, h4')?.textContent || 'Revenue';
      const copias = paginarGraficaReporte(svg);
      copias.forEach((copia, i) => {
        const pagina = crearPaginaReporte();
        const figura = document.createElement('figure');
        figura.className = 'reporte-grafica';
        const caption = document.createElement('figcaption');
        caption.textContent = titulo + (copias.length > 1 ? ` - Parte ${i + 1} de ${copias.length}` : '');
        figura.append(caption, copia);
        if (svg.id === 'grafica-backlog-vs-revenue') {
          const selector = document.querySelector('#selector-backlog-vs-revenue select');
          if (selector?.selectedOptions.length) {
            const alcance = document.createElement('p');
            alcance.className = 'reporte-nota';
            alcance.textContent = `Calendario de ejecución - ${selector.selectedOptions[0].textContent}.`;
            figura.appendChild(alcance);
          }
        }
        const nota = contenedor?.querySelector('.nota-grafica');
        if (nota && svg.id !== 'grafica-booking-vendedor') {
          const texto = document.createElement('p');
          texto.className = 'reporte-nota';
          texto.textContent = nota.textContent;
          figura.appendChild(texto);
        }
        pagina.contenido.appendChild(figura);
        paginas.push(pagina.pagina);
      });
    });
  } finally {
    estilosAnteriores.forEach(({ svg, width, maxWidth }) => {
      svg.style.width = width;
      svg.style.maxWidth = maxWidth;
    });
    document.body.classList.remove('preparando-reporte');
  }
  if (paginas.length === 1) {
    const vacio = document.createElement('p');
    vacio.textContent = 'No hay gráficas disponibles en esta vista.';
    portada.contenido.appendChild(vacio);
  }
  paginas.forEach((pagina, i) => {
    pagina.querySelector('.reporte-pie span:last-child').textContent = `Página ${i + 1} de ${paginas.length}`;
    reporte.appendChild(pagina);
  });
  document.body.appendChild(reporte);
}

function cerrarReporteGraficas() {
  document.body.classList.remove('modo-reporte');
  detallesAntesDeImprimir.forEach(detalle => { detalle.open = false; });
  detallesAntesDeImprimir = [];
  document.getElementById('reporte-graficas')?.remove();
  ajustarGraficasVisibles();
  window.scrollTo(0, scrollAntesDelReporte);
  document.querySelector('.btn-exportar-graficas')?.focus({ preventScroll: true });
}

function inicializarReporteGraficas() {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn-exportar-graficas pf-v6-c-button pf-m-secondary';
  boton.textContent = 'Exportar informe PDF';
  boton.addEventListener('click', () => {
    scrollAntesDelReporte = window.scrollY;
    prepararReporteGraficas();
    document.body.classList.add('modo-reporte');
    window.scrollTo(0, 0);
    document.querySelector('#reporte-graficas button')?.focus({ preventScroll: true });
  });
  document.querySelector('.encabezado').appendChild(boton);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('modo-reporte')) cerrarReporteGraficas();
  });
  window.addEventListener('beforeprint', () => {
    if (!document.body.classList.contains('modo-reporte')) {
      scrollAntesDelReporte = window.scrollY;
      prepararReporteGraficas();
    }
  });
  window.addEventListener('afterprint', () => {
    if (!document.body.classList.contains('modo-reporte')) cerrarReporteGraficas();
  });
}

function cambiarPestana(nombre, omitirHash) {
  // La pestaña queda en el hash de la URL: así se puede compartir un enlace
  // directo a la trazabilidad o a un proyecto concreto.
  if (!omitirHash) {
    const pa = (nombre === 'detalle' && estado.proyectoSeleccionado)
      ? '/' + estado.proyectoSeleccionado.num_pa : '';
    history.replaceState(null, '', '#' + nombre + pa);
  }

  // Ocultar todas
  document.querySelectorAll('.pestana-contenido').forEach(p => {
    p.classList.remove('activa');
  });
  document.querySelectorAll('.pestana-btn').forEach(b => {
    b.classList.remove('activa');
    b.setAttribute('aria-selected', 'false');
    // pf-v6-c-tabs marca la pestaña activa en el <li>, no en el botón
    if (b.parentElement) b.parentElement.classList.remove('pf-m-current');
  });

  // Mostrar seleccionada
  const pestana = document.getElementById(`pestana-${nombre}`);
  if (pestana) {
    pestana.classList.add('activa');
  }

  const btn = document.querySelector(`[data-pestana="${nombre}"]`);
  if (btn) {
    btn.classList.add('activa');
    btn.setAttribute('aria-selected', 'true');
    if (btn.parentElement) btn.parentElement.classList.add('pf-m-current');
  }

  // Renderizar contenido específico
  if (nombre === 'detalle') {
    renderizarDetalle();
  } else if (nombre === 'trazabilidad') {
    renderizarTrazabilidad();
  } else if (nombre === 'pms') {
    renderizarPMs();
  }
  if (nombre === 'detalle') window.scrollTo(0, 0);
  requestAnimationFrame(ajustarGraficasVisibles);
}

// ============================================================================
// ACTUALIZACIÓN GENERAL DE UI
// ============================================================================

function actualizarUI() {
  ocultarTooltip();
  calcularKPIs();
  renderizarTabla();
  actualizarGraficas();
  document.getElementById('indicador-proyectos').textContent =
    `${estado.proyectosFiltrados.length} de ${estado.proyectos.filter(pasaFiltroCompletados).length} proyectos`;
}

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

async function inicializar() {
  // Cargar datos
  const datosOK = await cargarDatos();
  if (!datosOK) return;

  // El periodo puede venir en la URL (?periodo=q2). Se lee ANTES del primer
  // render: si no, la vista se pinta con el periodo por defecto.
  const pedido = new URLSearchParams(location.search).get('periodo');
  if (pedido && PERIODOS.some(x => x.id === pedido)) estado.periodo = pedido;

  // Inicializar filtros
  inicializarFiltros();
  if (window.matchMedia('(max-width: 768px)').matches) {
    document.querySelector('.panel-filtros').open = false;
  }
  inicializarReporteGraficas();
  window.addEventListener('scroll', ocultarTooltip, { capture: true, passive: true });
  document.addEventListener('toggle', ocultarTooltip, true);
  document.getElementById('mostrar-columnas-completas').addEventListener('change', e => {
    document.getElementById('tabla-proyectos').classList.toggle('vista-completa', e.target.checked);
  });
  document.getElementById('filtro-no-iniciados-estado').addEventListener('change', renderizarTablaNoIniciados);

  // Configurar eventos de pestañas
  document.querySelectorAll('.pestana-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      // currentTarget (no target): el botón real de PatternFly envuelve el
      // texto en un <span>, y un clic ahí dejaría target apuntando al span.
      const pestana = e.currentTarget.dataset.pestana;
      cambiarPestana(pestana);
    });
  });

  // Botón volver
  document.getElementById('btn-volver-listado').addEventListener('click', () => {
    cambiarPestana('listado');
  });

  // Renderizar inicial
  actualizarUI();

  // Inicializar sistema de redimensionamiento de columnas
  cargarAnchosDeStorage();
  document.querySelectorAll('table').forEach(tabla => {
    asegurarResizers(tabla);
  });
  setupMutationObserver();

  // Abrir la pestaña que venga en la URL (#trazabilidad, #detalle/65085...).
  const [vista, pa] = decodeURIComponent(location.hash.slice(1)).split('/');
  if (vista === 'detalle' && pa) {
    const p = estado.proyectos.find(x => String(x.num_pa) === pa);
    if (p) { estado.proyectoSeleccionado = p; cambiarPestana('detalle', true); }
  } else if (vista === 'trazabilidad' || vista === 'detalle' || vista === 'pms') {
    cambiarPestana(vista, true);
  }

  // Ajustar tamaño de gráficas en resize (con debounce de 200ms)
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      ajustarGraficasVisibles();
    }, 200);
  });
}

// Iniciar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', inicializar);

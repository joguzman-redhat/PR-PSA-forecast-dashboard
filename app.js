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
    texto: '',
  },
  // Los cancelados se esconden por defecto: ensucian conteos y gráficas, y
  // los 24 que hay valen $0 de Valor OF. El interruptor los trae de vuelta.
  incluirCancelados: false,
  proyectosFiltrados: [],
  proyectoSeleccionado: null,
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
 * Backlog vs Revenue, mes a mes, del estado actual (no de los snapshots
 * históricos). El Backlog no es un dato aparte: en cada mes es lo que queda
 * por ejecutar del contrato, así que se recalcula en cada punto como
 * Valor OF − Acum 2025 − Commit acumulado hasta ese mes. En diciembre da
 * exactamente el Backlog que ya está guardado en BackLog NOLA, porque es la
 * misma cuenta (Valor OF − Acum 2025 − Q1..Q4).
 *
 * El Valor OF de BackLog NOLA (`fila.valor_of`) llega null en null en las 291
 * filas de la carga actual — el ETL de n8n no lo está escribiendo todavía.
 * Se reconstruye con los dos números que sí llegan siempre y que son,
 * literalmente, cómo se calculó el Backlog en origen: Valor OF = Backlog +
 * Total Ejecutado Acumulado (Total Ejecutado = Acum 2025 + Q1..Q4).
 * Verificado contra las 278 filas con dato completo: coincide exacto.
 */
function serieBacklogRevenuePorMes(proyectos) {
  let valorOf = 0;
  let acum2025 = 0;
  const commitPorMes = new Array(12).fill(0);
  proyectos.forEach(p => {
    const fila = backlogDe(p);
    if (!fila) return;
    const backlogFinal = typeof fila.backlog === 'number' ? fila.backlog : 0;
    const totalEjecutado = typeof fila.total_ejecutado_acumulado === 'number'
      ? fila.total_ejecutado_acumulado : 0;
    valorOf += typeof fila.valor_of === 'number' ? fila.valor_of : backlogFinal + totalEjecutado;
    acum2025 += typeof fila.acum_2025 === 'number' ? fila.acum_2025 : 0;
    MESES_ES.forEach((m, i) => {
      const v = fila[m + '_fijo'];
      commitPorMes[i] += typeof v === 'number' ? v : 0;
    });
  });

  const datos = {};
  let acumulado = 0;
  MESES_ES.forEach((m, i) => {
    acumulado += commitPorMes[i];
    const etiqueta = m.charAt(0).toUpperCase() + m.slice(1);
    datos[etiqueta] = { Commit: acumulado, Backlog: valorOf - acum2025 - acumulado };
  });
  return datos;
}

function calcularKPIs() {
  const proyectos = estado.proyectosFiltrados;
  const suma = campo => proyectos.reduce(
    (acc, p) => acc + (typeof p[campo] === 'number' ? p[campo] : 0), 0);

  const valorOf = suma('valor_of');
  const acumulado = suma('acumulado_a_hoy');

  const texto = (id, valor) => {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
  };

  texto('kpi-total-proyectos', proyectos.length.toLocaleString('es'));
  texto('kpi-valor-of-total', formatearDinero(valorOf));
  texto('kpi-acumulado-hoy', formatearDinero(acumulado));
  texto('kpi-backlog-2026', formatearDinero(suma('backlog_2026')));
  // Ejecución global = lo ejecutado sobre lo contratado, no el promedio de
  // los porcentajes: un proyecto de 2 millones no pesa igual que uno de 20 mil.
  texto('kpi-pct-ejecucion', valorOf > 0 ? (acumulado / valorOf * 100).toFixed(1) + '%' : '—');

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

function aplicarFiltros() {
  estado.proyectosFiltrados = estado.proyectos.filter(p => {
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
    if (d !== excepto) d.classList.remove('abierto');
  });
}

function construirDropdown(dim) {
  const cont = document.createElement('div');
  cont.className = 'dropdown-filtro';
  cont.dataset.campo = dim.campo;

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'dropdown-boton';
  boton.innerHTML = `<span class="dropdown-etiqueta">${dim.etiqueta}</span>
                     <span class="dropdown-badge"></span>
                     <span class="dropdown-flecha" aria-hidden="true">▾</span>`;
  boton.addEventListener('click', e => {
    e.stopPropagation();
    const abierto = cont.classList.contains('abierto');
    cerrarDropdowns(cont);
    cont.classList.toggle('abierto', !abierto);
  });

  const panel = document.createElement('div');
  panel.className = 'dropdown-panel';

  const opciones = opcionesDe(dim.campo);
  if (opciones.length > 10) {
    const buscador = document.createElement('input');
    buscador.type = 'text';
    buscador.className = 'dropdown-buscar';
    buscador.placeholder = 'Filtrar opciones...';
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
  columnasVerdes.unshift(COL_ID);
  columnasVerdes.push(COL_REVENUE);
  columnasVerdes.forEach((key) => {
    const col = estado.metadataProyectos.columnas.find(c => c.key === key)
      || { label: key === COL_ID ? 'PA / PR' : `Revenue · ${periodoActual().etiqueta}` };
    const th = document.createElement('th');
    const ord = estado.orden || {};
    th.textContent = col.label + (ord.columna === key ? (ord.desc ? '  ↓' : '  ↑') : '');
    th.dataset.columna = key;
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
      let valor = key === COL_REVENUE ? revenuePeriodo(proyecto) : proyecto[key];

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
      } else if (key === COL_REVENUE) {
        td.textContent = valor === null ? '—' : formatearDinero(valor);
        td.className = 'celda-numero';
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

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  // Actualizar indicador
  document.getElementById('indicador-proyectos').textContent =
    `${estado.proyectosFiltrados.length} de ${estado.proyectos.length} proyectos`;
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

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, String(v)));
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
  svg.innerHTML = '';

  const op = opciones || {};
  const fmt = FORMATOS[op.formato] || FORMATOS.dinero;

  if (!datos.length) {
    svg.setAttribute('viewBox', '0 0 600 120');
    const t = svgEl('text', { x: 300, y: 60, 'text-anchor': 'middle',
      'font-size': 13, fill: 'var(--text-dim)' });
    t.textContent = 'Sin datos para los filtros aplicados';
    svg.appendChild(t);
    return;
  }

  // Las etiquetas largas (países, nombres de PM) se dibujan inclinadas.
  const etiquetasLargas = datos.some(d => String(d.etiqueta).length > 9);
  const ancho = svg.clientWidth || 600;
  const alto = etiquetasLargas ? 340 : 280;
  const margen = {
    top: 16, right: 16,
    bottom: etiquetasLargas ? 112 : 44,
    left: etiquetasLargas ? 76 : 62,
  };
  const areaAncho = Math.max(80, ancho - margen.left - margen.right);
  const areaAlto = alto - margen.top - margen.bottom;

  svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
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
      x: -9, y: y + 4, 'font-size': 11, 'text-anchor': 'end',
      fill: 'var(--text-dim)', 'font-variant-numeric': 'tabular-nums',
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
      'font-size': 11, fill: 'var(--text-dim)',
    });
    if (etiquetasLargas) {
      const cx = i * paso + paso / 2;
      lbl.setAttribute('transform', `translate(${cx},${areaAlto + 12}) rotate(-32)`);
      lbl.setAttribute('text-anchor', 'end');
      lbl.textContent = texto.length > 19 ? texto.slice(0, 18) + '…' : texto;
    } else {
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

// ============================================================================
// ACTUALIZACIÓN DE GRÁFICAS
// ============================================================================

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

  // 1. Proyectos por estado. Aquí el color SÍ aporta: son 6 categorías fijas
  //    que el usuario reconoce de un vistazo en todo el dashboard.
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

  // En el resto, el eje X ya identifica cada barra: pintarlas de colores
  // distintos sería decorativo y haría creer que el color significa algo.
  const valorOf = p => (typeof p.valor_of === 'number' ? p.valor_of : 0);

  const porZona = agrupar('zona', valorOf);
  porZona.forEach(d => { d.exacto = dinero(d.valor); });
  crearGraficaBarrasSimple('grafica-zona', porZona, {
    formato: 'dinero', unidad: 'Valor OF',
  });

  const porPais = agrupar('pais', valorOf).slice(0, 10);
  porPais.forEach(d => { d.exacto = dinero(d.valor); });
  crearGraficaBarrasSimple('grafica-paises', porPais, {
    formato: 'dinero', unidad: 'Valor OF',
  });

  // Ejecución promedio por PM: el promedio simple de los proyectos que
  // tienen el dato. Los nulos no cuentan como cero, que sesgaría hacia abajo.
  const suma = new Map(), cuenta = new Map();
  proyectos.forEach(p => {
    if (typeof p.pct_ejecucion_actual !== 'number' || !p.pm_lider) return;
    const k = String(p.pm_lider);
    suma.set(k, (suma.get(k) || 0) + p.pct_ejecucion_actual);
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

  // Secciones de detalle
  const secciones = [
    {
      titulo: 'Identificación',
      campos: ['project_id', 'num_pa', 'num_opp'],
    },
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
      campos: ['estado', 'estatus', 'actions'],
    },
  ];

  secciones.forEach(seccion => {
    const div = document.createElement('div');
    div.className = 'seccion-detalle';

    const h4 = document.createElement('h4');
    h4.textContent = seccion.titulo;
    div.appendChild(h4);

    seccion.campos.forEach(campo => {
      const col = estado.metadataProyectos.columnas.find(c => c.key === campo);
      if (!col) return;

      const divCampo = document.createElement('div');
      divCampo.className = 'campo-detalle';

      const etiqueta = document.createElement('div');
      etiqueta.className = 'etiqueta-campo';
      etiqueta.textContent = col.label;

      const valor = document.createElement('div');
      valor.className = 'valor-campo';

      let contenido = proyecto[campo];
      let html = '';

      // Formateos especiales
      if (CAMPOS_DINERO.has(campo)) {
        html = formatearDinero(contenido);
      } else if (CAMPOS_PORCENTAJE.has(campo)) {
        html = formatearPorcentaje(contenido);
      } else if (campo === 'finalizacion' || campo === 'fecha_fin') {
        html = formatearFecha(contenido);
      } else {
        html = obtenerEtiquetaValor(contenido);
      }

      // Verificar si es recalculado
      if (col.recalculado && proyecto._recalculado && proyecto._recalculado[campo]) {
        html += ' <span class="badge-recalculado" title="El Excel traía un error aquí. ' +
          'Este valor se recalculó a partir de Fecha fin.">recalculado</span>';
      }

      // Verificar si hubo error
      if (proyecto._errores && proyecto._errores[campo]) {
        html += ' <span class="badge-error" title="Error original: ' + proyecto._errores[campo] + '">error</span>';
      }

      valor.innerHTML = html;
      if (!normalizarValor(contenido)) {
        valor.classList.add('nulo');
      }

      divCampo.appendChild(etiqueta);
      divCampo.appendChild(valor);
      div.appendChild(divCampo);
    });

    contenedor.appendChild(div);
  });

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

    const svgRevenue = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
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
      label.style.fontSize = '11px';
      label.style.color = 'var(--text-dim)';
      label.style.textTransform = 'uppercase';
      label.textContent = stat.label;

      const valor = document.createElement('div');
      valor.style.fontSize = '18px';
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
  svg.innerHTML = '';

  const SERIES = ['Commit', 'Upside'];
  const ancho = 900;
  const alto = 320;
  const margen = { top: 34, right: 18, bottom: 46, left: 72 };
  const areaAncho = ancho - margen.left - margen.right;
  const areaAlto = alto - margen.top - margen.bottom;
  svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);

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
    off += 16 + s.length * 6.6 + 18;
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
  svg.innerHTML = '';
  const op = opciones || {};

  const puntos = Object.keys(datos);
  const series = puntos.length ? Object.keys(datos[puntos[0]]) : [];

  // Con una sola carga no hay linea que dibujar, pero el dato SI existe.
  // Decir "sin historico" se lee como "no hay datos" y manda a buscar un fallo
  // que no esta: se muestran los valores de esa carga y por que falta la linea.
  if (puntos.length === 1 && series.length) {
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

  if (puntos.length < 2 || !series.length) {
    svg.setAttribute('viewBox', '0 0 600 120');
    const t = svgEl('text', { x: 300, y: 60, 'text-anchor': 'middle',
      'font-size': 13, fill: 'var(--text-dim)' });
    t.textContent = 'Sin histórico disponible';
    svg.appendChild(t);
    return;
  }

  const ancho = svg.clientWidth || 900;
  const alto = 340;
  const margen = { top: 40, right: 22, bottom: 58, left: 70 };
  const areaAncho = Math.max(120, ancho - margen.left - margen.right);
  const areaAlto = alto - margen.top - margen.bottom;
  svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);

  const g = svgEl('g', { transform: `translate(${margen.left},${margen.top})` });

  const todos = puntos.flatMap(p => series.map(s => datos[p][s] || 0));
  const maxV = Math.max(...todos, 0) || 1;
  const minV = Math.min(...todos, 0);
  const x = i => (areaAncho / Math.max(1, puntos.length - 1)) * i;
  const y = v => areaAlto - ((v - minV) / (maxV - minV || 1)) * areaAlto;
  const colorSerie = i => `var(--series-${Math.min(i + 1, 8)})`;

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

  // Eje X: solo ~7 etiquetas, si no se encabalgan.
  const salto = Math.max(1, Math.ceil(puntos.length / 7));
  puntos.forEach((p, i) => {
    if (i % salto !== 0 && i !== puntos.length - 1) return;
    const lbl = svgEl('text', {
      'font-size': 10, fill: 'var(--text-dim)',
      transform: `translate(${x(i)},${areaAlto + 12}) rotate(-28)`,
      'text-anchor': 'end',
    });
    lbl.textContent = p.length > 16 ? p.slice(0, 15) + '…' : p;
    g.appendChild(lbl);
  });

  // Líneas
  const trazos = {};
  series.forEach((s, si) => {
    const d = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(datos[p][s] || 0)}`).join(' ');
    const trazo = svgEl('path', {
      d, fill: 'none', stroke: colorSerie(si), 'stroke-width': 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    });
    trazos[s] = [trazo];
    g.appendChild(trazo);
    // Con `soloCambios`, el punto se dibuja unicamente donde el valor se
    // movio. Es lo que hace legible "aqui cambio": entre un cambio y otro la
    // linea va limpia, y cada marca es una fecha en la que paso algo.
    puntos.forEach((p, i) => {
      const v = datos[p][s] || 0;
      const cambio = i === 0 || Math.abs(v - (datos[puntos[i - 1]][s] || 0)) > 0.5;
      if (op.soloCambios && !cambio) return;
      const punto = svgEl('circle', {
        cx: x(i), cy: y(v), r: op.soloCambios ? 5 : 4,
        fill: colorSerie(si), stroke: 'var(--surface-1)', 'stroke-width': 2,
      });
      trazos[s].push(punto);
      g.appendChild(punto);
    });
  });

  // Leyenda arriba, fuera del área de datos para no taparlos.
  const leyenda = svgEl('g', { transform: `translate(0,${-22})` });
  const etiquetasLeyenda = [];
  let offset = 0;
  series.forEach((s, si) => {
    const item = svgEl('g', {});
    item.appendChild(svgEl('line', {
      x1: offset, y1: -4, x2: offset + 14, y2: -4,
      stroke: colorSerie(si), 'stroke-width': 2, 'stroke-linecap': 'round',
    }));
    const t = svgEl('text', {
      x: offset + 19, y: 0, 'font-size': 11, fill: 'var(--text-secondary)',
    });
    t.textContent = s;
    item.appendChild(t);
    leyenda.appendChild(item);
    etiquetasLeyenda.push(item);
    offset += 19 + s.length * 6.6 + 16;
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
    mostrarTooltip(ev, puntos[i], series.map((s, si) => ({
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
  const num = v => (typeof v === 'number' ? v : null);
  const valorOf = num(proyecto.valor_of);
  const acum = num(proyecto.acumulado_a_hoy);
  const backlog = num(proyecto.backlog_2026);
  const consumido = num(proyecto.consumido_2025);
  const pct = (valorOf && acum !== null) ? (acum / valorOf) * 100 : null;

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
  cab.appendChild(chips);
  hero.appendChild(cab);

  // --- cifras grandes ---
  const cifras = document.createElement('div');
  cifras.className = 'hero-cifras';
  [
    ['Valor OF', valorOf, 'Por cuánto se vendió el proyecto'],
    ['Acumulado a hoy', acum, 'Revenue ya ejecutado'],
    ['Backlog 2026', backlog, 'Lo que queda por ejecutar'],
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
  if (valorOf && acum !== null) {
    const bloque = document.createElement('div');
    bloque.className = 'hero-avance';

    const fila = document.createElement('div');
    fila.className = 'hero-avance-cab';
    const izq = document.createElement('span');
    izq.innerHTML = `Ejecución del contrato · <strong>${pct.toFixed(1)}%</strong>`;
    const der = document.createElement('span');
    der.className = 'hero-avance-nota';
    der.textContent = `${formatearDinero(acum)} de ${formatearDinero(valorOf)}`;
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
  const hermanos = estado.proyectos.filter(
    p => p.cliente === proyecto.cliente && p !== proyecto);
  if (!hermanos.length) return;

  const div = document.createElement('div');
  div.className = 'detalle-trazabilidad';
  const h4 = document.createElement('h4');
  h4.textContent = `Otros proyectos de ${proyecto.cliente} (${hermanos.length})`;
  div.appendChild(h4);

  const totalCliente = [proyecto, ...hermanos]
    .reduce((a, p) => a + (typeof p.valor_of === 'number' ? p.valor_of : 0), 0);
  const nota = document.createElement('p');
  nota.className = 'nota-tabla';
  nota.textContent = `Valor OF de la cuenta completa: ${formatearDinero(totalCliente)}`;
  div.appendChild(nota);

  const t = document.createElement('table');
  t.className = 'tabla-eventos-proyecto';
  const th = document.createElement('thead');
  const trh = document.createElement('tr');
  ['PA / PR', 'Proyecto', 'Estado', 'PM/Líder', 'Valor OF', `Revenue · ${periodoActual().etiqueta}`]
    .forEach(x => { const e = document.createElement('th'); e.textContent = x; trh.appendChild(e); });
  th.appendChild(trh); t.appendChild(th);

  const tb = document.createElement('tbody');
  hermanos
    .sort((a, b) => (b.valor_of || 0) - (a.valor_of || 0))
    .forEach(h => {
      const tr = document.createElement('tr');
      tr.className = 'fila-clicable';
      tr.addEventListener('click', () => abrirDetalle(h));
      const rev = revenuePeriodo(h);
      [[identificador(h).valor, 'celda-id'],
        [h.nombre_del_proyecto || '—', 'celda-nombre'],
        [h.estado || '—', ''],
        [h.pm_lider || '—', ''],
        [formatearDinero(h.valor_of), 'celda-numero'],
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
    notaBVR.textContent = 'El Commit es acumulado (enero, enero+febrero, …) y el Backlog es ' +
      'lo que queda de Valor OF en ese punto del año: Valor OF − Acum 2025 − Commit acumulado.';
    divBVR.appendChild(notaBVR);
    const svgBVR = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgBVR.setAttribute('class', 'grafica-svg');
    divBVR.appendChild(svgBVR);
    crearGraficaLinea(svgBVR, serieBacklogRevenuePorMes([proyecto]));
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

function renderizarTrazabilidad() {
  if (!estado.historia) {
    const panel = document.getElementById('pestana-trazabilidad');
    const notificacion = panel.querySelector('.panel-trazabilidad') || panel;
    notificacion.innerHTML = '<div style="padding: var(--spacing-lg); color: var(--text-secondary);">' +
      'Historial de revenue no disponible (aún no generado).</div>';
    return;
  }

  // El selector de periodo se monta una sola vez, arriba de las gráficas.
  const anfitrion = document.getElementById('periodo-trazabilidad');
  if (anfitrion && !anfitrion.children.length) {
    anfitrion.appendChild(construirSelectorPeriodo(renderizarTrazabilidad));
  }

  const snaps = estado.historia.snapshots;
  const meses = mesesActivos();
  const periodo = periodoActual();

  // --- gráfica 1: revenue del periodo elegido, a lo largo de los snapshots ---
  const serieTotal = {};
  snaps.forEach(snap => {
    let fijo = 0, upside = 0;
    meses.forEach(i => {
      const m = snap.por_mes[MESES_ES[i]];
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
      fila[nombre] = idxs.reduce((acc, i) => acc + ((snap.por_mes[MESES_ES[i]] || {}).fijo || 0), 0);
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
    selA.addEventListener('change', renderizarResumenProyectos);
    selB.addEventListener('change', renderizarResumenProyectos);

    const chk = document.getElementById('chk-solo-cambios');
    if (chk) chk.addEventListener('change', renderizarResumenProyectos);

    document.querySelectorAll('.atajo-rango').forEach(btn => {
      btn.addEventListener('click', () => {
        const [a, b] = rangoPredefinido(btn.dataset.rango, snaps);
        selA.value = a;
        selB.value = b;
        document.querySelectorAll('.atajo-rango').forEach(o => o.classList.remove('activo'));
        btn.classList.add('activo');
        renderizarResumenProyectos();
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
 * Backlog vs Revenue, mes a mes del año actual (no por snapshot/movimiento:
 * eso ya lo muestran las otras gráficas de esta pestaña). Global por
 * defecto; si se elige un PM, solo entre sus proyectos. Ver
 * serieBacklogRevenuePorMes() para la cuenta exacta.
 */
function renderizarGraficaBacklogVsRevenue() {
  const svg = document.getElementById('grafica-backlog-vs-revenue');
  if (!svg) return;
  const sel = document.getElementById('select-pm-backlog-revenue');
  const pmElegido = sel ? sel.value : '';

  const proyectos = pmElegido
    ? estado.proyectos.filter(p => p.pm_lider === pmElegido)
    : estado.proyectos;
  crearGraficaLinea(svg, serieBacklogRevenuePorMes(proyectos));

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
  const conEventos = new Set(estado.historia.eventos.map(e => e.snapshot_id));
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
  const mesesOk = new Set(mesesActivos().map(i => MESES_ES[i]));

  // Eventos del rango, agrupados por proyecto. Commit y Upside se tratan
  // independientes: la magnitud real de cada uno sale de dFijo/dUpside (la
  // resta entre snapshots), no de sumar montos de eventos por "dirección".
  const porPA = new Map();
  hist.eventos.forEach(e => {
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
  graficaQueCambio = null;

  const movidos = filas.filter(f => f.cambio).slice(0, MAX_LINEAS_CAMBIO);
  if (!movidos.length || iB - iA < 1) {
    svg.innerHTML = '';
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

  const soloCambios = document.getElementById('chk-solo-cambios');
  const visibles = (soloCambios && soloCambios.checked)
    ? filas.filter(f => f.cambio) : filas;

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

  const nombreDe = new Map(estado.proyectos.map(
    p => [claveProyecto(p), p.nombre_del_proyecto || identificador(p).valor]));

  const mesesOk = new Set(mesesActivos().map(i => MESES_ES[i]));
  let eventos = hist.eventos.filter(e => {
    if (e.campo && !mesesOk.has(e.campo)) return false;   // mes fuera del periodo
    if (tipo && e.tipo !== tipo) return false;
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
    const fecha = new Date(ev.timestamp).toLocaleDateString('es-CO',
      { day: '2-digit', month: 'short', year: 'numeric' });
    const d = ev.delta || 0;
    const signo = Math.abs(d) < 0.5 ? '—' : (d > 0 ? '+' : '−') + formatearDinero(Math.abs(d));

    [[fecha, ''], [nombre, 'celda-nombre'],
      [(TIPO_MOVIMIENTO[ev.tipo] || { texto: ev.tipo || '' }).texto, ''],
      [ev.campo ? ev.campo.charAt(0).toUpperCase() + ev.campo.slice(1) : '—', ''],
      [formatearDinero(ev.valor_anterior), 'celda-numero'],
      [formatearDinero(ev.valor_nuevo), 'celda-numero'],
      [signo, 'celda-numero ' + (Math.abs(d) < 0.5 ? '' : d > 0 ? 'delta-positivo' : 'delta-negativo')],
    ].forEach(([txt, c], i) => {
      const td = document.createElement('td');
      td.textContent = txt;
      td.className = c;
      if (i === 1) td.title = txt;
      tr.appendChild(td);
    });
    tabla.appendChild(tr);
  });

  const distintos = new Set(mostrados.map(e => e.num_pa)).size;
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

// ============================================================================
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
const CLAVE_ESTADO_PM = { 'In Progress': 'inProgreso', 'On Hold': 'onHold', 'Planned': 'planned' };

function calcularPMs() {
  const porPM = new Map();
  estado.proyectos.forEach(p => {
    if (!estado.incluirCancelados && p.estado === 'Canceled') return;
    const pm = p.pm_lider || SIN_DATO;
    if (!porPM.has(pm)) {
      porPM.set(pm, {
        pm,
        inProgresoN: 0, inProgresoBacklog: 0,
        onHoldN: 0, onHoldBacklog: 0,
        plannedN: 0, plannedBacklog: 0,
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
      const backlogValor = fila && typeof fila.backlog === 'number' ? fila.backlog : 0;
      acc[clave + 'N'] += 1;
      acc[clave + 'Backlog'] += backlogValor;
      acc.totalN += 1;
      acc.totalBacklog += backlogValor;
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

  const thead = document.querySelector('#tabla-pms thead tr');
  if (thead && !thead.dataset.wireado) {
    thead.dataset.wireado = '1';
    thead.querySelectorAll('th[data-columna]').forEach(th => {
      th.style.cursor = 'pointer';
      th.title = `Ordenar por ${th.textContent}`;
      th.addEventListener('click', () => ordenarTablaPMs(th.dataset.columna));
    });
  }

  let filas = calcularPMs();

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

  const tbody = document.querySelector('#tabla-pms tbody');
  tbody.innerHTML = '';
  const columnas = ['inProgresoN', 'inProgresoBacklog', 'onHoldN', 'onHoldBacklog',
    'plannedN', 'plannedBacklog', 'totalN', 'totalBacklog',
    'commit', 'upside', 'totalEjecutado', 'promedioMensual', 'promedioProyecto'];

  filas.forEach(f => {
    const tr = document.createElement('tr');
    tr.className = 'fila-clicable';
    tr.title = `Ver los proyectos de ${f.pm} en Listado de Proyectos`;
    tr.addEventListener('click', () => irAProyectosDePM(f.pm));

    const tdPM = document.createElement('td');
    tdPM.textContent = f.pm;
    tdPM.className = 'celda-nombre';
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
  });

  // Fila de totales, igual a "Total Result" de la tabla de negocio.
  const tfoot = document.querySelector('#tabla-pms tfoot');
  tfoot.innerHTML = '';
  if (filas.length) {
    const trTotal = document.createElement('tr');
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

/** Clic en un PM: filtra Listado de Proyectos a sus proyectos y cambia de
 * pestaña. Reusa el filtro que ya existe en vez de construir una vista de
 * proyectos nueva. */
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
// NAVEGACIÓN
// ============================================================================

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
}

// ============================================================================
// ACTUALIZACIÓN GENERAL DE UI
// ============================================================================

function actualizarUI() {
  calcularKPIs();
  renderizarTabla();
  actualizarGraficas();
  document.getElementById('indicador-proyectos').textContent =
    `${estado.proyectosFiltrados.length} de ${estado.proyectos.length} proyectos`;
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

  // Abrir la pestaña que venga en la URL (#trazabilidad, #detalle/65085...).
  const [vista, pa] = decodeURIComponent(location.hash.slice(1)).split('/');
  if (vista === 'detalle' && pa) {
    const p = estado.proyectos.find(x => String(x.num_pa) === pa);
    if (p) { estado.proyectoSeleccionado = p; cambiarPestana('detalle', true); }
  } else if (vista === 'trazabilidad' || vista === 'detalle' || vista === 'pms') {
    cambiarPestana(vista, true);
  }

  // Ajustar tamaño de gráficas en resize
  window.addEventListener('resize', () => {
    actualizarGraficas();
  });
}

// Iniciar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', inicializar);

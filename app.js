/**
 * Dashboard de Proyectos - Red Hat LATAM
 * Aplicación principal en JavaScript vanilla
 */

import { estado } from './js/estado.js';
import { obtenerTimeline } from './js/api.js';
import {
  formatearNumero,
  formatearDineroExacto,
} from './js/formato.js';
import {
  PERIODOS,
  configurarCalendarioTimeline,
  anioRevenue,
  periodoActual,
} from './js/calendario.js';
import {
  normalizarNombre,
  valorBooking,
  revenuePeriodo,
  ejecutadoProyecto,
  backlogHoy,
} from './js/dinero-proyecto.js';
import {
  calcularKPIs,
} from './js/kpis.js';
import {
  DIMENSIONES,
  SIN_DATO,
  valorDimension,
  pasaVisibilidadProyecto,
} from './js/filtros.js';
import {
  inicializarFiltroTerritorio,
  inicializarFiltros,
  cerrarDropdowns,
} from './js/filtros-ui.js';
import { configurarSelectorForecast } from './js/selector-forecast.js';
import { registrarVistas } from './js/vistas.js';
import { identificador } from './js/campos-proyecto.js';
import { renderizarTabla } from './js/listado-proyectos.js';
import { cargarAnchosDeStorage, asegurarResizers, setupMutationObserver } from './js/columnas-redimensionables.js';
import { svgEl } from './js/grafica-base.js';
import { ocultarTooltip } from './js/grafica-tooltip.js';
import { ajustarGraficasVisibles } from './js/grafica-registro.js';
import { actualizarGraficas } from './js/graficas-inicio.js';
import { renderizarTablaNoIniciados } from './js/tabla-no-iniciados.js';
import { abrirDetalle, renderizarDetalle } from './js/detalle.js';
import { renderizarTrazabilidad } from './js/trazabilidad-global.js';
import { calcularCambios } from './js/snapshots-cambios.js';
import { renderizarPMs } from './js/pms-vista.js';
import { calcularPMs } from './js/pms-calculo.js';

// Las vistas que los filtros repintan siguen aquí; se registran con llamadas
// que se resuelven al ejecutar, como antes cuando eran funciones del mismo archivo.
registrarVistas({
  actualizarUI: () => actualizarUI(),
  renderizarDetalle,
  renderizarTrazabilidad: () => renderizarTrazabilidad(),
  renderizarPMs: () => renderizarPMs(),
  abrirDetalle,
  cambiarPestana: (nombre, omitirHash) => cambiarPestana(nombre, omitirHash),
});

// ============================================================================
// FUNCIONES DE CARGA DE DATOS
// ============================================================================

async function cargarDatos() {
  const principal = document.querySelector('.contenedor-principal');
  const aviso = document.getElementById('forecast-estado');
  try {
    const datos = await obtenerTimeline();
    const {meta,proyectos,backlog,historia}=datos;
    estado.forecast={timeline:true,anio:meta.anio_actual,periodos:meta.periodos};
    estado.metadataProyectos=meta;estado.metadataBacklog=meta;
    estado.proyectos=proyectos.filter(p=>p._tipo_fila==='proyecto');
    estado.backlog=backlog.filter(p=>p._tipo_fila==='proyecto');estado.historia=historia;
    estado.backlogPorPA=new Map();estado.backlogPorNombre=new Map();estado.backlogPorTimeline=new Map();
    estado.backlog.forEach(b=>{
      estado.backlogPorTimeline.set(b.clave_timeline,b);
      if(b.num_pa!=null&&b.num_pa!=='')estado.backlogPorPA.set(String(b.num_pa),b);
      const n=normalizarNombre(b.nombre_del_proyecto);if(n&&!estado.backlogPorNombre.has(n))estado.backlogPorNombre.set(n,b);
    });
    configurarCalendarioTimeline(meta);
    estado.proyectosFiltrados=[...estado.proyectos];
    const vacio=meta.estado==='sin_datos';principal.classList.toggle('forecast-sin-datos',vacio);
    aviso.textContent=vacio?'Todavía no hay datos guardados. Ejecuta la carga de n8n.':
      `${estado.proyectos.length} proyectos · ${meta.periodos[0]} a ${meta.periodos.at(-1)} · calendario consolidado`;
    return true;
  } catch(err) {
    console.error('Error cargando timeline:',err);principal.classList.add('forecast-sin-datos');
    aviso.textContent='No se pudo cargar el timeline: '+err.message;return false;
  }
}


// ============================================================================
// FUNCIONES DE FILTRADO
// ============================================================================

// ============================================================================
// KPIs
// ============================================================================


















// ============================================================================
// FILTROS
// ============================================================================








/**
 * Con qué número se identifica un proyecto. El negocio usa el PA, pero
 * mientras no se lo asignan se guían por el PR. En la hoja hay 22 proyectos
 * cuyo "# PA" trae en realidad un PR, y 14 sin PA (13 de ellos cancelados).
 */



















// ============================================================================
// GRÁFICAS (SVG inline)
// ============================================================================
































// ============================================================================
// NAVEGACIÓN
// ============================================================================


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
    : estado.proyectos.filter(pasaVisibilidadProyecto);
  const sumar = fn => {
    const valores = proyectos.map(fn).filter(Number.isFinite);
    return valores.length || !proyectos.length ? valores.reduce((s, v) => s + v, 0) : null;
  };
  const booking = sumar(valorBooking), acumulado = sumar(ejecutadoProyecto);
  const perfiles = [estado.forecast.timeline?'Timeline · '+periodoActual().etiqueta:`Forecast ${anioRevenue()}`];
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
  const completos = proyectos.filter(p => [valorBooking(p), ejecutadoProyecto(p), backlogHoy(p)].every(Number.isFinite)).length;
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
    `${estado.proyectosFiltrados.length} de ${estado.proyectos.filter(pasaVisibilidadProyecto).length} proyectos`;
}

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

async function inicializar() {
  // Cargar datos
  const datosOK = await cargarDatos();
  configurarSelectorForecast();
  inicializarFiltroTerritorio();
  if (!datosOK || estado.metadataProyectos?.estado === 'sin_datos') return;

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

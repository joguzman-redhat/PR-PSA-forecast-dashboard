/**
 * Dashboard de Proyectos - Red Hat LATAM
 * Aplicación principal en JavaScript vanilla
 */

import { estado } from './js/estado.js';
import { obtenerTimeline } from './js/api.js';
import {
  formatearDinero,
  formatearNumero,
  formatearDineroExacto,
  formatearPorcentaje,
  formatearFecha,
  normalizarValor,
  obtenerEtiquetaValor,
} from './js/formato.js';
import {
  NOMBRES_MESES,
  MESES_ES,
  PERIODOS,
  configurarCalendarioTimeline,
  etiquetaPeriodoCalendario,
  anioRevenue,
  periodoActual,
  mesesActivos,
  sumarMeses,
  coberturaCalendario,
  compararMeses,
} from './js/calendario.js';
import {
  normalizarNombre,
  backlogDe,
  valorBooking,
  acumuladoAnterior,
  revenuePeriodo,
  upsidePeriodo,
  ejecutadoProyecto,
  backlogHoy,
  proyectadaAnio,
  porcentajeEjecucionProyecto,
} from './js/dinero-proyecto.js';
import {
  mesFinalizacion,
  periodoFinProyecto,
  vidaProyecto,
  pasaPeriodoProyecto,
  calendarioVidaProyecto,
  indicesVidaProyecto,
} from './js/vida-proyecto.js';
import {
  serieBacklogRevenuePorMes,
  serieSaldoProyecto,
} from './js/series-revenue.js';
import {
  calcularKPIs,
} from './js/kpis.js';
import {
  DIMENSIONES,
  SIN_DATO,
  valorDimension,
  pasaTerritorio,
  pasaVisibilidadProyecto,
} from './js/filtros.js';
import {
  aplicarFiltros,
  inicializarFiltroTerritorio,
  inicializarFiltros,
  cerrarDropdowns,
} from './js/filtros-ui.js';
import { configurarSelectorForecast } from './js/selector-forecast.js';
import { construirSelectorPeriodo } from './js/selector-periodo.js';
import { registrarVistas } from './js/vistas.js';
import { CAMPOS_DINERO, CAMPOS_PORCENTAJE, CAMPOS_ID, identificador, claseVencimiento } from './js/campos-proyecto.js';
import { renderizarTabla } from './js/listado-proyectos.js';
import { cargarAnchosDeStorage, asegurarResizers, setupMutationObserver } from './js/columnas-redimensionables.js';
import { crearGraficaLinea } from './js/grafica-linea.js';
import { crearGraficaBarrasSimple } from './js/grafica-barras-simple.js';
import { svgEl, escalaTexto, colorDeEntidad } from './js/grafica-base.js';
import { mostrarTooltip, moverTooltip, ocultarTooltip } from './js/grafica-tooltip.js';
import { registrarGrafica, ajustarGraficasVisibles, graficaQueCambioActual, fijarGraficaQueCambio } from './js/grafica-registro.js';
import { chip } from './js/chip.js';
import { actualizarGraficas } from './js/graficas-inicio.js';
import { renderizarTablaNoIniciados } from './js/tabla-no-iniciados.js';

// Las vistas que los filtros repintan siguen aquí; se registran con llamadas
// que se resuelven al ejecutar, como antes cuando eran funciones del mismo archivo.
registrarVistas({
  actualizarUI: () => actualizarUI(),
  renderizarDetalle: () => renderizarDetalle(),
  renderizarTrazabilidad: () => renderizarTrazabilidad(),
  renderizarPMs: () => renderizarPMs(),
  abrirDetalle: proyecto => abrirDetalle(proyecto),
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















function pintarProyeccionBacklogRevenue(svg, proyectos, nota) {
  if(estado.forecast.timeline) {
    svg.dataset.tituloReporte='Commit y Upside mensual · '+periodoActual().etiqueta;
    crearGraficaLinea(svg,serieBacklogRevenuePorMes(proyectos),{ejeX:'categoria',unidad:'Commit y Upside mensual'});
    if(nota)nota.textContent='Calendario de los Excel por mes y año. Los meses sin información quedan sin dato; no se estima revenue fuera de las fuentes.';
    return;
  }
  const datos = serieBacklogRevenuePorMes(proyectos);
  const tieneEstimacion = Object.keys(datos).length > 12;
  crearGraficaLinea(svg, datos, {
    ejeX: 'categoria', desdeEstimado: tieneEstimacion ? 12 : null,
    unidad: `Backlog y Commit acumulado desde enero de ${anioRevenue()}`,
  });
  if (nota) {
    nota.textContent = `Fecha de inicio aún no cargada: calendario desde enero de ${anioRevenue()}. `
      + 'El Commit es acumulado y el Backlog de diciembre corresponde al de BackLog NOLA. '
      + (tieneEstimacion ? `Desde enero de ${anioRevenue() + 1}, las líneas discontinuas muestran el reparto uniforme estimado del backlog hasta la fecha fin de cada proyecto. ` : '')
      + (proyectos.some(p => Number.isFinite(backlogHoy(p)) && backlogHoy(p) !== 0 &&
        (mesFinalizacion(p) === null || mesFinalizacion(p) <= anioRevenue() * 12 + 11))
        ? `Los proyectos sin fecha fin posterior a ${anioRevenue()} conservan su backlog pendiente.` : '');
  }
}



// ============================================================================
// FILTROS
// ============================================================================








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
  if(p.clave_timeline)return p.clave_timeline;
  if (p.num_pa !== null && p.num_pa !== undefined && p.num_pa !== '') {
    return String(p.num_pa);
  }
  // La historia se genera desde BackLog NOLA, asi que para los proyectos sin
  // PA la clave es el numero de fila DE ESA hoja, que no es el de esta.
  const enBacklog = backlogDe(p);
  return `fila-${enBacklog ? enBacklog._fila_excel : p._fila_excel}`;
}







function clavesProyectosOcultos() {
  return new Set(estado.proyectos
    .filter(p => !pasaVisibilidadProyecto(p)).map(claveProyecto));
}












// ============================================================================
// GRÁFICAS (SVG inline)
// ============================================================================


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
  if (!proyecto || !pasaTerritorio(proyecto)) {
    contenedor.textContent='Selecciona en el listado un proyecto del territorio elegido para ver su detalle.';
    return;
  }

  contenedor.innerHTML = '';
  renderizarEncabezadoProyecto(contenedor, proyecto);
  const alcance=document.createElement('p');alcance.className='nota-periodo';
  alcance.textContent='Detalle de toda la vida del proyecto; el rango global no recorta estas gráficas.';
  contenedor.appendChild(alcance);

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
    h4.textContent = 'Revenue detallado · vida completa del proyecto';
    divRevenue.appendChild(h4);
    if (estado.forecast.timeline) {
      const vida = vidaProyecto(proyecto);
      const nota = document.createElement('p'); nota.className = 'nota-periodo';
      nota.textContent = `Primer commit registrado: ${vida.inicio ? etiquetaPeriodoCalendario(vida.inicio) : 'sin commit registrado'}. Fecha fin: ${vida.fin ? etiquetaPeriodoCalendario(vida.fin) : 'sin fecha fin'}.`;
      if (vida.fueraDeVigencia) nota.textContent += ' La fuente contiene importes fuera de estas fechas; se conservan en los totales del periodo y requieren revisión.';
      divRevenue.appendChild(nota);
    }
    if (!estado.forecast.timeline) divRevenue.appendChild(construirSelectorPeriodo(renderizarDetalle));

    // Gráfica de barras apiladas (fijo vs upside), solo los meses del periodo
    const meses = calendarioVidaProyecto(proyecto);

    const datosGrafica = {};
    meses.forEach(mes => {
      datosGrafica[mes] = {
        'Commit': datosBacklog[mes + '_fijo'] ?? null,
        'Upside': datosBacklog[mes + '_upside'] ?? null,
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
      etiquetaPeriodoCalendario(mes), datosGrafica[mes],
    ]));
    crearGraficaLinea(svgTendencia, datosTendencia, {
      ejeX: 'categoria', unidad: 'Tendencia mensual de Commit y Upside', etiquetasValores:true,
    });

    const svgRevenue = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgRevenue.id = 'grafica-revenue-barras';
    svgRevenue.dataset.tituloReporte = 'Revenue mensual · vida completa del proyecto';
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
    if(estado.forecast.timeline) {
      const quarters=new Map();
      meses.forEach(m=>{const key='Q'+Math.ceil(Number(m.slice(5))/3)+' '+m.slice(0,4);
        const old=quarters.get(key)||{valor:0,n:0};if(typeof datosBacklog[m+'_fijo']==='number'){old.valor+=datosBacklog[m+'_fijo'];old.n++;}quarters.set(key,old);});
      stats=[...quarters].map(([label,v])=>({label,valor:v.n?v.valor:null}));
    } else if (estado.periodo === 'anio') {
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
    divStats.style.gridTemplateColumns = `repeat(${Math.min(Math.max(stats.length,1),4)}, minmax(0, 1fr))`;

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
  const anchoBarra = Math.max(1,Math.min(46, paso - 6));

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
      const valor=svgEl('text',{x:x+anchoBarra/2,y:Math.max(10,Math.min(areaAlto-2,Math.min(y0,y1)-4)),'text-anchor':'middle',class:'valor-punto'});
      valor.textContent=formatearDinero(v);g.appendChild(valor);
    });

    // Zona sensible: toda la columna, no solo la barra.
    const zona = svgEl('rect', { x: i * paso, y: 0, width: paso, height: areaAlto, fill: 'transparent' });
    zona.style.cursor = 'pointer';
    zona.addEventListener('mouseenter', ev => mostrarTooltip(ev,
      etiquetaPeriodoCalendario(m),
      SERIES.map((s, si) => ({
        color: `var(--series-${si + 1})`,
        etiqueta: s,
        valor: Number.isFinite((datos[m]||{})[s])?'$'+vals[si].toLocaleString('en-US',{maximumFractionDigits:0}):'Sin dato',
      }))));
    zona.addEventListener('mousemove', moverTooltip);
    zona.addEventListener('mouseleave', ocultarTooltip);
    g.appendChild(zona);

    const lbl = svgEl('text', {
      x: i * paso + paso / 2, y: areaAlto + 16,
      'font-size': 10, 'text-anchor': 'middle', fill: 'var(--text-dim)',
    });
    lbl.textContent = estado.forecast.timeline ? ((i%Math.ceil(meses.length/10)===0||i===meses.length-1)?etiquetaPeriodoCalendario(m):'') : m.slice(0,3);
    if(estado.forecast.timeline&&!SERIES.some(s=>Number.isFinite((datos[m]||{})[s]))) {
      const vacio=svgEl('text',{x:i*paso+paso/2,y:yCero-6,'font-size':9,'text-anchor':'middle',fill:'var(--text-dim)'});vacio.textContent='s/d';g.appendChild(vacio);
    }
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


/**
 * Cabecera del detalle: de quién es el proyecto y cómo va, en una sola mirada.
 *
 * Antes esta información estaba repartida en cuadrículas de etiqueta/valor,
 * todas con el mismo peso visual. Lo que el negocio mira primero —cuánto vale,
 * cuánto se ejecutó y cuánto queda— tiene que verse primero.
 */
function renderizarEncabezadoProyecto(contenedor, proyecto) {
  const booking = valorBooking(proyecto);
  const acum = ejecutadoProyecto(proyecto);
  const backlog = backlogHoy(proyecto);
  const consumido = acumuladoAnterior(proyecto);
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
    ['Backlog', backlog, 'Backlog de la fuente: ya descuenta el Commit planeado del año de referencia'],
    [`Acumulado anterior a ${anioRevenue()}`, consumido, `Revenue acumulado previo al año de referencia ${anioRevenue()}`],
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
    const ayuda=document.createElement('button');ayuda.type='button';ayuda.className='ayuda-kpi';ayuda.textContent='?';ayuda.title=tip;ayuda.setAttribute('aria-label',tip);l.appendChild(ayuda);
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
  const hermanos = todosHermanos.filter(pasaVisibilidadProyecto);

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

  const totalCliente = [proyecto, ...todosHermanos].filter(pasaVisibilidadProyecto)
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
        td.className = c || "";if(td.textContent==="On Hold")td.classList.add("estado-on-hold");
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
  const indices=indicesVidaProyecto(proyecto);
  const sumarVida=meses=>indices.reduce((a,i)=>({fijo:a.fijo+(meses?.[i]?.[0]||0),upside:a.upside+(meses?.[i]?.[1]||0)}),{fijo:0,upside:0});
  const hist = estado.historia;
  const pa = claveProyecto(proyecto);
  const serie = hist && hist.series_por_proyecto && hist.series_por_proyecto[pa];

  const div = document.createElement('div');
  div.className = 'detalle-trazabilidad';
  const h4 = document.createElement('h4');
  h4.textContent = 'Trazabilidad de Revenue · vida completa del proyecto';
  div.appendChild(h4);

  // --- Backlog vs. Revenue, mes a mes del año actual. Va antes del resto a
  // propósito: solo necesita el estado actual (BackLog NOLA), no el
  // histórico de snapshots, así que se ve aunque el proyecto no tenga
  // histórico todavía.
  if (backlogDe(proyecto)) {
    const divBVR = document.createElement('div');
    divBVR.className = 'detalle-revenue';
    const h4bvr = document.createElement('h4');
    h4bvr.textContent = 'Backlog contractual vs. revenue acumulado · vida completa';
    divBVR.appendChild(h4bvr);
    const notaBVR = document.createElement('p');
    notaBVR.className = 'nota-grafica';
    divBVR.appendChild(notaBVR);
    const svgBVR = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgBVR.id = 'grafica-backlog-proyecto';
    svgBVR.setAttribute('class', 'grafica-svg');
    divBVR.appendChild(svgBVR);
    const saldo=serieSaldoProyecto(proyecto);
    crearGraficaLinea(svgBVR,saldo.datos,{ejeX:'categoria',unidad:'Saldo contractual y revenue acumulado',etiquetasValores:true});
    notaBVR.textContent=saldo.nota;
    div.appendChild(divBVR);
  }

  if (!serie || serie.length < 2) {
    const p = document.createElement('p');
    p.className = 'aviso-sin-datos';
    p.textContent = 'Todavía no hay suficientes capturas para comparar cambios de este proyecto.';
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
    const t = sumarVida(s.meses);          // solo los meses del periodo
    evolucion[etiquetaDe(s.snapshot_id)] = { 'Commit': t.fijo, 'Upside': t.upside };
  });
  // ¿Hubo algún movimiento en el periodo elegido? Una línea plana no comunica
  // nada: si el dato nunca se movió, es más honesto decirlo con palabras.
  const etiquetas = Object.keys(evolucion);
  const valores = Object.values(evolucion);
  const fechasCambio = etiquetas.filter((_, i) => {
    if(!i)return false;
    if(estado.forecast.timeline){const c=compararMeses(serie[i-1],serie[i],indices);return Math.abs(c.fijoB-c.fijoA)>.5||Math.abs(c.upsideB-c.upsideA)>.5;}
    return Math.abs(valores[i].Commit-valores[i-1].Commit)>.5||Math.abs(valores[i].Upside-valores[i-1].Upside)>.5;
  });

  const resumen = document.createElement('p');
  resumen.className = 'resumen-cambios';
  div.appendChild(resumen);

  if (!fechasCambio.length) {
    const t = sumarVida(serie[serie.length - 1].meses);
    resumen.innerHTML = estado.forecast.timeline && serie.some((x,i)=>i&&compararMeses(serie[i-1],x,indices).nuevos>0)
      ? 'Se incorporaron meses de otro año. No se detectaron variaciones en los meses comparables.'
      : (Math.abs(t.fijo) < 1 && Math.abs(t.upside) < 1)
      ? `Este proyecto no tiene revenue en <strong>vida completa del proyecto</strong>.`
      : `El revenue de <strong>vida completa del proyecto</strong> nunca se movió: ` +
        `${formatearDinero(t.fijo)} en Commit desde el primer corte hasta hoy.`;
  } else {
    resumen.innerHTML = `<strong>${fechasCambio.length}</strong> ` +
      `movimiento${fechasCambio.length === 1 ? '' : 's'} en ` +
      `<strong>vida completa del proyecto</strong> · ` +
      `${fechasCambio.slice(0, 6).join(' · ')}${fechasCambio.length > 6 ? ' …' : ''}`;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.className.baseVal = 'grafica-svg';
    div.appendChild(svg);
    // soloCambios: el punto se dibuja donde pasó algo, no en los 32 cortes.
    crearGraficaLinea(svg, evolucion, { soloCambios: true, etiquetasValores:true });
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

  const idxMeses = indices;

  function pintarTablaMeses() {
    const a = serie[Number(selA.value)];
    const b = serie[Number(selB.value)];
    tablaMeses.innerHTML = '';

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    ['Mes', `Commit · #${a.snapshot_id.replace(/^t/,'')}`, `Commit · #${b.snapshot_id.replace(/^t/,'')}`,
      'Δ Commit', `Upside · #${a.snapshot_id.replace(/^t/,'')}`, `Upside · #${b.snapshot_id.replace(/^t/,'')}`, 'Δ Upside']
      .forEach(t => { const th = document.createElement('th'); th.textContent = t; trh.appendChild(th); });
    thead.appendChild(trh);
    tablaMeses.appendChild(thead);

    const tbody = document.createElement('tbody');
    let tfa = 0, tfb = 0, tua = 0, tub = 0;

    idxMeses.forEach(i => {
      const m = MESES_ES[i];
      const [fa, ua] = a.meses[i] || [0, 0];
      const [fb, ub] = b.meses[i] || [0, 0];
      const comparable=!estado.forecast.timeline||(Number.isFinite(fa)&&Number.isFinite(fb)&&Number.isFinite(ua)&&Number.isFinite(ub));
      if(comparable){tfa+=fa;tfb+=fb;tua+=ua;tub+=ub;}
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
      celda(comparable?delta(fb-fa):'—', 'celda-numero '+(comparable?claseDelta(fb-fa):''));
      celda(formatearDinero(ua), 'celda-numero');
      celda(formatearDinero(ub), 'celda-numero');
      celda(comparable?delta(ub-ua):'—', 'celda-numero '+(comparable?claseDelta(ub-ua,true):''));
      tbody.appendChild(tr);
    });

    const trt = document.createElement('tr');
    trt.className = 'fila-total';
    [[estado.forecast.timeline?'Total comparable':'Total', ''], [formatearDinero(tfa), 'celda-numero'], [formatearDinero(tfb), 'celda-numero'],
      [delta(tfb - tfa), 'celda-numero ' + claseDelta(tfb - tfa)],
      [formatearDinero(tua), 'celda-numero'], [formatearDinero(tub), 'celda-numero'],
      [delta(tub - tua), 'celda-numero ' + claseDelta(tub - tua, true)]]
      .forEach(([t, c]) => { const td = document.createElement('td'); td.textContent = t; td.className = c || "";if(td.textContent==="On Hold")td.classList.add("estado-on-hold"); trt.appendChild(td); });
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
      formatearDinero(hist.meta.umbral_evento_usd ?? MINIMO_CAMBIO) + '. La tabla de arriba muestra el detalle completo.';
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
            const td = document.createElement('td'); td.textContent = txt; td.className = c || "";if(td.textContent==="On Hold")td.classList.add("estado-on-hold"); tr.appendChild(td);
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
  clavesProyectosOcultos().forEach(clave => {
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
  if (!estado.forecast.timeline && anfitrion && !anfitrion.children.length) {
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
    serieTotal[snap.etiqueta] = { 'Commit': coberturaCalendario(snap)?fijo:null, 'Upside': coberturaCalendario(snap)?upside:null };
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
      fila[nombre] = coberturaCalendario(snap,idxs)?idxs.reduce((acc,i)=>acc+((mesesPorSnapshot.get(snap.id)[MESES_ES[i]]||{}).fijo||0),0):null;
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
    estado.proyectos.filter(pasaVisibilidadProyecto).map(p => p.pm_lider).filter(Boolean));
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
      ? 'Evolución del forecast entre capturas'
      : `Forecast entre capturas · ${periodo.etiqueta}`;
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

  const proyectos = estado.proyectos.filter(p => pasaVisibilidadProyecto(p) && (!pmElegido || p.pm_lider === pmElegido));
  pintarProyeccionBacklogRevenue(svg, proyectos, document.getElementById('nota-backlog-vs-revenue'));

  const titulo = document.getElementById('titulo-backlog-vs-revenue');
  if (titulo) {
    titulo.textContent = pmElegido
      ? `${estado.forecast.timeline?'Commit y Upside mensual':'Backlog vs. Revenue'} · ${pmElegido}`
      : `${estado.forecast.timeline?'Commit y Upside mensual':'Backlog vs. Revenue'} · todo el portafolio`;
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
    const corte = new Date(snaps[ultimo].timestamp).getTime() - 7 * 864e5;
    const desde=snaps.findIndex(s=>new Date(s.timestamp).getTime()>=corte);
    return [Math.max(0,desde-1),ultimo];
  }
  if (clave === 'mes') {
    const corte = new Date(snaps[ultimo].timestamp).getTime() - 31 * 864e5;
    const desde = snaps.findIndex(s => new Date(s.timestamp).getTime() >= corte);
    return [Math.max(0, desde - 1), ultimo];
  }
  // 'ultimo': el par de snapshots más reciente en el que de verdad pasó algo.
  const ocultos = clavesProyectosOcultos();
  const conEventos = new Set(estado.historia.eventos.filter(e => !ocultos.has(String(e.num_pa))).map(e => e.snapshot_id));
  for (let i = ultimo; i > 0; i--) {
    if (conEventos.has(snaps[i].id)) return [i - 1, i];
  }
  return [Math.max(0, ultimo - 1), ultimo];
}

// Un movimiento por debajo de este monto es ruido de redondeo, no una
// decisión de negocio.
const MINIMO_CAMBIO = 0.5;


function rangoSnapshots() {
  const snaps = estado.historia.snapshots;
  const selA = document.getElementById('select-snap-a');
  const selB = document.getElementById('select-snap-b');
  let iA = Number(selA && selA.value);
  let iB = Number(selB && selB.value);
  if (!Number.isFinite(iA)) iA = 0;
  if (!Number.isFinite(iB)) iB = snaps.length - 1;
  iA=Math.max(0,Math.min(snaps.length-1,iA));iB=Math.max(0,Math.min(snaps.length-1,iB));
  if(iA===iB&&snaps.length>1){if(iB>0)iA=iB-1;else iB=1;}
  if(iA>iB)[iA,iB]=[iB,iA];
  if(selA)selA.value=String(iA);if(selB)selB.value=String(iB);
  return [iA,iB];
}

function calcularCambios() {
  const hist = estado.historia;
  const snaps = hist.snapshots;
  const [iA, iB] = rangoSnapshots();
  const idA = snaps[iA].id, idB = snaps[iB].id;

  const porProyecto = new Map(estado.proyectos.map(p => [claveProyecto(p), p]));
  const ocultos = clavesProyectosOcultos();
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
    const comparables=estado.forecast.timeline?compararMeses(a,b):null;
    const sa = comparables?{fijo:comparables.fijoA,upside:comparables.upsideA}:a?sumarMeses(a.meses):{fijo:0,upside:0};
    const sb = comparables?{fijo:comparables.fijoB,upside:comparables.upsideB}:sumarMeses(b.meses);
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
  fijarGraficaQueCambio(null);

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
  fijarGraficaQueCambio(crearGraficaLinea(svg, datos, { soloCambios: true }));

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
    if (f.serie && graficaQueCambioActual()) {
      tr.addEventListener('mouseenter', () => graficaQueCambioActual().destacar(f.serie));
      tr.addEventListener('mouseleave', () => graficaQueCambioActual().destacar(null));
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
  const ocultos = clavesProyectosOcultos();

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
      td.className = c || "";if(td.textContent==="On Hold")td.classList.add("estado-on-hold");
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
    if (!pasaVisibilidadProyecto(p)) return;
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
    acc.totalEjecutado += (fila && typeof fila.proyectado === 'number')
      ? fila.proyectado : 0;

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
  if (!estado.forecast.timeline && anfitrion && !anfitrion.children.length) {
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
    const acum = ejecutadoProyecto(p) || 0;
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

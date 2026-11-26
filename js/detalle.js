// Vista de detalle del proyecto: orquesta encabezado, información, revenue,
// hermanos de cliente y trazabilidad del proyecto.

import { MESES_ES, etiquetaPeriodoCalendario, mesesActivos, periodoActual } from './calendario.js';
import { CAMPOS_DINERO, CAMPOS_PORCENTAJE } from './campos-proyecto.js';
import { chip } from './chip.js';
import { backlogDe } from './dinero-proyecto.js';
import { crearGraficaRevenueProyecto } from './detalle-grafica-revenue.js';
import { renderizarEncabezadoProyecto } from './detalle-encabezado.js';
import { renderizarHermanosDeCliente } from './detalle-hermanos-cliente.js';
import { renderizarTrazabilidadProyecto } from './detalle-trazabilidad-proyecto.js';
import { estado } from './estado.js';
import { SIN_DATO, pasaTerritorio, valorDimension } from './filtros.js';
import { formatearDinero, formatearFecha, formatearNumero, formatearPorcentaje, normalizarValor, obtenerEtiquetaValor } from './formato.js';
import { svgEl } from './grafica-base.js';
import { crearGraficaLinea } from './grafica-linea.js';
import { construirSelectorPeriodo } from './selector-periodo.js';
import { vidaProyecto, calendarioVidaProyecto } from './vida-proyecto.js';
import { vistas } from './vistas.js';

export function abrirDetalle(proyecto) {
  estado.proyectoSeleccionado = proyecto;
  vistas.cambiarPestana('detalle');
}

export function renderizarDetalle() {
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

// Informe PDF: arma las páginas desde la vista activa y gestiona impresión y cierre.
import { estado } from './estado.js';
import { periodoActual } from './calendario.js';
import { DIMENSIONES } from './filtros.js';
import { cerrarDropdowns } from './filtros-ui.js';
import { identificador } from './campos-proyecto.js';
import { ajustarGraficasVisibles, graficasRegistradas } from './grafica-registro.js';
import { crearPaginaReporte, construirResumenReporte } from './reporte-resumen.js';
import { ANCHO_GRAFICA_REPORTE, paginarGraficaReporte } from './reporte-grafica.js';

let detallesAntesDeImprimir = [];
let scrollAntesDelReporte = 0;

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

export function inicializarReporteGraficas() {
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

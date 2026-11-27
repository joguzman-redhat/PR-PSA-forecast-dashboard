// Gráfica de Backlog vs. Revenue (Commit y Upside por mes) de la trazabilidad global.

import { periodoActual } from './calendario.js';
import { estado } from './estado.js';
import { pasaVisibilidadProyecto } from './filtros.js';
import { crearGraficaLinea } from './grafica-linea.js';
import { serieBacklogRevenuePorMes } from './series-revenue.js';

function pintarProyeccionBacklogRevenue(svg, proyectos, nota) {
  svg.dataset.tituloReporte='Commit y Upside mensual · '+periodoActual().etiqueta;
  crearGraficaLinea(svg,serieBacklogRevenuePorMes(proyectos),{ejeX:'categoria',unidad:'Commit y Upside mensual'});
  if(nota)nota.textContent='Calendario de los Excel por mes y año. Los meses sin información quedan sin dato; no se estima revenue fuera de las fuentes.';
}

/**
 * Backlog vs Revenue, calendario de ejecución (no por snapshot/movimiento:
 * eso ya lo muestran las otras gráficas de esta pestaña). Global por
 * defecto; si se elige un PM, solo entre sus proyectos. Ver
 * serieBacklogRevenuePorMes() para la cuenta exacta.
 */
export function renderizarGraficaBacklogVsRevenue() {
  const svg = document.getElementById('grafica-backlog-vs-revenue');
  if (!svg) return;
  const sel = document.getElementById('select-pm-backlog-revenue');
  const pmElegido = sel ? sel.value : '';

  const proyectos = estado.proyectos.filter(p => pasaVisibilidadProyecto(p) && (!pmElegido || p.pm_lider === pmElegido));
  pintarProyeccionBacklogRevenue(svg, proyectos, document.getElementById('nota-backlog-vs-revenue'));

  const titulo = document.getElementById('titulo-backlog-vs-revenue');
  if (titulo) {
    titulo.textContent = pmElegido
      ? `Commit y Upside mensual · ${pmElegido}`
      : `Commit y Upside mensual · todo el portafolio`;
  }
}

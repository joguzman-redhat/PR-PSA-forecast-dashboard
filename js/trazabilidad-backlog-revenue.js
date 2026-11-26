// Gráfica de Backlog vs. Revenue (Commit y Upside por mes) de la trazabilidad global.

import { anioRevenue, periodoActual } from './calendario.js';
import { backlogHoy } from './dinero-proyecto.js';
import { estado } from './estado.js';
import { pasaVisibilidadProyecto } from './filtros.js';
import { crearGraficaLinea } from './grafica-linea.js';
import { serieBacklogRevenuePorMes } from './series-revenue.js';
import { mesFinalizacion } from './vida-proyecto.js';

export function pintarProyeccionBacklogRevenue(svg, proyectos, nota) {
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
      ? `${estado.forecast.timeline?'Commit y Upside mensual':'Backlog vs. Revenue'} · ${pmElegido}`
      : `${estado.forecast.timeline?'Commit y Upside mensual':'Backlog vs. Revenue'} · todo el portafolio`;
  }
}

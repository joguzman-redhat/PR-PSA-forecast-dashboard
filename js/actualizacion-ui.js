// Actualización general de la UI del Inicio tras un cambio de filtros.
import { estado } from './estado.js';
import { calcularKPIs } from './kpis.js';
import { pasaVisibilidadProyecto } from './filtros.js';
import { ocultarTooltip } from './grafica-tooltip.js';
import { renderizarTabla } from './listado-proyectos.js';
import { actualizarGraficas } from './graficas-inicio.js';

export function actualizarUI() {
  ocultarTooltip();
  calcularKPIs();
  renderizarTabla();
  actualizarGraficas();
  document.getElementById('indicador-proyectos').textContent =
    `${estado.proyectosFiltrados.length} de ${estado.proyectos.filter(pasaVisibilidadProyecto).length} proyectos`;
}

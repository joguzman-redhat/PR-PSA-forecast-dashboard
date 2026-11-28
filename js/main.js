// Punto de entrada del dashboard: registra las vistas y arranca al cargar el DOM.
import { registrarVistas } from './vistas.js';
import { renderizarDetalle, abrirDetalle } from './detalle.js';
import { renderizarTrazabilidad } from './trazabilidad-global.js';
import { renderizarPMs } from './pms-vista.js';
import { actualizarUI } from './actualizacion-ui.js';
import { cambiarPestana } from './navegacion.js';
import { inicializar } from './inicializacion.js';

// Las vistas que los filtros repintan se registran aquí, así los módulos que las
// usan no importan de este (sería un ciclo). actualizarUI, renderizarTrazabilidad y
// renderizarPMs van envueltas en una llamada porque las pruebas las reemplazan en el
// ámbito unido y la referencia directa no vería el reemplazo.
registrarVistas({
  actualizarUI: () => actualizarUI(),
  renderizarDetalle,
  renderizarTrazabilidad: () => renderizarTrazabilidad(),
  renderizarPMs: () => renderizarPMs(),
  abrirDetalle,
  cambiarPestana,
});

// Iniciar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', inicializar);

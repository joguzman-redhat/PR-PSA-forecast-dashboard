// Resumen del PM seleccionado en el Inicio.

import { chip } from './chip.js';
import { backlogHoy, ejecucionPonderada, ejecutadoProyecto, valorBooking } from './dinero-proyecto.js';
import { estado } from './estado.js';
import { SIN_DATO, valorDimension } from './filtros.js';
import { formatearDinero, formatearDineroExacto, formatearNumero } from './formato.js';

/** Resumen del único PM seleccionado, usando el mismo conjunto filtrado que el listado. */
export function renderizarResumenPM(proyectos) {
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
  const acumulado = sumar(ejecutadoProyecto);
  const backlog = sumar(backlogHoy);
  const porcentaje = ejecucionPonderada(portafolio);

  document.getElementById('pm-nombre').textContent = pm;
  document.getElementById('pm-n-proyectos').textContent = formatearNumero(portafolio.length);
  [['booking', booking], ['acumulado', acumulado], ['backlog', backlog]].forEach(([campo, valor]) => {
    const el = document.getElementById(`pm-${campo}`);
    el.textContent = formatearDinero(valor);
    el.title = formatearDineroExacto(valor);
  });
  const ejecucion = document.getElementById('pm-pct-ejec');
  ejecucion.textContent = porcentaje === null ? '—' : porcentaje.toFixed(1) + '%';
  ejecucion.title = 'Ejecutado / Booking total; ponderado por monto, no promedio de porcentajes.';

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
    [valorBooking(p), ejecutadoProyecto(p), backlogHoy(p)].every(Number.isFinite)).length;
  const faltantes = portafolio.length - completos;
  document.getElementById('pm-cobertura').textContent = !portafolio.length
    ? 'No hay proyectos para este PM con los filtros activos.'
    : `${completos} de ${portafolio.length} proyectos con cifras completas de BackLog NOLA.`
      + (faltantes ? ` ${faltantes} sin backlog o con cifras incompletas; los totales incluyen solo los importes disponibles.` : '');
}

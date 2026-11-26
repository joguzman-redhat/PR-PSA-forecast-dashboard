// Cálculo de la tabla de PMs.

import { mesesActivos } from './calendario.js';
import { backlogHoy, revenuePeriodo, upsidePeriodo } from './dinero-proyecto.js';
import { backlogDe } from './fila-backlog.js';
import { estado } from './estado.js';
import { SIN_DATO, pasaVisibilidadProyecto } from './filtros.js';

/**
 * Backlog por PM, igual a la tabla de negocio: se parte por estado (In
 * Progress / On Hold / Planned) porque esos 3 son los que de verdad tienen
 * backlog pendiente. Completed y Canceled no suman aquí (si suman $0, no
 * aportan nada a la vista y solo le agregan columnas vacías).
 * Commit, Upside y Total Ejecutado sí cuentan TODOS los proyectos activos
 * del PM: ahí no se trata de backlog pendiente sino de cuánto ha movido.
 */
const CLAVE_ESTADO_PM = { 'In Progress': 'inProgreso', 'On Hold': 'onHold', 'Planned': 'planned', 'Completed': 'completed' };

export function calcularPMs() {
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

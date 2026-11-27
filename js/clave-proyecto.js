// Llave para cruzar un proyecto entre las fuentes.

import { estado } from './estado.js';
import { pasaVisibilidadProyecto } from './filtros.js';

/**
 * Llave de un proyecto: la clave del timeline que entrega la API (ADR 0003),
 * con prefijo PR:, PA: o SIN_ID:. No hay respaldo por PA ni por fila de Excel.
 */
export function claveProyecto(p) {
  return p.clave_timeline;
}

export function clavesProyectosOcultos() {
  return new Set(estado.proyectos
    .filter(p => !pasaVisibilidadProyecto(p)).map(claveProyecto));
}

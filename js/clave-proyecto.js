// Llave para cruzar un proyecto entre las fuentes.

import { backlogDe } from './fila-backlog.js';
import { estado } from './estado.js';
import { pasaVisibilidadProyecto } from './filtros.js';

/**
 * Llave para cruzar un proyecto entre las tres fuentes. No se puede usar
 * num_pa a secas: 14 proyectos lo tienen en null y `find(b => b.num_pa ===
 * null)` devolvía SIEMPRE la primera fila nula, así que esos 14 mostraban
 * todos el mismo revenue. Las dos hojas están alineadas fila a fila
 * (304/304 con el mismo nombre), así que la fila de Excel es la red de
 * seguridad.
 */
export function claveProyecto(p) {
  if(p.clave_timeline)return p.clave_timeline;
  if (p.num_pa !== null && p.num_pa !== undefined && p.num_pa !== '') {
    return String(p.num_pa);
  }
  // La historia se genera desde BackLog NOLA, asi que para los proyectos sin
  // PA la clave es el numero de fila DE ESA hoja, que no es el de esta.
  const enBacklog = backlogDe(p);
  return `fila-${enBacklog ? enBacklog._fila_excel : p._fila_excel}`;
}

export function clavesProyectosOcultos() {
  return new Set(estado.proyectos
    .filter(p => !pasaVisibilidadProyecto(p)).map(claveProyecto));
}

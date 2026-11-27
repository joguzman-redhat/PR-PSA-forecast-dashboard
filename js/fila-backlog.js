// La fila de BackLog NOLA que corresponde a un proyecto. Vive aparte para que
// dinero-proyecto.js y vida-proyecto.js dependan de ella sin depender entre si.
import { estado } from './estado.js';

export function normalizarNombre(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^0-9a-z]+/g, '');
}

// Devuelve null si no hay match. Antes caia de vuelta al numero de fila, que
// es justamente lo que mezclaba el revenue entre proyectos distintos.
export function backlogDe(proyecto) {
  if (!proyecto) return null;
  if (proyecto.clave_timeline) return estado.backlogPorTimeline?.get(proyecto.clave_timeline) || null;
  const pa = proyecto.num_pa;
  if (pa !== null && pa !== undefined && pa !== '') {
    const porPA = estado.backlogPorPA && estado.backlogPorPA.get(String(pa));
    if (porPA) return porPA;
  }
  const n = normalizarNombre(proyecto.nombre_del_proyecto);
  if (n && estado.backlogPorNombre) return estado.backlogPorNombre.get(n) || null;
  return null;
}

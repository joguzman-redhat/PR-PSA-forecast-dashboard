// La fila de BackLog NOLA que corresponde a un proyecto. Vive aparte para que
// dinero-proyecto.js y vida-proyecto.js dependan de ella sin depender entre si.
import { estado } from './estado.js';

// Se une solo por la clave del timeline que entrega la API (ADR 0003). Devuelve
// null si no hay match: ni el PA ni el nombre ni el numero de fila sirven de
// respaldo, porque mezclaban el revenue entre proyectos distintos.
export function backlogDe(proyecto) {
  if (!proyecto || !proyecto.clave_timeline) return null;
  return estado.backlogPorTimeline?.get(proyecto.clave_timeline) || null;
}

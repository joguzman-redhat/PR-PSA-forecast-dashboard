// Rango de Snapshots a comparar: atajos del selector y lectura de los selectores.

import { clavesProyectosOcultos } from './clave-proyecto.js';
import { estado } from './estado.js';

/** Atajos del selector de rango. Devuelve [indiceDesde, indiceHasta]. */
export function rangoPredefinido(clave, snaps) {
  const ultimo = snaps.length - 1;
  if (clave === 'todo') return [0, ultimo];
  if (clave === 'semana') {
    const limite = new Date(snaps[ultimo].timestamp).getTime() - 7 * 864e5;
    const desde=snaps.findIndex(s=>new Date(s.timestamp).getTime()>=limite);
    return [Math.max(0,desde-1),ultimo];
  }
  if (clave === 'mes') {
    const limite = new Date(snaps[ultimo].timestamp).getTime() - 31 * 864e5;
    const desde = snaps.findIndex(s => new Date(s.timestamp).getTime() >= limite);
    return [Math.max(0, desde - 1), ultimo];
  }
  // 'ultimo': el par de snapshots más reciente en el que de verdad pasó algo.
  const ocultos = clavesProyectosOcultos();
  const conEventos = new Set(estado.historia.eventos.filter(e => !ocultos.has(String(e.num_pa))).map(e => e.snapshot_id));
  for (let i = ultimo; i > 0; i--) {
    if (conEventos.has(snaps[i].id)) return [i - 1, i];
  }
  return [Math.max(0, ultimo - 1), ultimo];
}

export function rangoSnapshots() {
  const snaps = estado.historia.snapshots;
  const selA = document.getElementById('select-snap-a');
  const selB = document.getElementById('select-snap-b');
  let iA = Number(selA && selA.value);
  let iB = Number(selB && selB.value);
  if (!Number.isFinite(iA)) iA = 0;
  if (!Number.isFinite(iB)) iB = snaps.length - 1;
  iA=Math.max(0,Math.min(snaps.length-1,iA));iB=Math.max(0,Math.min(snaps.length-1,iB));
  if(iA===iB&&snaps.length>1){if(iB>0)iA=iB-1;else iB=1;}
  if(iA>iB)[iA,iB]=[iB,iA];
  if(selA)selA.value=String(iA);if(selB)selB.value=String(iB);
  return [iA,iB];
}

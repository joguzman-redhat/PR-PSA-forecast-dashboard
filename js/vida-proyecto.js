// Vida del proyecto: Fecha fin, primer mes con Commit y los meses entre ambos.
import { estado } from './estado.js';
import { MESES_ES, mesesActivos } from './calendario.js';
import { backlogDe } from './fila-backlog.js';

/** Fecha fin de Info Proyectos, sin desplazar días/meses por la zona horaria. */
export function mesFinalizacion(proyecto) {
  const valor = proyecto.fecha_fin;
  let anio, mes, dia;
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    const fecha = new Date(Date.UTC(1899, 11, 30) + Math.floor(valor) * 86400000);
    anio = fecha.getUTCFullYear(); mes = fecha.getUTCMonth() + 1; dia = fecha.getUTCDate();
  } else if (typeof valor === 'string') {
    const iso = valor.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
    const americana = valor.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (iso) [, anio, mes, dia] = iso.map(Number);
    else if (americana) { mes = +americana[1]; dia = +americana[2]; anio = +americana[3]; }
    else return null;
  } else return null;
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null;
  return anio * 12 + mes - 1;
}

/** Months are compared as YYYY-MM; unknown limits stay unknown. */
export function periodoFinProyecto(proyecto) {
  const mes = mesFinalizacion(proyecto);
  return mes === null ? null : `${Math.floor(mes / 12)}-${String(mes % 12 + 1).padStart(2, '0')}`;
}

export function vidaProyecto(proyecto) {
  const fila = backlogDe(proyecto);
  const periodos = estado.forecast.periodos || [];
  const inicio = periodos.find(p => Number.isFinite(fila?.[p+'_fijo']) && fila[p+'_fijo'] !== 0) || null;
  const fin = periodoFinProyecto(proyecto);
  const fueraDeVigencia = !!fin && periodos.some(p => p > fin &&
    ((Number.isFinite(fila?.[p+'_fijo']) && fila[p+'_fijo'] !== 0) ||
     (Number.isFinite(fila?.[p+'_upside']) && fila[p+'_upside'] !== 0)));
  return {inicio, fin, fueraDeVigencia};
}

export function pasaPeriodoProyecto(proyecto) {
  if (!estado.forecast.timeline) return true;
  const indices = mesesActivos();
  if (!indices.length) return false;
  const desde = MESES_ES[indices[0]], hasta = MESES_ES[indices.at(-1)];
  const {inicio, fin} = vidaProyecto(proyecto);
  return (!fin || fin >= desde) && (!inicio || inicio <= hasta);
}

export function mesesTimelineProyecto(proyecto) {
  if (!estado.forecast.timeline) return mesesActivos();
  const {inicio, fin} = vidaProyecto(proyecto);
  return mesesActivos().filter(i => (!inicio || MESES_ES[i] >= inicio) && (!fin || MESES_ES[i] <= fin));
}

export function calendarioVidaProyecto(p) {
  const vida=vidaProyecto(p);if(!vida.inicio)return [];
  const registrados=(estado.forecast.periodos||[]).filter(m=>Number.isFinite(backlogDe(p)?.[m+'_fijo'])&&backlogDe(p)[m+'_fijo']!==0);
  const fin=vida.fin||registrados.at(-1);if(!fin||fin<vida.inicio)return [];
  let n=Number(vida.inicio.slice(0,4))*12+Number(vida.inicio.slice(5))-1;
  const ultimo=Number(fin.slice(0,4))*12+Number(fin.slice(5))-1;
  if(ultimo-n>1200)return [];
  const meses=[];for(;n<=ultimo;n++)meses.push(`${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`);
  return meses;
}

export function indicesVidaProyecto(p) {
  const vida=calendarioVidaProyecto(p);
  return vida.map(m=>MESES_ES.indexOf(m)).filter(i=>i>=0);
}

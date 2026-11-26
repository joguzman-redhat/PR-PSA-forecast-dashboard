// Vida del proyecto: Fecha fin, primer mes con Commit y los meses entre ambos.
import { estado } from './estado.js';
import { MESES_ES, mesesActivos, etiquetaPeriodoCalendario } from './calendario.js';
import { formatearDineroExacto } from './formato.js';
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

const conImporte = v => Number.isFinite(v) && v !== 0;

/**
 * Vida del proyecto: primer mes con Commit y Fecha fin (null si no tiene; nunca
 * se deriva del Commit). `mesesPosterioresAFin` lista los meses con Commit o
 * Upside después de la Fecha fin, con su importe: se advierten, no se recortan.
 * `fueraDeVigencia` conserva su nombre por contrato de pruebas.
 */
export function vidaProyecto(proyecto) {
  const fila = backlogDe(proyecto);
  const periodos = estado.forecast.periodos || [];
  const inicio = periodos.find(p => conImporte(fila?.[p+'_fijo'])) || null;
  const fin = periodoFinProyecto(proyecto);
  const mesesPosterioresAFin = !fin ? [] : periodos.filter(p => p > fin &&
    (conImporte(fila?.[p+'_fijo']) || conImporte(fila?.[p+'_upside'])));
  const suma = sufijo => mesesPosterioresAFin.reduce((a, p) => a + (Number.isFinite(fila[p+sufijo]) ? fila[p+sufijo] : 0), 0);
  return {inicio, fin, fueraDeVigencia: mesesPosterioresAFin.length > 0, mesesPosterioresAFin,
    commitPosteriorAFin: suma('_fijo'), upsidePosteriorAFin: suma('_upside')};
}

/**
 * Advertencia visible de un Commit o Upside posterior a la Fecha fin, o null.
 * Informa el importe afectado; el dinero no se modifica ni se oculta.
 */
export function advertenciaFueraDeFechaFin(proyecto) {
  const vida = vidaProyecto(proyecto);
  if (!vida.mesesPosterioresAFin.length) return null;
  const meses = vida.mesesPosterioresAFin.map(etiquetaPeriodoCalendario);
  const cuando = meses.length === 1 ? `en ${meses[0]}` : `entre ${meses[0]} y ${meses.at(-1)}`;
  const partes = [];
  if (vida.commitPosteriorAFin !== 0) partes.push(`Commit de ${formatearDineroExacto(vida.commitPosteriorAFin)}`);
  if (vida.upsidePosteriorAFin !== 0) partes.push(`Upside de ${formatearDineroExacto(vida.upsidePosteriorAFin)}`);
  const que = partes.length ? partes.join(' y ') : 'importes que se compensan';
  const etiqueta = vida.commitPosteriorAFin !== 0 || !partes.length ? 'Commit' : 'Upside';
  return `${etiqueta} posterior a la Fecha fin (${etiquetaPeriodoCalendario(vida.fin)}): ${que} ${cuando}. El importe se conserva en el Proyectado y en las gráficas; revisar la Fecha fin.`;
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

/**
 * Meses de la vida del proyecto, de su primer Commit a la Fecha fin (aunque el
 * último Commit sea anterior: se ve el saldo que queda). Sin Fecha fin, hasta
 * el último mes con Commit. Si hay Commit o Upside posterior a la Fecha fin, el
 * calendario llega hasta ese mes: el importe no se recorta.
 */
export function calendarioVidaProyecto(p) {
  const vida=vidaProyecto(p);if(!vida.inicio)return [];
  const fila=backlogDe(p),periodos=estado.forecast.periodos||[];
  const registrados=periodos.filter(m=>conImporte(fila?.[m+'_fijo']));
  const fin=[vida.fin||registrados.at(-1),vida.mesesPosterioresAFin.at(-1)].filter(Boolean).sort().at(-1);
  if(!fin||fin<vida.inicio)return [];
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

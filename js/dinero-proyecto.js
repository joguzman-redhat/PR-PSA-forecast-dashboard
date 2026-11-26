// Dinero de un proyecto, siempre desde su fila de backlog (BackLog NOLA):
// Booking, Ejecutado, Backlog, Proyectado, Commit y Upside. Las filas llegan ya
// con los nombres del glosario (ver api.js).
import { estado } from './estado.js';
import { MESES_ES, mesesActivos, mesesEjecutadosForecast, mesReferenciaFinanciera } from './calendario.js';

export function normalizarNombre(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^0-9a-z]+/g, '');
}

// Devuelve null si no hay match. Antes caia de vuelta al numero de fila, que
// es justamente lo que mezclaba el revenue entre proyectos distintos.
export function backlogDe(proyecto) {
  if (proyecto.clave_timeline) return estado.backlogPorTimeline?.get(proyecto.clave_timeline) || null;
  if (!proyecto) return null;
  const pa = proyecto.num_pa;
  if (pa !== null && pa !== undefined && pa !== '') {
    const porPA = estado.backlogPorPA && estado.backlogPorPA.get(String(pa));
    if (porPA) return porPA;
  }
  const n = normalizarNombre(proyecto.nombre_del_proyecto);
  if (n && estado.backlogPorNombre) return estado.backlogPorNombre.get(n) || null;
  return null;
}

/**
 * Valor Booking de un proyecto. TODA LA PLATA viene de BackLog NOLA, nunca de
 * Info Proyectos: los campos p.valor_of / p.acumulado_a_hoy / p.consumido_2025
 * / p.backlog_2026 NO están convertidos (carecen del factor de conversión).
 * Se reconstruye como lo calcula el propio Excel: Booking = Backlog + Proyectado,
 * las dos ya convertidas. Va primero porque las cargas
 * anteriores al arreglo del ETL guardaron en fila.booking el valor de Info (sin
 * convertir); fila.booking queda solo de respaldo.
 */
export function valorBooking(proyecto) {
  const fila = backlogDe(proyecto);
  if(estado.forecast.timeline)return typeof fila?.booking==='number'?fila.booking:null;
  if (!fila) return null;
  if (typeof fila.backlog === 'number' && typeof fila.proyectado === 'number') {
    return fila.backlog + fila.proyectado;
  }
  return typeof fila.booking === 'number' ? fila.booking : null;
}

/** Acumulado del año pasado (2025), desde BackLog NOLA. */
export function acumuladoAnterior(proyecto) {
  const fila = backlogDe(proyecto);
  return fila && typeof fila.acumulado_anterior === 'number' ? fila.acumulado_anterior : null;
}

/** Revenue fijo de un proyecto en el periodo elegido, desde BackLog NOLA. */
export function revenuePeriodo(proyecto) {
  const fila = backlogDe(proyecto);
  if (!fila) return null;
  if(estado.forecast.timeline&&!mesesActivos().some(i=>typeof fila[MESES_ES[i]+'_fijo']==='number'))return null;
  return mesesActivos().reduce((acc, i) => {
    const v = fila[MESES_ES[i] + '_fijo'];
    return acc + (typeof v === 'number' ? v : 0);
  }, 0);
}

/** Upside de un proyecto en el periodo elegido. Hermano de revenuePeriodo. */
export function upsidePeriodo(proyecto) {
  const fila = backlogDe(proyecto);
  if (!fila) return null;
  if(estado.forecast.timeline&&!mesesActivos().some(i=>typeof fila[MESES_ES[i]+'_upside']==='number'))return null;
  return mesesActivos().reduce((acc, i) => {
    const v = fila[MESES_ES[i] + '_upside'];
    return acc + (typeof v === 'number' ? v : 0);
  }, 0);
}

/**
 * Revenue acumulado a hoy de un proyecto. acum_2025 es el saldo arrastrado del
 * año anterior; los meses de enero a hoy del año en curso suman el resto.
 * TODA LA PLATA viene de BackLog NOLA: si no hay fila de backlog, el proyecto
 * no tiene cifras de revenue (se muestra "—" en vez de cero).
 */
export function ejecutadoProyecto(proyecto) {
  const fila = backlogDe(proyecto);
  if(estado.forecast.timeline)return fila?.ejecutado ?? null;
  if (!fila) return null;
  const acum2025 = acumuladoAnterior(proyecto) ?? 0;
  // Enero hasta el mes en curso, inclusive.
  const commitHastaHoy = MESES_ES.slice(0, mesesEjecutadosForecast()).reduce((acc, m) => {
    const v = fila[m + '_fijo'];
    return acc + (typeof v === 'number' ? v : 0);
  }, 0);
  return acum2025 + commitHastaHoy;
}

/**
 * Backlog de un proyecto: la columna "Backlog" de BackLog NOLA, tal cual. El
 * Excel lo calcula como Valor OF − Acum 2025 − commit de los 12 meses, o sea,
 * ya descuenta lo planeado para el resto del año. Es el número de las tablas
 * dinámicas del negocio, así que manda sobre cualquier cálculo propio.
 * Consecuencia: Booking = Acumulado a hoy + commit planeado resto del año + Backlog.
 */
export function backlogHoy(proyecto) {
  const fila = backlogDe(proyecto);
  return fila && typeof fila.backlog === 'number' ? fila.backlog : null;
}

/**
 * Ejecución proyectada al cierre del año = acum_2025 + suma de los 12 meses fijo.
 */
export function proyectadaAnio(proyecto) {
  const fila = backlogDe(proyecto);
  if(estado.forecast.timeline)return fila?.proyectado ?? null;
  if (!fila) return null;
  const acum2025 = acumuladoAnterior(proyecto) ?? 0;
  const totalFijo = MESES_ES.reduce((acc, m) => {
    const v = fila[m + '_fijo'];
    return acc + (typeof v === 'number' ? v : 0);
  }, 0);
  return acum2025 + totalFijo;
}

export function porcentajeEjecucionProyecto(p) {
  const booking=valorBooking(p),acum=ejecutadoProyecto(p);
  return Number.isFinite(booking)&&booking>0&&Number.isFinite(acum)?100*acum/booking:null;
}

export function commitPendienteProyecto(p) {
  const b=backlogDe(p);if(!b)return null;
  const anio=b.anio_atributos??estado.forecast.anio;
  const meses=Array.from({length:12},(_,i)=>`${anio}-${String(i+1).padStart(2,'0')}`).filter(m=>m>mesReferenciaFinanciera());
  const valores=meses.map(m=>b[(estado.forecast.timeline?m:MESES_ES[Number(m.slice(5))-1])+'_fijo']);
  return valores.every(Number.isFinite)?valores.reduce((a,b)=>a+b,0):null;
}

export function proyeccionReferencia(p) {
  const acum=ejecutadoProyecto(p),pendiente=commitPendienteProyecto(p);
  return Number.isFinite(acum)&&Number.isFinite(pendiente)?acum+pendiente:null;
}

export function resumenFinanciero(proyectos) {
  const suma=fn=>{const n=proyectos.map(fn).filter(Number.isFinite);return n.length||!proyectos.length?n.reduce((a,b)=>a+b,0):null;};
  const faltantes=proyectos.filter(p=>![valorBooking(p),ejecutadoProyecto(p),backlogHoy(p),commitPendienteProyecto(p)].every(Number.isFinite)).length;
  const booking=suma(valorBooking),backlog=suma(backlogHoy),proyectado=suma(proyeccionReferencia),pendiente=suma(commitPendienteProyecto);
  const diferencia=faltantes||![booking,backlog,proyectado].every(Number.isFinite)?null:booking-backlog-proyectado;
  return {booking,backlog,proyectado,pendiente,faltantes,diferencia:diferencia!==null&&Math.abs(diferencia)<.01?0:diferencia,
    referencias:[...new Set(proyectos.map(p=>backlogDe(p)?.anio_atributos??estado.forecast.anio))].sort()};
}

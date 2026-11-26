// Dinero de un proyecto, siempre desde su fila de backlog (BackLog NOLA):
// Booking, Ejecutado, Backlog, Proyectado, Commit y Upside. Las filas llegan ya
// con los nombres del glosario (ver api.js).
import { estado } from './estado.js';
import { backlogDe } from './fila-backlog.js';
import { vidaProyecto } from './vida-proyecto.js';
import { MESES_ES, mesesActivos, mesesEjecutadosForecast, mesReferenciaFinanciera } from './calendario.js';

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
 * Arrastre de un proyecto: lo ejecutado antes del primer mes con Commit de su
 * vida. El acumulado anterior de la fila llega hasta el inicio de su Año fuente;
 * si la vida empieza antes (un proyecto con Commit en 2026 cuya fuente es FY27),
 * esos meses ya vienen dentro del acumulado anterior y se restan para no
 * contarlos dos veces cuando se suman mes a mes. Sin dato si falta el acumulado
 * anterior o algún mes de ese tramo.
 */
export function arrastreProyecto(proyecto) {
  const b = backlogDe(proyecto);
  if (!b) return null;
  const inicio = vidaProyecto(proyecto).inicio;
  const fuente = b.anio_atributos ?? estado.forecast.anio;
  const previos = (estado.forecast.periodos || []).filter(m => m >= inicio && Number(m.slice(0, 4)) < fuente);
  if (!Number.isFinite(b.acumulado_anterior) || previos.some(m => !Number.isFinite(b[m + '_fijo']))) return null;
  return b.acumulado_anterior - previos.reduce((a, m) => a + b[m + '_fijo'], 0);
}

/**
 * Ejecutado de un proyecto sobre toda su vida: el acumulado anterior más el
 * Commit de todos los meses hasta el actual (de cualquier año), sin leer la
 * columna de la API, que solo llega al fin del Año fuente. Si falta un mes
 * pasado queda sin dato; solo mientras el mes actual siga dentro del Año fuente
 * se usa la columna de la fila como respaldo, porque ahí coincide.
 * TODA LA PLATA viene de BackLog NOLA: si no hay fila de backlog, el proyecto
 * no tiene cifras de revenue (se muestra "—" en vez de cero).
 */
export function ejecutadoProyecto(proyecto) {
  const fila = backlogDe(proyecto);
  if (estado.forecast.timeline) {
    if (!fila) return null;
    const hoy = mesReferenciaFinanciera();
    const inicio = vidaProyecto(proyecto).inicio;
    let acumulado = arrastreProyecto(proyecto);
    if (Number.isFinite(acumulado)) {
      for (const m of estado.forecast.periodos || []) {
        if (!inicio || m < inicio || m > hoy) continue;
        if (!Number.isFinite(fila[m + '_fijo'])) { acumulado = null; break; }
        acumulado += fila[m + '_fijo'];
      }
      if (Number.isFinite(acumulado)) return acumulado;
    }
    const fuente = fila.anio_atributos ?? estado.forecast.anio;
    return Number(hoy.slice(0, 4)) <= fuente && Number.isFinite(fila.ejecutado) ? fila.ejecutado : null;
  }
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
 * Excel lo calcula como Booking − acumulado anterior − Commit de los 12 meses
 * de su Año fuente, o sea, ya descuenta lo planeado para ese año. Es el número de las tablas
 * dinámicas del negocio, así que manda sobre cualquier cálculo propio.
 * Consecuencia: Booking = Ejecutado + Commit pendiente + Backlog sin planear.
 */
export function backlogHoy(proyecto) {
  const fila = backlogDe(proyecto);
  return fila && typeof fila.backlog === 'number' ? fila.backlog : null;
}

/**
 * Proyectado de un proyecto: Ejecutado más el Commit de los meses futuros sobre
 * toda su vida, incluido 2027. Nunca incluye Upside. Sin dato si falta el
 * Ejecutado o algún mes futuro de su vida. En el modo anterior, sin timeline,
 * sigue siendo el cierre del año: acum_2025 + los 12 meses fijo.
 */
export function proyectadoProyecto(proyecto) {
  if (estado.forecast.timeline) return proyeccionReferencia(proyecto);
  const fila = backlogDe(proyecto);
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

/** Meses YYYY-MM de `desde` a `hasta`, ambos inclusive. */
function mesesEntre(desde, hasta) {
  const lista = [];
  let n = Number(desde.slice(0, 4)) * 12 + Number(desde.slice(5)) - 1;
  const ultimo = Number(hasta.slice(0, 4)) * 12 + Number(hasta.slice(5)) - 1;
  for (; n <= ultimo && lista.length < 1200; n++) lista.push(`${Math.floor(n / 12)}-${String(n % 12 + 1).padStart(2, '0')}`);
  return lista;
}

/**
 * Commit de los meses posteriores al actual, sobre toda la vida del proyecto
 * (incluido 2027). Deben tener dato todos los meses futuros hasta el fin de su
 * Año fuente y hasta el fin de su vida (Fecha fin, o el último mes con Commit);
 * si falta uno, sin dato, nunca cero. Un Commit posterior a la Fecha fin se
 * suma igual: se advierte, no se recorta.
 */
export function commitPendienteProyecto(p) {
  const b=backlogDe(p);if(!b)return null;
  const anio=b.anio_atributos??estado.forecast.anio;
  if(!estado.forecast.timeline){
    const meses=Array.from({length:12},(_,i)=>`${anio}-${String(i+1).padStart(2,'0')}`).filter(m=>m>mesReferenciaFinanciera());
    const valores=meses.map(m=>b[MESES_ES[Number(m.slice(5))-1]+'_fijo']);
    return valores.every(Number.isFinite)?valores.reduce((a,b)=>a+b,0):null;
  }
  const hoy=mesReferenciaFinanciera(),periodos=estado.forecast.periodos||[];
  const registrados=periodos.filter(m=>Number.isFinite(b[m+'_fijo'])&&b[m+'_fijo']!==0);
  const finVida=vidaProyecto(p).fin||registrados.at(-1)||'';
  const obligado=[`${anio}-12`,finVida].sort().at(-1);
  // Cobertura exigida: desde el mes siguiente al actual, y no antes de enero del Año fuente.
  const n=Number(hoy.slice(0,4))*12+Number(hoy.slice(5)),siguiente=`${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`;
  const desde=[siguiente,`${anio}-01`].sort().at(-1);
  const sinDato=desde<=obligado&&mesesEntre(desde,obligado).some(m=>!Number.isFinite(b[m+'_fijo']));
  if(sinDato)return null;
  return periodos.filter(m=>m>hoy&&Number.isFinite(b[m+'_fijo'])).reduce((a,m)=>a+b[m+'_fijo'],0);
}

/**
 * Commit de los meses posteriores al Año fuente. El Backlog de la fuente ya
 * descuenta el Commit de su propio año; lo que se registre después (2027 para
 * una fuente FY26) todavía no está descontado, y por eso baja el Backlog sin
 * planear: Booking = Ejecutado + Commit pendiente + Backlog sin planear.
 */
export function commitPosteriorAlAnioFuente(p) {
  const b=backlogDe(p);if(!b)return null;
  const fuente=b.anio_atributos??estado.forecast.anio;
  return (estado.forecast.periodos||[]).filter(m=>Number(m.slice(0,4))>fuente)
    .reduce((a,m)=>a+(Number.isFinite(b[m+'_fijo'])?b[m+'_fijo']:0),0);
}

export function proyeccionReferencia(p) {
  const acum=ejecutadoProyecto(p),pendiente=commitPendienteProyecto(p);
  return Number.isFinite(acum)&&Number.isFinite(pendiente)?acum+pendiente:null;
}

export function resumenFinanciero(proyectos) {
  const suma=fn=>{const n=proyectos.map(fn).filter(Number.isFinite);return n.length||!proyectos.length?n.reduce((a,b)=>a+b,0):null;};
  const faltantes=proyectos.filter(p=>![valorBooking(p),ejecutadoProyecto(p),backlogHoy(p),commitPendienteProyecto(p)].every(Number.isFinite)).length;
  const booking=suma(valorBooking),backlog=suma(backlogHoy),proyectado=suma(proyeccionReferencia),pendiente=suma(commitPendienteProyecto);
  const posterior=suma(commitPosteriorAlAnioFuente);
  const backlogSinPlanear=Number.isFinite(backlog)&&Number.isFinite(posterior)?backlog-posterior:null;
  const diferencia=faltantes||![booking,backlogSinPlanear,proyectado].every(Number.isFinite)?null:booking-backlogSinPlanear-proyectado;
  return {booking,backlog,backlogSinPlanear,proyectado,pendiente,faltantes,diferencia:diferencia!==null&&Math.abs(diferencia)<.01?0:diferencia,
    referencias:[...new Set(proyectos.map(p=>backlogDe(p)?.anio_atributos??estado.forecast.anio))].sort()};
}

// Dinero de un proyecto, siempre desde su fila de backlog (BackLog NOLA):
// Booking, Ejecutado, Backlog, Proyectado, Commit y Upside. Las filas llegan ya
// con los nombres del glosario (ver api.js).
import { estado } from './estado.js';
import { backlogDe } from './fila-backlog.js';
import { vidaProyecto } from './vida-proyecto.js';
import { MESES_ES, mesesActivos, mesesEjecutadosForecast, mesReferenciaFinanciera, etiquetaPeriodoCalendario } from './calendario.js';

/**
 * Valor Booking de un proyecto. TODA LA PLATA viene de BackLog NOLA, nunca de
 * Info Proyectos: sus columnas de dinero (las del Excel de Info Proyectos) NO
 * están convertidas (carecen del factor de conversión).
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

/** Acumulado previo al Año fuente, desde BackLog NOLA. */
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
 * si la vida empieza antes (un proyecto con Commit en un año anterior a su fuente),
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
 * Backlog de la fuente: la columna "Backlog" de BackLog NOLA, tal cual. El Excel
 * lo calcula como Booking − acumulado anterior − Commit de los 12 meses de su
 * Año fuente, o sea, solo descuenta lo planeado para ese año. Es un dato de
 * entrada; lo que se muestra es el Backlog continuo (backlogHoy).
 */
export function backlogDeLaFuente(proyecto) {
  const fila = backlogDe(proyecto);
  return fila && typeof fila.backlog === 'number' ? fila.backlog : null;
}

/**
 * Backlog de un proyecto, continuo entre años (ADR 0002): el de la fuente menos
 * el Commit posterior a su Año fuente, o sea, lo que falta por planear de toda
 * la vida. Es el único Backlog que se muestra: así las fuentes de todos los años se ven como un
 * solo Excel, aunque no cuadre con el Backlog de la fuente.
 * Consecuencia: Booking = Ejecutado + Commit pendiente + Backlog.
 */
export function backlogHoy(proyecto) {
  const fuente = backlogDeLaFuente(proyecto);
  return fuente === null ? null : fuente - commitPosteriorAlAnioFuente(proyecto);
}

/**
 * Proyectado de un proyecto: Ejecutado más el Commit de los meses futuros sobre
 * toda su vida. Nunca incluye Upside. Sin dato si falta el
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
 * Cobertura del Commit futuro de un proyecto: la suma del Commit de los meses
 * posteriores al actual que SÍ tienen dato, y los meses que deberían tenerlo
 * (desde el siguiente al actual, y no antes de enero del Año fuente, hasta el
 * fin de su Año fuente y de su vida: Fecha fin, o el último mes con Commit) y
 * no lo tienen. Un mes sin cobertura no es cero: no se suma. Un Commit posterior
 * a la Fecha fin se suma igual: se advierte, no se recorta.
 */
function coberturaCommitFuturo(p) {
  const b=backlogDe(p);if(!b)return null;
  const anio=b.anio_atributos??estado.forecast.anio;
  const hoy=mesReferenciaFinanciera(),periodos=estado.forecast.periodos||[];
  const registrados=periodos.filter(m=>Number.isFinite(b[m+'_fijo'])&&b[m+'_fijo']!==0);
  const finVida=vidaProyecto(p).fin||registrados.at(-1)||'';
  const obligado=[`${anio}-12`,finVida].sort().at(-1);
  const n=Number(hoy.slice(0,4))*12+Number(hoy.slice(5)),siguiente=`${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`;
  const desde=[siguiente,`${anio}-01`].sort().at(-1);
  const faltantes=desde<=obligado?mesesEntre(desde,obligado).filter(m=>!Number.isFinite(b[m+'_fijo'])):[];
  const valor=periodos.filter(m=>m>hoy&&Number.isFinite(b[m+'_fijo'])).reduce((a,m)=>a+b[m+'_fijo'],0);
  return {valor,faltantes,siguiente};
}

/**
 * Commit de los meses posteriores al actual, sobre toda la vida del proyecto
 * Con meses sin cobertura es parcial: suma solo el Commit que
 * existe (ver coberturaProyectado), nunca cero inventado. Sin fila de backlog,
 * sin dato. En el modo anterior, sin timeline, exige los meses del año.
 */
export function commitPendienteProyecto(p) {
  const b=backlogDe(p);if(!b)return null;
  if(!estado.forecast.timeline){
    const anio=b.anio_atributos??estado.forecast.anio;
    const meses=Array.from({length:12},(_,i)=>`${anio}-${String(i+1).padStart(2,'0')}`).filter(m=>m>mesReferenciaFinanciera());
    const valores=meses.map(m=>b[MESES_ES[Number(m.slice(5))-1]+'_fijo']);
    return valores.every(Number.isFinite)?valores.reduce((a,b)=>a+b,0):null;
  }
  return coberturaCommitFuturo(p).valor;
}

/**
 * Cobertura del Proyectado: null si está completo (o no se puede calcular); si
 * faltan meses de Commit, `{hasta, faltantes, anios}`: el último mes con
 * cobertura contigua, los meses sin ella y sus años.
 */
export function coberturaProyectado(p) {
  if(!estado.forecast.timeline)return null;
  const c=coberturaCommitFuturo(p);
  if(!c||!c.faltantes.length)return null;
  const n=Number(c.faltantes[0].slice(0,4))*12+Number(c.faltantes[0].slice(5))-2;
  const hasta=`${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`;
  return {hasta,faltantes:c.faltantes,anios:[...new Set(c.faltantes.map(m=>Number(m.slice(0,4))))]};
}

/** Aviso visible de un Proyectado parcial, o null si está completo. */
export function textoProyectadoParcial(p) {
  const c=coberturaProyectado(p);if(!c)return null;
  return `Proyectado parcial: cubre hasta ${etiquetaPeriodoCalendario(c.hasta)}; faltan meses de ${c.anios.join(' y ')}. Los meses sin cobertura no se cuentan como cero.`;
}

/**
 * Commit de los meses posteriores al Año fuente. El Backlog de la fuente ya
 * descuenta el Commit de su propio año; lo que se registre después (el de 2027 y 2028 para
 * una fuente FY26) todavía no está descontado, y se resta para obtener el
 * Backlog continuo (backlogHoy).
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

/**
 * Suma de una medida por proyecto, ignorando los que no tienen dato: un
 * proyecto sin cifras no cuenta como cero. Sin ningún dato, null (no 0), salvo
 * que no haya proyectos.
 */
export function sumaConDato(proyectos, medida) {
  const n=proyectos.map(medida).filter(Number.isFinite);
  return n.length||!proyectos.length?n.reduce((a,b)=>a+b,0):null;
}

/**
 * Ejecución ponderada por monto (Ejecutado / Booking), solo con los proyectos
 * que tienen ambas cifras: uno sin Ejecutado no baja el porcentaje. Sin
 * proyectos con ambas, o con Booking cero, sin dato.
 */
export function ejecucionPonderada(proyectos) {
  const con=proyectos.filter(p=>Number.isFinite(valorBooking(p))&&Number.isFinite(ejecutadoProyecto(p)));
  const booking=con.reduce((a,p)=>a+valorBooking(p),0),ejecutado=con.reduce((a,p)=>a+ejecutadoProyecto(p),0);
  return booking>0?100*ejecutado/booking:null;
}

export function resumenFinanciero(proyectos) {
  const suma=fn=>sumaConDato(proyectos,fn);
  const incompleto=p=>![valorBooking(p),ejecutadoProyecto(p),backlogHoy(p),commitPendienteProyecto(p)].every(Number.isFinite)||coberturaProyectado(p)!==null;
  const faltantes=proyectos.filter(incompleto).length;
  const parciales=proyectos.filter(p=>coberturaProyectado(p)!==null).length;
  const booking=suma(valorBooking),backlog=suma(backlogHoy),proyectado=suma(proyeccionReferencia),pendiente=suma(commitPendienteProyecto);
  const diferencia=faltantes||![booking,backlog,proyectado].every(Number.isFinite)?null:booking-backlog-proyectado;
  return {booking,backlog,backlogFuente:suma(backlogDeLaFuente),proyectado,pendiente,faltantes,parciales,diferencia:diferencia!==null&&Math.abs(diferencia)<.01?0:diferencia,
    referencias:[...new Set(proyectos.map(p=>backlogDe(p)?.anio_atributos??estado.forecast.anio))].sort()};
}

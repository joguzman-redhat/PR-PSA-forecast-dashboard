// Series mensuales de revenue que alimentan las graficas: Commit y Upside del
// portafolio, y la curva de saldo de un proyecto.
import { estado } from './estado.js';
import { formatearDineroExacto } from './formato.js';
import { MESES_ES, mesesActivos, anioRevenue, etiquetaMesRevenue, etiquetaPeriodoCalendario } from './calendario.js';
import { valorBooking, acumuladoAnterior, backlogHoy, arrastreProyecto } from './dinero-proyecto.js';
import { backlogDe } from './fila-backlog.js';
import { mesFinalizacion, vidaProyecto, calendarioVidaProyecto } from './vida-proyecto.js';

/** Calendario de 2026 y reparto uniforme del Backlog fuente hasta cada fecha fin futura. */
export function serieBacklogRevenuePorMes(proyectos) {
  if(estado.forecast.timeline) {
    return Object.fromEntries(mesesActivos().map(i=>{
      const m=MESES_ES[i];let fijo=0,upside=0,conDatos=false;
      proyectos.forEach(p=>{const b=backlogDe(p);if(typeof b?.[m+'_fijo']==='number'){fijo+=b[m+'_fijo'];upside+=b[m+'_upside']||0;conDatos=true;}});
      return [etiquetaPeriodoCalendario(m),{Commit:conDatos?fijo:null,Upside:conDatos?upside:null}];
    }));
  }
  let valorOfTotal = 0;
  let acum2025Total = 0;
  const commitPorMes = new Array(12).fill(0);
  const diciembre = anioRevenue() * 12 + 11;
  const proyecciones = [];
  let ultimoMes = diciembre;
  proyectos.forEach(p => {
    const booking = valorBooking(p);
    const acum = acumuladoAnterior(p);
    valorOfTotal += booking || 0;
    acum2025Total += acum || 0;
    const fila = backlogDe(p);
    if (!fila) return;
    const fin = mesFinalizacion(p);
    if (fin !== null && fin > diciembre) {
      ultimoMes = Math.max(ultimoMes, fin);
      const saldo = backlogHoy(p);
      if (Number.isFinite(saldo)) proyecciones.push({ saldo, meses: fin - diciembre });
    }
    MESES_ES.forEach((m, i) => {
      const v = fila[m + '_fijo'];
      commitPorMes[i] += typeof v === 'number' ? v : 0;
    });
  });

  const datos = {};
  let acumulado = 0;
  MESES_ES.forEach((m, i) => {
    acumulado += commitPorMes[i];
    const etiqueta = etiquetaMesRevenue(anioRevenue() * 12 + i);
    datos[etiqueta] = { Commit: acumulado, Backlog: valorOfTotal - acum2025Total - acumulado };
  });
  const commitAnual = acumulado;
  const backlogDiciembre = valorOfTotal - acum2025Total - commitAnual;
  for (let mes = diciembre + 1; mes <= ultimoMes; mes++) {
    const transcurridos = mes - diciembre;
    const estimado = proyecciones.reduce((suma, p) => suma +
      (transcurridos >= p.meses ? p.saldo : p.saldo * transcurridos / p.meses), 0);
    datos[etiquetaMesRevenue(mes)] = {
      Commit: commitAnual + estimado,
      Backlog: backlogDiciembre - estimado,
    };
  }
  return datos;
}

export function serieSaldoProyecto(p) {
  const b=backlogDe(p),booking=valorBooking(p),vida=vidaProyecto(p),meses=calendarioVidaProyecto(p);
  if(!b||!Number.isFinite(booking)||!meses.length)return {datos:{},nota:'Sin Booking, primer Commit o Vida del proyecto suficiente para construir la curva.'};
  const arrastre=arrastreProyecto(p);
  const datos={'Inicio del registro':{'Revenue acumulado':0,'Backlog':booking}};
  let acumulado=arrastre,completo=Number.isFinite(arrastre);
  for(const m of meses){
    if(!Number.isFinite(b[m+'_fijo']))completo=false;
    if(completo)acumulado+=b[m+'_fijo'];
    datos[etiquetaPeriodoCalendario(m)]={'Revenue acumulado':completo?acumulado:null,'Backlog':completo?booking-acumulado:null};
  }
  const saldo=completo?booking-acumulado:null;
  let nota='Backlog = Booking − revenue acumulado: lo que falta por ejecutar, descontando también el Commit de años posteriores al Año fuente (el Backlog del Excel solo descuenta el de su año). Se usa un solo Booking por proyecto. Hasta el mes actual el revenue acumulado es el Ejecutado; después es el Proyectado, que suma solo Commit (nunca Upside), incluidos los meses de 2027. ';
  if(Number.isFinite(arrastre)&&arrastre!==0)nota+=`El primer mes incorpora ${formatearDineroExacto(arrastre)} de acumulado anterior al calendario disponible. `;
  if(!vida.fin)nota+='Sin Fecha fin: la curva termina en el último mes con Commit registrado. ';
  nota+=saldo===null?'Hay meses sin cobertura: la curva queda sin dato; no se inventa revenue.':Math.abs(saldo)<.01?'Los commits cubren el Booking y el Backlog llega a cero.':`Backlog al finalizar según los Commit cargados: ${formatearDineroExacto(saldo)}${saldo<0?' de ejecución excedente':''}. No se fuerza a cero ni se reparte Backlog sin Commit.`;
  return {datos,nota,saldo};
}

// KPIs del encabezado y los textos de ayuda que los explican.
import { estado } from './estado.js';
import { formatearDinero, formatearDineroExacto } from './formato.js';
import { periodoActual, etiquetaPeriodoCalendario, mesReferenciaFinanciera } from './calendario.js';
import { valorBooking, ejecutadoProyecto, backlogHoy, revenuePeriodo, upsidePeriodo, resumenFinanciero, sumaConDato, ejecucionPonderada } from './dinero-proyecto.js';

export function textoAyudaGlobal() {
  return 'El rango selecciona proyectos cuya vida registrada se solapa con las fechas elegidas: desde el primer commit distinto de cero hasta su fecha fin, ambos inclusive. No exige tener commit en cada trimestre. Si falta un límite, se usa solo el conocido. México filtra país México; NSSA incluye el resto de NOLA. Commit y Upside suman los meses del rango. Booking, Ejecutado, Proyectado y Backlog (continuo entre años) usan una sola fuente por proyecto, con preferencia por el año actual, y cubren toda la vida del proyecto. El detalle muestra la vida completa, sin recortarla por este rango.';
}

export function actualizarAyudas() {
  const texto=textoAyudaGlobal(),ayuda=document.getElementById('ayuda-rango-texto');if(ayuda)ayuda.textContent=texto;
  const r=resumenFinanciero(estado.proyectosFiltrados),ref=r.referencias.map(a=>'FY'+a).join(', ')||'sin fuente';
  const info={
    'kpi-total-proyectos':'Proyectos que cumplen el rango, territorio, estado y filtros seleccionados.',
    'kpi-valor-of-total':`Booking de BackLog NOLA, una vez por proyecto. Año fuente: ${ref}; no se suman Bookings de distintos años.`,
    'kpi-acumulado-hoy':`Ejecutado: acumulado anterior más el Commit de todos los meses hasta ${etiquetaPeriodoCalendario(mesReferenciaFinanciera())}, inclusive, sobre toda la vida del proyecto. No es solo el revenue del rango seleccionado.`,
    'kpi-backlog-2026':`Backlog continuo entre años: el Backlog de la Carga más reciente (Año fuente ${ref}) menos el Commit de los años posteriores a ese Año fuente; lo que falta por planear de toda la vida del proyecto. Por eso puede no coincidir con el Excel de un solo año (suma de las fuentes: ${formatearDineroExacto(r.backlogFuente)}). No es Booking menos Ejecutado.`,
    'kpi-pct-ejecucion':'Ejecutado dividido por Booking; ponderado por monto.',
    'kpi-revenue-periodo':`Suma de Commit en ${periodoActual().etiqueta}; cambia con el rango global.`,
    'kpi-upside-periodo':`Suma de Upside en ${periodoActual().etiqueta}; no se considera revenue comprometido.`,
    'kpi-commit-pendiente':`Commit de los meses posteriores a ${etiquetaPeriodoCalendario(mesReferenciaFinanciera())}, de cualquier año hasta el fin de la vida del proyecto; independiente del rango de revenue. Nunca incluye Upside.`,
    'kpi-proyectado':`Proyectado: Ejecutado más el Commit pendiente (${formatearDineroExacto(r.pendiente)}), sobre toda la vida del proyecto. Sin Upside.${r.parciales?` ${r.parciales} proyectos son parciales: su vida llega más allá del Commit cargado, y esos meses no se cuentan como cero; el cálculo se completa cuando se cargue ese Commit.`:''}`,
    'kpi-diferencia-booking':`Booking − Proyectado − Backlog (continuo). Cero significa conciliado. Positivo: valor sin explicar; negativo: excedente. ${r.faltantes?r.faltantes+' proyectos tienen cifras incompletas.':'No se ajusta ningún importe para forzar igualdad.'}`,
  };
  document.querySelectorAll('.fila-kpis-pms .kpi-etiqueta').forEach(label=>{
    if(label.querySelector('.ayuda-kpi'))return;
    const ayuda=document.createElement('button');ayuda.type='button';ayuda.className='ayuda-kpi';ayuda.textContent='?';
    ayuda.title='Portafolio por PM: respeta el rango global y el territorio. Commit y Upside suman los meses seleccionados; Booking y Backlog se toman una vez por proyecto del Año fuente, con su estado actual.';
    ayuda.setAttribute('aria-label',ayuda.title);label.appendChild(ayuda);
  });
  for(const [id,title]of Object.entries(info)){
    const valor=document.getElementById(id),tile=valor?.closest('.kpi-tile');if(!tile)continue;
    valor.title=title;
    let ayuda=tile.querySelector('.ayuda-kpi');
    if(!ayuda){ayuda=document.createElement('button');ayuda.type='button';ayuda.className='ayuda-kpi';ayuda.textContent='?';tile.querySelector('.kpi-etiqueta').appendChild(ayuda);}
    ayuda.title=title;ayuda.setAttribute('aria-label',title);
  }
}

/**
 * Los KPIs se recalculan sobre los proyectos filtrados, no sobre el total:
 * el punto de filtrar es ver los números de ese recorte.
 *
 * Los nulos se ignoran en vez de contarse como cero. Con 26 proyectos que
 * traen #N/A del Excel, tratarlos como cero bajaría los promedios y daría
 * una lectura falsa.
 */
export function calcularKPIs() {
  const proyectos = estado.proyectosFiltrados;
  const booking = sumaConDato(proyectos, valorBooking);
  const acumulado = sumaConDato(proyectos, ejecutadoProyecto);
  const backlog = sumaConDato(proyectos, backlogHoy);

  const texto = (id, valor) => {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
  };

  texto('kpi-total-proyectos', proyectos.length.toLocaleString('es'));
  texto('kpi-valor-of-total', formatearDinero(booking));
  texto('kpi-acumulado-hoy', formatearDinero(acumulado));
  texto('kpi-backlog-2026', formatearDinero(backlog));
  // Ejecución global = lo ejecutado sobre lo contratado, no el promedio de
  // los porcentajes: un proyecto de 2 millones no pesa igual que uno de 20 mil.
  const ejecucion = ejecucionPonderada(proyectos);
  texto('kpi-pct-ejecucion', ejecucion === null ? '—' : ejecucion.toFixed(1) + '%');

  const importesPeriodo=proyectos.map(revenuePeriodo).filter(Number.isFinite);
  const rev=importesPeriodo.length||!proyectos.length?importesPeriodo.reduce((a,b)=>a+b,0):null;
  texto('kpi-revenue-periodo', formatearDinero(rev));
  texto('kpi-revenue-periodo-etq', `Commit · ${periodoActual().etiqueta}`);
  const financiero=resumenFinanciero(proyectos);
  const upsides=proyectos.map(upsidePeriodo).filter(Number.isFinite);
  texto('kpi-upside-periodo',formatearDinero(upsides.length||!proyectos.length?upsides.reduce((a,b)=>a+b,0):null));
  texto('kpi-commit-pendiente',formatearDinero(financiero.pendiente));
  texto('kpi-proyectado',formatearDinero(financiero.proyectado));
  texto('kpi-proyectado-aviso',financiero.parciales?`Parcial en ${financiero.parciales} de ${proyectos.length} proyectos`:'');
  texto('kpi-diferencia-booking',formatearDinero(financiero.diferencia));
  actualizarAyudas();
}

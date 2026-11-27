// Calendario de revenue: los meses que conoce el dashboard, los periodos que se
// pueden elegir (año, trimestre, mes, rango) y el mes de referencia. Es el unico
// modulo que reasigna MESES_ES y PERIODOS: los demas solo los leen, porque los
// imports son de solo lectura (por eso se modifican en sitio, no se reasignan).
import { estado } from './estado.js';

export const NOMBRES_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const MESES_ES = [...NOMBRES_MESES];
export const PERIODOS = [
  { id: 'anio', etiqueta: 'Todo el año', meses: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { id: 'q1', etiqueta: 'Q1 · ene-mar', meses: [0, 1, 2] },
  { id: 'q2', etiqueta: 'Q2 · abr-jun', meses: [3, 4, 5] },
  { id: 'q3', etiqueta: 'Q3 · jul-sep', meses: [6, 7, 8] },
  { id: 'q4', etiqueta: 'Q4 · oct-dic', meses: [9, 10, 11] },
  ...MESES_ES.map((m, i) => ({
    id: m, etiqueta: m.charAt(0).toUpperCase() + m.slice(1), meses: [i],
  })),
];

export function configurarCalendarioTimeline(meta) {
  MESES_ES.splice(0,MESES_ES.length,...meta.periodos);
  const url=new URLSearchParams(location.search);
  const explicito=url.has('desde')||url.has('hasta');
  const fecha=meta.fecha_referencia || new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const anio=Number(fecha.slice(0,4)) || meta.anio_actual;
  const mes=Number(fecha.slice(5,7)) || 1;
  const inicioQ=`${anio}-${String(Math.floor((mes-1)/3)*3+1).padStart(2,'0')}`;
  // El calendario son exactamente los periodos que trae la API: un Año fuente
  // nuevo aparece solo cuando llega su Carga, sin tocar codigo.
  const primero=MESES_ES[0],ultimo=MESES_ES.at(-1);
  const hastaPorDefecto=ultimo||meta.hasta||inicioQ;
  const desdePorDefecto=primero&&inicioQ<primero?primero:(inicioQ>hastaPorDefecto?(primero||inicioQ):inicioQ);
  PERIODOS.splice(0,PERIODOS.length,{id:'todos',etiqueta:'Todo el histórico',meses:MESES_ES.map((_,i)=>i)});
  for(const anio of [...new Set(MESES_ES.map(p=>p.slice(0,4)))]) {
    PERIODOS.push({id:'y'+anio,etiqueta:anio,meses:MESES_ES.map((p,i)=>p.startsWith(anio)?i:-1).filter(i=>i>=0)});
    for(let q=1;q<=4;q++)PERIODOS.push({id:anio+'-q'+q,etiqueta:`Q${q} ${anio}`,
      meses:MESES_ES.map((p,i)=>p.startsWith(anio)&&Math.ceil(Number(p.slice(5))/3)===q?i:-1).filter(i=>i>=0)});
  }
  PERIODOS.push(...MESES_ES.map((p,i)=>({id:p,etiqueta:etiquetaPeriodoCalendario(p),meses:[i]})));
  estado.forecast.periodos=[...MESES_ES];
  estado.rangoTimeline=explicito?{desde:url.get('desde')||meta.desde,hasta:url.get('hasta')||meta.hasta}:{desde:desdePorDefecto,hasta:hastaPorDefecto};
  estado.periodo='rango';
  estado.unidadTimeline=url.get('unidad')==='trimestres'||!explicito?'trimestres':'meses';
}

export function etiquetaPeriodoCalendario(p) {
  if(!/^\d{4}-\d{2}$/.test(p||''))return p;
  return NOMBRES_MESES[Number(p.slice(5))-1].slice(0,3)+' '+p.slice(0,4);
}

// El calendario pertenece al año seleccionado, no al año del navegador.
export function anioRevenue() { return estado.forecast.anio; }

export function mesesEjecutadosForecast(hoy = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: 'numeric' }).formatToParts(hoy);
  const anio = Number(partes.find(p => p.type === 'year').value);
  const mes = Number(partes.find(p => p.type === 'month').value);
  return anioRevenue() < anio ? 12 : anioRevenue() > anio ? 0 : mes;
}

export function etiquetaMesRevenue(indice) {
  const mes = NOMBRES_MESES[indice % 12];
  return `${mes.charAt(0).toUpperCase() + mes.slice(1, 3)} ${Math.floor(indice / 12)}`;
}

export function mesReferenciaFinanciera() {
  const fecha=estado.metadataProyectos?.fecha_referencia;
  if(/^\d{4}-\d{2}-\d{2}$/.test(fecha||''))return fecha.slice(0,7);
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit'}).formatToParts(new Date());
  return parts.find(p=>p.type==='year').value+'-'+parts.find(p=>p.type==='month').value;
}

export function periodoActual() {
  if(estado.periodo==='rango'&&estado.rangoTimeline) {
    const {desde,hasta}=estado.rangoTimeline;
    return {id:'rango',etiqueta:etiquetaPeriodoCalendario(desde)+' – '+etiquetaPeriodoCalendario(hasta),
      meses:MESES_ES.map((p,i)=>p>=desde&&p<=hasta?i:-1).filter(i=>i>=0)};
  }
  return PERIODOS.find(p => p.id === estado.periodo) || PERIODOS[0];
}

/** Índices de mes que entran en el periodo elegido. */
export function mesesActivos() {
  return periodoActual().meses;
}

/** Suma fijo y upside de un tramo `meses` (12 pares [fijo, upside]). */
export function sumarMeses(pares, indices) {
  let fijo = 0, upside = 0;
  (indices || mesesActivos()).forEach(i => {
    const par = pares[i];
    if (!par) return;
    fijo += par[0] || 0;
    upside += par[1] || 0;
  });
  return { fijo, upside };
}

/** Variaciones solo en meses con cobertura en ambos Snapshots; añadir un año no es un movimiento. */
export function coberturaCalendario(snapshot,indices=mesesActivos()) {
  return !snapshot.anios_disponibles || indices.every(i=>snapshot.anios_disponibles.includes(Number(MESES_ES[i]?.slice(0,4))));
}

export function compararMeses(a,b,indices=mesesActivos()) {
  let fijoA=0,fijoB=0,upsideA=0,upsideB=0,nuevos=0;
  indices.forEach(i=>{
    const anterior=a?.meses?.[i],nuevo=b?.meses?.[i];
    if(!Number.isFinite(anterior?.[0])||!Number.isFinite(nuevo?.[0])) {
      if(Number.isFinite(nuevo?.[0]))nuevos++;return;
    }
    fijoA+=anterior[0];fijoB+=nuevo[0];
    upsideA+=anterior[1]||0;upsideB+=nuevo[1]||0;
  });
  return {fijoA,fijoB,upsideA,upsideB,nuevos};
}

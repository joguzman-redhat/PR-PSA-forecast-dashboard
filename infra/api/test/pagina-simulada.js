// Cargador comun de las pruebas del front. Ejecuta el front completo en una
// pagina simulada y expone sus funciones de calculo como `ui`. Es el unico
// seam de las pruebas: si cambia la forma de cargar el front, solo cambia aqui.
const vm = require('node:vm');
const { codigoUnido } = require('./modulos-front');
// El front se carga como lo recibe el navegador (modulos ES) pero se ejecuta
// unido en un solo ambito, para que las pruebas lean y reemplacen sus funciones.
const code = codigoUnido();
function pagina(search='') {
  const clases=new Set();const controles=new Map();
  for(const id of ['forecast-desde','forecast-hasta','forecast-estado','forecast-unidad'])controles.set(id,{
    value:'',textContent:'',disabled:false,opciones:[],handlers:{},
    replaceChildren(...items){this.opciones=items;},appendChild(item){this.opciones.push(item);},
    addEventListener(tipo,handler){this.handlers[tipo]=handler;},setCustomValidity(msg){this.validationMessage=msg;},reportValidity(){},
  });
  const context=vm.createContext({Intl,URL,URLSearchParams,console,Map,Set,
    document:{addEventListener(){},getElementById(id){return controles.get(id);},
      querySelector(){return {classList:{toggle(k,v){if(v)clases.add(k);else clases.delete(k);},add(k){clases.add(k);}}};}},
    Option:function(text,value){this.text=text;this.value=String(value);},
    location:{search,href:'http://localhost:3000/'+search,assign(url){this.destino=url;}},
  });
  vm.runInContext(code+'\nglobalThis.ui={acumuladoHoy:ejecutadoProyecto,backlogHoy,proyectadaAnio:proyectadoProyecto,backlogDe,mesFinalizacion,periodoFinProyecto,proyeccionReferencia,corteFinanciero:mesReferenciaFinanciera,calcularKPIs,mesesActivos,etiquetaPeriodoCalendario,formatearDinero,formatearDineroExacto,formatearPorcentaje,estado,cargarDatos,configurarSelectorForecast,mesesEjecutadosForecast,serieBacklogRevenuePorMes,acumuladoAnterior,configurarCalendarioTimeline,periodoActual,revenuePeriodo,upsidePeriodo,valorBooking,claveProyecto,compararMeses,coberturaCalendario,vidaProyecto,pasaPeriodoProyecto,mesesTimelineProyecto,valorDimension,etiquetaDimension,calcularPMs,pasaTerritorio,porcentajeEjecucionProyecto,calendarioVidaProyecto,serieSaldoProyecto,advertenciaFueraDeFechaFin,resumenFinanciero,commitPendienteProyecto,backlogDeLaFuente,coberturaProyectado,textoProyectadoParcial,rangoSnapshots,DIMENSIONES};',context);
  return {context,ui:context.ui,controles,clases};
}
// `anios` = cuantos Años fuente trae la API (2026 en adelante); por defecto dos.
function datosTimeline(anios=2) {
  const periodos=Array.from({length:12*anios},(_,i)=>`${2026+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`);
  return {meta:{timeline:true,anio_actual:2026,fecha_referencia:'2026-11-24',estado:'disponible',periodos,desde:'2026-01',hasta:`${2025+anios}-12`},
    proyectos:[{_tipo_fila:'proyecto',num_pa:'123',clave_timeline:'PA:123'}],
    backlog:[{_tipo_fila:'proyecto',num_pa:'123',clave_timeline:'PA:123',valor_of:1000,acumulado_anterior:50,
      '2026-01_fijo':100,'2027-01_fijo':200,'2026-10_fijo':10,'2027-12_fijo':20}],
    historia:{snapshots:[],eventos:[],series_por_proyecto:{}}};
}
// Sustituye el DOM por elementos que se crean al pedirlos y devuelve una
// funcion que lee el texto que el front escribio en cada uno.
function simularElementos(context) {
  const elementos = new Map();
  context.document.getElementById = id => {
    if (!elementos.has(id)) elementos.set(id, { textContent: '', title: '', closest() { return null; } });
    return elementos.get(id);
  };
  context.document.querySelectorAll = () => [];
  return id => elementos.get(id).textContent;
}
module.exports = { pagina, datosTimeline, simularElementos };

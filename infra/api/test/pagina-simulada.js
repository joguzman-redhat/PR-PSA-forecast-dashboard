// Cargador comun de las pruebas del front. Ejecuta el front completo en una
// pagina simulada y expone sus funciones de calculo como `ui`. Es el unico
// seam de las pruebas: si cambia la forma de cargar el front, solo cambia aqui.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const code = fs.readFileSync(path.resolve(__dirname,'../../../app.js'),'utf8');
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
  vm.runInContext(code+'\nglobalThis.ui={acumuladoHoy,backlogHoy,proyectadaAnio,backlogDe,mesFinalizacion,periodoFinProyecto,proyeccionReferencia,corteFinanciero,calcularKPIs,mesesActivos,etiquetaPeriodoCalendario,formatearDinero,formatearDineroExacto,formatearPorcentaje,estado,cargarDatos,configurarSelectorForecast,mesesEjecutadosForecast,serieBacklogRevenuePorMes,acumuladoAnterior,configurarCalendarioTimeline,periodoActual,revenuePeriodo,upsidePeriodo,valorBooking,claveProyecto,compararMeses,coberturaCalendario,vidaProyecto,pasaPeriodoProyecto,mesesTimelineProyecto,valorDimension,etiquetaDimension,calcularPMs,pasaTerritorio,porcentajeEjecucionProyecto,calendarioVidaProyecto,serieSaldoProyecto,resumenFinanciero,commitPendienteProyecto,rangoSnapshots,DIMENSIONES};',context);
  return {context,ui:context.ui,controles,clases};
}
function datosTimeline() {
  const periodos=Array.from({length:24},(_,i)=>`${2026+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`);
  return {meta:{timeline:true,anio_actual:2026,fecha_referencia:'2026-11-24',estado:'disponible',periodos,desde:'2026-01',hasta:'2027-12'},
    proyectos:[{_tipo_fila:'proyecto',num_pa:'123',clave_timeline:'PA:123'}],
    backlog:[{_tipo_fila:'proyecto',num_pa:'123',clave_timeline:'PA:123',valor_of:1000,acumulado_anterior:50,
      '2026-01_fijo':100,'2027-01_fijo':200,'2026-10_fijo':10,'2027-12_fijo':20}],
    historia:{snapshots:[],eventos:[],series_por_proyecto:{}}};
}
module.exports = { pagina, datosTimeline };

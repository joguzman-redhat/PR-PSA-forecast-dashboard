const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const code = fs.readFileSync(path.resolve(__dirname,'../../../app.js'),'utf8');
function pagina(search='') {
  const clases=new Set();const controles=new Map();
  for(const id of ['forecast-desde','forecast-hasta','forecast-estado'])controles.set(id,{
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
  vm.runInContext(code+'\nglobalThis.ui={estado,cargarDatos,configurarSelectorForecast,mesesEjecutadosForecast,serieBacklogRevenuePorMes,acumuladoAnterior,configurarCalendarioTimeline,periodoActual,revenuePeriodo,upsidePeriodo,valorBooking,claveProyecto,compararMeses,coberturaCalendario};',context);
  return {context,ui:context.ui,controles,clases};
}
test('el corte mensual distingue años pasados, actuales y futuros en hora Colombia',()=>{
  const {ui}=pagina();const hoy=new Date('2026-11-14T12:00:00Z');
  ui.estado.forecast.anio=2025;assert.equal(ui.mesesEjecutadosForecast(hoy),12);
  ui.estado.forecast.anio=2026;assert.equal(ui.mesesEjecutadosForecast(hoy),11);
  ui.estado.forecast.anio=2027;assert.equal(ui.mesesEjecutadosForecast(hoy),0);
  assert.equal(ui.mesesEjecutadosForecast(new Date('2027-01-01T01:00:00Z')),0);
});
test('el calendario y la proyeccion usan el año seleccionado y no duplican el acumulado anterior',()=>{
  const {ui}=pagina();ui.estado.forecast.anio=2027;
  const p={num_pa:'123',fecha_fin:'03/31/2028'};
  const fila={num_pa:'123',acumulado_anterior:160,valor_of:1000,total_ejecutado_acumulado:210,backlog:790,enero_fijo:50};
  ui.estado.backlogPorPA=new Map([['123',fila]]);
  const serie=ui.serieBacklogRevenuePorMes([p]);
  assert.ok(Object.keys(serie)[0].endsWith('2027'));
  assert.equal(serie['Dic 2027'].Backlog,790);
  assert.equal(serie['Mar 2028'].Backlog,0);
  assert.equal(ui.acumuladoAnterior(p),160);
});
function datosTimeline() {
  const periodos=Array.from({length:24},(_,i)=>`${2026+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`);
  return {meta:{timeline:true,anio_actual:2026,estado:'disponible',periodos,desde:'2026-01',hasta:'2027-12'},
    proyectos:[{_tipo_fila:'proyecto',num_pa:'123',clave_timeline:'PA:123'}],
    backlog:[{_tipo_fila:'proyecto',num_pa:'123',clave_timeline:'PA:123',valor_of:1000,acumulado_anterior:50,
      '2026-01_fijo':100,'2027-01_fijo':200,'2026-10_fijo':10,'2027-12_fijo':20}],
    historia:{snapshots:[],eventos:[],series_por_proyecto:{}}};
}
test('carga atomica del timeline sin selector de año ni fuente',async()=>{
  const {ui,context,controles}=pagina();const consultas=[];
  context.fetch=async url=>{consultas.push(url);return {ok:true,json:async()=>datosTimeline()};};
  assert.equal(await ui.cargarDatos(),true);assert.equal(consultas.length,1);assert.match(consultas[0],/api\/timeline/);
  ui.configurarSelectorForecast();assert.equal(controles.get('forecast-desde').opciones.length,32);
  assert.equal(ui.valorBooking(ui.estado.proyectos[0]),1000);
  assert.equal(ui.claveProyecto(ui.estado.proyectos[0]),'PA:123');
});
test('Desde y Hasta aceptan trimestres completos, meses y rangos entre años',async()=>{
  const {ui,context,controles}=pagina();
  context.fetch=async()=>({ok:true,json:async()=>datosTimeline()});
  context.history={replaceState(_state,_title,url){context.location.href=String(url);}};
  context.document.querySelectorAll=()=>[];
  vm.runInContext('actualizarUI=()=>{};renderizarTrazabilidad=()=>{};renderizarPMs=()=>{};',context);
  await ui.cargarDatos();ui.configurarSelectorForecast();
  const desde=controles.get('forecast-desde'),hasta=controles.get('forecast-hasta');
  assert.ok(desde.opciones.some(o=>o.value==='2026-10'));
  assert.ok(desde.opciones.some(o=>o.value==='2026-q4'&&o.text.includes('oct–dic')));
  desde.value='2026-q4';hasta.value='2027-q1';desde.handlers.change();
  assert.equal(ui.periodoActual().meses.length,6);
  assert.equal(ui.revenuePeriodo(ui.estado.proyectos[0]),210);
  assert.equal(new URL(context.location.href).search,'?desde=2026-10&hasta=2027-03');
  hasta.value='2026-q4';hasta.handlers.change();
  assert.equal(ui.periodoActual().meses.length,3);
  assert.equal(ui.revenuePeriodo(ui.estado.proyectos[0]),10);
  desde.value='2026-11';desde.handlers.change();
  assert.equal(ui.periodoActual().meses.length,2);
  assert.equal(ui.revenuePeriodo(ui.estado.proyectos[0]),null);
  desde.value='2027-q2';desde.handlers.change();
  assert.match(hasta.validationMessage,/posterior/);
  assert.equal(ui.estado.rangoTimeline.desde,'2026-11');
});
test('rango Q4 2026 a Q4 2027 selecciona 15 meses y suma cada enero por separado',async()=>{
  const {ui,context}=pagina('?desde=2026-10&hasta=2027-12');
  context.fetch=async()=>({ok:true,json:async()=>({...datosTimeline(),meta:{...datosTimeline().meta,desde:'2026-10',hasta:'2027-12'}})});
  await ui.cargarDatos();assert.equal(ui.periodoActual().meses.length,15);
  assert.equal(ui.revenuePeriodo(ui.estado.proyectos[0]),230);
  ui.estado.periodo='todos';assert.equal(ui.revenuePeriodo(ui.estado.proyectos[0]),330);
});
test('un periodo sin cobertura permanece sin dato, y no aparenta ser cero',async()=>{
  const {ui,context}=pagina();context.fetch=async()=>({ok:true,json:async()=>datosTimeline()});await ui.cargarDatos();
  ui.estado.periodo='2026-02';assert.equal(ui.revenuePeriodo(ui.estado.proyectos[0]),null);
  assert.equal(ui.upsidePeriodo(ui.estado.proyectos[0]),null);
  const datos=ui.serieBacklogRevenuePorMes(ui.estado.proyectos);assert.equal(Object.values(datos)[0].Commit,null);
});
test('base vacia muestra estado explicito sin reutilizar el forecast anterior',async()=>{
  const {ui,context,clases,controles}=pagina();context.fetch=async()=>({ok:true,json:async()=>({
    meta:{timeline:true,anio_actual:2026,periodos:[],desde:null,hasta:null,estado:'sin_datos'},
    proyectos:[],backlog:[],historia:{snapshots:[],eventos:[],series_por_proyecto:{}}})});
  assert.equal(await ui.cargarDatos(),true);assert.ok(clases.has('forecast-sin-datos'));
  assert.match(controles.get('forecast-estado').textContent,/no hay datos/);
});


test('incorporar enero FY27 no es un movimiento y cambios posteriores si se detectan',()=>{
  const {ui}=pagina();
  const a={meses:[[100,10],[null,null]]};const b={meses:[[110,15],[200,30]]};
  const c=ui.compararMeses(a,b,[0,1]);assert.equal(c.fijoB-c.fijoA,10);assert.equal(c.upsideB-c.upsideA,5);assert.equal(c.nuevos,1);
  const posterior=ui.compararMeses(b,{meses:[[110,15],[220,35]]},[0,1]);assert.equal(posterior.fijoB-posterior.fijoA,20);
});


test('capturas sin FY27 no dibujan cero para los meses FY27',()=>{
  const {ui}=pagina();ui.estado.forecast.timeline=true;ui.configurarCalendarioTimeline(datosTimeline().meta);
  assert.equal(ui.coberturaCalendario({anios_disponibles:[2026]},[0,12]),false);
  assert.equal(ui.coberturaCalendario({anios_disponibles:[2026]},[0,1]),true);
  assert.equal(ui.coberturaCalendario({anios_disponibles:[2026,2027]},[0,12]),true);
});

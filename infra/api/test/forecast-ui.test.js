const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { pagina, datosTimeline } = require('./pagina-simulada');
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
  const fila={num_pa:'123',acumulado_anterior:160,booking:1000,proyectado:210,backlog:790,enero_fijo:50};
  ui.estado.backlogPorPA=new Map([['123',fila]]);
  const serie=ui.serieBacklogRevenuePorMes([p]);
  assert.ok(Object.keys(serie)[0].endsWith('2027'));
  assert.equal(serie['Dic 2027'].Backlog,790);
  assert.equal(serie['Mar 2028'].Backlog,0);
  assert.equal(ui.acumuladoAnterior(p),160);
});
test('carga atomica del timeline sin selector de año ni fuente',async()=>{
  const {ui,context,controles}=pagina();const consultas=[];
  context.fetch=async url=>{consultas.push(url);return {ok:true,json:async()=>datosTimeline()};};
  assert.equal(await ui.cargarDatos(),true);assert.equal(consultas.length,1);assert.match(consultas[0],/api\/timeline/);
  ui.configurarSelectorForecast();assert.equal(controles.get('forecast-desde').opciones.length,8);
  assert.equal(ui.valorBooking(ui.estado.proyectos[0]),1000);
  assert.equal(ui.claveProyecto(ui.estado.proyectos[0]),'PA:123');
});
test('Desde y Hasta aceptan trimestres completos, meses y rangos entre años',async()=>{
  const {ui,context,controles}=pagina('?desde=2026-01&hasta=2027-12');
  context.fetch=async()=>({ok:true,json:async()=>datosTimeline()});
  context.history={replaceState(_state,_title,url){context.location.href=String(url);}};
  context.document.querySelectorAll=()=>[];
  vm.runInContext('aplicarFiltros=()=>{};actualizarUI=()=>{};renderizarTrazabilidad=()=>{};renderizarPMs=()=>{};',context);
  await ui.cargarDatos();ui.configurarSelectorForecast();
  const desde=controles.get('forecast-desde'),hasta=controles.get('forecast-hasta');
  assert.ok(desde.opciones.some(o=>o.value==='2026-10'));
  const unidad=controles.get('forecast-unidad');
  unidad.value='trimestres';unidad.handlers.change();
  assert.equal(desde.opciones.length,8);
  assert.ok(desde.opciones.some(o=>o.value==='2026-q4'&&o.text.includes('oct–dic')));
  desde.value='2026-q4';hasta.value='2027-q1';desde.handlers.change();
  assert.equal(ui.periodoActual().meses.length,6);
  assert.equal(ui.revenuePeriodo(ui.estado.proyectos[0]),210);
  assert.equal(new URL(context.location.href).search,'?desde=2026-10&hasta=2027-03&unidad=trimestres');
  hasta.value='2026-q4';hasta.handlers.change();
  assert.equal(ui.periodoActual().meses.length,3);
  assert.equal(ui.revenuePeriodo(ui.estado.proyectos[0]),10);
  unidad.value='meses';unidad.handlers.change();
  assert.equal(desde.opciones.length,24);
  desde.value='2026-11';desde.handlers.change();
  assert.equal(ui.periodoActual().meses.length,2);
  assert.equal(ui.revenuePeriodo(ui.estado.proyectos[0]),null);
  unidad.value='trimestres';unidad.handlers.change();
  const anterior=ui.estado.rangoTimeline.desde;
  desde.value='2027-q2';desde.handlers.change();
  assert.match(hasta.validationMessage,/posterior/);
  assert.equal(ui.estado.rangoTimeline.desde,anterior);
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


test('fin se filtra por mes y año desde la fecha real, incluidos ISO y serial Excel',()=>{
  const {ui}=pagina();
  for(const fecha of ['12/31/2027','2027-12-31',46752]) {
    // Excel serial 46752 is 2027-12-31.
    assert.equal(ui.valorDimension({fecha_fin:fecha},'periodo_fin'),'2027-12');
  }
  assert.equal(ui.etiquetaDimension('periodo_fin','2027-12'),'dic 2027');
  assert.equal(ui.valorDimension({fecha_fin:'02/30/2027'},'periodo_fin'),'(sin dato)');
  assert.equal(ui.valorDimension({},'periodo_fin'),'(sin dato)');
});
test('el rango filtra desde el primer commit hasta el mes fin sin inventar fechas',async()=>{
  const {ui,context}=pagina();context.fetch=async()=>({ok:true,json:async()=>datosTimeline()});await ui.cargarDatos();
  const p=ui.estado.proyectos[0];p.fecha_fin='12/31/2026';
  ui.estado.rangoTimeline={desde:'2027-01',hasta:'2027-12'};ui.estado.periodo='rango';
  assert.equal(ui.pasaPeriodoProyecto(p),false); // Even with future commit in the source.
  assert.equal(ui.vidaProyecto(p).fueraDeVigencia,true);
  ui.estado.rangoTimeline={desde:'2026-12',hasta:'2026-12'};
  assert.equal(ui.pasaPeriodoProyecto(p),true);
  ui.estado.periodo='todos';assert.equal(ui.mesesTimelineProyecto(p).length,12);
  ui.estado.backlog[0]['2026-01_fijo']=0;ui.estado.backlog[0]['2026-10_fijo']=0;
  p.fecha_fin='12/31/2027';ui.estado.rangoTimeline={desde:'2026-01',hasta:'2026-12'};ui.estado.periodo='rango';
  assert.equal(ui.pasaPeriodoProyecto(p),false); // First recorded commit is January 2027.
  delete p.fecha_fin;ui.estado.rangoTimeline={desde:'2027-01',hasta:'2027-12'};
  assert.equal(ui.pasaPeriodoProyecto(p),true);
  assert.equal(ui.valorDimension(p,'periodo_fin'),'(sin dato)');
});
test('los proyectos sin commit se filtran por su fin conocido y los PMs respetan la vigencia',async()=>{
  const {ui,context}=pagina();const datos=datosTimeline();
  datos.proyectos[0].pm_lider='PM prueba';datos.proyectos[0].estado='In Progress';datos.proyectos[0].fecha_fin='12/31/2026';
  datos.proyectos.push({...datos.proyectos[0],num_pa:'456',clave_timeline:'PA:456',fecha_fin:'12/31/2027'});
  datos.backlog.push({_tipo_fila:'proyecto',num_pa:'456',clave_timeline:'PA:456',valor_of:400,backlog:300,'2027-01_fijo':0});
  context.fetch=async()=>({ok:true,json:async()=>datos});await ui.cargarDatos();
  ui.estado.periodo='rango';ui.estado.rangoTimeline={desde:'2027-01',hasta:'2027-12'};
  const filas=ui.calcularPMs();assert.equal(filas.length,1);assert.equal(filas[0].nProyectos,1);
  assert.equal(filas[0].proyectos[0].num_pa,'456');assert.equal(ui.vidaProyecto(datos.proyectos[1]).inicio,null);
  datos.proyectos[1].fecha_fin='12/31/2026';assert.equal(ui.pasaPeriodoProyecto(datos.proyectos[1]),false);
});


test('por defecto usa Q actual a Q4 del siguiente año; una URL explícita conserva su rango',async()=>{
  const {ui,context}=pagina();context.fetch=async()=>({ok:true,json:async()=>datosTimeline()});await ui.cargarDatos();
  assert.equal(ui.estado.unidadTimeline,'trimestres');assert.equal(ui.estado.rangoTimeline.desde,'2026-10');assert.equal(ui.estado.rangoTimeline.hasta,'2027-12');
  assert.equal(ui.periodoActual().meses.length,15);
  const otra=pagina('?desde=2026-01&hasta=2026-03');otra.context.fetch=context.fetch;await otra.ui.cargarDatos();
  assert.equal(otra.ui.estado.rangoTimeline.desde,'2026-01');assert.equal(otra.ui.periodoActual().meses.length,3);
});
test('México y NSSA particionan NOLA, admiten acentos y no se confunden con Zona',()=>{
  const {ui}=pagina();const rows=[{pais:'Mexico',zona:'Commercial'},{pais:'México',zona:'Enterprise'},{pais:'Jamaica',zona:'CEACA'},{pais:null}];
  ui.estado.territorio='mexico';assert.equal(rows.filter(ui.pasaTerritorio).length,2);
  ui.estado.territorio='nssa';assert.equal(rows.filter(ui.pasaTerritorio).length,2);
  ui.estado.territorio='todos';assert.equal(rows.filter(ui.pasaTerritorio).length,4);
});
test('barra contractual independiente del número de proyectos filtrados',async()=>{
  const {ui,context}=pagina();const d=datosTimeline();Object.assign(d.backlog[0],{valor_of:1000,acumulado_a_fecha:811,backlog:189});
  context.fetch=async()=>({ok:true,json:async()=>d});await ui.cargarDatos();
  assert.equal(ui.porcentajeEjecucionProyecto(ui.estado.proyectos[0]),81.1);
});
test('proyectado más Backlog explica Booking e informa diferencias sin rellenarlas',async()=>{
  const {ui,context}=pagina();const d=datosTimeline();Object.assign(d.backlog[0],{anio_atributos:2026,valor_of:1000,acumulado_a_fecha:700,backlog:270,'2026-12_fijo':30});
  context.fetch=async()=>({ok:true,json:async()=>d});await ui.cargarDatos();let r=ui.resumenFinanciero(ui.estado.proyectos);
  assert.equal(r.proyectado,730);assert.equal(r.pendiente,30);assert.equal(r.diferencia,0);
  d.backlog[0]['2026-12_fijo']=10;r=ui.resumenFinanciero(ui.estado.proyectos);assert.equal(r.diferencia,20);
  d.backlog[0]['2026-12_fijo']=null;r=ui.resumenFinanciero(ui.estado.proyectos);assert.equal(r.diferencia,null);assert.equal(r.faltantes,1);
});
test('detalle conserva toda la vida, no duplica Bookings y no fuerza el saldo a cero',async()=>{
  const {ui,context}=pagina();const d=datosTimeline();d.proyectos[0].fecha_fin='06/30/2027';
  Object.assign(d.backlog[0],{anio_atributos:2026,valor_of:1000,acumulado_anterior:100});
  for(const m of d.meta.periodos)d.backlog[0][m+'_fijo']=0;
  d.backlog[0]['2026-03_fijo']=200;d.backlog[0]['2027-01_fijo']=300;
  context.fetch=async()=>({ok:true,json:async()=>d});await ui.cargarDatos();ui.estado.rangoTimeline={desde:'2027-04',hasta:'2027-06'};
  const p=ui.estado.proyectos[0],meses=ui.calendarioVidaProyecto(p);assert.equal(meses[0],'2026-03');assert.equal(meses.at(-1),'2027-06');assert.equal(meses.length,16);
  const serie=ui.serieSaldoProyecto(p);assert.equal(Object.values(serie.datos)[0]['Saldo contractual'],1000);assert.equal(serie.saldo,400);
  assert.match(serie.nota,/No se fuerza a cero/);
  d.backlog[0]['2027-07_fijo']=999999;assert.equal(ui.serieSaldoProyecto(p).saldo,400);
});
test('meses sin cobertura no se convierten en ceros en la curva contractual',async()=>{
  const {ui,context}=pagina();const d=datosTimeline();d.proyectos[0].fecha_fin='01/31/2028';
  Object.assign(d.backlog[0],{anio_atributos:2026,valor_of:1000,acumulado_anterior:0});
  for(const m of d.meta.periodos)d.backlog[0][m+'_fijo']=0;d.backlog[0]['2026-01_fijo']=10;
  context.fetch=async()=>({ok:true,json:async()=>d});await ui.cargarDatos();const r=ui.serieSaldoProyecto(ui.estado.proyectos[0]);assert.equal(r.saldo,null);assert.match(r.nota,/sin cobertura/);
});
test('orden de filtros y ausencia de tipo de ejecución',()=>{
  const {ui}=pagina();assert.equal(ui.DIMENSIONES.slice(0,8).map(d=>d.campo).join(','),'estado,cliente,pm_lider,vendedor,tsm,zona,pais,periodo_fin');
  assert.equal(ui.DIMENSIONES.some(d=>d.campo==='tipo_de_ejecucion'),false);
});
test('la comparación selecciona dos capturas distintas y ordena sus extremos',()=>{
  const {ui,controles}=pagina();ui.estado.historia={snapshots:[{id:'t1'},{id:'t2'},{id:'t3'}]};
  controles.set('select-snap-a',{value:'2'});controles.set('select-snap-b',{value:'2'});
  assert.equal(ui.rangoSnapshots().join(','),'1,2');assert.equal(controles.get('select-snap-a').value,'1');
});


test('la curva no duplica el arrastre cuando cambia el año financiero de referencia',async()=>{
  const {ui,context}=pagina();const d=datosTimeline();d.proyectos[0].fecha_fin='12/31/2027';
  Object.assign(d.backlog[0],{anio_atributos:2027,valor_of:1000,acumulado_anterior:300});
  for(const m of d.meta.periodos)d.backlog[0][m+'_fijo']=0;
  d.backlog[0]['2026-01_fijo']=200;d.backlog[0]['2027-01_fijo']=300;
  context.fetch=async()=>({ok:true,json:async()=>d});await ui.cargarDatos();
  assert.equal(ui.serieSaldoProyecto(ui.estado.proyectos[0]).saldo,400);
});
test('un proyecto que aparece solo en FY27 conserva el arrastre conocido sin inventar FY26',async()=>{
  const {ui,context}=pagina();const d=datosTimeline();d.proyectos[0].fecha_fin='01/31/2027';
  Object.assign(d.backlog[0],{anio_atributos:2027,valor_of:1000,acumulado_anterior:300});
  for(const m of d.meta.periodos){if(m.startsWith('2026'))delete d.backlog[0][m+'_fijo'];else d.backlog[0][m+'_fijo']=0;}
  d.backlog[0]['2027-01_fijo']=100;
  context.fetch=async()=>({ok:true,json:async()=>d});await ui.cargarDatos();
  assert.equal(ui.calendarioVidaProyecto(ui.estado.proyectos[0])[0],'2027-01');assert.equal(ui.serieSaldoProyecto(ui.estado.proyectos[0]).saldo,600);
});
test('el rango inicial avanza al cambiar el año y deja sin cobertura los meses futuros',async()=>{
  const {ui,context}=pagina();const d=datosTimeline();d.meta.fecha_referencia='2027-02-01';d.meta.anio_actual=2027;
  context.fetch=async()=>({ok:true,json:async()=>d});await ui.cargarDatos();assert.equal(ui.estado.rangoTimeline.desde,'2027-01');assert.equal(ui.estado.rangoTimeline.hasta,'2028-12');
  assert.equal(ui.estado.forecast.periodos.at(-1),'2028-12');ui.estado.periodo='2028-01';assert.equal(ui.revenuePeriodo(ui.estado.proyectos[0]),null);
});

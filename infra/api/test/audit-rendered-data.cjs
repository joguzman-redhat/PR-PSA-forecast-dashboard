// Read-only checks of the real frontend calculations using a captured local API response.
// Usage: node infra/api/test/audit-rendered-data.cjs /tmp/forecast-audit
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const out=process.argv[2];if(!out)throw new Error('Supply the private audit output directory');
const data=JSON.parse(fs.readFileSync(path.join(out,'timeline.json')));
const dom=JSON.parse(fs.readFileSync(path.join(out,'pantallas.json')));
const controls=new Map();
const context=vm.createContext({Intl,URL,URLSearchParams,console,Map,Set,location:{search:''},
 document:{addEventListener(){},querySelector(){return {classList:{toggle(){},add(){}}};},getElementById(id){if(!controls.has(id))controls.set(id,{textContent:''});return controls.get(id);}},
 fetch:async()=>({ok:true,json:async()=>structuredClone(data)})});
vm.runInContext(require('./modulos-front').codigoUnido()+'\nglobalThis.ui={estado,cargarDatos,revenuePeriodo,upsidePeriodo,valorBooking,acumuladoHoy:ejecutadoProyecto,backlogHoy,calcularPMs,serieBacklogRevenuePorMes,commitPendienteProyecto,proyeccionReferencia,commitPosteriorAlAnioFuente,calendarioVidaProyecto,serieSaldoProyecto,advertenciaFueraDeFechaFin,vidaProyecto};',context);
let count=0;const issues=[];
function check(name,e,a){count++;const ok=typeof e==='number'?typeof a==='number'&&Math.abs(e-a)<.01:e===a;if(!ok)issues.push({name,expected:e,actual:a});}
function money(n){const sign=n<0?'-':'';n=Math.abs(n);return sign+'$'+(n>=1e6?(n/1e6).toFixed(2)+'M':n>=1e4?(n/1e3).toFixed(0)+'K':n>=1e3?(n/1e3).toFixed(1)+'K':n.toFixed(0));}
// Formula de los ADR 0001 y 0002 sobre los datos guardados, sin usar las funciones del front.
const mesesEntre=(a,z)=>{const r=[];let n=Number(a.slice(0,4))*12+Number(a.slice(5))-1;const u=Number(z.slice(0,4))*12+Number(z.slice(5))-1;for(;n<=u;n++)r.push(Math.floor(n/12)+'-'+String(n%12+1).padStart(2,'0'));return r;};
const hoy=data.meta.fecha_referencia.slice(0,7);
function esperado(p,b){
 const months=data.meta.periodos;
 const fuente=b.anio_atributos??data.meta.anio_actual,fijo=m=>b[m+'_fijo'];
 const inicio=months.find(m=>typeof fijo(m)==='number'&&fijo(m)!==0)||null;
 const f=typeof p.fecha_fin==='string'?p.fecha_fin.match(/^(\d{2})\/(\d{2})\/(\d{4})$/):null,fin=f?f[3]+'-'+f[1]:null;
 const registrados=months.filter(m=>typeof fijo(m)==='number'&&fijo(m)!==0);
 const finVida=fin||registrados.at(-1)||'';
 // Ejecutado = acumulado anterior + Commit de los meses del Año fuente en adelante hasta hoy.
 const tramo=months.filter(m=>Number(m.slice(0,4))>=fuente&&m<=hoy);
 const previos=months.filter(m=>inicio&&m>=inicio&&Number(m.slice(0,4))<fuente);
 const ejecutado=typeof b.acumulado_anterior==='number'&&previos.every(m=>typeof fijo(m)==='number')&&tramo.every(m=>typeof fijo(m)==='number')
   ?b.acumulado_anterior+tramo.reduce((a,m)=>a+fijo(m),0):null;
 const siguiente=mesesEntre(hoy,(Number(hoy.slice(0,4))+1)+'-12')[1];
 const desde=[siguiente,fuente+'-01'].sort().at(-1),hasta=[fuente+'-12',finVida].sort().at(-1);
 // Mes sin cobertura = sin dato, no cero: se suma solo el Commit que existe y el Proyectado queda parcial.
 const faltantes=desde<=hasta?mesesEntre(desde,hasta).filter(m=>typeof fijo(m)!=='number'):[];
 const pendiente=months.filter(m=>m>hoy&&typeof fijo(m)==='number').reduce((a,m)=>a+fijo(m),0);
 const posterior=months.filter(m=>Number(m.slice(0,4))>fuente).reduce((a,m)=>a+(typeof fijo(m)==='number'?fijo(m):0),0);
 return {booking:b.valor_of??null,backlogFuente:b.backlog??null,
   // ADR 0002: el Backlog mostrado es el de la fuente menos el Commit posterior al Año fuente.
   backlog:typeof b.backlog==='number'?b.backlog-posterior:null,ejecutado,pendiente,parcial:faltantes.length>0,
   proyectado:ejecutado!==null?ejecutado+pendiente:null,
   posterior,inicio,fin,registrados,fuente};
}
(async()=>{
const ui=context.ui;check('load',true,await ui.cargarDatos());
const months=data.meta.periodos;const backlog=new Map(data.backlog.map(r=>[r.clave_timeline,r]));
// Exhaustive ranges per project: all contiguous calendar ranges, commit and upside.
for(let start=0;start<months.length;start++)for(let end=start;end<months.length;end++){
 ui.estado.periodo='rango';ui.estado.rangoTimeline={desde:months[start],hasta:months[end]};
 for(const p of data.proyectos){const b=backlog.get(p.clave_timeline);for(const [suffix,fn] of [['fijo',ui.revenuePeriodo],['upside',ui.upsidePeriodo]]){
   const values=months.slice(start,end+1).map(m=>b[m+'_'+suffix]);const expected=values.some(v=>typeof v==='number')?values.reduce((s,v)=>s+(v||0),0):null;
   check(p.clave_timeline+' '+months[start]+'..'+months[end]+' '+suffix,expected,fn(p));
 }}
}
function elegibles(desde,hasta) {
 return data.proyectos.filter(p=>{
  if(['Completed','Canceled'].includes(p.estado))return false;
  const parts=typeof p.fecha_fin==='string'?p.fecha_fin.match(/^(\d{2})\/(\d{2})\/(\d{4})$/):null;
  const fin=parts?parts[3]+'-'+parts[1]:null;
  const b=backlog.get(p.clave_timeline);
  const inicio=months.find(m=>typeof b[m+'_fijo']==='number'&&b[m+'_fijo']!==0);
  return (!inicio||inicio<=hasta)&&(!fin||fin>=desde);
 });
}
const fecha=data.meta.fecha_referencia;const y=Number(fecha.slice(0,4)),m=Number(fecha.slice(5,7));
const defaultDesde=`${y}-${String(Math.floor((m-1)/3)*3+1).padStart(2,'0')}`,defaultHasta=`${y+1}-12`;
ui.estado.periodo='rango';ui.estado.rangoTimeline={desde:defaultDesde,hasta:defaultHasta};
const selectedMonths=months.filter(m=>m>=defaultDesde&&m<=defaultHasta);
const visible=elegibles(defaultDesde,defaultHasta);
const sumRows=(rows,f)=>rows.reduce((s,p)=>s+(backlog.get(p.clave_timeline)[f]||0),0);
const sum=f=>sumRows(visible,f);
for(const p of data.proyectos){const b=backlog.get(p.clave_timeline);check('booking '+p.clave_timeline,b.valor_of,ui.valorBooking(p));check('backlog continuo '+p.clave_timeline,esperado(p,b).backlog,ui.backlogHoy(p));check('accrued '+p.clave_timeline,b.acumulado_a_fecha,ui.acumuladoHoy(p));}
for(const [name,start,end] of [['pantalla',months.findIndex(m=>m>=defaultDesde),months.findLastIndex(m=>m<=defaultHasta)],['rango',9,23],['fy27',12,23]]){
 const selected=elegibles(months[start],months[end]);const sumPage=f=>sumRows(selected,f);
 const d=dom[name];check(name+' count',String(selected.length),d['kpi-total-proyectos']);check(name+' booking',money(sumPage('valor_of')),d['kpi-valor-of-total']);
 // Un proyecto sin cifras no cuenta como cero: Backlog y % de ejecucion usan solo los que tienen dato.
 const calc0=selected.map(p=>esperado(p,backlog.get(p.clave_timeline)));
 const conBacklog=calc0.map(c=>c.backlog).filter(v=>v!==null);
 check(name+' backlog continuo',conBacklog.length?money(conBacklog.reduce((a,b)=>a+b,0)):'\u2014',d['kpi-backlog-2026']);
 check(name+' accrued',money(sumPage('acumulado_a_fecha')),d['kpi-acumulado-hoy']);
 const ambos=calc0.filter(c=>c.booking!==null&&c.ejecutado!==null);
 check(name+' execution',ambos.length?(100*ambos.reduce((a,c)=>a+c.ejecutado,0)/ambos.reduce((a,c)=>a+c.booking,0)).toFixed(1)+'%':'\u2014',d['kpi-pct-ejecucion']);
 const expected=months.slice(start,end+1).reduce((s,m)=>s+sumPage(m+'_fijo'),0);check(name+' revenue',money(expected),d['kpi-revenue-periodo']);
 // Ticket 13/14: Proyectado y Commit pendiente, calculados aqui con la formula del ADR 0001.
 const calc=selected.map(p=>esperado(p,backlog.get(p.clave_timeline)));
 const total=f=>{const n=calc.map(f).filter(v=>v!==null);return n.length?n.reduce((a,b)=>a+b,0):null;};
 check(name+' commit pendiente',money(total(c=>c.pendiente)),d['kpi-commit-pendiente']);
 check(name+' proyectado',money(total(c=>c.proyectado)),d['kpi-proyectado']);
 const incompletos=calc.filter(c=>c.parcial||[c.booking,c.ejecutado,c.backlog].some(v=>v===null)).length;
 const parciales=calc.filter(c=>c.parcial).length;
 check(name+' aviso parcial',parciales?`Parcial en ${parciales} de ${selected.length} proyectos`:'',d['kpi-proyectado-aviso']);
 const dif=total(c=>c.booking)-total(c=>c.backlog)-total(c=>c.proyectado);
 check(name+' diferencia vs booking',incompletos?'—':money(Math.abs(dif)<.01?0:dif),d['kpi-diferencia-booking']);
}
const ps=new Map();for(const p of visible){const pm=p.pm_lider||'(sin dato)';if(!ps.has(pm))ps.set(pm,[]);ps.get(pm).push(p);}
for(const pm of ui.calcularPMs()){
 const group=ps.get(pm.pm)||[];check('pm count '+pm.pm,group.length,pm.proyectos.length);
 for(const [field,suffix] of [['commit','fijo'],['upside','upside']])check('pm '+field+' '+pm.pm,group.reduce((s,p)=>s+selectedMonths.reduce((s,m)=>s+(backlog.get(p.clave_timeline)[m+'_'+suffix]||0),0),0),pm[field]);
}
check('rendered PM count',String(ps.size),dom.pms['kpi-pms-total']);
const bl=visible.map(p=>esperado(p,backlog.get(p.clave_timeline)).backlog).filter(v=>v!==null);
check('rendered PM total backlog continuo',bl.length?money(bl.reduce((a,b)=>a+b,0)):'\u2014',dom.pms['kpi-pms-total-backlog']);
for(const [status,id] of [['In Progress','in-progress'],['On Hold','on-hold'],['Planned','planned'],['Completed','completed']])check('rendered PM '+status,String(visible.filter(p=>p.estado===status).length),dom.pms['kpi-pms-'+id]);
const graph=Object.values(ui.serieBacklogRevenuePorMes(visible));check('chart selected months',selectedMonths.length,graph.length);selectedMonths.forEach((m,i)=>{check('chart commit '+m,sum(m+'_fijo'),graph[i].Commit);check('chart upside '+m,sum(m+'_upside'),graph[i].Upside);});
// Por proyecto: Ejecutado, Commit pendiente, Proyectado y Backlog sin planear.
const casos={conFinPosteriorAlUltimoCommit:0,sinFin:0,commitPosteriorAFin:0};
for(const p of data.proyectos){
 const b=backlog.get(p.clave_timeline),e=esperado(p,b),k=p.clave_timeline;
 check('ejecutado '+k,e.ejecutado,ui.acumuladoHoy(p));check('pendiente '+k,e.pendiente,ui.commitPendienteProyecto(p));
 check('proyectado '+k,e.proyectado,ui.proyeccionReferencia(p));check('posterior al anio fuente '+k,e.posterior,ui.commitPosteriorAlAnioFuente(p));
 // Fecha fin: la vida llega a ella, o al ultimo Commit si no hay; nunca se inventa.
 const vida=ui.vidaProyecto(p);check('fecha fin '+k,e.fin,vida.fin);
 const importes=months.filter(m=>e.fin&&m>e.fin&&((b[m+'_fijo']||0)!==0||(b[m+'_upside']||0)!==0));
 const finCalendario=e.inicio?[e.fin||e.registrados.at(-1),importes.at(-1)].filter(Boolean).sort().at(-1):null;
 const cal=ui.calendarioVidaProyecto(p);
 check('calendario ultimo mes '+k,e.inicio&&finCalendario>=e.inicio?finCalendario:null,cal.at(-1)??null);
 check('calendario primer mes '+k,e.inicio&&finCalendario>=e.inicio?e.inicio:null,cal[0]??null);
 if(e.inicio&&e.fin&&e.fin>e.registrados.at(-1))casos.conFinPosteriorAlUltimoCommit++;
 if(e.inicio&&!e.fin)casos.sinFin++;
 if(importes.length)casos.commitPosteriorAFin++;
 // Curva de saldo: Booking - (acumulado anterior + Commit de los meses del Año fuente en adelante, hasta ese mes); sin dato si falta un mes.
 if(cal.length&&typeof e.booking==='number'){
  const serie=Object.values(ui.serieSaldoProyecto(p).datos).slice(1);check('curva meses '+k,cal.length,serie.length);
  let completo=typeof b.acumulado_anterior==='number',acum=b.acumulado_anterior;
  const previos=months.filter(m=>m>=e.inicio&&Number(m.slice(0,4))<e.fuente);
  if(previos.some(m=>typeof b[m+'_fijo']!=='number'))completo=false;else if(completo)acum-=previos.reduce((a,m)=>a+b[m+'_fijo'],0);
  cal.forEach((m,i)=>{if(typeof b[m+'_fijo']!=='number')completo=false;if(completo)acum+=b[m+'_fijo'];
   check('curva saldo '+k+' '+m,completo?e.booking-acum:null,serie[i]?.['Backlog']??null);});
 }
 // Advertencia: solo si hay Commit o Upside posterior a la Fecha fin, y nombra el importe sin alterarlo.
 const aviso=ui.advertenciaFueraDeFechaFin(p);check('advertencia presente '+k,importes.length>0,aviso!==null);
 if(importes.length){const c=importes.reduce((a,m)=>a+(b[m+'_fijo']||0),0);const fmt=n=>(n<0?'\u2212$':'$')+Math.abs(Math.round(n)).toLocaleString('en-US');
  if(c!==0)check('advertencia importe '+k,true,aviso.includes(fmt(c)));}
}
const result={scope:'UI consistency with currently saved API data; NOT evidence of Excel freshness',casos,checks:count,issues};fs.writeFileSync(path.join(out,'prueba-ui.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({casos,checks:count,issues:issues.slice(0,4),failures:issues.length}));
})().catch(e=>{console.error(e);process.exitCode=1;});

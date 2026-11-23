// Read-only checks of the real frontend calculations using a captured local API response.
// Usage: node infra/api/test/audit-rendered-data.cjs /tmp/forecast-audit
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const out=process.argv[2];if(!out)throw new Error('Supply the private audit output directory');
const data=JSON.parse(fs.readFileSync(path.join(out,'timeline.json')));
const dom=JSON.parse(fs.readFileSync(path.join(out,'pantallas.json')));
const controls=new Map();
const context=vm.createContext({Intl,URL,URLSearchParams,console,Map,Set,location:{search:''},
 document:{addEventListener(){},querySelector(){return {classList:{toggle(){},add(){}}};},getElementById(id){if(!controls.has(id))controls.set(id,{textContent:''});return controls.get(id);}},
 fetch:async()=>({ok:true,json:async()=>data})});
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../../app.js'),'utf8')+'\nglobalThis.ui={estado,cargarDatos,revenuePeriodo,upsidePeriodo,valorBooking,acumuladoHoy,backlogHoy,calcularPMs,serieBacklogRevenuePorMes};',context);
let count=0;const issues=[];
function check(name,e,a){count++;const ok=typeof e==='number'?typeof a==='number'&&Math.abs(e-a)<.01:e===a;if(!ok)issues.push({name,expected:e,actual:a});}
function money(n){const sign=n<0?'-':'';n=Math.abs(n);return sign+'$'+(n>=1e6?(n/1e6).toFixed(2)+'M':n>=1e4?(n/1e3).toFixed(0)+'K':n>=1e3?(n/1e3).toFixed(1)+'K':n.toFixed(0));}
(async()=>{
const ui=context.ui;check('load',true,await ui.cargarDatos());
const months=data.meta.periodos;const backlog=new Map(data.backlog.map(r=>[r.clave_timeline,r]));
// Exhaustive ranges per project: 300 ranges x 343 projects x commit/upside.
for(let start=0;start<months.length;start++)for(let end=start;end<months.length;end++){
 ui.estado.periodo='rango';ui.estado.rangoTimeline={desde:months[start],hasta:months[end]};
 for(const p of data.proyectos){const b=backlog.get(p.clave_timeline);for(const [suffix,fn] of [['fijo',ui.revenuePeriodo],['upside',ui.upsidePeriodo]]){
   const values=months.slice(start,end+1).map(m=>b[m+'_'+suffix]);const expected=values.some(v=>typeof v==='number')?values.reduce((s,v)=>s+(v||0),0):null;
   check(p.clave_timeline+' '+months[start]+'..'+months[end]+' '+suffix,expected,fn(p));
 }}
}
ui.estado.periodo='todos';const visible=data.proyectos.filter(p=>!['Completed','Canceled'].includes(p.estado));
const sum=f=>visible.reduce((s,p)=>s+(backlog.get(p.clave_timeline)[f]||0),0);
for(const p of data.proyectos){const b=backlog.get(p.clave_timeline);check('booking '+p.clave_timeline,b.valor_of,ui.valorBooking(p));check('backlog '+p.clave_timeline,b.backlog,ui.backlogHoy(p));check('accrued '+p.clave_timeline,b.acumulado_a_fecha,ui.acumuladoHoy(p));}
for(const [name,start,end] of [['pantalla',0,23],['rango',9,23],['fy27',12,23]]){
 const d=dom[name];check(name+' count',String(visible.length),d['kpi-total-proyectos']);check(name+' booking',money(sum('valor_of')),d['kpi-valor-of-total']);check(name+' backlog',money(sum('backlog')),d['kpi-backlog-2026']);check(name+' accrued',money(sum('acumulado_a_fecha')),d['kpi-acumulado-hoy']);check(name+' execution',(100*sum('acumulado_a_fecha')/sum('valor_of')).toFixed(1)+'%',d['kpi-pct-ejecucion']);
 const expected=months.slice(start,end+1).reduce((s,m)=>s+sum(m+'_fijo'),0);check(name+' revenue',money(expected),d['kpi-revenue-periodo']);
}
const ps=new Map();for(const p of visible){const pm=p.pm_lider||'(sin dato)';if(!ps.has(pm))ps.set(pm,[]);ps.get(pm).push(p);}
for(const pm of ui.calcularPMs()){
 const group=ps.get(pm.pm)||[];check('pm count '+pm.pm,group.length,pm.proyectos.length);
 for(const [field,suffix] of [['commit','fijo'],['upside','upside']])check('pm '+field+' '+pm.pm,group.reduce((s,p)=>s+months.reduce((s,m)=>s+(backlog.get(p.clave_timeline)[m+'_'+suffix]||0),0),0),pm[field]);
}
check('rendered PM count',String(ps.size),dom.pms['kpi-pms-total']);
for(const [status,id] of [['In Progress','in-progress'],['On Hold','on-hold'],['Planned','planned'],['Completed','completed']])check('rendered PM '+status,String(visible.filter(p=>p.estado===status).length),dom.pms['kpi-pms-'+id]);
const graph=Object.values(ui.serieBacklogRevenuePorMes(visible));check('chart 24 months',24,graph.length);months.forEach((m,i)=>{check('chart commit '+m,sum(m+'_fijo'),graph[i].Commit);check('chart upside '+m,sum(m+'_upside'),graph[i].Upside);});
const result={scope:'UI consistency with currently saved API data; NOT evidence of Excel freshness',checks:count,issues};fs.writeFileSync(path.join(out,'prueba-ui.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({checks:count,issues:issues.slice(0,4),failures:issues.length}));
})().catch(e=>{console.error(e);process.exitCode=1;});

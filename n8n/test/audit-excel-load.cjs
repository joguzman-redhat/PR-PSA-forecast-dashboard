// Offline data-load audit using a disposable database. No real database writes.
// Usage: node n8n/test/audit-excel-load.cjs /tmp/forecast-audit
const fs=require('fs'),cp=require('child_process'),crypto=require('crypto');
const path=require('node:path');const root=path.resolve(__dirname,'../..');const out=process.argv[2];if(!out)throw new Error('Supply private audit directory');const fixture=require(root+'/n8n/test/forecast-fixture.cjs');
const name='forecast-excel-audit-'+Date.now();
function run(a,input){const r=cp.spawnSync('podman',a,{input,encoding:'utf8',maxBuffer:32*1024*1024});if(r.status!==0)throw new Error(r.stderr||r.stdout);return r.stdout.trim();}
function sql(q){return run(['exec','-i',name,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres'],q);}
(async()=>{let server;try{
run(['run','-d','--rm','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','docker.io/library/postgres:16-alpine']);
for(let i=0;i<80;i++){if(cp.spawnSync('podman',['exec',name,'pg_isready','-U','postgres']).status===0)break;await new Promise(r=>setTimeout(r,150));}
sql(fs.readFileSync(root+'/infra/db/init/01_schema.sql','utf8'));
const validations=[];
for(const year of [2026,2027]){
 let d=JSON.parse(fs.readFileSync(path.join(out,'input'+year+'.json')));
 d._fuente=fixture.fuente(year);d=fixture.ejecutar('Normalizar Forecast por Anio',d);d=fixture.ejecutar('Recalcular Columnas Rotas',d);d=fixture.ejecutar('Validar Calidad de Datos',d);
 validations.push({year,info:d.InfoProyectos.length,backlog:d.Backlog.length,validation:d._validacion});
 if(!d._validacion.valido)throw new Error(JSON.stringify(d._validacion));
 d._hash=crypto.randomUUID();
 const q=new Function('$',fixture.codigo('Construir SQL de Carga'))(()=>({item:{json:d}}))[0].json.sql;sql(q);
}
fs.writeFileSync(path.join(out,'validacion-carga.json'),JSON.stringify(validations,null,2));
// Run the real API against the isolated DB through stdin/stdout; no extra ports.
const queries=JSON.parse(sql(`SELECT json_build_object('cargas',(SELECT json_agg(c) FROM v_carga_timeline c),'atributos',(SELECT json_agg(t) FROM (SELECT forecast_clave_timeline(s.atributos,s.proyecto_id,c.anio_forecast) clave_proyecto,s.atributos,s.origen,s.proyecto_id,c.id carga_id,c.anio_forecast,ra.valor_of,ra.acum_2025 acumulado_anterior,ra.backlog,ra.total_ejecutado_acumulado FROM proyecto_snapshot s JOIN carga c ON c.id=s.carga_id LEFT JOIN revenue_anual ra ON ra.carga_id=c.id AND ra.proyecto_id=s.proyecto_id) t),'mensuales',(SELECT json_agg(t) FROM (SELECT clave_proyecto,carga_id,to_char(periodo,'YYYY-MM') periodo,commit_usd,upside_usd FROM v_revenue_timeline) t));`));
const {construirEstado,calendario}=require(root+'/infra/api/src/timeline');
const state=construirEstado(queries.cargas,queries.atributos,queries.mensuales,calendario('2026-01','2027-12'),2026,'2026-11-22');
fs.writeFileSync(path.join(out,'timeline-recargado-aislado.json'),JSON.stringify(state));

const expected=JSON.parse(fs.readFileSync(path.join(out,'expected-sources.json')));let checks=0;const issues=[];
function check(key,field,e,a){checks++;if(!(e===null?a===null:typeof e==='number'?typeof a==='number'&&Math.abs(e-a)<.010001:e===a))issues.push({key,field,expected:e,actual:a});}
for(const [year,records] of Object.entries(expected))for(const [key,r] of Object.entries(records)){
 const attr=queries.atributos.find(a=>a.anio_forecast===Number(year)&&a.clave_proyecto===key);check(key,year+' presence',true,!!attr);if(!attr)continue;
 for(const [f,v] of Object.entries(r.money))check(key,year+' '+f,v,attr[f]);
 for(let m=0;m<12;m++){const row=queries.mensuales.find(a=>a.carga_id===attr.carga_id&&a.clave_proyecto===key&&a.periodo===year+'-'+String(m+1).padStart(2,'0'));check(key,year+' month'+m+' presence',true,!!row);if(row){check(key,year+' month'+m+' commit',r.months[m][0]??0,row.commit_usd);check(key,year+' month'+m+' upside',r.months[m][1]??0,row.upside_usd);}}
}
for(const [key,r] of Object.entries(expected[2026])){const p=state.proyectos.find(p=>p.clave_timeline===key);check(key,'current source priority',2026,p?.anio_atributos);}
const result={checks,issues,projects:state.proyectos.length,project_month_rows:queries.mensuales.length,scope:'Real n8n normalization, recalculation, validation, SQL and timeline construction in temporary PostgreSQL; original financial database not modified'};
fs.writeFileSync(path.join(out,'prueba-aislada.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({validations,checks,failures:issues.length,examples:issues.slice(0,3),isolatedProjects:state.proyectos.length,isolatedMonthly:queries.mensuales.length}));

}finally{try{run(['rm','-f',name]);}catch(e){console.error(e.message)}}})().catch(e=>{console.error(e);process.exitCode=1;});

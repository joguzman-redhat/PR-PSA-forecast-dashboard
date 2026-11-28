// Prueba de la migracion 2026-11-26_identidad_project_id.sql contra un Postgres efimero (podman).
// Reproduce el estado ANTERIOR al ticket 01: esquema actual + 2026-11-22_timeline.sql (regla vieja PA -> PR -> SIN_PA).
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { setTimeout } = require('node:timers/promises');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'../../..');
const container = 'forecast-migracion-test-'+randomUUID();
const leer = f => fs.readFileSync(path.join(root,'infra/db',f),'utf8');
function run(args,input){const r=spawnSync('podman',args,{input,encoding:'utf8',maxBuffer:16*1024*1024});if(r.status!==0)throw Error((r.stdout||'')+(r.stderr||''));return r.stdout;}
const psql = (sql,...extra) => run(['exec','-i',container,'psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres',...extra],sql);
const consulta = sql => psql(sql).trim();
const FOTO = `SELECT clave_proyecto||'|'||periodo||'|'||proyecto_id||'|'||carga_id||'|'||commit_usd||'|'||upside_usd
  FROM forecast_revenue_mensual ORDER BY 1`;
const DATOS = `
INSERT INTO carga(anio_forecast,archivo_id,datos_hash,archivo_nombre) VALUES (2026,'s26','h1','FY26 a'),(2026,'s26','h2','FY26 b');
INSERT INTO proyecto(clave,num_pa,project_id,nombre,ultima_carga_id) VALUES
 ('pa:PR-061990','PR-061990','PR-061990','Partido',1),
 ('pa:69412','69412','PR-061990','Partido',2),
 ('pa:777','777',NULL,'Solo PA',2),
 ('nombre:huerfano',NULL,NULL,'Huerfano',2);
INSERT INTO revenue_mes SELECT 1,1,m,100*m,10*m FROM generate_series(1,3) m;
INSERT INTO revenue_mes SELECT 2,2,m,100*m,10*m FROM generate_series(4,6) m;
INSERT INTO revenue_mes SELECT 2,3,m,5,0 FROM generate_series(1,2) m;
INSERT INTO revenue_mes SELECT 2,4,m,7,1 FROM generate_series(1,2) m;`;
(async()=>{let started=false;try{
  run(['run','-d','--rm','--name',container,'--network','none','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','docker.io/library/postgres:16-alpine']);started=true;
  let ready=false;for(let i=0;i<100;i++){if(spawnSync('podman',['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres']).status===0){ready=true;break;}await setTimeout(150);}if(!ready)throw Error('PG temporal no disponible');
  psql(leer('init/01_schema.sql'));
  psql(leer('migraciones/2026-11-22_timeline.sql')); // estado previo: claves partidas
  psql(DATOS);
  const antes = consulta(`SELECT string_agg(DISTINCT clave_proyecto,',' ORDER BY clave_proyecto) FROM forecast_revenue_mensual`);
  assert.equal(antes,'PA:69412,PA:777,PA:PR-061990,SIN_PA:2026:4','precondicion: claves partidas');
  const totalAntes = consulta('SELECT sum(commit_usd)||\'/\'||sum(upside_usd) FROM forecast_revenue_mensual');
  const base = consulta('SELECT sum(commit_usd)||\'/\'||sum(upside_usd) FROM revenue_mes');
  assert.equal(totalAntes,base,'precondicion: el consolidado suma como revenue_mes');
  const sqlMig = leer('migraciones/2026-11-26_identidad_project_id.sql');
  psql(sqlMig);
  const claves = consulta(`SELECT string_agg(DISTINCT clave_proyecto,',' ORDER BY clave_proyecto) FROM forecast_revenue_mensual`);
  assert.equal(claves,'PA:777,PR:PR-061990,SIN_ID:2026:4','un solo proyecto por Project ID');
  assert.equal(consulta(`SELECT count(*)||'/'||min(periodo)||'/'||max(periodo) FROM forecast_revenue_mensual WHERE clave_proyecto='PR:PR-061990'`),'6/2026-01-01/2026-06-01','historial completo del proyecto unido');
  assert.equal(consulta('SELECT sum(commit_usd)||\'/\'||sum(upside_usd) FROM forecast_revenue_mensual'),totalAntes,'los totales no cambian');
  // proyecto.clave: la que usa el ETL de n8n para actualizar. Gana la fila mas reciente de cada identidad;
  // la otra conserva su clave vieja (sus cargas y su historial no se tocan, ni se borran filas).
  const CLAVES_PROYECTO = `SELECT string_agg(id||'='||clave,',' ORDER BY id) FROM proyecto`;
  assert.equal(consulta(CLAVES_PROYECTO),'1=pa:PR-061990,2=PR:PR-061990,3=PA:777,4=SIN_ID:2026:4','proyecto.clave sigue la regla nueva');
  assert.equal(consulta('SELECT count(*) FROM proyecto'),'4','no se borran proyectos');
  const una = consulta(FOTO), unaClaves = consulta(CLAVES_PROYECTO);
  psql(sqlMig);
  assert.equal(consulta(FOTO),una,'correrla dos veces deja los mismos datos');
  assert.equal(consulta(CLAVES_PROYECTO),unaClaves,'proyecto.clave tambien es idempotente');
  // El trigger nuevo sigue la regla nueva para escrituras posteriores.
  psql(`INSERT INTO revenue_mes VALUES (2,2,7,1,0)`);
  assert.equal(consulta(`SELECT count(*) FROM forecast_revenue_mensual WHERE clave_proyecto='PR:PR-061990'`),'7');
  console.log('migracion de identidad: ok');
}finally{if(started)run(['rm','-f',container]);}})().catch(e=>{console.error(e.message);process.exitCode=1;});

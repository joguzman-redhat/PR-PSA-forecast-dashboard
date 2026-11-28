const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { setTimeout } = require('node:timers/promises');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'../../..');
const container = 'forecast-api-test-'+randomUUID();
function run(args,input){const r=spawnSync('podman',args,{input,encoding:'utf8',maxBuffer:16*1024*1024});if(r.status!==0)throw Error((r.stdout||"")+(r.stderr||""));return r.stdout;}
(async()=>{let started=false;try{
  run(['run','-d','--rm','--name',container,'--network','none','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','docker.io/library/postgres:16-alpine']);started=true;
  let ready=false;for(let i=0;i<100;i++){if(spawnSync('podman',['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres']).status===0){ready=true;break;}await setTimeout(150);}if(!ready)throw Error('PG temporal no disponible');
  run(['exec','-i',container,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres'],fs.readFileSync(path.join(root,'infra/db/init/01_schema.sql'),'utf8'));
  // Solo el codigo de la API se monta, en lectura. No se comparten volumenes reales.
  const output=run(['run','--rm','--network','container:'+container,
    '-v',path.join(root,'infra/api')+':/app:ro,z','-w','/app',
    '-e','FORECAST_ISOLATED_TEST=true','-e','PGHOST=127.0.0.1','-e','PGUSER=postgres','-e','PGDATABASE=postgres',
    'docker.io/library/node:22-alpine','node','test/forecast-years.integration.cjs']);
  process.stdout.write(output);
}finally{if(started)run(['rm','-f',container]);}})().catch(e=>{console.error(e.message);process.exitCode=1;});

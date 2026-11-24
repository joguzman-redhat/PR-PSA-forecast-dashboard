const {test}=require('node:test');
const assert=require('node:assert/strict');
const {agruparCortes,construirHistoria}=require('../src/timeline');
const carga=(id,anio,run,hora)=>({id,anio_forecast:anio,ejecucion_id:run,ejecutada_en:`2026-11-24T${hora}Z`,etiqueta:`24 nov 2026 ${hora.slice(0,5)}`,tipo:'etl'});
test('un corte combina ambas fuentes aunque la corrida cruce de minuto',()=>{
  const cargas=[carga(1,2026,'a','10:59:55'),carga(2,2027,'a','11:01:02'),carga(3,2026,'b','12:00:00'),carga(4,2027,'b','12:01:01'),carga(5,2027,'c','13:00:00')];
  const atributos=cargas.map(c=>({carga_id:c.id,anio_forecast:c.anio_forecast,clave_proyecto:'PA:1',atributos:{num_pa:'1',nombre:'Demo'},valor_of:1000,acumulado_anterior:0,backlog:500}));
  const valores=[100,200,110,220,225];
  const meses=cargas.map((c,i)=>({carga_id:c.id,clave_proyecto:'PA:1',periodo:c.anio_forecast+'-01',commit_usd:valores[i],upside_usd:i*5}));
  const h=construirHistoria(cargas,atributos,meses,['2026-01','2027-01'],2026,'2026-11-24');
  assert.equal(h.snapshots.length,3);
  assert.deepEqual(h.snapshots.map(s=>s.totales.fijo),[300,330,335]);
  assert.deepEqual(h.series_por_proyecto['PA:1'].at(-1).meses,[[110,10],[225,20]]);
  assert.deepEqual(h.eventos.filter(e=>e.tipo==='commit').map(e=>[e.snapshot_id,e.campo,e.delta]),[['t4','2026-01',10],['t4','2027-01',20],['t5','2027-01',5]]);
  assert.equal(h.snapshots[0].timestamp,cargas[1].ejecutada_en);
  assert.ok(h.snapshots.every(s=>!s.etiqueta.includes('FY')&&s.ejecucion_identificada));
});
test('dos ejecuciones distintas en el mismo minuto no se mezclan',()=>{
  const c=[carga(1,2026,'a','10:00:01'),carga(2,2027,'a','10:00:02'),carga(3,2026,'b','10:00:03'),carga(4,2027,'b','10:00:04')];
  assert.deepEqual(agruparCortes(c).map(g=>g.cargas.map(c=>c.id)),[[1,2],[3,4]]);
});
test('sin identidad de ejecución no se fusionan capturas por cercanía temporal',()=>{
  const c=[carga(1,2026,null,'10:00:01'),carga(2,2027,null,'10:00:02'),carga(3,2026,null,'10:00:03'),carga(4,2027,null,'10:01:04')];
  assert.deepEqual(agruparCortes(c).map(g=>g.cargas.map(c=>c.id)),[[1],[2],[3],[4]]);
});
test('incorporar un año sin cobertura anterior no fabrica movimientos',()=>{
  const c=[carga(1,2026,'a','10:00:01'),carga(2,2027,'b','11:00:02')];
  const a=c.map(x=>({carga_id:x.id,anio_forecast:x.anio_forecast,clave_proyecto:'PA:1',atributos:{num_pa:'1'}}));
  const m=c.map(x=>({carga_id:x.id,clave_proyecto:'PA:1',periodo:x.anio_forecast+'-01',commit_usd:100,upside_usd:0}));
  const h=construirHistoria(c,a,m,['2026-01','2027-01'],2026,'2026-11-24');
  assert.equal(h.eventos.length,0);assert.equal(h.series_por_proyecto['PA:1'][0].meses[1][0],null);
});

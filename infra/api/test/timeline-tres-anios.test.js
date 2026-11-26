// Ticket 17: el timeline de la API es generico en el numero de Años fuente.
// Sin BD: usa las funciones puras exportadas por timeline.js.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {calendario,construirEstado,construirHistoria,validarRango}=require('../src/timeline');
const carga=(id,anio,run,hora)=>({id,anio_forecast:anio,ejecucion_id:run,ejecutada_en:`2026-11-24T${hora}Z`,etiqueta:`corte ${id}`,tipo:'etl'});
const attr=(c,clave,extra={})=>({carga_id:c.id,anio_forecast:c.anio_forecast,clave_proyecto:clave,atributos:{num_pa:clave.slice(3),nombre:'P'+clave},valor_of:1000,acumulado_anterior:0,backlog:500,total_ejecutado_acumulado:0,...extra});
const mes=(c,clave,m,v)=>({carga_id:c.id,clave_proyecto:clave,periodo:`${c.anio_forecast}-${String(m).padStart(2,'0')}`,commit_usd:v,upside_usd:0});
const periodos=calendario('2026-01','2028-12');

test('el calendario cubre tres años y el rango acepta 2028',()=>{
  assert.equal(periodos.length,36);assert.equal(periodos.at(-1),'2028-12');
  assert.deepEqual(validarRango({desde:'2026-10',hasta:'2028-12'}),{desde:'2026-10',hasta:'2028-12'});
});
test('con tres cargas cada proyecto trae 36 periodos y un proyecto solo de FY28 usa sus atributos',()=>{
  const cs=[carga(1,2026,'a','10:00:00'),carga(2,2027,'a','10:00:01'),carga(3,2028,'a','10:00:02')];
  const atributos=[attr(cs[0],'PA:1'),attr(cs[1],'PA:1'),attr(cs[2],'PA:1'),attr(cs[2],'PA:9',{valor_of:777})];
  const meses=[mes(cs[0],'PA:1',1,10),mes(cs[1],'PA:1',1,20),mes(cs[2],'PA:1',3,30),mes(cs[2],'PA:9',3,5)];
  const e=construirEstado(cs,atributos,meses,periodos,2026,'2026-11-24');
  const p1=e.backlog.find(b=>b.clave_timeline==='PA:1'),p9=e.backlog.find(b=>b.clave_timeline==='PA:9');
  assert.equal(p1.anio_atributos,2026);assert.equal(p1.meses.length,36);
  assert.equal(p1['2028-03_fijo'],30);assert.equal(p1['2027-01_fijo'],20);assert.equal(p1['2028-04_fijo'],null);
  assert.equal(p9.anio_atributos,2028);assert.equal(p9.valor_of,777);assert.equal(p9['2026-01_fijo'],null);
});
test('al llegar FY28 el corte lo incorpora sin fabricar movimientos',()=>{
  const cs=[carga(1,2026,'a','10:00:00'),carga(2,2027,'a','10:00:01'),carga(3,2028,'b','11:00:00')];
  const atributos=cs.map(c=>attr(c,'PA:1'));
  const meses=cs.map(c=>mes(c,'PA:1',1,100));
  const h=construirHistoria(cs,atributos,meses,periodos,2026,'2026-11-24');
  assert.deepEqual(h.snapshots.map(s=>s.anios_disponibles),[[2026,2027],[2026,2027,2028]]);
  assert.equal(h.eventos.length,0);
  assert.equal(h.series_por_proyecto['PA:1'].at(-1).meses[24][0],100);
  assert.equal(h.series_por_proyecto['PA:1'][0].meses[24][0],null);
});

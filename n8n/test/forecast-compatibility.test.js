const { test } = require('node:test');
const assert = require('node:assert/strict');
const { workflow, codigo, ejecutar, fuente, normalizar } = require('./forecast-fixture.cjs');

const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
function filas(anio) {
  return Array.from({ length: 10 }, (_, i) => ({
    '# PA': String(100 + i), 'Nombre del Proyecto': 'Ficticio ' + i,
    'Valor OF': 1000, 'Fecha fin': '12/31/2027',
    ...(anio === 2026 ? { 'Acum 2025': 100, 'Backlog 2026': 850, 'TOTAL EJECUTADO ACUMULADO': 150 }
      : { 'Total Ejecutado Acumulado 2025-2026': 100, 'Backlog 2027': 850, 'TOTAL EJECUTADO ACUMULADO 2025-2026-2027': 150 }),
    ...Object.fromEntries(meses.map((m, n) => [m, n ? 0 : 50])),
    ...Object.fromEntries(meses.map((m, n) => [n ? 'Upside_' + n : 'Upside', 0])),
  }));
}
function preparar(rows, anio, modo) {
  return ejecutar('Recalcular Columnas Rotas', normalizar(rows, rows, anio, modo));
}

test('la configuracion revisa FY26 y FY27 en orden sin cambiar parametros', () => {
  assert.deepEqual(new Function(codigo('Configurar Fuente Forecast'))().map(i => i.json._fuente.anio_forecast), [2026, 2027]);
  assert.equal(fuente().anio_forecast, 2026);
  assert.equal(fuente().modo, 'cargar');
  assert.equal(fuente().archivo_id, '1_NNst0wIKXAlCa7fu8RRiBFAahcXzvuGEEt5IAhm-co');
  assert.equal(workflow.nodes.find(n => n.type === 'n8n-nodes-base.googleDrive').parameters.fileId.value,
    '={{ $json._fuente.archivo_id }}');
});

test('FY27 conserva el acumulado de ambos años anteriores sin volver a sumarlo', () => {
  const data = preparar(filas(2027), 2027, 'validar');
  assert.equal(data._fuente.archivo_id, '13ULKx3-9MmFrU6suvm8jSgIwIKsBh44wLH7i_l10tSE');
  assert.equal(data.Backlog[0]._forecast.acumulado_anterior, 100);
  assert.equal(data.Backlog[0]._forecast.total_ejecutado, 150);
  assert.equal(data.Backlog[0]._forecast.backlog, 850);
  assert.equal(data.Backlog[0]._forecast.meses[0].commit, 50);
  assert.equal(ejecutar('Validar Calidad de Datos', data)._validacion.valido, true);
});

test('FY26 carga valida y conserva metadatos a traves del enriquecimiento', () => {
  const data = preparar(filas(2026), 2026, 'cargar');
  assert.equal(data._esquema_forecast.faltantes.length, 0);
  assert.equal(ejecutar('Validar Calidad de Datos', data)._validacion.valido, true);
});

test('admite FY27 cargar y bloquea modo validar, metadatos ausentes o filas de otro año', () => {
  const cargable = preparar(filas(2027), 2027, 'cargar');
  assert.ok(ejecutar('Calcular Hash', cargable)._hash);
  assert.throws(() => fuente(2028, 'cargar'), /no valida/);
  const data = preparar(filas(2027), 2027, 'validar');
  assert.throws(() => ejecutar('Calcular Hash', data), /Escritura bloqueada/);
  const sql = new Function('$', codigo('Construir SQL de Carga'));
  assert.throws(() => sql(() => ({ item: { json: data } })), /Escritura bloqueada/);
  assert.throws(() => sql(() => ({ item: { json: {} } })), /Escritura bloqueada/);
  const alterado = { ...data, _fuente: fuente() };
  assert.throws(() => sql(() => ({ item: { json: alterado } })), /filas de otro año/);
});

test('validacion termina con resumen y no llega a Postgres', () => {
  const mode = workflow.connections['Solo Validar Forecast?'].main;
  assert.equal(mode[0][0].node, 'Resumen Validacion Forecast (sin escritura)');
  assert.equal(mode[1][0].node, 'Calcular Hash');
  assert.equal(workflow.connections['Resumen Validacion Forecast (sin escritura)'].main[0][0].node, 'Siguiente Excel');
  assert.equal(workflow.connections['Siguiente Excel'].main[0][0].node, 'Procesar Fuentes Forecast');
  const data = ejecutar('Validar Calidad de Datos', preparar(filas(2027), 2027, 'validar'));
  const result = ejecutar('Resumen Validacion Forecast (sin escritura)', data);
  assert.equal(result.escritura_postgres, false);
  assert.equal(result.cobertura_financiera.backlog.con_dato, 10);
  assert.equal(result.anio_forecast, 2027);
});

test('rechaza un archivo FY27 seleccionado como FY26', () => {
  const data = ejecutar('Validar Calidad de Datos', preparar(filas(2027), 2026, 'cargar'));
  assert.equal(data._validacion.valido, false);
  assert.ok(data._validacion.errores.some(e => /otro año/.test(e)));
  assert.ok(data._validacion.errores.some(e => /acumulado_anterior/.test(e)));
});

test('rechaza cabeceras ausentes y campos financieros completamente nulos', () => {
  const rows = filas(2026).map(r => { const x = { ...r }; delete x['Backlog 2026']; x['Acum 2025'] = '#N/A'; return x; });
  const data = ejecutar('Validar Calidad de Datos', preparar(rows, 2026, 'cargar'));
  assert.equal(data._validacion.valido, false);
  assert.ok(data._validacion.errores.some(e => /Columnas requeridas.*backlog/.test(e)));
  assert.ok(data._validacion.errores.some(e => /Sin valores numericos para acumulado_anterior/.test(e)));
});

test('admite ceros y blancos individuales, y detecta llaves duplicadas', () => {
  const rows = filas(2027);
  rows[0]['Backlog 2027'] = 0; rows[1]['Backlog 2027'] = '#N/A';
  let data = ejecutar('Validar Calidad de Datos', preparar(rows, 2027, 'validar'));
  assert.equal(data._validacion.valido, true);
  assert.equal(data.Backlog[0]._forecast.backlog, 0);
  assert.equal(data.Backlog[1]._forecast.backlog, null);
  rows[1]['# PA'] = rows[0]['# PA'];
  data = ejecutar('Validar Calidad de Datos', preparar(rows, 2027, 'validar'));
  assert.equal(data._validacion.valido, false);
  assert.ok(data._validacion.errores.some(e => /Llaves duplicadas/.test(e)));
});

test('el hash distingue año y fuente sin depender del nombre visible', () => {
  const data = preparar(filas(2026), 2026, 'cargar');
  const original = ejecutar('Calcular Hash', data)._hash;
  assert.equal(ejecutar('Calcular Hash', data)._hash, original);
  assert.notEqual(ejecutar('Calcular Hash', { ...data, _fuente: { ...data._fuente, archivo_id: 'otro-origen' } })._hash, original);
});

test('registrar FY28 solo agrega un archivo y genera sus mapeos sin cambiar la logica',()=>{
  const code=codigo('Configurar Fuente Forecast').replace('const fuentes = Object.fromEntries',
    "archivos[2028]={archivo_id:'ficticio28',archivo_nombre:'FY28 ficticio'};\nconst fuentes = Object.fromEntries");
  const sources=new Function(code)().map(i=>i.json._fuente);
  assert.deepEqual(sources.map(f=>f.anio_forecast),[2026,2027,2028]);
  const source=sources.at(-1);
  const rows=filas(2027).map(r=>{
    const x={...r};delete x['Backlog 2027'];delete x['Total Ejecutado Acumulado 2025-2026'];delete x['TOTAL EJECUTADO ACUMULADO 2025-2026-2027'];
    return {...x,'Backlog 2028':700,'Total Ejecutado Acumulado 2025-2026-2027':250,'TOTAL EJECUTADO ACUMULADO 2025-2026-2027-2028':300};
  });
  const normal=ejecutar('Normalizar Forecast por Anio',{_fuente:source,InfoProyectos:rows,Backlog:rows});
  assert.equal(normal.Backlog[0]._forecast.acumulado_anterior,250);
  assert.equal(normal.Backlog[0]._forecast.total_ejecutado,300);
  assert.equal(normal._esquema_forecast.cabeceraOtroAnio,false);
  assert.ok(ejecutar('Calcular Hash',normal)._hash);
});

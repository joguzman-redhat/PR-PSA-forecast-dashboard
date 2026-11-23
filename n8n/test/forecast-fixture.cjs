const fs = require('node:fs');
const path = require('node:path');
const workflow = JSON.parse(fs.readFileSync(path.join(__dirname, '../n8n_nola_completo.json'), 'utf8'));
function codigo(nombre) {
  return workflow.nodes.find(n => n.name === nombre).parameters.jsCode;
}
function ejecutar(nombre, data) {
  return new Function('$json', codigo(nombre))(data)[0].json;
}
function fuente(anio = 2026, modo = 'cargar') {
  const code = codigo('Configurar Fuente Forecast')
    .replace(/const ANIOS_FORECAST = [^;]+;/, `const ANIOS_FORECAST = [${anio}];`)
    .replace("const MODO = 'cargar';", `const MODO = '${modo}';`);
  return new Function(code)()[0].json._fuente;
}
function normalizar(backlog, info = backlog, anio = 2026, modo = 'cargar') {
  return ejecutar('Normalizar Forecast por Anio', {
    _fuente: fuente(anio, modo), InfoProyectos: info, Backlog: backlog,
  });
}
module.exports = { workflow, codigo, ejecutar, fuente, normalizar };

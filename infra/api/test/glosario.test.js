// El vocabulario del GLOSSARY.md se verifica de forma mecanica: los terminos
// de _Avoid_ que no tienen uso legitimo en espanol comun no pueden aparecer en
// el front (identificadores, comentarios ni textos).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '../../..');

// Cada termino se busca sobre la linea normalizada: camelCase y snake_case se
// separan en palabras y todo va en minusculas (`serieBacklogProyecto` -> «serie saldo proyecto»).
const TERMINOS = [
  { termino: 'valor of', patron: /(?<![a-záéíóúñ])valor of(?![a-záéíóúñ])/ },
  { termino: 'saldo contractual', patron: /(?<![a-záéíóúñ])saldo contractual(?![a-záéíóúñ])/ },
  { termino: 'saldo', patron: /(?<![a-záéíóúñ])saldos?(?![a-záéíóúñ])/ },
  { termino: 'vigencia', patron: /(?<![a-záéíóúñ])vigencia(?![a-záéíóúñ])/ },
  { termino: 'acumulado a hoy', patron: /(?<![a-záéíóúñ])acumulado a hoy(?![a-záéíóúñ])/ },
  { termino: 'acumulado al corte', patron: /(?<![a-záéíóúñ])acumulado al corte(?![a-záéíóúñ])/ },
  { termino: 'acumulado proyectado', patron: /(?<![a-záéíóúñ])acumulado proyectado(?![a-záéíóúñ])/ },
  { termino: 'año de referencia', patron: /(?<![a-záéíóúñ])a[ñn]o de referencia(?![a-záéíóúñ])/ },
  { termino: 'año financiero', patron: /(?<![a-záéíóúñ])a[ñn]o financiero(?![a-záéíóúñ])/ },
  { termino: 'project status', patron: /(?<![a-záéíóúñ])project status(?![a-záéíóúñ])/ },
  { termino: 'backlog sin planear', patron: /(?<![a-záéíóúñ])backlog sin planear(?![a-záéíóúñ])/ },
  { termino: 'corte', patron: /(?<![a-záéíóúñ])cortes?(?![a-záéíóúñ])/ },
];

// Ids de columnas de Info Proyectos (vienen asi del Excel y de la API). Solo
// pueden aparecer en los archivos que definen o leen esa columna; en el resto
// el termino prohibido sigue siendo un error.
const COLUMNAS_PERMITIDAS = {
  valor_of: [
    'campos-proyecto.js', // lista de columnas de Info Proyectos
    'listado-proyectos.js', // pinta la columna y la ordena
    'detalle.js', // tabla de datos del proyecto: lista valor_of_anterior
  ],
  acumulado_a_hoy: [
    'campos-proyecto.js',
    'listado-proyectos.js',
  ],
  project_status: [
    'listado-proyectos.js',
    'estado.js', // clave del filtro Semaforo
    'filtros.js', // dimension de filtro Semaforo
    'detalle.js', // columna Semaforo de la tabla de datos
    'detalle-encabezado.js', // chip Semaforo del encabezado
    'pms-proyectos.js', // punto Semaforo en la tabla de proyectos del PM
    'resumen-pm.js', // cuenta proyectos por Semaforo
    'reporte-resumen.js', // cuenta proyectos por Semaforo en el informe
    'semaforo-proyectos.js', // pastillas Semaforo del inicio
  ],
};
// `js/api.js` es la capa de traduccion: nombra los campos viejos de la API.
const ARCHIVOS_EXENTOS = ['api.js'];

function archivosFront() {
  const res = [path.join(RAIZ, 'index.html')];
  for (const dir of ['js', 'css']) {
    for (const f of fs.readdirSync(path.join(RAIZ, dir))) res.push(path.join(RAIZ, dir, f));
  }
  return res;
}

function normalizar(linea, nombreArchivo) {
  let l = linea;
  for (const [id, archivos] of Object.entries(COLUMNAS_PERMITIDAS)) {
    if (archivos.includes(nombreArchivo)) l = l.replace(new RegExp(`(?<![A-Za-z0-9])${id}(?![A-Za-z0-9])`, 'g'), ' ');
  }
  return l
    .replace(/([a-záéíóúñ0-9])([A-ZÁÉÍÓÚÑ])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase();
}

test('el front no usa terminos que el glosario manda evitar', () => {
  const infracciones = [];
  for (const archivo of archivosFront()) {
    const nombre = path.basename(archivo);
    if (ARCHIVOS_EXENTOS.includes(nombre)) continue;
    fs.readFileSync(archivo, 'utf8').split('\n').forEach((linea, i) => {
      const n = normalizar(linea, nombre);
      for (const { termino, patron } of TERMINOS) {
        if (patron.test(n)) infracciones.push(`${path.relative(RAIZ, archivo)}:${i + 1} «${termino}»: ${linea.trim().slice(0, 100)}`);
      }
    });
  }
  assert.deepStrictEqual(infracciones, [], `Terminos de _Avoid_ en el front:\n${infracciones.join('\n')}`);
});

test('cada termino prohibido figura en una linea _Avoid_ del GLOSSARY.md', () => {
  const avoid = fs.readFileSync(path.join(RAIZ, 'GLOSSARY.md'), 'utf8')
    .split('\n').filter(l => l.startsWith('_Avoid_')).join('\n')
    .replace(/_/g, ' ').toLowerCase();
  for (const { termino } of TERMINOS) {
    assert.ok(avoid.includes(termino.replace(/ñ/g, 'ñ')), `«${termino}» no esta en ninguna linea _Avoid_ de GLOSSARY.md`);
  }
});

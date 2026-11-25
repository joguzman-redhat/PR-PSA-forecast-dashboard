// Recorre el grafo de modulos ES del front a partir de su punto de entrada.
// Lo usan el cargador de pruebas (que une los modulos en un solo script, igual
// que antes) y las pruebas que verifican la integridad del grafo. Solo admite
// la forma de modulo que usa el proyecto: imports con nombre y rutas relativas,
// y exports declarados en linea. Cualquier otra forma se rechaza a proposito.
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '../../..');
const ENTRADA = path.join(RAIZ, 'app.js');
const IMPORT = /^import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?[ \t]*$/gm;
const EXPORT = /^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

function leer(ruta) {
  const fuente = fs.readFileSync(ruta, 'utf8');
  const imports = [...fuente.matchAll(IMPORT)].map(m => ({
    nombres: m[1].split(',').map(s => s.trim()).filter(Boolean),
    especificador: m[2],
  }));
  const exports = [...fuente.matchAll(EXPORT)].map(m => m[1]);
  const sinImports = fuente.replace(IMPORT, '');
  const extra = sinImports.match(/^(?:import\b|export\s+(?:default\b|\{|\*))/m);
  if (extra) throw new Error(`Forma de import/export no admitida en ${path.relative(RAIZ, ruta)}: "${extra[0]}"`);
  return { ruta, fuente, imports, exports };
}

// Devuelve los modulos con las dependencias antes que quien las usa.
function grafoModulos(entrada = ENTRADA) {
  const orden = [], listos = new Set(), enCurso = new Set();
  const visitar = ruta => {
    if (listos.has(ruta)) return;
    if (enCurso.has(ruta)) throw new Error(`Ciclo de imports en ${path.relative(RAIZ, ruta)}`);
    enCurso.add(ruta);
    const modulo = leer(ruta);
    for (const imp of modulo.imports) {
      if (!/^\.\.?\//.test(imp.especificador)) throw new Error(`Import no relativo: ${imp.especificador}`);
      imp.ruta = path.resolve(path.dirname(ruta), imp.especificador);
      visitar(imp.ruta);
    }
    enCurso.delete(ruta);
    listos.add(ruta);
    orden.push(modulo);
  };
  visitar(entrada);
  return orden;
}

// Los modulos unidos en un solo script de ambito global, como se probaba antes.
function codigoUnido(entrada = ENTRADA) {
  return grafoModulos(entrada)
    .map(m => m.fuente.replace(IMPORT, '').replace(/^export\s+/gm, ''))
    .join('\n');
}

module.exports = { RAIZ, ENTRADA, grafoModulos, codigoUnido };

// Integridad de la carga modular del front: el navegador recibe un punto de
// entrada como modulo ES, sus imports resuelven y la imagen de la API los incluye.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { RAIZ, grafoModulos } = require('./modulos-front');

const leer = relativa => fs.readFileSync(path.join(RAIZ, relativa), 'utf8');

test('el HTML carga la aplicacion como modulo ES y no como script clasico', () => {
  const html = leer('index.html');
  assert.match(html, /<script\s+type="module"\s+src="app\.js(\?v=\d+)?"><\/script>/);
  assert.doesNotMatch(html, /<script\s+src="app\.js/);
});

test('el estado y el formateo viven en modulos propios que importa la aplicacion', () => {
  const rutas = grafoModulos().map(m => path.relative(RAIZ, m.ruta));
  assert.ok(rutas.includes(path.join('js', 'estado.js')));
  assert.ok(rutas.includes(path.join('js', 'formato.js')));
  assert.equal(rutas.at(-1), 'app.js'); // la entrada va al final: depende de todo lo demas
});

test('cada nombre importado existe como export del modulo de origen', () => {
  for (const modulo of grafoModulos()) {
    for (const imp of modulo.imports) {
      const origen = grafoModulos(imp.ruta).at(-1);
      for (const nombre of imp.nombres) {
        assert.ok(origen.exports.includes(nombre),
          `${path.relative(RAIZ, modulo.ruta)} importa ${nombre}, que ${imp.especificador} no exporta`);
      }
    }
  }
});

test('los modulos son sintaxis valida en modo estricto, que es como los ejecuta el navegador', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'modulos-front-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  for (const modulo of grafoModulos()) {
    const copia = path.join(tmp, path.basename(modulo.ruta, '.js') + '.mjs');
    fs.writeFileSync(copia, modulo.fuente);
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', copia], { stdio: 'pipe' }),
      path.relative(RAIZ, modulo.ruta));
  }
});

test('la imagen de la API y su lista blanca de construccion incluyen los modulos', () => {
  assert.match(leer('infra/api/Dockerfile'), /^COPY\s+js\s+\.\/public\/js\s*$/m);
  const ignorados = leer('.dockerignore').split('\n').map(l => l.trim());
  assert.ok(ignorados.includes('!js/'), 'falta !js/ en .dockerignore');
  assert.ok(ignorados.includes('!js/**'), 'falta !js/** en .dockerignore');
});

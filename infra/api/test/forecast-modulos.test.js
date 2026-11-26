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
  const grafo = grafoModulos();
  const porRuta = new Map(grafo.map(m => [m.ruta, m]));
  for (const modulo of grafo) {
    for (const imp of modulo.imports) {
      const origen = porRuta.get(imp.ruta);
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

test('solo js/api.js conoce los nombres de dinero con que la API entrega el backlog', () => {
  // Los ids de columna de Info Proyectos (valor_of, ...) viven en el listado y en
  // sus campos: son claves de la configuración de columnas, no filas de backlog.
  const idsDeColumna = ['listado-proyectos.js', 'campos-proyecto.js'];
  const antiguos = /\b(valor_of|acumulado_a_fecha|total_ejecutado_acumulado|acum_2025)\b/;
  for (const modulo of grafoModulos()) {
    const codigo = modulo.fuente.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    if (path.basename(modulo.ruta) === 'api.js') assert.match(codigo, antiguos);
    else if (path.basename(modulo.ruta) !== 'app.js' && !idsDeColumna.includes(path.basename(modulo.ruta))) assert.doesNotMatch(codigo, antiguos, path.basename(modulo.ruta));
  }
});

test('los calculos de dinero, calendario y vida del proyecto viven en modulos propios', () => {
  const porNombre = new Map(grafoModulos().map(m => [path.basename(m.ruta), m]));
  const esperado = {
    'calendario.js': ['MESES_ES', 'PERIODOS', 'configurarCalendarioTimeline', 'periodoActual', 'mesesActivos'],
    'dinero-proyecto.js': ['valorBooking', 'ejecutadoProyecto', 'backlogHoy', 'revenuePeriodo', 'upsidePeriodo', 'resumenFinanciero'],
    'vida-proyecto.js': ['mesFinalizacion', 'vidaProyecto', 'calendarioVidaProyecto'],
    'series-revenue.js': ['serieBacklogRevenuePorMes', 'serieSaldoProyecto'],
    'kpis.js': ['calcularKPIs'],
  };
  for (const [archivo, nombres] of Object.entries(esperado)) {
    assert.ok(porNombre.has(archivo), `falta js/${archivo}`);
    for (const n of nombres) assert.ok(porNombre.get(archivo).exports.includes(n), `${archivo} no exporta ${n}`);
  }
  assert.doesNotMatch(porNombre.get('app.js').fuente, /^function (valorBooking|ejecutadoProyecto|vidaProyecto|calcularKPIs)\b/m);
});

test('los identificadores de los modulos de calculo no usan terminos prohibidos del glosario', () => {
  const prohibidos = /\b(acumuladoHoy|corteFinanciero|valorOf|saldoContractual)\b/;
  for (const archivo of ['calendario.js', 'dinero-proyecto.js', 'vida-proyecto.js', 'series-revenue.js', 'kpis.js']) {
    const codigo = leer(path.join('js', archivo)).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(codigo, prohibidos, archivo);
  }
});

test('el listado de proyectos y las columnas redimensionables viven en modulos propios', () => {
  const porNombre = new Map(grafoModulos().map(m => [path.basename(m.ruta), m]));
  const esperado = {
    'listado-proyectos.js': ['renderizarTabla', 'ordenarTabla'],
    'columnas-redimensionables.js': ['cargarAnchosDeStorage', 'asegurarResizers', 'setupMutationObserver'],
    'campos-proyecto.js': ['CAMPOS_DINERO', 'identificador', 'claseVencimiento'],
  };
  for (const [archivo, nombres] of Object.entries(esperado)) {
    assert.ok(porNombre.has(archivo), `falta js/${archivo}`);
    for (const n of nombres) assert.ok(porNombre.get(archivo).exports.includes(n), `${archivo} no exporta ${n}`);
  }
  assert.doesNotMatch(porNombre.get('app.js').fuente, /^function (renderizarTabla|ordenarTabla|asegurarResizers)\b/m);
});

test('cada tipo de grafica vive en un modulo propio', () => {
  const porNombre = new Map(grafoModulos().map(m => [path.basename(m.ruta), m]));
  const esperado = {
    'grafica-tooltip.js': ['mostrarTooltip', 'moverTooltip', 'ocultarTooltip'],
    'grafica-base.js': ['svgEl', 'colorDeEntidad', 'fijarColores', 'escalaTexto'],
    'grafica-registro.js': ['registrarGrafica', 'ajustarGraficasVisibles'],
    'grafica-barras-simple.js': ['crearGraficaBarrasSimple'],
    'grafica-barras-agrupadas-horizontal.js': ['crearGraficaBarrasAgrupadasHorizontal'],
    'grafica-barras-apiladas.js': ['crearGraficaBarrasApiladas'],
    'grafica-linea.js': ['crearGraficaLinea'],
    'graficas-inicio.js': ['actualizarGraficas'],
    'semaforo-proyectos.js': ['renderizarSemaforoProyectos'],
    'resumen-pm.js': ['renderizarResumenPM'],
    'tabla-no-iniciados.js': ['renderizarTablaNoIniciados'],
  };
  for (const [archivo, nombres] of Object.entries(esperado)) {
    assert.ok(porNombre.has(archivo), `falta js/${archivo}`);
    for (const n of nombres) assert.ok(porNombre.get(archivo).exports.includes(n), `${archivo} no exporta ${n}`);
  }
  // La vertical no la llama nadie todavia, asi que no entra al grafo: se comprueba el archivo.
  assert.match(fs.readFileSync(path.join(RAIZ, 'js/grafica-barras-agrupadas-vertical.js'), 'utf8'), /^export function crearGraficaBarrasAgrupadasVertical\b/m);
  assert.doesNotMatch(porNombre.get('app.js').fuente, /^function (svgEl|crearGrafica(Barras\w+|Linea)|actualizarGraficas)\b/m);
});

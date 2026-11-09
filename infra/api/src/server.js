const path = require('path');
const fs = require('fs');
const express = require('express');

function normalizarRutaBase(valor = '') {
  if (valor === '' || valor === '/') return '';
  if (!/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\/?$/.test(valor)) {
    throw new Error('APP_BASE_PATH debe ser una ruta como /cloud-forecast');
  }
  return valor.replace(/\/$/, '');
}

function crearApp({
  rutaBase = process.env.APP_BASE_PATH || '',
  publicDir = process.env.PUBLIC_DIR || path.join(__dirname, '..', 'public'),
  demo = process.env.FORECAST_DEMO === 'true',
} = {}) {
  const prefijo = normalizarRutaBase(rutaBase);
  const datosDemo = demo ? require('./preview').crearDatosDemo() : null;
  // La prueba sintetica funciona sin credenciales y sin abrir conexiones a PG.
  const pool = demo ? null : require('./db').pool;
  const app = express();
  const rutas = express.Router();
  app.use(express.json());
  app.disable('x-powered-by');

  // La sonda de vida no depende de Postgres. /health conserva la comprobacion
  // de la base y del esquema para diagnosticar si el servicio esta listo.
  const vivo = (_req, res) => res.json({ ok: true });
  app.get('/health/live', vivo);
  rutas.get('/health/live', vivo);
  rutas.get('/health', async (_req, res) => {
    if (demo) return res.json({ ok: true, modo: 'demo', origen: 'demo' });
    try {
      const { rows } = await pool.query('SELECT count(*)::int AS cargas FROM carga');
      res.json({ ok: true, cargas: rows[0].cargas });
    } catch (err) {
      res.status(503).json({ ok: false, error: err.message });
    }
  });

  // Swagger y el dashboard usan rutas relativas para funcionar tambien bajo
  // el path asignado por SPAship, manteniendo un solo origen con la API.
  rutas.get('/api/openapi.yaml', (_req, res) => {
    if (demo) {
      // El contrato de produccion conserva ejemplos del negocio. La prueba
      // publica solamente la documentacion minima de sus datos sinteticos.
      return res.json({
        openapi: '3.0.3',
        info: { title: 'Cloud Forecast DEMO', version: '1.0.0', description: 'Datos ficticios para pruebas.' },
        servers: [{ url: prefijo || '/' }],
        paths: Object.fromEntries(['proyectos', 'backlog', 'historia'].map((nombre) => [
          `/api/${nombre}`, { get: { responses: { 200: { description: 'Datos ficticios de demostracion' } } } },
        ])),
      });
    }
    const spec = fs.readFileSync(path.join(__dirname, 'openapi.yaml'), 'utf8')
      .replace('url: http://localhost:3000', `url: ${JSON.stringify(prefijo || '/')}`);
    res.type('text/yaml').send(spec);
  });
  rutas.get('/api/docs/swagger-initializer.js', (_req, res) => {
    res.type('application/javascript').send(
      `window.ui = SwaggerUIBundle({
       url: '../openapi.yaml',
       dom_id: '#swagger-ui',
       deepLinking: true,
       presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
       layout: 'StandaloneLayout'
     });`,
    );
  });
  rutas.get('/api/docs', (req, res, next) => {
    if (req.path.endsWith('/')) return next();
    res.redirect(308, `${prefijo}/api/docs/${req.url.slice(req.path.length)}`);
  });
  rutas.use('/api/docs', express.static(require('swagger-ui-dist').getAbsoluteFSPath()));

  if (demo) {
    rutas.use('/api', (_req, res, next) => {
      res.set('Cache-Control', 'no-store');
      next();
    });
    for (const nombre of ['proyectos', 'backlog', 'historia']) {
      rutas.get(`/api/${nombre}`, (_req, res) => res.json(datosDemo[nombre]));
    }
    rutas.post('/api/reload', (_req, res) => res.status(409).json({
      error: 'El modo demo utiliza datos ficticios y no admite cargas de datos.',
    }));
  } else {
    rutas.use('/api/proyectos', require('./routes/proyectos'));
    rutas.use('/api/backlog', require('./routes/backlog'));
    const { router: historia, invalidarCache } = require('./routes/historia');
    rutas.use('/api/historia', historia);
    // n8n lo llama despues de cada carga para que la historia se reconstruya.
    rutas.post('/api/reload', (_req, res) => {
      invalidarCache();
      res.json({ ok: true });
    });
  }
  rutas.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint no encontrado' }));

  if (prefijo || demo) {
    rutas.get(['/', '/index.html'], (_req, res, next) => {
      fs.readFile(path.join(publicDir, 'index.html'), 'utf8', (err, html) => {
        if (err) return next(err);
        // Tambien resuelve assets y ./api cuando el proxy recibe la URL sin
        // barra final y elimina el prefijo antes de enviarla al contenedor.
        let pagina = prefijo ? html.replace('<head>', `<head>\n  <base href="${prefijo}/">`) : html;
        if (demo) {
          res.set('Cache-Control', 'no-store');
          pagina = pagina.replace('<title>', '<title>DEMO · ').replace('<body>',
            '<body><aside class="aviso-demo" role="status">DEMO · Datos ficticios. '
            + 'Sólo para pruebas de la aplicación.</aside>');
        }
        res.type('html').send(pagina);
      });
    });
  }
  rutas.use(express.static(publicDir));

  if (prefijo) {
    // La barra final hace que ./api, CSS y fuentes resuelvan dentro del path.
    app.use((req, res, next) => {
      if (req.path === prefijo) {
        return res.redirect(308, `${prefijo}/${req.url.slice(req.path.length)}`);
      }
      next();
    });
    app.use(prefijo, rutas);
  }
  // Algunos proxies eliminan el prefijo antes de enviar la solicitud al pod.
  // Se aceptan ambas formas; el ingreso de SPAship decide la URL publica.
  app.use('/', rutas);

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: err.message });
  });
  return app;
}

if (require.main === module) {
  const port = parseInt(process.env.PORT || '3000', 10);
  const demo = process.env.FORECAST_DEMO === 'true';
  const server = crearApp({ demo }).listen(port, '0.0.0.0', () => {
    console.log(`forecast-api escuchando en :${port}`);
  });
  // Node es PID 1 en la imagen: atender SIGTERM permite que OpenShift reemplace
  // el pod sin tener que agotar el plazo y terminarlo con SIGKILL.
  const cerrar = () => {
    const limite = setTimeout(() => process.exit(1), 10000);
    limite.unref();
    server.close(async () => {
      try {
        if (!demo) await require('./db').pool.end();
      } catch (err) {
        console.error(err);
        process.exitCode = 1;
      } finally {
        clearTimeout(limite);
      }
    });
    server.closeIdleConnections();
  };
  process.once('SIGTERM', cerrar);
  process.once('SIGINT', cerrar);
}

module.exports = { crearApp, normalizarRutaBase };

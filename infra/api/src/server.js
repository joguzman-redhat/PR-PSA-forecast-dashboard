const path = require('path');
const express = require('express');
const { pool } = require('./db');

const proyectos = require('./routes/proyectos');
const backlog = require('./routes/backlog');
const { router: historia, invalidarCache } = require('./routes/historia');

const app = express();
app.use(express.json());
app.disable('x-powered-by');

app.get('/health', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT count(*)::int AS cargas FROM carga');
    res.json({ ok: true, cargas: rows[0].cargas });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

// Contrato: el YAML crudo y Swagger UI servido desde node_modules, sin CDN,
// para que la documentacion funcione igual sin internet.
app.get('/api/openapi.yaml', (_req, res) => {
  res.type('text/yaml').sendFile(path.join(__dirname, 'openapi.yaml'));
});
app.get('/api/docs/swagger-initializer.js', (_req, res) => {
  res.type('application/javascript').send(
    `window.ui = SwaggerUIBundle({
       url: '/api/openapi.yaml',
       dom_id: '#swagger-ui',
       deepLinking: true,
       presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
       layout: 'StandaloneLayout'
     });`,
  );
});
app.use('/api/docs', express.static(require('swagger-ui-dist').getAbsoluteFSPath()));

app.use('/api/proyectos', proyectos);
app.use('/api/backlog', backlog);
app.use('/api/historia', historia);

// n8n lo llama despues de cada carga para que la historia se reconstruya.
app.post('/api/reload', (_req, res) => {
  invalidarCache();
  res.json({ ok: true });
});

// El dashboard se sirve desde la misma app: un solo origen, sin CORS y sin
// dos despliegues. Va despues de /api para que nunca lo tape.
const publicDir = process.env.PUBLIC_DIR || path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

const port = parseInt(process.env.PORT || '3000', 10);
app.listen(port, () => {
  console.log(`forecast-api escuchando en :${port} · dashboard desde ${publicDir}`);
});

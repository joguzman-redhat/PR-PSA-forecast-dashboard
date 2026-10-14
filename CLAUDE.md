# CLAUDE.md

Guía para Claude Code (claude.ai/code) al trabajar en este repo.

## Qué es esto

Dashboard de Cloud Forecast: Postgres (el dato) → API Node.js (endpoints +
sirve el dashboard) → n8n (orquesta, hoy sin terminar de conectar la carga de
datos). Este repo es la **versión 1** — el PoC original (Excel → ETL Python →
JSON) ya se retiró; el dashboard lee en vivo de Postgres.

## Key Commands

```bash
# Stack completo: Postgres + API (sirve también el dashboard) + n8n + nginx.
cd infra
./forecast.sh up        # levanta todo
./forecast.sh seed      # carga datos a Postgres (ver infra/README.md: hoy
                         # depende de datos que ya no vienen en este repo)
./forecast.sh rebuild   # reconstruye la imagen de la API Y recrea el contenedor
./forecast.sh logs      # logs de la API
./forecast.sh psql      # consola SQL
./forecast.sh down      # apaga (conserva los volúmenes)
./forecast.sh destroy   # apaga y BORRA el histórico de Postgres (no el de n8n)

# Verificar el dato
podman exec forecast-postgres psql -U forecast -d forecast -c \
  "SELECT count(*) FROM proyecto;
   SELECT sum(commit_usd) FROM revenue_mes WHERE carga_id=(SELECT id FROM v_carga_actual);"

# URLs
# http://localhost:3000/          dashboard (lee de Postgres)
# http://localhost:3000/api/docs/ contrato de la API (Swagger UI, sin CDN)
# http://localhost:3000/health    estado de la API
# http://localhost:8080/          n8n (vía nginx)
# http://localhost:5678/          n8n (directo, sin nginx)
```

Credenciales de la BD (desarrollo, en `infra/.env`): base `forecast`, usuario
`forecast`, contraseña `forecast`, en `127.0.0.1:5432`.

Legacy (no forma parte de `forecast.sh up`, solo hace falta si necesitas
exponer n8n a internet, p. ej. para webhooks de Google Drive):

```bash
infra/setup.sh   # n8n + ngrok, por fuera del compose — ver advertencia abajo
```

> `setup.sh` y el `n8n` de `infra/docker-compose.yml` usan el mismo nombre de
> contenedor y el mismo puerto 5678: no corren los dos a la vez. Comparten el
> volumen `n8n-data`, así que cambiar de uno a otro no pierde workflows ni
> credenciales.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Google Drive (xlsx: Cloud Forecast FY26)                                │
│ └─ Auto-refrescado cada 4h desde Salesforce                             │
└─────────────────────────┬───────────────────────────────────────────────┘
                          │
                          ▼ Drive Trigger (fileUpdated) — TODAVÍA NO EXISTE
                          │
┌─────────────────────────┴───────────────────────────────────────────────┐
│ n8n (infra/docker-compose.yml, puerto 5678 / 8080 vía nginx)             │
│ └─ el flujo definitivo exportado vive en n8n/n8n_nola_completo.json      │
│ └─ hoy NO escribe a Postgres: falta el ETL que lo haga (ver abajo)       │
└─────────────────────────┬───────────────────────────────────────────────┘
                          │
                          ▼ (pendiente) ETL → Postgres directo
                          │
┌─────────────────────────┴───────────────────────────────────────────────┐
│ PostgreSQL 16 (forecast-postgres, 127.0.0.1:5432)                        │
│ ├─ carga          snapshots; dedup por datos_hash                        │
│ ├─ proyecto       UPSERT por clave; jsonb datos_info/backlog             │
│ ├─ revenue_mes    proyecto x mes x carga  ← LA PLATA                     │
│ ├─ revenue_anual  valor_of, acum_2025, backlog, total_ejecutado          │
│ ├─ movimiento     qué cambió entre dos cargas                            │
│ └─ 5 vistas: v_carga_actual, v_proyecto_actual, v_revenue_quarter,       │
│              v_total_ejecutado, v_totales_carga                          │
└─────────────────────────┬───────────────────────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────────────────────┐
│ API Node.js (forecast-api, :3000) — monolito: API + dashboard            │
│ ├─ GET  /api/proyectos  → proyecto.datos_info                           │
│ ├─ GET  /api/backlog    → datos_backlog + revenue_* (plata recalculada)  │
│ ├─ GET  /api/historia   → carga + revenue_mes + movimiento (cacheado)    │
│ ├─ POST /api/reload     → invalida la cache de historia                  │
│ └─ GET  /*              → sirve este directorio como estático            │
└─────────────────────────┬───────────────────────────────────────────────┘
                          │
                          ▼ fetch('./api/...') — relativo, sin CORS
                    http://localhost:3000/
```

**La plata tiene un solo dueño**: `revenue_mes` y `revenue_anual`. Los jsonb
`datos_info` / `datos_backlog` guardan solo las columnas descriptivas del Excel
—de `datos_backlog` se excluyen los campos de dinero— para que la API pueda
devolver la forma exacta del JSON original sin que nada pueda divergir de las
tablas de hechos. Por eso los quarters y el total ejecutado se recalculan al
leer.

## File Layout

```
PoC/                           (raíz de este repo)
├── CLAUDE.md
├── README.md                  # Historia del PoC: hallazgos de negocio,
│                               # validación del dato. La sección "Cómo
│                               # levantarlo" apunta a infra/.
├── index.html · app.js · styles.css · vendor/   # Dashboard, vanilla JS
├── n8n/
│   └── n8n_nola_completo.json # Export del workflow — definitivo, no editar
│                               # a mano aquí; se edita en n8n y se reexporta.
├── docs/                      # Documentos de planeación del PoC original
│                               # (QUICK_START, VIABILIDAD, ESPECIFICACION_
│                               # BACKEND, etc.) — históricos, se conservan
│                               # como referencia aunque ya no describan el
│                               # estado actual.
├── CLOUD FORECAST GENERAL - NOLA FY26.xlsx   # Dato de origen (NO se sube
│                               # a git: ver .gitignore)
└── infra/
    ├── forecast.sh            # up | seed | rebuild | logs | psql | down | destroy
    ├── README.md              # operación del stack técnico (empezar por aquí)
    ├── docker-compose.yml     # 4 servicios: postgres, api, n8n, nginx
    ├── .env                   # credenciales de desarrollo (NO se sube a git)
    ├── .env.example
    ├── db/init/01_schema.sql  # 5 tablas + 5 vistas (solo corre la 1a vez)
    ├── nginx/n8n.conf         # reverse proxy delante de n8n
    ├── setup.sh               # legacy: n8n + ngrok, para exposición pública
    └── api/
        ├── Dockerfile
        ├── package.json
        └── src/
            ├── server.js      # Express: /api/* + sirve el dashboard
            ├── db.js          # pool; numeric -> float
            ├── dominio.js     # meses, quarters, claves de cruce
            ├── seed.js        # carga datos a Postgres (ver aviso en infra/README.md)
            └── routes/        # proyectos.js, backlog.js, historia.js
```

## El flujo de n8n — todavía no existe

No hay un flujo que escriba a Postgres. `n8n/n8n_nola_completo.json` es el
export vigente, pero la carga a Postgres hoy es manual. Para construirlo
faltan dos piezas, en este orden:

1. **Un ETL que escriba directo a Postgres** (en el lenguaje que sea — el
   PoC original usaba Python y ya no está en este repo) — en una transacción.
   La deduplicación por `carga.datos_hash` ya está en el esquema: calcular el
   sha256 sobre los datos *extraídos* (no sobre el `.xlsx`, que cambia de
   bytes en cada refresco aunque el contenido sea idéntico) y salir con éxito
   sin escribir si coincide con la última carga. La lógica de cruce y de
   movimientos está en `infra/api/src/seed.js` y se puede portar.
2. **El workflow**: Drive Trigger (`fileUpdated` por `fileId`) → Download del
   binario → Execute Command (el ETL nuevo) → IF código ≠ 0 →
   `POST http://api:3000/api/reload` (n8n y la API ya comparten red vía el
   compose, no hace falta `host.containers.internal` ni conectar redes a mano).

## Credenciales de n8n

La guía de credenciales (Drive OAuth2, Sheets, Vertex AI) con el detalle de
scopes y pasos no forma parte de este repo. Para el flujo nuevo solo hace
falta `Google Drive OAuth2 API` (scope `drive.readonly`) y la credencial
Postgres descrita en `infra/README.md`.

## Qué NO está en este repo (a propósito)

- `flows/` (exports históricos de n8n distintos al vigente) y el ETL en
  Python (`etl.py`, `generar_historia.py`, `actualizar.sh`, `serve.sh`,
  `data/*.json`) del PoC original: se retiraron porque ya no se usan — el
  dashboard lee de Postgres, no de JSON regenerados a mano.
- No actives ni reconstruyas ese flujo Excel→JSON: es historia, no el camino
  a producción. El camino a producción es la sección de arriba.

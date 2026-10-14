# Integración: n8n + PostgreSQL + Dashboard

**Objetivo**: n8n consume Excel de Drive → ETL (Python) → escribe en Postgres → Dashboard Lee de Postgres

---

## 1. Base de datos (PostgreSQL)

### Contenedor

```yaml
# docker-compose.yml (en /infra)
version: '3.8'

services:
  n8n:
    image: n8n
    ports:
      - "5678:5678"
    environment:
      - N8N_HOST=n8n
      - DB_TYPE=postgres
      - DB_POSTGRESDB_HOST=postgres
      - DB_POSTGRESDB_PORT=5432
      - DB_POSTGRESDB_DATABASE=n8n_data
      - DB_POSTGRESDB_USER=n8n
      - DB_POSTGRESDB_PASSWORD=n8n_pass
    depends_on:
      - postgres
    networks:
      - local_net

  postgres:
    image: postgres:16
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres_admin
      - POSTGRES_DB=forecast
    volumes:
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
      - postgres_data:/var/lib/postgresql/data
    networks:
      - local_net

  # Backend Node.js que sirve la API
  api:
    build: ./api
    ports:
      - "3000:3000"
    environment:
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=forecast
      - DB_USER=forecast_user
      - DB_PASSWORD=forecast_pass
    depends_on:
      - postgres
    networks:
      - local_net

volumes:
  postgres_data:

networks:
  local_net:
    driver: bridge
```

### Esquema SQL (`init.sql`)

```sql
-- Crear usuario de aplicación
CREATE USER forecast_user WITH PASSWORD 'forecast_pass';
GRANT ALL PRIVILEGES ON DATABASE forecast TO forecast_user;

-- Tablas
CREATE TABLE carga (
  id               bigserial PRIMARY KEY,
  ejecutada_en     timestamptz NOT NULL DEFAULT now(),
  archivo_nombre   text        NOT NULL,
  datos_hash       text        NOT NULL,
  fecha_referencia date        NOT NULL,
  filas_info       int         NOT NULL,
  filas_backlog    int         NOT NULL
);
CREATE INDEX ON carga (ejecutada_en DESC);

CREATE TABLE proyecto (
  id                    bigserial PRIMARY KEY,
  clave                 text NOT NULL UNIQUE,
  num_pa                text,
  project_id            text,
  num_opp               text,
  nombre                text,
  cliente               text,
  pm_lider              text,
  pm_lider_psa          text,
  zona                  text,
  pais                  text,
  vendedor              text,
  tsm                   text,
  billing_type          text,
  billing_arrangement   text,
  estado                text,
  valor_of              numeric(14,2),
  valor_of_anterior     numeric(14,2),
  acumulado_a_hoy       numeric(14,2),
  consumido_2025        numeric(14,2),
  backlog_2026          numeric(14,2),
  ejecucion_deseada     numeric(14,2),
  pct_ejecucion_actual  numeric(10,6),
  pct_peso_contrato     numeric(10,6),
  fecha_fin             date,
  estado_contrato       text,
  dias_para_vencimiento int,
  meses_transcurridos   numeric(10,4),
  tipo_de_ejecucion     text,
  q_del_clawback        text,
  estatus               text,
  start_at_risk         boolean,
  campos_con_error      jsonb,
  campos_recalculados   text[],
  primera_carga_id      bigint REFERENCES carga(id),
  ultima_carga_id       bigint REFERENCES carga(id),
  actualizado_en        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON proyecto (cliente);
CREATE INDEX ON proyecto (estado);
CREATE INDEX ON proyecto (pais, zona);

CREATE TABLE revenue_mes (
  carga_id    bigint   NOT NULL REFERENCES carga(id) ON DELETE CASCADE,
  proyecto_id bigint   NOT NULL REFERENCES proyecto(id),
  mes         smallint NOT NULL CHECK (mes BETWEEN 1 AND 12),
  commit_usd  numeric(14,2) NOT NULL DEFAULT 0,
  upside_usd  numeric(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (carga_id, proyecto_id, mes)
);
CREATE INDEX ON revenue_mes (proyecto_id, mes);

CREATE TABLE revenue_anual (
  carga_id                  bigint NOT NULL REFERENCES carga(id) ON DELETE CASCADE,
  proyecto_id               bigint NOT NULL REFERENCES proyecto(id),
  acum_2025                 numeric(14,2),
  backlog                   numeric(14,2),
  total_ejecutado_acumulado numeric(14,2),
  PRIMARY KEY (carga_id, proyecto_id)
);

CREATE TABLE movimiento (
  id              bigserial PRIMARY KEY,
  carga_id        bigint   NOT NULL REFERENCES carga(id) ON DELETE CASCADE,
  carga_previa_id bigint   REFERENCES carga(id),
  proyecto_id     bigint   NOT NULL REFERENCES proyecto(id),
  mes             smallint CHECK (mes BETWEEN 1 AND 12),
  tipo            text     NOT NULL,
  monto           numeric(14,2) NOT NULL,
  commit_anterior numeric(14,2),
  commit_nuevo    numeric(14,2),
  upside_anterior numeric(14,2),
  upside_nuevo    numeric(14,2)
);
CREATE INDEX ON movimiento (carga_id);
CREATE INDEX ON movimiento (proyecto_id);

-- Vistas
CREATE VIEW v_carga_actual AS
  SELECT * FROM carga ORDER BY id DESC LIMIT 1;

CREATE VIEW v_proyecto_actual AS
SELECT p.*, ra.acum_2025, ra.backlog, ra.total_ejecutado_acumulado
FROM proyecto p
LEFT JOIN revenue_anual ra
  ON ra.proyecto_id = p.id AND ra.carga_id = (SELECT id FROM v_carga_actual);

CREATE VIEW v_revenue_quarter AS
SELECT
  r.proyecto_id,
  ceil(r.mes / 3.0)::int       AS quarter,
  sum(r.commit_usd)            AS commit_usd,
  sum(r.upside_usd)            AS upside_usd
FROM revenue_mes r
WHERE r.carga_id = (SELECT id FROM v_carga_actual)
GROUP BY r.proyecto_id, ceil(r.mes / 3.0);

-- Permisos
GRANT CONNECT ON DATABASE forecast TO forecast_user;
GRANT USAGE ON SCHEMA public TO forecast_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO forecast_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO forecast_user;
```

---

## 2. n8n Workflow

### Nodos (en orden)

| # | Nodo | Config |
|---|---|---|
| 1 | Google Drive Trigger | Vigila `fileId`, evento `fileUpdated` |
| 2 | Google Drive Download | Descarga binario `.xlsx` |
| 3 | Execute Command | `python3 /home/node/etl.py <ruta.xlsx> --destino=postgres --hoy` |
| 4 | IF | Si código ≠ 0, mandar alerta y terminar |
| 5 | HTTP POST | A `http://api:3000/api/reload` para recalcular caché |
| 6 | Notification | Si hubo carga o si ETL falló |

### Variables de entorno en n8n

```
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=forecast
POSTGRES_USER=forecast_user
POSTGRES_PASSWORD=forecast_pass
```

### Archivo `etl.py` (copiar a `/home/node/etl.py`)

Cambios respecto a la versión actual:

```python
import psycopg
import hashlib
from datetime import datetime

def main(xlsx_path, destino='postgres', hoy=None):
    # Extraer datos (igual que ahora)
    data_info = extract_info_proyectos(xlsx_path)
    data_backlog = extract_backlog_nola(xlsx_path)
    
    if destino == 'postgres':
        write_to_postgres(data_info, data_backlog, hoy)
    else:
        write_to_json(data_info, data_backlog)  # Keep existing JSON output

def write_to_postgres(info, backlog, fecha_referencia):
    conn = psycopg.connect(
        "host=postgres port=5432 dbname=forecast "
        "user=forecast_user password=forecast_pass"
    )
    
    try:
        with conn.transaction():
            # 1. Calcular hash
            datos_hash = hashlib.sha256(
                json.dumps(info + backlog, sort_keys=True).encode()
            ).hexdigest()
            
            # 2. Verificar si ya existe
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id FROM carga WHERE datos_hash = %s",
                    (datos_hash,)
                )
                if cur.fetchone():
                    return 0  # Ya existe, no hacer nada
            
            # 3. Insertar carga
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO carga (archivo_nombre, datos_hash, 
                       fecha_referencia, filas_info, filas_backlog)
                       VALUES (%s, %s, %s, %s, %s) RETURNING id""",
                    ("cloud_forecast.xlsx", datos_hash, fecha_referencia,
                     len(info), len(backlog))
                )
                carga_id = cur.fetchone()[0]
            
            # 4. UPSERT proyectos
            for row in info:
                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO proyecto (clave, num_pa, nombre, cliente, ...)
                        VALUES (%s, %s, %s, %s, ...)
                        ON CONFLICT (clave) DO UPDATE SET ...
                    """, (...))
            
            # 5. Insertar revenue_mes
            for row in backlog:
                for mes in range(1, 13):
                    # INSERT INTO revenue_mes (carga_id, proyecto_id, mes, commit_usd, upside_usd)
            
            # 6. Calcular movimientos (ver query en ESPECIFICACION_BACKEND.md §5)
            
        return 0
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    finally:
        conn.close()
```

---

## 3. Backend API (Node.js Express)

### Estructura

```
api/
├── package.json
├── index.js
├── db.js
└── routes/
    ├── proyectos.js
    ├── backlog.js
    └── historia.js
```

### `db.js`

```javascript
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'forecast',
  user: process.env.DB_USER || 'forecast_user',
  password: process.env.DB_PASSWORD || 'forecast_pass',
});

module.exports = pool;
```

### `index.js`

```javascript
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const proyectosRouter = require('./routes/proyectos');
const backlogRouter = require('./routes/backlog');
const historiaRouter = require('./routes/historia');

const app = express();
app.use(cors());
app.use(express.json());

// API endpoints
app.get('/api/proyectos', proyectosRouter);
app.get('/api/backlog', backlogRouter);
app.get('/api/historia', historiaRouter);

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// Reload cache (llamado desde n8n después de cada carga)
app.post('/api/reload', (req, res) => {
  // Limpiar caché de memoria si la hay
  res.json({ status: 'reloaded' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
```

### `routes/proyectos.js`

```javascript
const router = require('express').Router();
const pool = require('../db');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM v_proyecto_actual ORDER BY cliente, nombre'
    );
    
    const meta = {
      fecha_carga: new Date().toISOString(),
      total_proyectos: result.rows.length,
      campos_simulados: ['start_at_risk']
    };
    
    res.json({
      meta,
      proyectos: result.rows.map(transformProyecto)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function transformProyecto(row) {
  // Mappear nombres de campos si es necesario (convertir a snake_case español)
  return {
    num_pa: row.num_pa,
    nombre: row.nombre,
    cliente: row.cliente,
    valor_of: parseFloat(row.valor_of),
    estado: row.estado,
    // ... resto de campos
  };
}

module.exports = router;
```

---

## 4. Dashboard (cambios mínimos)

### `index.html` — reemplazar fetch

**Antes:**
```javascript
fetch('data/proyectos.json').then(r => r.json()).then(d => loadProyectos(d))
```

**Después:**
```javascript
fetch('http://localhost:3000/api/proyectos').then(r => r.json()).then(d => loadProyectos(d))
```

O si está en Docker con subdominios:
```javascript
fetch('http://api:3000/api/proyectos')
```

---

## 5. Levantar todo

### Paso a paso

```bash
# 1. Crear archivos
mkdir -p infra/api
cd infra

# 2. Copiar docker-compose.yml (arriba) a infra/
# 3. Copiar init.sql (arriba) a infra/
# 4. Crear carpeta api/
cat > api/package.json <<'EOF'
{
  "name": "forecast-api",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "express": "^4.18.0",
    "pg": "^8.11.0",
    "cors": "^2.8.5"
  }
}
EOF

# 5. Copiar archivos de la API (db.js, index.js, routes/)
# 6. Crear Dockerfile para la API
cat > api/Dockerfile <<'EOF'
FROM node:20
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
EOF

# 7. Levantar
podman-compose up -d

# 8. Verificar
podman-compose ps
podman exec forecast-postgres psql -U postgres -d forecast -c "SELECT * FROM carga;"
curl http://localhost:3000/health
curl http://localhost:3000/api/proyectos
```

### Logs

```bash
podman-compose logs -f api
podman-compose logs -f postgres
```

### Detener

```bash
podman-compose down
```

---

## 6. Estructura de respuesta API

Mantener exactamente igual a los JSON actuales:

### `GET /api/proyectos`

```json
{
  "meta": {
    "fecha_carga": "2026-10-09T15:30:00Z",
    "total_proyectos": 349,
    "campos_simulados": ["start_at_risk"]
  },
  "proyectos": [
    {
      "num_pa": "64779",
      "nombre": "BANRESERVAS",
      "cliente": "Banco",
      "valor_of": 8000000.00,
      "estado": "In Progress",
      ...
    }
  ]
}
```

### `GET /api/backlog`

```json
{
  "meta": {...},
  "backlog": [
    {
      "num_pa": "64779",
      "nombre": "BANRESERVAS",
      "mes_1_fijo": 210467,
      "mes_1_upside": 76533,
      ...
    }
  ]
}
```

### `GET /api/historia`

```json
{
  "meta": {...},
  "snapshots": [
    {
      "id": 1,
      "timestamp": "2026-10-01T10:30:00Z",
      "etiqueta": "Oct 01 • 10:30",
      "totales": {...},
      "por_mes": {...}
    }
  ],
  "series_por_proyecto": {
    "64779": [
      {
        "snapshot_id": 1,
        "commit": 2500000,
        "upside": 1200000,
        "meses": [[210467, 76533], ...]
      }
    ]
  },
  "eventos": [
    {
      "num_pa": "64779",
      "nombre": "BANRESERVAS",
      "tipo": "upside_a_commit",
      "campo": "enero",
      "delta": 50000,
      "valor_anterior": 200000,
      "valor_nuevo": 250000
    }
  ]
}
```

---

## 7. Checklist de implementación

- [ ] Crear `init.sql` con esquema
- [ ] Crear `docker-compose.yml` con 3 servicios (n8n, postgres, api)
- [ ] Modificar `etl.py` para escribir en Postgres (ver seción 2)
- [ ] Crear carpeta `api/` con Express.js
- [ ] Implementar 3 endpoints GET `/api/proyectos`, `/backlog`, `/historia`
- [ ] Cambiar URLs en dashboard `index.html` (3 fetch)
- [ ] Testear: `podman-compose up`, correr ETL, verificar BD, consumir API
- [ ] Ajustar mapeo de campos si es necesario (español/inglés, snake_case)

---

## 8. Notas importantes

1. **Deduplicación en n8n**: ETL calcula hash y devuelve código 0 si no hay cambios. n8n solo guarda alerta si falló (código ≠ 0).

2. **Transacción en BD**: Todo lo que escribe etl.py debe estar en una transacción. Si falla en el medio, rollback automático.

3. **Orden de escritura**:
   - INSERT carga
   - UPSERT proyecto
   - INSERT revenue_mes / revenue_anual
   - INSERT movimiento

4. **Caché**: Si el dashboard descarga proyectos.json entero, agregar un TTL en memoria en la API. Sin carga constante, la BD es rápida.

5. **Paginación futura**: Cuando pasen de ~60 cargas, `/api/historia?desde=X&hasta=Y` será necesario. Dashboard ya soporta rangos.


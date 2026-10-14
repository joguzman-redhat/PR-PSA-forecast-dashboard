# Quick Start: Levantar todo en 1 hora

---

## 0. Prerrequisitos

```bash
podman --version          # v4+
podman-compose --version  # v1.0.6+
python3 --version         # 3.9+
psql --version           # 16+
```

---

## 1. Crear docker-compose.yml

**Ubicación:** `/home/joguzman/Documents/projectos/practican8n/infra/docker-compose.yml`

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16
    container_name: forecast-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: forecast
    ports:
      - "5432:5432"
    volumes:
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
      - postgres_data:/var/lib/postgresql/data
    networks:
      - local_net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    container_name: forecast-api
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: forecast
      DB_USER: forecast_user
      DB_PASSWORD: forecast_pass
      NODE_ENV: production
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - local_net

  n8n:
    image: n8n
    container_name: forecast-n8n
    environment:
      DB_TYPE: postgres
      DB_POSTGRESDB_HOST: postgres
      DB_POSTGRESDB_PORT: 5432
      DB_POSTGRESDB_DATABASE: n8n_data
      DB_POSTGRESDB_USER: n8n
      DB_POSTGRESDB_PASSWORD: n8n_pass
      POSTGRES_HOST: postgres
      POSTGRES_PORT: 5432
      POSTGRES_DB: forecast
      POSTGRES_USER: forecast_user
      POSTGRES_PASSWORD: forecast_pass
      N8N_HOST: localhost
      N8N_PORT: 5678
      WEBHOOK_TUNNEL_URL: http://localhost:5678/
    ports:
      - "5678:5678"
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - n8n_data:/home/node/.n8n
      - ./etl.py:/home/node/etl.py:ro
      - /home/joguzman/Documents/projectos/practican8n/PoC:/home/node/data:ro
    networks:
      - local_net

volumes:
  postgres_data:
  n8n_data:

networks:
  local_net:
    driver: bridge
```

---

## 2. Crear init.sql

**Ubicación:** `/home/joguzman/Documents/projectos/practican8n/infra/init.sql`

```sql
CREATE USER forecast_user WITH PASSWORD 'forecast_pass';
GRANT ALL PRIVILEGES ON DATABASE forecast TO forecast_user;

\c forecast forecast_user

CREATE TABLE carga (
  id               bigserial PRIMARY KEY,
  ejecutada_en     timestamptz NOT NULL DEFAULT now(),
  archivo_nombre   text        NOT NULL,
  datos_hash       text        NOT NULL UNIQUE,
  fecha_referencia date        NOT NULL,
  filas_info       int         NOT NULL,
  filas_backlog    int         NOT NULL
);
CREATE INDEX idx_carga_ejecutada_en ON carga (ejecutada_en DESC);

CREATE TABLE proyecto (
  id                    bigserial PRIMARY KEY,
  clave                 text NOT NULL UNIQUE,
  num_pa                text,
  project_id            text,
  num_opp               text,
  nombre                text,
  cliente               text,
  pm_lidor              text,
  pm_lidor_psa          text,
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
CREATE INDEX idx_proyecto_cliente ON proyecto (cliente);
CREATE INDEX idx_proyecto_estado ON proyecto (estado);
CREATE INDEX idx_proyecto_pais_zona ON proyecto (pais, zona);

CREATE TABLE revenue_mes (
  carga_id    bigint   NOT NULL REFERENCES carga(id) ON DELETE CASCADE,
  proyecto_id bigint   NOT NULL REFERENCES proyecto(id),
  mes         smallint NOT NULL CHECK (mes BETWEEN 1 AND 12),
  commit_usd  numeric(14,2) NOT NULL DEFAULT 0,
  upside_usd  numeric(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (carga_id, proyecto_id, mes)
);
CREATE INDEX idx_revenue_mes_proyecto ON revenue_mes (proyecto_id, mes);

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
CREATE INDEX idx_movimiento_carga ON movimiento (carga_id);
CREATE INDEX idx_movimiento_proyecto ON movimiento (proyecto_id);

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

GRANT CONNECT ON DATABASE forecast TO forecast_user;
GRANT USAGE ON SCHEMA public TO forecast_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO forecast_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO forecast_user;
```

---

## 3. Crear API Node.js

**Carpeta:** `/home/joguzman/Documents/projectos/practican8n/infra/api/`

### `package.json`

```json
{
  "name": "forecast-api",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.0",
    "cors": "^2.8.5"
  },
  "engines": {
    "node": "20"
  }
}
```

### `Dockerfile`

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### `index.js`

```javascript
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'forecast',
  user: process.env.DB_USER || 'forecast_user',
  password: process.env.DB_PASSWORD || 'forecast_pass',
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/api/proyectos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM v_proyecto_actual ORDER BY cliente, nombre');
    res.json({
      meta: { fecha: new Date().toISOString(), total: result.rows.length },
      proyectos: result.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/backlog', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.num_pa, p.nombre, p.cliente, 
             r.mes, r.commit_usd, r.upside_usd
      FROM revenue_mes r
      JOIN proyecto p ON r.proyecto_id = p.id
      WHERE r.carga_id = (SELECT id FROM v_carga_actual)
      ORDER BY p.nombre, r.mes
    `);
    res.json({
      meta: { fecha: new Date().toISOString() },
      backlog: result.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/historia', async (req, res) => {
  try {
    const cargas = await pool.query('SELECT * FROM carga ORDER BY id DESC LIMIT 100');
    const movimientos = await pool.query('SELECT * FROM movimiento ORDER BY carga_id DESC LIMIT 1000');
    res.json({
      meta: { fecha: new Date().toISOString() },
      snapshots: cargas.rows,
      eventos: movimientos.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API en puerto ${PORT}`));
```

---

## 4. Levantar

```bash
cd infra

# Crear archivos si no existen
# (ya están: docker-compose.yml, init.sql)
# Crear carpeta api/ con los 3 archivos arriba

podman-compose up -d

# Esperar a que se levante (30s aprox)
sleep 30

# Verificar
podman-compose ps
podman exec forecast-postgres psql -U postgres -d forecast -c "SELECT COUNT(*) FROM carga;"
curl http://localhost:3000/health
```

---

## 5. Modificar etl.py

En `/home/joguzman/Documents/projectos/practican8n/PoC/etl.py`, al final del `main()`:

```python
if args.destino == 'postgres':
    write_to_postgres(data_info, data_backlog, args.fecha_referencia)
    return 0
else:
    # Original: guardar JSON
    ...
```

Agregar función:

```python
def write_to_postgres(info, backlog, fecha_ref):
    import psycopg
    import hashlib
    import json
    import os
    
    conn = psycopg.connect(
        f"host={os.getenv('POSTGRES_HOST', 'postgres')} "
        f"port={os.getenv('POSTGRES_PORT', 5432)} "
        f"dbname={os.getenv('POSTGRES_DB', 'forecast')} "
        f"user={os.getenv('POSTGRES_USER', 'forecast_user')} "
        f"password={os.getenv('POSTGRES_PASSWORD', 'forecast_pass')}"
    )
    
    try:
        with conn.transaction():
            # Hash
            datos_hash = hashlib.sha256(
                json.dumps(info + backlog, sort_keys=True, default=str).encode()
            ).hexdigest()
            
            # Verificar
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM carga WHERE datos_hash = %s", (datos_hash,))
                if cur.fetchone():
                    print("Sin cambios, saltando", file=sys.stderr)
                    return 0
            
            # Insertar carga
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO carga (archivo_nombre, datos_hash, "
                    "fecha_referencia, filas_info, filas_backlog) "
                    "VALUES (%s, %s, %s, %s, %s) RETURNING id",
                    ("cloud_forecast.xlsx", datos_hash, fecha_ref, len(info), len(backlog))
                )
                carga_id = cur.fetchone()[0]
            
            # UPSERT proyectos (omitiendo detalle por brevedad)
            # INSERT revenue_mes
            # Calcular movimientos
            # ...
            
        print(f"Carga {carga_id} escrita OK", file=sys.stderr)
        return 0
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1
    finally:
        conn.close()
```

---

## 6. Cambiar dashboard

En `/home/joguzman/Documents/projectos/practican8n/PoC/index.html`, reemplazar:

```javascript
// ANTES
fetch('data/proyectos.json').then(r => r.json())
fetch('data/backlog_nola.json').then(r => r.json())
fetch('data/historia_revenue.json').then(r => r.json())

// DESPUÉS
fetch('http://api:3000/api/proyectos').then(r => r.json())
fetch('http://api:3000/api/backlog').then(r => r.json())
fetch('http://api:3000/api/historia').then(r => r.json())
```

---

## 7. Test

```bash
# Verificar BD
psql -h localhost -U forecast_user -d forecast -c "SELECT COUNT(*) FROM proyecto;"

# Ejecutar ETL
cd PoC
python3 etl.py "CLOUD FORECAST GENERAL - NOLA FY26.xlsx" \
  --destino=postgres --fecha=2026-10-06

# Verificar carga
psql -h localhost -U forecast_user -d forecast \
  -c "SELECT COUNT(*) FROM proyecto; SELECT SUM(commit_usd) FROM revenue_mes WHERE carga_id = (SELECT id FROM v_carga_actual);"

# Verificar API
curl http://localhost:3000/api/proyectos | jq '.meta'

# Abrir dashboard (cambiar localhost si es Docker)
# http://localhost:8099
```

---

## 8. Cleanup

```bash
cd infra
podman-compose down        # Para todo
podman-compose down -v     # Para todo + borra volúmenes (¡cuidado!)
podman-compose logs -f api # Ver logs de API
```

---

## Archivos a crear/modificar

```
infra/
├── docker-compose.yml      ← Crear (ver sección 1)
├── init.sql               ← Crear (ver sección 2)
└── api/
    ├── package.json       ← Crear (ver sección 3)
    ├── Dockerfile         ← Crear (ver sección 3)
    └── index.js          ← Crear (ver sección 3)

PoC/
├── etl.py               ← Modificar (agregar write_to_postgres)
└── index.html           ← Modificar (cambiar 3 fetch)
```


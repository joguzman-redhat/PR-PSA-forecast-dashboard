# Cheat Sheet: Cloud Forecast

## 0. Antes de empezar

```bash
cd /home/joguzman/Documents/projectos/practican8n/infra

# Crear estos archivos (ver QUICK_START.md):
# ├── docker-compose.yml
# ├── init.sql
# └── api/
#     ├── package.json
#     ├── Dockerfile
#     └── index.js
```

## 1. Levantar

```bash
podman-compose up -d          # Inicia 3 contenedores

# Esperar ~30s
sleep 30

podman-compose ps             # Verificar
```

## 2. Datos en BD

```bash
# Conectar a PostgreSQL
psql -h localhost -U forecast_user -d forecast

# Queries útiles
SELECT COUNT(*) FROM carga;                    -- ¿Cuántas cargas?
SELECT COUNT(*) FROM proyecto;                 -- ¿Cuántos proyectos?
SELECT SUM(commit_usd) FROM revenue_mes 
WHERE carga_id = (SELECT id FROM v_carga_actual);  -- ¿Total commit?
SELECT * FROM v_proyecto_actual LIMIT 1;     -- ¿Qué ve el API?
SELECT * FROM movimiento LIMIT 5;             -- ¿Qué cambió?
```

## 3. Ejecutar ETL

```bash
cd /home/joguzman/Documents/projectos/practican8n/PoC

# Versión 1: JSON (actual)
python3 etl.py "CLOUD FORECAST GENERAL - NOLA FY26.xlsx" --fecha=2026-10-06

# Versión 2: PostgreSQL (nueva)
python3 etl.py "CLOUD FORECAST GENERAL - NOLA FY26.xlsx" \
  --destino=postgres --fecha=2026-10-06

# Códigos de retorno
# 0 = Éxito (o sin cambios)
# 1 = Error (validación falló)
```

## 4. Verificar API

```bash
# Health check
curl http://localhost:3000/health

# Proyectos
curl http://localhost:3000/api/proyectos | jq '.meta'

# Backlog
curl http://localhost:3000/api/backlog | jq '.backlog | length'

# Historia
curl http://localhost:3000/api/historia | jq '.snapshots | length'
```

## 5. Dashboard

```bash
# Opción A: Dentro de Docker (si está en PoC/)
# Servido en: http://localhost:8099

# Opción B: Cambiar fetch en index.html
# ANTES: fetch('data/proyectos.json')
# AHORA: fetch('http://api:3000/api/proyectos')

# Luego:
cd /home/joguzman/Documents/projectos/practican8n/PoC
python3 -m http.server 8099
# http://localhost:8099
```

## 6. Logs

```bash
podman-compose logs -f postgres   # BD
podman-compose logs -f api        # API REST
podman-compose logs -f n8n        # Workflow

# Última línea (salir con Ctrl+C)
podman-compose logs postgres | tail -20
```

## 7. Parar

```bash
podman-compose down              # Para y remove containers
podman-compose down -v           # ¡ CUIDADO !: borra también volúmenes
```

## 8. Troubleshooting

### "No puedo conectar a postgres:5432"
```bash
podman-compose ps                     # ¿Está running?
podman exec forecast-postgres pg_isready  # ¿Ready?
```

### "API devuelve 500"
```bash
podman-compose logs api           # Ver error
psql -c "SELECT 1 FROM carga;"    # ¿Existe tabla?
```

### "Dashboard no trae datos"
```bash
# Abrir DevTools (F12)
# Ver Network tab: ¿qué devuelve http://api:3000/api/proyectos?

# Si es CORS:
# El docker-compose.yml ya tiene cors: true

# Si es 404:
# Verificar que API está corriendo
curl http://api:3000/health
```

### "etl.py falla"
```bash
# Ver salida completa
python3 etl.py "archivo.xlsx" --destino=postgres --fecha=2026-10-06 2>&1

# Revisar validaciones en ESPECIFICACION_BACKEND.md § 8
```

## 9. Estructura esperada

### Vista desde n8n
```
n8n container (5678)
 └─ /home/node/etl.py         ← ejecuta esto
 └─ /home/node/data/          ← accede archivos
 └─ env vars: POSTGRES_*      ← conecta aquí
```

### Conexión
```
etl.py
  ├─ psycopg.connect(host="postgres", ...) ← nombre del servicio en docker
  └─ INSERT INTO carga/proyecto/revenue_mes/...
```

### Vista desde API
```
api container (3000)
 └─ db.js: pool.connect(host="postgres", ...)
 └─ routes: GET /api/proyectos (SELECT * FROM v_proyecto_actual)
 └─ response: { meta, proyectos: [...] }
```

## 10. Validación final (checklist)

- [ ] `podman-compose ps` = 3/3 running
- [ ] `psql` conecta sin error
- [ ] `SELECT COUNT(*) FROM proyecto` = 349
- [ ] `SELECT SUM(commit_usd)...` = $20,253,985.24
- [ ] `curl http://localhost:3000/health` = {"ok":true}
- [ ] `curl http://localhost:3000/api/proyectos` = 349 registros
- [ ] Dashboard carga sin errores en console (F12)
- [ ] Filtros funcionan
- [ ] Gráficas dibujan

---

## Referencia rápida: Archivos importantes

| Archivo | Ubicación | Propósito |
|---------|-----------|----------|
| docker-compose.yml | `infra/` | Levanta 3 containers |
| init.sql | `infra/` | Schema de BD |
| etl.py | `PoC/` | Excel → Postgres |
| index.html | `PoC/` | Dashboard (cambiar fetch) |
| index.js | `infra/api/` | API Express |

---

## Env vars para n8n

```
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=forecast
POSTGRES_USER=forecast_user
POSTGRES_PASSWORD=forecast_pass
```

## Env vars para API

```
DB_HOST=postgres
DB_PORT=5432
DB_NAME=forecast
DB_USER=forecast_user
DB_PASSWORD=forecast_pass
```


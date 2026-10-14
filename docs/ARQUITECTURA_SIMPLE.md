# Arquitectura: Componentes y flujo

---

## Componentes (3 contenedores)

```
┌─────────────────┐
│   n8n (5678)    │  - Lee Drive trigger
│                 │  - Descarga Excel
│                 │  - Ejecuta etl.py
└────────┬────────┘
         │
         │ etl.py
         │
         ▼
┌─────────────────┐
│  PostgreSQL     │  - Tablas: carga, proyecto, revenue_mes, movimiento
│   (5432)        │  - Vistas: v_proyecto_actual, v_carga_actual
└────────┬────────┘
         │
         │ SELECT (queries)
         │
         ▼
┌─────────────────┐
│  API Node.js    │  - GET /api/proyectos
│   (3000)        │  - GET /api/backlog
│                 │  - GET /api/historia
└────────┬────────┘
         │
         │ JSON
         │
         ▼
    Dashboard
   (index.html)
```

---

## Base de datos: Tablas y relaciones

```
carga
├─ id (PK)
├─ ejecutada_en
├─ datos_hash        ← verifica si cambió (deduplicación)
├─ fecha_referencia  ← fecha de corte del Excel
├─ filas_info
└─ filas_backlog

proyecto
├─ id (PK)
├─ clave (UNIQUE)    ← num_pa o nombre normalizado (clave de cruce)
├─ num_pa
├─ nombre
├─ cliente
├─ pm_lider
├─ estado            ← Planned, In Progress, On Hold, Completed, Canceled
├─ valor_of          ← Valor del proyecto
├─ fecha_fin
├─ estado_contrato   ← Recalculado
├─ primera_carga_id  ─┐
├─ ultima_carga_id   ─┴─► FK a carga
└─ ... (35 campos más)

revenue_mes
├─ carga_id (FK)
├─ proyecto_id (FK)
├─ mes (1-12)
├─ commit_usd        ← Revenue fijo del mes
└─ upside_usd        ← Revenue pendiente

revenue_anual
├─ carga_id (FK)
├─ proyecto_id (FK)
├─ acum_2025         ← Acumulado gastado en 2025
├─ backlog           ← Backlog 2026
└─ total_ejecutado

movimiento
├─ id (PK)
├─ carga_id (FK)
├─ carga_previa_id (FK)
├─ proyecto_id (FK)
├─ mes
├─ tipo              ← 'upside_a_commit', 'commit_a_upside', 'alta_proyecto'
├─ monto             ← Delta que cambió
├─ commit_anterior
├─ commit_nuevo
└─ ... (histórico completo del cambio)
```

---

## Flujo de datos por carga

### Caso 1: El Excel cambió → Se escribe todo

```
1. n8n detecta cambio en Drive
2. Descarga Excel binario
3. etl.py:
   - Extrae Info Proyectos + BackLog NOLA
   - Calcula hash SHA256 de lo extraído
   - Consulta: ¿existe carga con este hash?
   
   ✓ Existe → Salir (código 0, sin escribir nada)
   ✗ No existe → Continuar
   
4. Dentro de UNA TRANSACCIÓN:
   INSERT carga → obtener carga_id
   UPSERT proyecto (por clave)
   INSERT revenue_mes (349 proyectos × 12 meses = ~4k filas)
   INSERT revenue_anual
   SELECT carga anterior
   Calcular diferencias: ¿dónde cambió?
   INSERT movimiento (solo si delta > $1)
   
5. COMMIT (todo o nada)
6. n8n obtiene código 0 → Éxito
7. n8n llama POST /api/reload → API descarta caché
8. Dashboard hace fetch a /api/proyectos
   → Base de datos tiene datos frescos
```

### Caso 2: El Excel no cambió

```
etl.py calcula hash → coincide con última carga
→ return 0 (código de éxito sin escribir)
→ Fin (no hay movimiento, no hay notificación)
```

---

## API: Qué devuelve cada endpoint

### Datos fuente: `v_proyecto_actual` (view)

Trae el estado ACTUAL de cada proyecto con su revenue más reciente (acum_2025, backlog, etc).

```sql
SELECT p.*, ra.acum_2025, ra.backlog
FROM proyecto p
LEFT JOIN revenue_anual ra 
  ON ra.proyecto_id = p.id 
  AND ra.carga_id = (SELECT id FROM v_carga_actual);
```

### Datos fuente: `revenue_mes` × `v_carga_actual`

Para cada proyecto × mes × carga, qué commit y upside había.

### Datos fuente: `movimiento` (tabla)

Registro de TODO lo que cambió entre cargas: proyecto, mes, tipo de movimiento, monto exacto.

### Mapeo a endpoints

```
GET /api/proyectos
  ← SELECT * FROM v_proyecto_actual
  ← Estructura: { meta, proyectos: [...] }
  ← Dashboard dibuja listado y filtros

GET /api/backlog  
  ← SELECT * FROM revenue_anual, proyecto WHERE carga_id = (SELECT id FROM v_carga_actual)
  ← Estructura: { meta, backlog: [...] }
  ← Dashboard dibuja tabla mes a mes

GET /api/historia
  ← SELECT * FROM carga, revenue_mes, movimiento 
  ← Estructura: { meta, snapshots: [...], series_por_proyecto: {...}, eventos: [...] }
  ← Dashboard dibuja gráficas y trazabilidad
```

---

## Variables de conexión

### n8n → PostgreSQL

En el contenedor n8n, pasar como env vars:

```
POSTGRES_HOST=postgres     (nombre del servicio en docker-compose)
POSTGRES_PORT=5432
POSTGRES_DB=forecast
POSTGRES_USER=forecast_user
POSTGRES_PASSWORD=forecast_pass
```

En etl.py, dentro del contenedor:

```python
import psycopg
conn = psycopg.connect(
    host="postgres",
    port=5432,
    dbname="forecast",
    user="forecast_user",
    password="forecast_pass"
)
```

### API → PostgreSQL

En el contenedor api, pasar como env vars:

```
DB_HOST=postgres
DB_PORT=5432
DB_NAME=forecast
DB_USER=forecast_user
DB_PASSWORD=forecast_pass
```

En db.js:

```javascript
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});
```

### Dashboard → API

```javascript
fetch('http://api:3000/api/proyectos')  // URL interna (docker)
// o 
fetch('http://localhost:3000/api/proyectos')  // Si es local sin docker
```

---

## Comandos podman-compose

```bash
# Iniciar
podman-compose -f infra/docker-compose.yml up -d

# Logs
podman-compose -f infra/docker-compose.yml logs -f postgres
podman-compose -f infra/docker-compose.yml logs -f api
podman-compose -f infra/docker-compose.yml logs -f n8n

# Detener
podman-compose -f infra/docker-compose.yml down

# Borrar volúmenes (¡cuidado! pierde datos)
podman-compose -f infra/docker-compose.yml down -v

# Ejecutar comando en contenedor
podman exec forecast-postgres psql -U postgres -d forecast -c "SELECT COUNT(*) FROM proyecto;"

# Conectarse a BD desde host
psql -h localhost -U forecast_user -d forecast
# (password: forecast_pass)
```

---

## Ciclo completo: Excel → BD → Dashboard

```
Hora 10:00 → Excel en Drive cambió
            ↓
n8n detecta el cambio (trigger)
            ↓
Descarga cloud_forecast.xlsx
            ↓
Ejecuta: python3 etl.py cloud_forecast.xlsx --destino=postgres --hoy
            ↓
etl.py:
  - Lee Info Proyectos (349 filas)
  - Lee BackLog NOLA (349 filas × 12 meses)
  - Normaliza claves (PA o nombre)
  - Recalcula 8 columnas rotas
  - Hash SHA256
  - ¿Cambió? (compara hash con última carga)
            ↓
  SÍ, cambió
  INSERT INTO carga
  UPSERT INTO proyecto
  INSERT INTO revenue_mes (4200 filas)
  INSERT INTO movimiento (calcula diferencias)
  COMMIT
            ↓
Retorna código 0
            ↓
n8n obtiene respuesta ✓
            ↓
n8n → POST http://api:3000/api/reload
            ↓
API descarta caché (si la hay)
            ↓
Usuario abre dashboard
            ↓
Dashboard: fetch http://api:3000/api/proyectos
           ↓
           SELECT * FROM v_proyecto_actual
           ↓ (resuelve a BD viva)
           ↓
           Retorna 349 proyectos con datos frescos
            ↓
Dashboard renderiza listado, filtros, KPIs
            ↓
Usuario ve los cambios
```

---

## Cambios en archivos existentes

| Archivo | Cambio |
|---------|--------|
| `etl.py` | Agregar argumento `--destino=postgres`. Cuando se pase, conectar a BD en vez de escribir JSON |
| `index.html` | Reemplazar 3 fetch de `data/*.json` por `http://api:3000/api/*` |
| `app.js` | Sin cambios (lógica es igual, solo cambia de dónde vienen los datos) |
| Nuevo: `infra/docker-compose.yml` | Define 3 servicios |
| Nuevo: `infra/init.sql` | Esquema de BD |
| Nuevo: `api/` | Carpeta con Node.js + Express |

---

## Validación: Queries útiles para verificar

```sql
-- ¿Cuántas cargas hay?
SELECT COUNT(*) FROM carga;

-- ¿Cuántos proyectos en la carga más reciente?
SELECT COUNT(*) FROM proyecto 
WHERE ultima_carga_id = (SELECT id FROM v_carga_actual);

-- ¿Cuál fue el último cambio?
SELECT * FROM movimiento 
WHERE carga_id = (SELECT id FROM v_carga_actual)
ORDER BY id DESC LIMIT 1;

-- Verificar hash (deduplicación)
SELECT datos_hash, COUNT(*) FROM carga GROUP BY datos_hash HAVING COUNT(*) > 1;

-- Revenue total del portafolio (hoy)
SELECT SUM(commit_usd) FROM revenue_mes WHERE carga_id = (SELECT id FROM v_carga_actual);

-- Top 10 proyectos por valor OF
SELECT nombre, valor_of FROM v_proyecto_actual ORDER BY valor_of DESC LIMIT 10;
```


# Viabilidad: Cloud Forecast → Postgres + Dashboard

---

## Resumen ejecutivo

**¿Es viable hacerlo directamente desde n8n?** ✅ SÍ

**¿Qué necesita?** 3 componentes en Docker:
1. PostgreSQL (almacena datos)
2. API Node.js Express (lee BD y devuelve JSON)
3. n8n (orquesta el flujo ETL)

**¿Cambios en el dashboard actual?** Mínimos (3 líneas de fetch)

**Complejidad:** Media. No hay que reescribir nada, solo cambiar la salida de etl.py de JSON a SQL.

---

## Stack tecnológico recomendado

```
┌──────────────────────────────────────────────────────────────┐
│ Frontend: Dashboard (ya existe)                              │
│ ├─ index.html / app.js / styles.css                         │
│ ├─ Busca datos en API (cambio: 3 fetch)                     │
│ └─ Vanilla JS, sin dependencias                             │
├──────────────────────────────────────────────────────────────┤
│ Backend: API REST (nuevo)                                    │
│ ├─ Node.js 20 + Express 4                                   │
│ ├─ 3 endpoints: /api/proyectos, /backlog, /historia         │
│ ├─ Pool de conexiones a BD (pg 8)                           │
│ └─ Respuestas JSON (estructura = JSON actual)               │
├──────────────────────────────────────────────────────────────┤
│ Base de datos: PostgreSQL 16                                 │
│ ├─ 5 tablas: carga, proyecto, revenue_mes, revenue_anual,   │
│ │  movimiento                                                │
│ ├─ 3 vistas: v_carga_actual, v_proyecto_actual,             │
│ │  v_revenue_quarter                                         │
│ └─ ~1.5 MB por snapshot (349 × 12 × 2 + metadatos)          │
├──────────────────────────────────────────────────────────────┤
│ Orquestación: n8n workflow                                   │
│ ├─ 1. Google Drive Trigger → deteccion de cambio            │
│ ├─ 2. Download binario .xlsx                                │
│ ├─ 3. Execute Command: etl.py --destino=postgres            │
│ ├─ 4. IF (código de éxito)                                  │
│ └─ 5. Notificación si hay cambio o error                    │
├──────────────────────────────────────────────────────────────┤
│ ETL: Python 3 (etl.py modificado)                            │
│ ├─ Lee Excel (openpyxl)                                     │
│ ├─ Extrae, normaliza, recalcula 8 columnas                  │
│ ├─ Conecta a Postgres (psycopg3)                            │
│ ├─ Escribe en transacción (todo o nada)                     │
│ └─ Devuelve código 0 (éxito) o 1 (fallo)                    │
└──────────────────────────────────────────────────────────────┘

Ejecución: Docker (local hoy, OpenShift después)
├─ docker-compose.yml (3 servicios)
├─ Volumen persistente para Postgres
└─ Red interna (postgres y n8n privados, API expuesta)
```

---

## Ventajas de esta arquitectura

| Ventaja | Por qué |
|---------|---------|
| **Histórico real** | Cada carga es un snapshot, no simulado. 32 cargas hoy, 365 en un año. |
| **Deduplicación automática** | Hash SHA256 evita escribir si no cambió. ~4h entre refrescos. |
| **Transacciones** | Si falla en el medio, rollback. No quedan cargas a medias. |
| **Trazabilidad** | Tabla `movimiento` registra EXACTAMENTE qué cambió, cuándo y cuánto. |
| **Dashboard sin cambios** | Los JSON tienen la misma estructura. Solo cambian las URLs. |
| **Escalable** | Postgres maneja fácil 1000+ cargas. Vistas para cálculos complejos. |
| **Auditable** | Tabla de cargas con timestamp, hash, usuario (si lo agregás). |
| **Backend monolítico** | API es un único servicio que lee BD y devuelve JSON. Sin complejidad. |

---

## Desafíos y soluciones

| Desafío | Solución |
|---------|----------|
| **Conexión etl.py → Postgres** | Env vars en contenedor n8n. `psycopg.connect(host="postgres", ...)` |
| **Tabla de proyectos crece infinito** | No crece. UPSERT por clave deduplicador. Siempre 349 proyectos. |
| **revenue_mes explota** | ~1400 filas por carga (349 × 4 meses). Índices en proyecto_id. |
| **¿Y si falla Postgres?** | n8n retira el código ≠ 0 y manda alerta. Dashboard no se actualiza. |
| **Migración a OpenShift** | 3 Deployments (n8n, Postgres, API). PVC para Postgres. Listo. |
| **Paginación en historia** | Cuando pase 60 cargas, `?desde=X&hasta=Y`. Ya lo planificaste. |
| **Backups** | `pg_dump` del volumen persistente. Script cron en host. |

---

## Cambios de código necesarios

### 1. etl.py (~50 líneas nuevas)

```python
# Agregar al final del main()

if args.destino == 'postgres':
    write_to_postgres(data_info, data_backlog, args.hoy)
else:
    write_to_json(data_info, data_backlog)  # Mantener original

def write_to_postgres(info, backlog, fecha_referencia):
    conn = psycopg.connect(
        host=os.getenv('POSTGRES_HOST', 'postgres'),
        port=os.getenv('POSTGRES_PORT', 5432),
        dbname=os.getenv('POSTGRES_DB', 'forecast'),
        user=os.getenv('POSTGRES_USER'),
        password=os.getenv('POSTGRES_PASSWORD')
    )
    
    # 1. Hash
    # 2. Verificar si existe
    # 3. INSERT carga
    # 4. UPSERT proyecto
    # 5. INSERT revenue
    # 6. Calcular movimientos
    # 7. COMMIT
```

### 2. index.html (3 líneas)

```javascript
// ANTES
fetch('data/proyectos.json').then(r => r.json()).then(loadProyectos)

// DESPUÉS
fetch('http://api:3000/api/proyectos').then(r => r.json()).then(loadProyectos)
```

Lo mismo para `/backlog` y `/historia`.

### 3. Nueva: api/index.js (~100 líneas)

```javascript
const express = require('express');
const { Pool } = require('pg');

const app = express();
const pool = new Pool({...});

app.get('/api/proyectos', async (req, res) => {
  const result = await pool.query('SELECT * FROM v_proyecto_actual');
  res.json({ meta: {...}, proyectos: result.rows });
});

// Idem /api/backlog, /api/historia
```

---

## Cronograma (desarrollo local)

| Fase | Qué | Tiempo | Bloqueador |
|------|-----|--------|-----------|
| 1 | Crear init.sql + docker-compose.yml | 30 min | Ninguno |
| 2 | Modificar etl.py para escribir en Postgres | 2h | Test de conexión |
| 3 | Crear API con Express (3 endpoints) | 2h | Test de queries |
| 4 | Cambiar fetch en dashboard | 15 min | Nada |
| 5 | Testing end-to-end | 1h | Alineación de estructuras JSON |

**Total: ~5.5 horas** (un día de desarrollo)

---

## Validación: Cómo verificar que está bien

```bash
# 1. ¿Se levantó todo?
podman-compose ps
# Debe mostrar 3 contenedores: n8n, postgres, api

# 2. ¿Se crearon las tablas?
psql -h localhost -U forecast_user -d forecast \
  -c "SELECT COUNT(*) FROM carga;"

# 3. ¿Etl.py escribe en Postgres?
cd PoC
python3 etl.py "CLOUD FORECAST GENERAL - NOLA FY26.xlsx" \
  --destino=postgres --fecha=2026-10-06

# 4. ¿La carga se insertó?
psql -h localhost -U forecast_user -d forecast \
  -c "SELECT COUNT(*) FROM proyecto;"
# Debe mostrar: 349

# 5. ¿El revenue cuadra?
psql -h localhost -U forecast_user -d forecast \
  -c "SELECT SUM(commit_usd) FROM revenue_mes \
       WHERE carga_id = (SELECT id FROM v_carga_actual);"
# Debe coincidir con el Excel: $20,253,985.24

# 6. ¿La API responde?
curl http://localhost:3000/api/proyectos | jq '.meta'

# 7. ¿El dashboard funciona?
# Abrir http://localhost:8099
# Debe mostrar 349 proyectos, listado de filtros, KPIs, gráficas
```

---

## Fuera de alcance (por ahora)

- ~~Autenticación en el dashboard~~ → Fácil de agregar después
- ~~Backups automáticos~~ → Script cron en host
- ~~Agente LLM que genera SQL~~ → Tabla `movimiento` lista para eso
- ~~Histórico de atributos (cliente, PM)~~ → Tabla `proyecto_historial` opcional
- ~~OpenShift~~ → Después, solo cambiar docker-compose → 3 Deployments

---

## Decisión

**Recomendación: ✅ Adelante con esta arquitectura**

- Es viable, escalable y testeable.
- El dashboard no cambia (solo URLs).
- El histórico es real, no simulado.
- Se puede hacer en un día.
- Base sólida para OpenShift después.

Próximo paso: Crear `init.sql` + `docker-compose.yml` y empezar testing.


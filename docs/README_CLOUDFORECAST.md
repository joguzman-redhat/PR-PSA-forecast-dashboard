# Cloud Forecast: Documentación completa

---

## 📚 Documentación por audiencia

### Para gerentes / stakeholders

1. **[VIABILIDAD.md](VIABILIDAD.md)** — ¿Es viable? ¿Qué cuesta? ¿Cuándo?
   - Resumen ejecutivo (2 min)
   - Stack tecnológico
   - Ventajas + desafíos
   - Cronograma (5.5h)

---

### Para desarrolladores (implementar)

**Lectura recomendada en orden:**

1. **[ARQUITECTURA_SIMPLE.md](ARQUITECTURA_SIMPLE.md)** — Entiende el flujo (5 min)
   - Diagrama de 3 componentes
   - Tablas de BD y sus relaciones
   - Flujo de datos por carga
   - Variables de conexión

2. **[QUICK_START.md](QUICK_START.md)** — Levanta todo en 1 hora (paso a paso)
   - Crear docker-compose.yml
   - Crear init.sql
   - Crear API Node.js
   - Test de extremo a extremo

3. **[INTEGRACION_DB.md](INTEGRACION_DB.md)** — Referencia técnica completa
   - Esquema SQL detallado
   - Modificaciones a etl.py
   - Código de API completo
   - Estructura de respuestas JSON
   - Checklist de implementación

---

### Para auditar / revisar antes de producción

- **[ESPECIFICACION_BACKEND.md](ESPECIFICACION_BACKEND.md)** (original en repo)
  - Qué está roto en el Excel (8 columnas)
  - Trampas de datos (12 puntos)
  - Validaciones que abortan la carga
  - Reglas de negocio confirmadas

---

## 🚀 Resumen de flujo

```
Drive (Excel)
  ↓ 4h refresh
n8n (trigger + execute etl.py)
  ↓
PostgreSQL (5 tablas + 3 vistas)
  ↓
API REST (3 endpoints)
  ↓
Dashboard (index.html)
```

---

## ⚡ Quick commands

```bash
# Start everything
cd infra && podman-compose up -d

# Run ETL manually
cd PoC && python3 etl.py "CLOUD FORECAST GENERAL - NOLA FY26.xlsx" \
  --destino=postgres --fecha=2026-10-06

# Verify data
psql -h localhost -U forecast_user -d forecast -c \
  "SELECT COUNT(*) FROM proyecto;"

# Check API
curl http://localhost:3000/api/proyectos | jq '.meta'

# Stop
cd infra && podman-compose down
```

---

## 📋 Checklist: Qué leer según tu rol

| Rol | Lee | Por qué |
|-----|-----|---------|
| **Product Manager** | VIABILIDAD.md | Viabilidad, timeline, ventajas |
| **Tech Lead** | ARQUITECTURA_SIMPLE.md | Decisiones de diseño, flujo |
| **Dev (DB)** | INTEGRACION_DB.md § 1, 4 | Schema SQL, índices |
| **Dev (API)** | INTEGRACION_DB.md § 2, 3 | API endpoints, código Node.js |
| **Dev (ETL)** | INTEGRACION_DB.md § 2 + ESPECIFICACION_BACKEND.md | Modificar etl.py, trampas |
| **DevOps** | QUICK_START.md | docker-compose, volumes, networking |
| **QA / Tester** | VIABILIDAD.md, QUICK_START.md § 7 | Test plan, validación |

---

## 📊 Matriz: Qué se modifica / se crea

| Archivo | Estado | Cambios |
|---------|--------|---------|
| `etl.py` | ✏️ Modificar | Agregar función `write_to_postgres()` |
| `index.html` | ✏️ Modificar | Cambiar 3 fetch: `data/*.json` → `http://api:3000/api/*` |
| `app.js` | ✅ Sin cambios | Lógica igual, datos vienen de API |
| `styles.css` | ✅ Sin cambios | |
| `flows/flow_cloud_forecast.json` | 🆕 Crear | Workflow n8n (si no existe) |
| `infra/docker-compose.yml` | 🆕 Crear | 3 servicios: postgres, api, n8n |
| `infra/init.sql` | 🆕 Crear | Schema, views, permisos |
| `infra/api/package.json` | 🆕 Crear | Dependencias Node.js |
| `infra/api/Dockerfile` | 🆕 Crear | Build image para API |
| `infra/api/index.js` | 🆕 Crear | API REST (Express) |
| `infra/api/db.js` | 🆕 Crear | Pool PostgreSQL |
| `infra/api/routes/*.js` | 🆕 Crear | 3 endpoints |

---

## 🔍 Decisiones técnicas (ya tomadas)

| Decisión | Razón | Implicación |
|----------|-------|------------|
| **PostgreSQL, no MongoDB** | Datos numéricos/tabulares, queries complejas, ACID | Queries deterministas, índices, vistas |
| **Monolítico (API → BD), no microservicios** | Menos complejidad, más rápido | Un solo servicio, un deploy |
| **Deduplicación por hash (etl.py)** | Evita ruido, Excel se refresha c/4h | Query en BD, no en n8n |
| **Transacción por carga** | Garantía: todo o nada | Si falla en el medio, rollback |
| **Vistas SQL para LLM** | Aislamiento de reglas de negocio | Prompt describe vistas, no tablas |
| **Dashboard sin cambios (URLs only)** | Zero rewrite, validado | 3 líneas de JS nuevas |

---

## 🧪 Validación: Antes de decir "listo"

- [ ] `podman-compose ps` muestra 3 servicios running
- [ ] `psql -c "SELECT COUNT(*) FROM proyecto;"` retorna 349
- [ ] `psql -c "SELECT SUM(commit_usd) FROM revenue_mes WHERE carga_id = (SELECT id FROM v_carga_actual);"` retorna $20,253,985.24
- [ ] `curl http://localhost:3000/api/proyectos | jq '.proyectos | length'` retorna 349
- [ ] Dashboard abre en http://localhost:8099 sin errores de fetch
- [ ] Cada columna del listado es visible
- [ ] Filtros funcionan (Cliente, Estado, Zona, etc.)
- [ ] Detalle de proyecto carga sin errores
- [ ] Gráfica de trazabilidad carga datos

---

## 📞 Soporte

| Tema | Documento | Sección |
|------|-----------|---------|
| "¿Es viable?" | VIABILIDAD.md | § Resumen ejecutivo |
| "¿Cómo se ve la BD?" | ARQUITECTURA_SIMPLE.md | § Base de datos |
| "¿Cómo conecto?" | QUICK_START.md | § 7. Test |
| "¿Qué hace etl.py?" | ESPECIFICACION_BACKEND.md | § 2. Reparto del trabajo |
| "¿Qué está roto en el Excel?" | ESPECIFICACION_BACKEND.md | § 8. Trampas del dato |
| "¿Cómo paginan los datos?" | INTEGRACION_DB.md | § 7. Cuándo paginar |
| "¿Y si falla todo?" | VIABILIDAD.md | § Desafíos y soluciones |

---

## 🎯 Siguiente paso

1. **Tú eres dev:** Abre QUICK_START.md, sigue paso 1-7.
2. **Tú eres PM:** Lee VIABILIDAD.md, sección "Cronograma".
3. **Tú eres DevOps:** Copia docker-compose.yml de QUICK_START.md.
4. **Dudas:** Vuelve a ARQUITECTURA_SIMPLE.md, léelo todo de nuevo.

---

## 📝 Cambios desde la versión anterior

| Cambio | Antes | Ahora |
|--------|-------|-------|
| **Salida del ETL** | JSON (3 archivos) | PostgreSQL (5 tablas + 3 vistas) |
| **Dashboard data** | `fetch('data/proyectos.json')` | `fetch('http://api:3000/api/proyectos')` |
| **Histórico** | Simulado (generar_historia.py) | Real (tabla carga) |
| **Trazabilidad** | Determinista (seed 20261006) | Cada carga es un snapshot verdadero |
| **Movimientos** | Generados en Python | Calculados en BD (tabla movimiento) |
| **Infraestructura** | n8n local + ngrok | docker-compose (postgres + api + n8n) |
| **Deduplicación** | Manual (mirar JSON viejo) | SHA256 en etl.py |

---

## 🎁 Bonificaciones (no en scope, para después)

- Autenticación en dashboard
- Backups automáticos (pg_dump)
- Agente LLM (genera SQL sobre vistas)
- Histórico de atributos (cliente, PM, zona)
- Alertas Slack por movimientos > $X
- Migración a OpenShift (3 Deployments)


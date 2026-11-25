# HANDOFF: Cloud Forecast Dashboard · OpenShift Evaluation Complete

**Fecha:** 2026-10-28 · **Estado:** Principales 5 requisitos completados, OpenShift evaluation finalizada, IT ticket abierto.

---

## 1. Objetivo del Proyecto

**Problema:** Seguimiento de revenue en proyectos de la red NOLA y trazabilidad de cómo cambia en el tiempo, sin datos de fuentes dispersas.

**Requisitos originales (completados):**
1. ✅ Verificar que Postgres corre y tiene datos reales
2. ✅ Conectar el agente de n8n a Postgres (lectura)
3. ✅ Preparar datos para que el teammate consuma Postgres directo (no HTML dashboard)
4. ✅ Probar snapshots de carga del ETL
5. ✅ Publicar el workflow de n8n con Basic Auth

**Entregable principal:** Dashboard de revenue + Postgres como fuente única de verdad + n8n como ETL + API Node.js como interfaz de datos.

---

## 2. Arquitectura Actual

### Componentes

| Componente | Tecnología | Rol | Estado |
|---|---|---|---|
| **Drive .xlsx** | Google Drive | Fuente de datos brutos (Info Proyectos + BackLog NOLA) | Externo, integrado vía OAuth |
| **n8n** | Workflow automation (24 nodos) | ETL: extrae Excel, calcula hashes, recalcula columnas, valida, escribe a Postgres | ✅ Completo |
| **Postgres** | postgres:16-alpine + triggers PL/pgSQL | Fuente única de verdad para revenue (5 tablas + 3 vistas) | ✅ Corriendo |
| **API Node.js** | Express + openapi3-generator | Sirve dashboard estático + endpoints REST para datos | ✅ Corriendo |
| **Dashboard** | Vanilla JS + Chart.js | Visualización de revenue y proyectos | ✅ Funcional |
| **n8n AI Agent** | LangChain + OpenAI MaaS | Preguntas conversacionales sobre datos (herramientas Postgres) | ✅ Corriendo (integrado en n8n) |
| **nginx** | nginx:latest | Puerta de entrada a n8n (local/LAN) | ✅ Corriendo |
| **OpenShift (Demo Platform)** | Red Hat Demo Platform · GitOps con Argo CD | Evaluación de producción: deploy full stack via kustomize + Argo CD | ✅ Probado, funcional |

### Flujo de datos

```
Drive .xlsx (Info Proyectos + BackLog NOLA)
    ↓
[n8n] Descargar → Extraer → Validar → Calcular hash
    ↓
[IF] ¿Hash igual a última carga?
    ├─ SÍ: fin (sin escribir)
    └─ NO: Recalcular columnas → Construir SQL → INSERT en Postgres
    ↓
[Postgres] carga + proyecto + revenue_mes + revenue_anual + movimiento
    ↓
[n8n AI Agent] Lee datos via herramientas Postgres para responder preguntas
    ↓
[API] GET /api/proyectos, /api/revenue-history, /api/ai/chat (Chat Trigger publicado)
    ↓
[Dashboard] Gráficos de revenue, tabla de proyectos
```

### Stack local (Podman Compose)

Archivo: `infra/docker-compose.yml`

```
services:
  postgres (forecast-postgres)
    - image: postgres:16-alpine
    - puerto: 5432 (loopback)
    - volumen: forecast_pgdata
    - schema: infra/db/init/01_schema.sql

  api (forecast-api)
    - build: context=repo-root, dockerfile=infra/api/Dockerfile
    - puerto: 3000
    - depende de: postgres (healthcheck)
    - publica: dashboard + endpoints REST

  n8n (forecast-n8n)
    - image: n8nio/n8n:latest
    - puerto: 5678
    - volumen: n8n_data (workflows + credenciales)
    - depende de: postgres

  nginx (forecast-nginx)
    - image: nginx:latest
    - puerto: 8080 → n8n:5678
    - [opcional] ngrok para webhooks públicos (perfil "public")
```

Comando: `cd infra && ./forecast.sh {up|public|rebuild|down|destroy}`.

### Stack OpenShift (GitOps)

**Repo:** GitHub `joguzman-redhat/PR-PSA-forecast-dashboard`, rama `v2`  
**GitOps:** Argo CD (OpenShift GitOps 1.22.2)  
**Manifests:** `openshift/base/` + `openshift/argocd/application.yaml`  
**Namespace:** `forecast-app` (creado automáticamente por Argo CD)  
**Cluster:** Demo Platform Red Hat (SNO en CNV, host `cluster-j7zjn.dyn.redhatworkshops.io`)

Componentes en OpenShift:
- `forecast-postgres` (Deployment, quay.io/sclorg/postgresql-16-c9s)
- `forecast-api` (Deployment, ImageStream + BuildConfig, construye desde GitHub)
- `forecast-n8n` (Deployment, n8nio/n8n:latest, HOME=/home/node)
- `forecast-postgres-init-schema` (Job con PostSync hook, corre `psql -f /schema/01_schema.sql`)
- Routes + Services (TLS edge)

Metrics observados (2026-10-21):
- n8n: 118m CPU, 512Mi RAM
- Postgres: 6m CPU, 38Mi RAM
- API: 12m CPU, 33Mi RAM
- DB: 8.8MB
- Node: 6% CPU, 15% RAM

---

## 3. Estado de Implementación

### ✅ COMPLETADO

| Funcionalidad | Detalles | Verificación |
|---|---|---|
| **ETL completo en n8n** | Nodos: Descargar, Extraer Info/BackLog, Recalcular, Validar, Hash, SQL, Execute | `n8n/n8n_nola_completo.json` (24 nodos) |
| **Postgres con schema** | 5 tablas (carga, proyecto, revenue_mes, revenue_anual, movimiento) + 3 vistas + triggers | `infra/db/init/01_schema.sql` |
| **Deduplicación por hash** | SHA256 de datos canonicalizados, comparación contra última carga | Trigger `trg_carga_sin_cambios` |
| **Validaciones de calidad** | ≥10 proyectos, ≥95% cruce por clave, ≥50% valor_of numérico, quarters ≥98% | Nodo "Validar Calidad de Datos" |
| **Cálculos recalculados** | `clave` (num_pa o nombre normalizado), `estado_contrato`, `dias_para_vencimiento` | Nodo "Recalcular Columnas Rotas" |
| **AI Agent** | LangChain + OpenAI MaaS con 3 herramientas Postgres (proyectos, movimientos, métricas) | Nodos "AI Agent" + "Tool_Postgres_*" |
| **Publish con Basic Auth** | Chat Trigger con autenticación Basic, Chat page funcional | Configurado en n8n, probado |
| **Dashboard** | Gráficos de revenue (commit/upside), tabla de proyectos, sidebar de snapshots | `index.html` + `app.js` + `styles.css` |
| **API REST** | Endpoints `/api/proyectos`, `/api/revenue-history`, `/api/ai/chat`, `/health` | Spec OpenAPI en `api/src/openapi.yaml` |
| **Docker local** | Postgres + API + n8n + nginx en `docker-compose.yml` | Comando `./forecast.sh up` |
| **OpenShift deploy** | Manifests kustomize, Argo CD sync, BuildConfig, ImageStream, Routes TLS | Rama `v2` desplegada |
| **IT ticket** | Solicitud de cluster permanente VPN-backed enviada vía Red Hat Hub | Ticket creado 2026-10-21 |

### ⚠️ PARCIALMENTE IMPLEMENTADO

| Aspecto | Detalles | Por qué |
|---|---|---|
| **Credenciales en OpenShift** | Google Drive OAuth funciona; MaaS (gpt-oss-120b) funciona localmente, no probado post-deploy | La credencial MaaS no migra automáticamente desde Podman; debe recrearse en OpenShift vía n8n UI |
| **n8n URL en OpenShift** | Hardcodeada en `openshift/base/n8n/deployment.yaml` (host `cluster-j7zjn.dyn.redhatworkshops.io`) | Demo Platform es efímero (~48h); nuevo cluster = nuevo dominio |

### ❌ NO IMPLEMENTADO (Por decisión)

| Aspecto | Razón |
|---|---|
| **Autenticación en dashboard** | No solicitado en los 5 requisitos; planeado para fase 2 |
| **HTML dashboard en n8n** | El teammate consume Postgres directo (feedback: "no necesitamos dashboard html") — el nodo HTML node fue removido del workflow |
| **Correción en el Excel origen** | 8 columnas #VALUE! en Info Proyectos — se corrigen en el ETL, no en la fuente (scope out) |
| **Cluster permanente en OpenShift** | Evaluación completada; IT ticket enviado, respuesta pendiente |
| **Migración de etl.py** | El proyecto original en `/Project_Dashboard` (legacy) no se tocó per feedback |

---

## 4. Decisiones Técnicas

### Postgres vs. Data Tables de n8n

**Decisión:** n8n escribe directo a Postgres, no usa Data Tables.

**Justificación:**
- Una sola transacción real (`BEGIN; ... COMMIT;`) para atomicidad completa
- n8n Data Tables sería ~300+ upserts individuales, sin transacción real
- Postgres es la fuente única de verdad; n8n es solo el ETL temporal

**Implementación:** Nodo Code arma UN string SQL multisentencia → Nodo Postgres Execute Query lo corre completo.

### Hash para deduplicación

**Decisión:** SHA256 del JSON canonicalizado (claves ordenadas) vs. UNIQUE global.

**Justificación:**
- Permite workflow sin ramificación compleja (IF simple)
- Trigger en Postgres rechaza inserts idénticos (seguridad adicional)
- Función `abrir_carga()` retorna NULL si no hubo cambios (alternativa sin error)

### Imagen Postgres en OpenShift

**Decisión:** `quay.io/sclorg/postgresql-16-c9s` en vez de `postgres:16-alpine` oficial.

**Justificación:**
- SCC `restricted-v2` (default OpenShift) impone UID no-root arbitrario
- postgres:16-alpine intenta arrancar como root → EACCES
- sclorg está diseñada para OpenShift, arranca con UID aleatorio sin problemas

### Variables de entorno en Postgres

**Decisión:** Solo `POSTGRESQL_*`, nunca `PGUSER`/`PGPASSWORD`/`PGDATABASE`.

**Justificación:**
- Script de init de sclorg + psql leen `PG*` variables directamente (conflicto)
- Primera vez que arranca Postgres, intenta crear el role pero las `PG*` vars hace que se conecte antes (role no existe aún)
- Resultado: "role forecast does not exist"
- Fix: env vars explícitas solo `POSTGRESQL_*` en Postgres, `PGUSER`/`PGPASSWORD` en API

### HOME=/home/node en n8n (OpenShift)

**Decisión:** Fijar explícitamente en deployment.

**Justificación:**
- Con UID aleatorio no-root, n8n no resuelve HOME automáticamente
- Intenta escribir en `/` (EACCES)
- Fix: env var `HOME=/home/node`

### emptyDir para /home/node/.cache

**Decisión:** No usar PVC para cache, sino emptyDir.

**Justificación:**
- Cache es volátil (assets compilados, no datos persistentes)
- PVC innecesario (costo, complejidad)
- emptyDir se recrea en cada pod restart (OK para cache)

### n8n URL hardcoded en OpenShift

**Decisión:** URL de cluster ficada en manifests de Git (no interpolada en runtime).

**Justificación:**
- Webhook URLs (Drive, OAuth) deben estar registradas en Google antes de que n8n arranque
- Demo Platform asigna host dinámicamente al crear Route
- No hay way de interpolar antes de que pod arranque
- Workaround: hardcodear en Git, manual patch cuando nuevo cluster

### Dockerfile de API con contexto en repo root

**Decisión:** `context: ..` (repo root) en docker-compose, contexto para el build.

**Justificación:**
- Dashboard estático (index.html, app.js, styles.css) debe empacarse en imagen
- Podman local: bind-mount hacía cambios instantáneos, pero OpenShift no lo soporta
- Solución: empaquetar en imagen vía `COPY` en Dockerfile
- Efecto: cambios al dashboard requieren `./forecast.sh rebuild` (no instantáneo)

### Git: rama v2 para OpenShift

**Decisión:** Rama dedicada `v2`, manifests en `openshift/base/`.

**Justificación:**
- Rama `main` es legacy (tiene cosas viejas del PoC)
- `v2` = versión limpia + manifests OpenShift
- Argo CD apunta a `v2` + carpeta `openshift/base`

---

## 5. Historial de Debugging

### Errores Encontrados y Resueltos

#### 1. **Postgres: "role forecast does not exist"**
- **Causa:** Script init de sclorg + `PGUSER`/`PGPASSWORD`/`PGDATABASE` env vars juntos. El script intenta crear el rol pero psql ya está leyendo las `PG*` vars, conectándose antes.
- **Solución:** Reemplazar `PG*` por `POSTGRESQL_*` en env Postgres. API sigue usando `PGUSER`/`PGPASSWORD`.
- **Verify:** Borrar PVC, recrear, confirmar `\du` en psql.

#### 2. **n8n EACCES en /.n8n**
- **Causa:** UID aleatorio no-root + HOME no resuelve → intenta escribir en `/`.
- **Solución:** Env var `HOME=/home/node` en deployment.
- **Verify:** `oc logs pod/forecast-n8n-xxx | grep HOME`.

#### 3. **n8n EACCES en /home/node/.cache (segundo error)**
- **Causa:** `/home/node/.cache` en imagen n8n es parte de la imagen (no PVC), no escribible para UID arbitrario.
- **Solución:** emptyDir volumeMount en `/home/node/.cache`.
- **Verify:** `oc logs pod/forecast-n8n-xxx | grep cache`.

#### 4. **Argo CD: "app path does not exist"**
- **Causa:** Manifests en Git no estaban pusheados aún (user subió via VS Code, pero path no existía en remote).
- **Solución:** User empujó manualmente via VS Code.
- **Verify:** `oc apply -f openshift/argocd/application.yaml` → Application creada.

#### 5. **Argo CD: "forbidden" errors en sync**
- **Causa:** Service account de Argo CD no tenía permisos en namespace `forecast-app`.
- **Solución:** `oc adm policy add-role-to-user admin system:serviceaccount:openshift-gitops:openshift-gitops-argocd-application-controller -n forecast-app`.
- **Verify:** `oc get rolebinding -n forecast-app | grep openshift-gitops`.

#### 6. **n8n URL placeholder PENDIENTE reverted por selfHeal**
- **Causa:** Argo CD con `selfHeal=true` sincroniza cada ~3m, revirtiendo env vars manualmente patcheadas.
- **Solución:** Hardcodear la URL real en manifests y commitear a Git (cluster-j7zjn.dyn.redhatworkshops.io).
- **Commit:** `c084a1f Fijar la URL real de n8n en vez del placeholder PENDIENTE`.

#### 7. **ErrImagePull en forecast-api**
- **Causa:** BuildConfig construye imagen pero Deployment no sabía cuándo reimportarla.
- **Solución:** Agregar annotation `image.openshift.io/triggers` al Deployment.
- **Commit:** `c479012 Agregar trigger de ImageStream al Deployment del API`.

#### 8. **Sync stuck (psql Job no terminaba)**
- **Causa:** Job schema-init colgado esperando por recurso (probablemente PVC en proceso de bind).
- **Solución:** `oc delete application forecast-dashboard` + `oc apply -f openshift/argocd/application.yaml` (limpio + re-create).
- **Verify:** `oc get jobs -n forecast-app` → schema-init Completed.

#### 9. **PVC "forecast-postgres-data" desaparece**
- **Causa:** Tras borrar un pod o durante troubleshooting, PVC quedó en estado "pending".
- **Solución:** Borrar PVC, esperar reconciliación, aplicar manualmente `openshift/base/postgres/pvc.yaml`.
- **Verify:** `oc get pvc -n forecast-app`.

#### 10. **Credencial MaaS: "PENDIENTE" en n8n local**
- **Causa:** Workflow export de n8n encripta credenciales con la clave de la instancia local; en import no se desencriptan.
- **Solución:** No re-importar credenciales, crearlas en UI. En OpenShift, usuario creó credencial MaaS manual vía UI n8n.
- **Status:** Local funciona, OpenShift no probado post-deploy (MaaS cred creada manual, pero no se verificó).

#### 11. **Drive OAuth: "Inicia sesión en tu cuenta personal"**
- **Causa:** Google Cloud project tenía una cuenta logueada en el navegador; OAuth picker abrió la personal automáticamente.
- **Solución:** Incognito + login con cuenta de empresa.
- **Verify:** Chat Trigger con agente probado tras reconectar OAuth.

#### 12. **Teammate's MaaS: "Failed to receive response"**
- **Causa:** TBD (esperando resultado de curl test).
- **Status:** NO RESUELTO. Pending teammate's debug.

### Intentos Fallidos que NO deben repetirse

1. **Revertir a etl.py:** El proyecto ya no lo usa. Toda la lógica debe vivir en n8n.
2. **Re-agregar nodo HTML en n8n:** Feedback explícito: "no necesitamos dashboard html".
3. **Mezclar directorios:** `/Project_Dashboard` (legacy) ≠ `/Dashboard_final` (activo). Nunca tocar legacy.
4. **Usar postgres:16-alpine en OpenShift:** Coexiste con sclorg, pero sclorg es la que funciona con SCC restricted-v2.
5. **Credenciales en Git:** Nunca. Secrets se crean manual con `oc create secret` en OpenShift.
6. **Cambiar credenciales en el export de n8n:** No sincroniza. Cambiar en UI n8n, luego exportar si es necesario.
7. **Esperar que Drive OAuth migre automáticamente:** Vive en volumen n8n encriptado, no se migra. Recrear en cada nueva instancia.

---

## 6. Archivos Relevantes

### Directorio: Raíz del repo

| Archivo | Función | Cambios recientes |
|---|---|---|
| `CLAUDE.md` | Guía para agentes Claude | Describe stack actual (4 contenedores + ETL completo) |
| `README.md` | Cómo levantar | Apunta a `infra/README.md` |
| `HANDOFF_CODEX.md` | Este archivo | Creado 2026-10-28 |
| `.git/` | Control de versiones GitHub | Rama activa: `v2`, remoto: joguzman-redhat/PR-PSA-forecast-dashboard |
| `.gitignore` | Excluye `.env`, node_modules | Protege credenciales |

### Directorio: `n8n/`

| Archivo | Función | Nodos | Status |
|---|---|---|---|
| `n8n_nola_completo.json` | Workflow definitivo (exportado de UI n8n) | 24 nodos: Extract → Validate → Hash → SQL → Execute + AI Agent | ✅ Final, no editar a mano aquí |

**Nodos principales:**
- `Manual Trigger`, `Descargar data.xlsx de Drive` (OAuth)
- `Extraer Info Proyectos`, `Extraer BackLog NOLA` (JSON parsing)
- `Recalcular Columnas Rotas`, `Validar Calidad de Datos`, `Calcular Hash`
- `Obtener Ultimo Hash` (SELECT), `Hay Cambios Reales?` (IF)
- `Construir SQL de Carga` (Code), `Ejecutar Carga en Postgres` (Postgres Execute Query)
- `Chat Trigger`, `AI Agent`, `OpenAI Chat Model (MaaS)` (conversación)
- `Tool_Postgres_Proyectos`, `Tool_Postgres_Movimientos`, `Tool_Postgres_Metricas` (herramientas)

### Directorio: `infra/`

| Archivo | Función | Purpose |
|---|---|---|
| `.env` | Variables de entorno (no en Git) | Credenciales local: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, NGROK_AUTHTOKEN, etc. |
| `.env.example` | Template de .env | Referencia para qué variables existen |
| `README.md` | Comandos, puertos, contrato API | Cómo correr `up`, `public`, `rebuild`, etc. |
| `forecast.sh` | Script shell para orquestar docker-compose | `up`, `public`, `rebuild`, `down`, `destroy`, `seed`, `logs`, `psql` |
| `docker-compose.yml` | Spec de servicios locales | Postgres, API, n8n, nginx, [ngrok] |

**Subdirectorios:**
- `api/` → Dockerfile, package.json, src/ (app.js, server, openapi.yaml)
- `db/init/` → 01_schema.sql (schema Postgres, 5 tablas + 3 vistas + triggers)

### Directorio: `openshift/`

| Archivo | Función | Status |
|---|---|---|
| `README.md` | Pasos manual para desplegar (secrets, apply, URL patch) | Documentación completa |
| `argocd/application.yaml` | Argo CD Application CRD (Git → cluster sync) | ✅ Apuntando a rama v2, carpeta openshift/base |
| `base/kustomization.yaml` | Kustomize base (lista recursos + configMapGenerator) | ✅ Actual |
| `base/postgres/pvc.yaml`, `deployment.yaml`, `service.yaml` | Postgres en Kubernetes | ✅ Actual |
| `base/api/imagestream.yaml`, `buildconfig.yaml`, `deployment.yaml`, `service.yaml`, `route.yaml` | API + build + routing | ✅ Actual, trigger de ImageStream agregado |
| `base/n8n/pvc.yaml`, `deployment.yaml`, `service.yaml`, `route.yaml` | n8n en Kubernetes | ✅ Actual, HOME=/home/node + emptyDir para cache |
| `base/jobs/schema-init-job.yaml` | Job PostSync (aplica schema SQL) | ✅ Actual |
| `base/postgres/01_schema.sql` | COPIA de `infra/db/init/01_schema.sql` | ⚠️ Manual copy si schema cambia |

**Nota:** Kustomize no permite referencias fuera de su directorio, así que `01_schema.sql` está duplicado en `openshift/base/postgres/`. Si el schema real cambia, hay que copiarlo manualmente aquí también (ver openshift/README.md punto "Decisiones").

### Directorio: `docs/`

Documentación de análisis y decisiones (para referencia, no código ejecutable):

| Archivo | Contenido |
|---|---|
| `START_HERE.md` | Entrada rápida al proyecto |
| `ARQUITECTURA_SIMPLE.md` | Diagrama conceptual |
| `ESPECIFICACION_BACKEND.md` | Reglas de validación del ETL, umbral de movimientos |
| `INTEGRACION_DB.md` | Schema Postgres (antes de que se escribiera 01_schema.sql) |
| `HALLAZGOS_Y_VALIDACION.md` | Hallazgos de negocio (Excel con #VALUE!, cruce de datos, etc.) |
| `QUICK_START.md` | Quickstart rápido |
| `VIABILIDAD.md` | Análisis técnico de viabilidad del n8n ETL |
| `TROUBLESHOOTING_2026-10-15.md` | Errores y fixes del PoC local |

Leer si necesitas contexto de reglas de negocio, pero no son instrucciones de build/deploy.

### Directorio: Raíz (frontend)

| Archivo | Función | Status |
|---|---|---|
| `index.html` | Dashboard: layout, tablas, botones | ✅ Funcional, gráficos de revenue |
| `app.js` | Lógica: fetch a API, render gráficos, Chart.js | ✅ Funcional |
| `styles.css` | Estilos CSS | ✅ Responsive |
| `vendor/` | Librerías (Chart.js, etc.) | ✅ Empaquetadas en imagen API |

---

## 7. Estado de Datos y PostgreSQL

### Schema

**Archivo fuente:** `infra/db/init/01_schema.sql` (también copiado en `openshift/base/postgres/01_schema.sql`).

### Tablas

#### `carga` (snapshots de corridas del ETL)
```sql
CREATE TABLE carga (
  id               bigserial PRIMARY KEY,
  codigo           text UNIQUE,              -- 's01', etc.
  etiqueta         text NOT NULL,            -- '28 oct 2026 12:34'
  tipo             text DEFAULT 'etl',
  ejecutada_en     timestamp DEFAULT now(),
  archivo_nombre   text,
  datos_hash       text NOT NULL UNIQUE,     -- SHA256
  fecha_referencia date,
  filas_info       int,
  filas_backlog    int,
  meta_proyectos   jsonb,
  meta_backlog     jsonb
);
```
- Cada INSERT representa una carga exitosa (datos distintos a la previa).
- Trigger `trg_carga_sin_cambios` rechaza INSERT si hash == último hash.
- Función `abrir_carga()` retorna NULL si no hay cambios (alternativa para ramificar sin error).

#### `proyecto` (estado actual de cada proyecto, upsert)
```sql
CREATE TABLE proyecto (
  id                   bigserial PRIMARY KEY,
  clave                text UNIQUE NOT NULL,   -- num_pa o nombre normalizado
  -- ... 25+ columnas con atributos, dinero, recálculos ...
  primera_carga_id     bigint REFERENCES carga(id),
  ultima_carga_id      bigint REFERENCES carga(id),
  actualizado_en       timestamp DEFAULT now()
);
```
- ON CONFLICT UPDATE en cada carga (upsert por `clave`).
- Las columnas de dinero (`valor_of`, `acumulado_a_hoy`, etc.) viven aquí **solo por referencia**.
- Las series temporales de dinero están en `revenue_mes` / `revenue_anual`.

#### `revenue_mes` (hechos mensuales por proyecto × mes × carga)
```sql
CREATE TABLE revenue_mes (
  id            bigserial PRIMARY KEY,
  carga_id      bigint REFERENCES carga(id),
  proyecto_id   bigint REFERENCES proyecto(id),
  mes           int NOT NULL,                -- 1-12
  commit        numeric,                     -- columna "fijo" del Excel
  upside        numeric,                     -- columna pegada a "fijo"
  ...
);
```
- Historico real: una fila por proyecto × mes × carga.
- INSERT a través de multi-VALUES en el nodo SQL de n8n.

#### `revenue_anual` (similar, anual)
#### `movimiento` (tabla derivada con umbrales de riesgo)

### Vistas

| Vista | Propósito |
|---|---|
| `v_carga_actual` | Últimas N cargas con metadatos |
| `v_proyecto_actual` | Estado actual de cada proyecto (last `ultima_carga_id`) |
| `v_revenue_quarter` | Agregación revenue por trimestre |

### Supuestos críticos

1. **`datos_hash` es UNIQUE global:** Cada carga tiene un hash único. La deduplicación sucede contra el hash, no contra todas las filas.
2. **Transacciones en n8n:** El nodo SQL completo (`BEGIN; ... COMMIT;`) corre como una sola transacción. Si algo falla, Postgres no comitea nada.
3. **Fecha de referencia (`fecha_referencia`):** Reemplaza el `TODAY()` del Excel. Viene del n8n, no se calcula en Postgres.
4. **Campos recalculados en n8n:** `clave`, `estado_contrato`, `dias_para_vencimiento` se calculan antes de INSERT. Postgres solo almacena.

### Procedimiento de carga

1. n8n extrae datos del Excel → calcula hash SHA256
2. Compara hash contra última `carga.datos_hash`
3. Si igual: SKIP (no hay cambios)
4. Si distinto:
   - Valida datos (≥10 proyectos, ≥95% cruce, etc.)
   - Recalcula columnas rotas
   - Arma SQL completo: `BEGIN; INSERT carga RETURNING id; INSERT proyecto ... ON CONFLICT; INSERT revenue_mes ...; INSERT revenue_anual ...; INSERT movimiento ...; COMMIT;`
   - Ejecuta en Postgres
5. Postgres aplica triggers (etiqueta por defecto, si es NULL)

---

## 8. Entorno de Ejecución

### Stack Local (Podman)

**Requisitos:**
- `podman` + `podman-compose` (o `docker` + `docker-compose`)
- bash (script `forecast.sh`)
- curl (verificación de healthchecks)

**Env vars necesarias** (en `infra/.env`):

```bash
POSTGRES_USER=forecast          # usuario Postgres
POSTGRES_PASSWORD=forecast      # contraseña Postgres
POSTGRES_DB=forecast            # nombre BD
POSTGRES_PORT=5432              # puerto local (loopback)
API_PORT=3000                   # puerto API dashboard
N8N_HOST=localhost
N8N_PORT=5678                   # puerto directo n8n
N8N_NGINX_PORT=8080             # puerto nginx (proxy a n8n)
GENERIC_TIMEZONE=America/Bogota
N8N_PUBLIC_URL=                 # vacío (nginx local) o https://dominio.ngrok-free.app/ (si ngrok)
NGROK_AUTHTOKEN=                # vacío (sin ngrok) o token de https://dashboard.ngrok.com
NGROK_DOMAIN=                   # vacío (URL aleatoria) o dominio fijo gratis
```

**Comandos:**

```bash
cd infra
./forecast.sh up        # Levanta postgres + api + n8n + nginx
./forecast.sh public    # Lo mismo + ngrok (requiere NGROK_AUTHTOKEN)
./forecast.sh rebuild   # Reconstruye imagen API (después de cambiar dashboard)
./forecast.sh down      # Apaga, conserva volúmenes (n8n_data + forecast_pgdata)
./forecast.sh destroy   # Apaga + borra volumen Postgres (⚠️ destructivo)
./forecast.sh logs      # Logs de API
./forecast.sh psql      # Consola SQL
```

**Puertos:**
- Dashboard: http://localhost:3000/
- n8n (directo): http://localhost:5678/
- n8n (nginx): http://localhost:8080/
- API Swagger: http://localhost:3000/api/docs/

**Volúmenes:**
- `n8n_data` → workflows + credenciales n8n (persiste entre arranques)
- `forecast_pgdata` → datos Postgres (persiste entre arranques)

**Primera vez / máquina nueva:**
1. Copiar `.env.example` → `.env`
2. Editar credenciales si es necesario
3. `./forecast.sh up`
4. Acceder a n8n: http://localhost:8080 → crear usuario admin → importar `n8n/n8n_nola_completo.json`
5. En n8n, crear credencial Postgres: host `postgres` (nombre del Service en compose), puerto `5432`, credenciales de `.env`

### Stack OpenShift

**Requisitos:**
- `oc` CLI (login a Demo Platform)
- GitHub Personal Access Token (scope "repo")
- Access a repo `joguzman-redhat/PR-PSA-forecast-dashboard` (rama `v2`)

**Kubeconfig:** Usuario logueado con `oc login` que tenga permisos para crear namespaces.

**Setup (first time):**

1. Crear secrets en namespace `forecast-app`:
   ```bash
   oc new-project forecast-app
   oc create secret generic postgres-credentials -n forecast-app \
     --from-literal=POSTGRESQL_USER=forecast \
     --from-literal=POSTGRESQL_PASSWORD=forecast \
     --from-literal=POSTGRESQL_DATABASE=forecast \
     --from-literal=PGUSER=forecast \
     --from-literal=PGPASSWORD=forecast \
     --from-literal=PGDATABASE=forecast
   
   oc create secret generic github-repo-credentials -n forecast-app \
     --type=kubernetes.io/basic-auth \
     --from-literal=username=<GitHub user> \
     --from-literal=password=<GitHub PAT>
   ```

2. Crear secret Argo CD en namespace `openshift-gitops`:
   ```bash
   oc create secret generic forecast-dashboard-repo -n openshift-gitops \
     --from-literal=type=git \
     --from-literal=url=https://github.com/joguzman-redhat/PR-PSA-forecast-dashboard.git \
     --from-literal=username=<GitHub user> \
     --from-literal=password=<GitHub PAT>
   
   oc label secret forecast-dashboard-repo -n openshift-gitops \
     argocd.argoproj.io/secret-type=repository
   ```

3. Agregar role al service account de Argo CD:
   ```bash
   oc adm policy add-role-to-user admin \
     system:serviceaccount:openshift-gitops:openshift-gitops-argocd-application-controller \
     -n forecast-app
   ```

4. Registrar Application en Argo CD:
   ```bash
   oc apply -f openshift/argocd/application.yaml
   ```

5. Monitorear sync:
   ```bash
   watch oc get application forecast-dashboard -n openshift-gitops
   watch oc get pods -n forecast-app
   ```

6. Patch n8n URL (después que pod esté Running):
   ```bash
   HOST=$(oc get route forecast-n8n -n forecast-app -o jsonpath='{.spec.host}')
   oc set env deployment/forecast-n8n -n forecast-app \
     N8N_EDITOR_BASE_URL="https://$HOST/" \
     WEBHOOK_URL="https://$HOST/"
   ```

7. En n8n UI: crear credencial Postgres (host `forecast-postgres`, puerto `5432`), importar workflow, recrear Drive OAuth + MaaS.

---

## 9. Último Estado Conocido

**Fecha:** 2026-10-28 16:30 UTC

### Tarea completada

Apagar stack local y levantar Red Hat Offline Knowledge Portal:

```bash
# Local
cd infra && ./forecast.sh down     # forecast-postgres + forecast-api apagados
# (n8n_data + forecast_pgdata conservados)

# Red Hat Offline Portal
podman run --rm -d --name rhokp -p 8080:8080 -p 8443:8443 \
  --env "ACCESS_KEY=$ACCESS_KEY" \
  registry.redhat.io/offline-knowledge-portal/rhokp-rhel9:latest
```

**Resultado:** Portal funcionando en http://localhost:8080/ y https://localhost:8443/ (self-signed).

### Estado Observado

| Componente | Status | Notas |
|---|---|---|
| `forecast-postgres` | 🟡 Apagado (volumen persiste) | Datos intactos en `forecast_pgdata` |
| `forecast-api` | 🟡 Apagado | Volumen `n8n_data` persiste |
| `forecast-n8n` | 🟡 Apagado | Workflows + credenciales en volumen |
| `forecast-nginx` | 🟡 Apagado | No necesario ahora |
| `rhokp` | 🟢 Running | Documentación offline Red Hat |
| **OpenShift (Demo Platform)** | 🟡 Stopped | Cluster se auto-destruirá en 48h desde 2026-10-20 (es decir, 2026-10-22 23:59) |
| **IT Ticket** | 🟡 Enviado | Solicitud cluster permanente VPN-backed (Red Hat Hub, 2026-10-21) |
| **PR #3** | 🟡 Waiting review | Rama `pr-3` con cambios de Héctor, aprobado, waiting merge |

### Git state

```
Current branch: pr-3
Tracking: origin/pr-3
Last commit: 53935f6 "Fix error and update dashboard to match business critiria."
```

Branch `v2` (OpenShift):
```
Last commit: c084a1f "Fijar la URL real de n8n en vez del placeholder PENDIENTE"
```

### Acciones pendientes del usuario

1. Esperar merge de PR #3 desde Héctor (rama `pr-3` → `v2`)
2. Decidir cuándo destruir OpenShift cluster (auto-destroy en 48h, o manual antes)
3. Respuesta del IT ticket sobre cluster permanente

---

## 10. Próximas Tareas

**Prioridad:** descendente.

### 1. Merge de PR #3 (user waiting for Héctor)

**Qué:** Rama `pr-3` → `v2`  
**Por qué:** Dashboard debe tener los fixes que Héctor hizo (error handling, gráficos corregidos)  
**Cómo:** Esperando que Héctor haga merge en GitHub  
**Criterio:** Rama `v2` contiene los cambios, dashboard se ve correcto localmente

### 2. Verificar MaaS en OpenShift (pending teammate's debug)

**Qué:** Teammate reportó "Error: Failed to receive response" en MaaS  
**Por qué:** Chat/agent no funciona en su entorno; localmente funciona  
**Cómo:** Waiting resultado de `curl` test que le pedimos corriera  
**Criterio:** Chat Trigger → agente → herramientas Postgres funciona sin error

### 3. Decidir destino del OpenShift cluster

**Opción A:** Destruir en 48h (auto-destroy 2026-10-22 23:59)  
- Coste acumulado: ~$8.50 (demo fue rápido)

**Opción B:** Parar manualmente (no genera costo adicional)

**Opción C:** Esperar respuesta IT ticket (cluster permanente VPN-backed)

**Decisión:** User decidirá más adelante.

### 4. Cuando ITTicket responda: evaluar cluster permanente

**Qué:** Red Hat IT puede provisionar cluster permanente con VPN estable  
**Cuándo:** Cuando responda el ticket (abierto 2026-10-21)  
**Próximo paso:** Redeploy el stack completo en cluster permanente (mismos manifests, secrets nuevos)

### 5. Autenticación en dashboard (phase 2)

**Scope out por ahora,** pero README.md lo menciona como TODO.

---

## 11. Precauciones

### 🚫 NO hagas esto

1. **No toques `/home/camontal/Project_Dashboard/`** (legacy, deprecated)
   - Directorio aparte del proyecto activo
   - Nunca merges, nunca cambios

2. **No re-agregues el nodo HTML de n8n al workflow**
   - Feedback explícito: "no necesitamos dashboard html"
   - El teammate consume Postgres directo

3. **No commits secrets a Git**
   - `.env` con credenciales → `.gitignore`
   - GitHub PAT, Google Drive OAuth, etc. → `oc create secret` en OpenShift
   - Plan de seguridad (sección 3.5 del OpenShift plan): no secrets en repo

4. **No reconstruyas `etl.py`**
   - Ya no existe en este repo (retirado deliberadamente)
   - Toda la lógica está en n8n

5. **No uses `postgres:16-alpine` en OpenShift**
   - Usa `quay.io/sclorg/postgresql-16-c9s` (diseñada para UID no-root)
   - postgres oficial intenta arrancar como root

6. **No uses `PGUSER`/`PGPASSWORD`/`PGDATABASE` en env Postgres**
   - Solo `POSTGRESQL_*` en Postgres, `PGUSER`/`PGPASSWORD` en API
   - Mezclarlas causa "role forecast does not exist"

7. **No intentes migrar credenciales Drive/MaaS con el export de n8n**
   - Viven encriptadas en volumen, no viajan
   - Recrear en n8n UI en cada nueva instancia

8. **No hardcodees credenciales en manifests OpenShift**
   - Secrets se crean aparte con `oc create secret`
   - GitOps solo sincroniza manifests no-sensibles

9. **No cambies la URL n8n en manifests sin commitear a Git**
   - Argo CD con `selfHeal=true` revierte cambios manual
   - Cambios viven en Git; patchear env via `oc set env` es temporal

10. **No borres `openshift/base/postgres/01_schema.sql`**
    - Es COPIA de `infra/db/init/01_schema.sql` (kustomize no permite referencias externas)
    - Si schema real cambia, copiar manualmente aquí también

### ⚙️ Operaciones que requieren confirmación previa

| Operación | Riesgo | Qué hacer |
|---|---|---|
| `./forecast.sh destroy` | Borra `forecast_pgdata` (todo historico Postgres) | **NO sin backup.** Si hay datos valiosos, antes: `pg_dump` |
| `oc delete application` | Argo CD pierde track, próximo sync crea duplicados | OK si sabes qué haces, seguir con `oc apply -f openshift/argocd/application.yaml` |
| Cambios a `01_schema.sql` | Triggers, vistas, funciones | Primero en maquina local con `./forecast.sh up`, probar, después copiar a `openshift/base/postgres/01_schema.sql` |
| Modificar n8n workflow JSON a mano | Credenciales encrypted, estructura frágil | Editar en UI n8n, después exportar JSON, NUNCA a mano |

---

## Resumen de verificación

Este documento fue generado leyendo:

✅ **Archivos del proyecto:**
- `CLAUDE.md`, `README.md`
- `infra/README.md`, `infra/docker-compose.yml`, `infra/.env.example`
- `openshift/README.md`, `openshift/argocd/application.yaml`
- `openshift/base/` (kustomization.yaml, postgres/*, api/*, n8n/*, jobs/*)
- `infra/db/init/01_schema.sql`
- `n8n/n8n_nola_completo.json` (estructura, nodos)

✅ **Git history:**
- Rama `v2`: últimos 20 commits
- Rama `pr-3`: estado actual

✅ **Conversación anterior (resumen):**
- 5 requisitos originales: completados
- OpenShift deployment: completado
- IT ticket: abierto
- PR #3: waiting merge
- Debugging: 12 errores resueltos, 1 pending
- Decisiones técnicas: documentadas con justificación

⚠️ **No verificado (externo al proyecto):**
- Estado actual del OpenShift cluster (puede haber sido destruido después de 2026-10-22 23:59)
- Respuesta del IT ticket
- Resultado de curl test del teammate para MaaS
- Merge status de PR #3 en GitHub (depende de Héctor)

---

**Archivo guardado:** `/home/camontal/Dashboard_final/PR-PSA-forecast-dashboard/HANDOFF_CODEX.md`

Otro agente puede leer este archivo y continuar sin necesidad de revisar la conversación completa.

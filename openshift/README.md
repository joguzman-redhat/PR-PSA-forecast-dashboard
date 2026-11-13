# Despliegue en OpenShift vía GitOps

Manifiestos para desplegar el stack (Postgres + API/Dashboard + n8n) en
OpenShift, sincronizados por Argo CD desde este repo (rama `v2`, carpeta
`openshift/base`).

**No corras nada de esto con `oc apply -f openshift/base` directo** — pasa
primero por los secrets manuales de abajo, o los pods de Postgres/API van a
quedar en `CrashLoopBackOff` por falta de credenciales.

## 1. Secrets (fuera de Git, a propósito — ver política de seguridad del plan)

Namespace de destino: `forecast-app` (Argo CD lo crea solo gracias a
`CreateNamespace=true`, pero los secrets no te los crea nadie).

```bash
oc new-project forecast-app   # si Argo CD aún no lo creó

# Mismas credenciales que tengas en infra/.env de esta máquina.
oc create secret generic postgres-credentials -n forecast-app \
  --from-literal=POSTGRESQL_USER=<valor de POSTGRES_USER> \
  --from-literal=POSTGRESQL_PASSWORD=<valor de POSTGRES_PASSWORD> \
  --from-literal=POSTGRESQL_DATABASE=<valor de POSTGRES_DB> \
  --from-literal=PGUSER=<mismo valor de POSTGRES_USER> \
  --from-literal=PGPASSWORD=<mismo valor de POSTGRES_PASSWORD> \
  --from-literal=PGDATABASE=<mismo valor de POSTGRES_DB>

# Token de GitHub (Personal Access Token, scope "repo") para que el BuildConfig
# pueda clonar el repo privado.
oc create secret generic github-repo-credentials -n forecast-app \
  --type=kubernetes.io/basic-auth \
  --from-literal=username=<tu usuario de GitHub> \
  --from-literal=password=<tu Personal Access Token>
```

Argo CD también necesita su propio acceso al repo privado (es un secret
aparte, en el namespace `openshift-gitops`, con un label específico):

```bash
oc create secret generic forecast-dashboard-repo -n openshift-gitops \
  --from-literal=type=git \
  --from-literal=url=https://github.com/joguzman-redhat/PR-PSA-forecast-dashboard.git \
  --from-literal=username=<tu usuario de GitHub> \
  --from-literal=password=<tu Personal Access Token>

oc label secret forecast-dashboard-repo -n openshift-gitops \
  argocd.argoproj.io/secret-type=repository
```

## 2. Registrar la Application en Argo CD

```bash
oc apply -f openshift/argocd/application.yaml
```

Verifica el sync:

```bash
oc get application forecast-dashboard -n openshift-gitops
oc get pods -n forecast-app
```

## 3. Primer build de la imagen del API

El `BuildConfig` dispara solo al crearse (trigger `ConfigChange`), pero si
quieres forzarlo manualmente o reconstruir después de un cambio:

```bash
oc start-build forecast-api -n forecast-app --follow
```

## 4. Parchear la URL de n8n (paso manual, una vez por despliegue nuevo)

El host de la Route de n8n no se conoce hasta que OpenShift la crea —mismo
problema que la URL dinámica de ngrok en Podman. Después de que el pod de
n8n esté `Running`:

```bash
HOST=$(oc get route forecast-n8n -n forecast-app -o jsonpath='{.spec.host}')
oc set env deployment/forecast-n8n -n forecast-app \
  N8N_EDITOR_BASE_URL="https://$HOST/" \
  WEBHOOK_URL="https://$HOST/"
```

Esto reinicia el pod de n8n automáticamente (son env vars nuevas).

## 5. Configuración dentro de n8n (manual, vía UI — no está en Git)

Igual que en Podman: la primera vez que abras la Route de n8n te va a pedir
crear la cuenta owner. Después, a mano:

- Importar `n8n/n8n_nola_completo.json` (**revisa primero cuál versión es la
  correcta — ver `HANDOFF.md` en el root del repo, sección de archivos
  duplicados**).
- Crear la credencial de Postgres: host `forecast-postgres` (nombre del
  Service, no `localhost` ni `postgres` — en Kubernetes el DNS interno usa el
  nombre del Service), puerto `5432`, mismas credenciales del secret
  `postgres-credentials`.
- Recrear la credencial de Google Drive (OAuth) y la del modelo MaaS — viven
  encriptadas en el volumen de n8n, no se migran solas desde Podman.

## 6. Verificar

```bash
oc get route forecast-dashboard -n forecast-app -o jsonpath='{.spec.host}'
```

Abre esa URL — debe verse el dashboard con datos reales. Si da 502 o
pantalla en blanco, revisa `oc logs deployment/forecast-api -n forecast-app`.

## Decisiones tomadas (y por qué)

- **Postgres usa `quay.io/sclorg/postgresql-16-c9s`, no `postgres:16-alpine`**
  (la imagen de Podman) — la oficial de Docker Hub corre como root al
  arrancar y choca con la política de seguridad por defecto de OpenShift
  (SCC `restricted-v2`, UID aleatorio no-root). La de sclorg está diseñada
  para esto.
- **nginx no se incluye** — en Podman existía como puerta de entrada estable
  delante de n8n; en OpenShift ese rol lo cumple nativamente la `Route`.
- **El schema SQL se aplica con un Job** (`jobs/schema-init-job.yaml`), no
  automáticamente dentro del contenedor de Postgres — así no se arriesga a
  reventar una base ya cargada en cada sync de Argo CD. Si hace falta
  reaplicarlo: `oc delete job forecast-postgres-init-schema -n forecast-app`
  y Argo CD lo vuelve a crear en el próximo sync.
- **`Dockerfile` vive en la raiz y usa ese contexto** (antes `infra/api/`)
  para poder empaquetar el dashboard estático dentro de la imagen —
  OpenShift no soporta el bind-mount que usaba Podman Compose para montar
  `index.html`/`app.js`/etc. en caliente. Efecto secundario: en Podman local,
  un cambio a esos archivos ya **no se refleja al instante** — hay que
  reconstruir la imagen (`./forecast.sh rebuild`).

## Pendiente / no probado todavía

- No se ha corrido `oc apply` de nada de esto — son manifiestos preparados,
  no un despliegue confirmado.
- No se validó que la imagen `quay.io/sclorg/postgresql-16-c9s` lea
  correctamente el schema de `01_schema.sql` tal cual está escrito (usa
  `timestamptz`/triggers de PL/pgSQL estándar, debería ser compatible, pero
  no se ejecutó en esta imagen específica).
- Separación por entornos (dev/stage) no implementada — solo hay `base/`,
  pensado para un único ambiente de evaluación.

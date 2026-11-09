# Prueba de Cloud Forecast en SPAship

La prueba usa **Containerized Deployment (From Git Repo)** para servir la API
y el dashboard juntos, con el mismo origen. El modo demo es opcional y utiliza
solamente datos ficticios en memoria; permite probar la interfaz sin Postgres
remoto. Se identifica en pantalla y en la impresion como **DEMO**.

El modo demo no ejecuta el ETL ni el agente de n8n. El despliegue completo con
datos reales requiere PostgreSQL accesible desde el cluster, su esquema e
historico, credenciales, control de acceso y n8n con su almacenamiento.

## Construir y probar el contenedor

El contexto de build debe ser la **raiz del repo**:

```bash
podman build -f infra/api/Dockerfile -t localhost/cloud-forecast:preview .
podman run --rm -p 127.0.0.1:3000:3000 \
  -e FORECAST_DEMO=true -e APP_BASE_PATH=/cloud-forecast \
  localhost/cloud-forecast:preview
```

Abre `http://localhost:3000/cloud-forecast/`. La imagen contiene solamente los
assets publicos en `/app/public`. Si se ejecuta Node directamente, PUBLIC_DIR
debe apuntar a una carpeta dedicada con esos assets, nunca a la raiz del repo.

La `.dockerignore` de la raiz limita el contexto a los fuentes y assets que
necesita la imagen. El build instala las versiones del `package-lock.json`.

Pruebas de rutas y modo demo, con Node.js 20 o superior:

```bash
npm ci --prefix infra/api --ignore-scripts
npm test --prefix infra/api
```

## Campos del formulario de SPAship

Usar una propiedad y un ambiente de prueba autorizados. La propiedad
`one-platform` que se reviso es compartida y contiene otras aplicaciones.
El build desde Git utiliza los archivos de la rama remota seleccionada: los
cambios locales deben publicarse en esa rama antes de iniciar el despliegue.

| Paso / campo | Valor para esta prueba |
|---|---|
| Tipo | Containerized Deployment / From Git Repo |
| Repository URL | `https://github.com/joguzman-redhat/PR-PSA-forecast-dashboard.git` |
| Context Directory | `/` |
| Git Branch | La rama remota que contiene estos cambios |
| Dockerfile name | `infra/api/Dockerfile` |
| Application Name | `cloud-forecast` (confirmar que este disponible) |
| Environment | `dev`, sujeto al acceso asignado a la propiedad |
| Path | `/cloud-forecast` |
| Health Check Path | `/health/live` |
| Reference | Una etiqueta de prueba, por ejemplo `preview-1` |
| Port | `3000` |
| Configuration | `FORECAST_DEMO=true`, `APP_BASE_PATH=/cloud-forecast` |
| Secret | No necesita credenciales de Postgres en modo demo |
| Build Arguments | Vacio |
| CPU Required / Limit | `200m` / `300m` (valores iniciales del formulario) |
| Memory Required / Limit | `256Mi` / `512Mi` (valores iniciales del formulario) |
| Replicas | `1` |

Si el repo es privado, el servicio de build debe tener acceso al repositorio;
esa autorizacion se configura con el equipo de la plataforma. No colocar
tokens en Repository URL ni en Build Arguments.

Revisar los valores y la autorizacion de la propiedad antes de confirmar la
creacion. Registrar la URL que entregue SPAship y comprobar:

- Banner **DEMO**, estilos, fuentes y las cuatro pestanas del dashboard.
- `/cloud-forecast/api/proyectos`, `/api/backlog` y `/api/historia`, todos bajo
  el mismo prefijo y con `meta.origen` igual a `demo`.
- `/cloud-forecast/health/live` y `/cloud-forecast/api/docs/`.

## Configuracion del path

`APP_BASE_PATH` acepta rutas como `/cloud-forecast`. El servidor sirve bajo el
prefijo y tambien acepta solicitudes a la raiz para proxies que lo eliminan.
El HTML incluye la ruta base para resolver assets y API en ambos casos.
Sin esta variable, el despliegue local por defecto sigue sirviendo en `/`.

## Conectar los datos reales

Con `FORECAST_DEMO` sin definir (o con valor `false`) se utilizan las rutas
actuales de Postgres. Configurar `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` y
`PGDATABASE` mediante los mecanismos de configuracion y secretos del entorno.
La base del computador local no es accesible automaticamente desde el cluster.

`/health/live` comprueba que el proceso responde. `/health` comprueba tambien
la base y el esquema. Antes del uso con datos reales deben estar resueltos el
control de acceso, la conectividad, el respaldo y la recuperacion.

# Prueba manual de CI

Esta prueba clona `main` y ejecuta las pruebas y el lint disponibles en esa rama.
No despliega la aplicación, no construye/publica imágenes, no accede a Postgres
y no crea almacenamiento persistente. Se ejecuta en `--pipeline`, el namespace
de tipo build; la aplicación seguirá teniendo como destino `--runtime-int`.

```bash
oc apply -f openshift/ci/prueba-manual.yaml
oc create -f openshift/ci/prueba-manual-run.yaml
oc get pipelineruns -n nola-consulting-services-tenant--pipeline
```

El ServiceAccount no tiene RoleBinding adicional y el pod no monta un token de API.
La imagen de herramientas UBI Node 22 usa un tag mutable únicamente para esta
prueba de conectividad/CI; no es una imagen de producción ni de la aplicación.
Una entrega reproducible deberá fijar su digest y registrar el commit descargado.

## Primera ejecución

`forecast-ci-prueba-mfjnj` arrancó un pod con Node 22.23.4, npm 10.9.9 y Git
2.52.0. GitHub resolvió por DNS; HTTPS hacia GitHub terminó por timeout.
El clonado no completó, por lo que no se ejecutaron pruebas dentro del clúster.
La ejecución terminó en `Failed` con el error de conexión a GitHub. El intento
posterior de cancelación fue rechazado porque ya había finalizado; los logs
permanecen disponibles.

La política `TenantEgress/default` en el namespace build contenía una denegación
final y no permitía GitHub/npm. La guía corporativa define `TenantEgress` en cada
namespace de trabajo, no en el namespace `--config`.

## Cambio de egress aprobado y aplicado

`habilitar-egress.sh` preserva las reglas existentes y agrega TCP/443
a `github.com` y `registry.npmjs.org` antes de la denegación final. Comprueba el
servidor y usa resourceVersion para no pisar cambios concurrentes. Por defecto
solo valida mediante admisión con dry-run.

```bash
bash openshift/ci/habilitar-egress.sh --dry-run
```

La validación server-side fue aceptada. La primera aplicación fue rechazada por
revisión automática; el usuario aprobó después explícitamente el cambio y se
aplicó correctamente. Se verificaron ambas reglas TCP/443, las reglas anteriores,
la denegación final y `egressReady: true`. El permiso afecta a todos los pods del
namespace de build, no solo a esta ejecución; no publica servicios de entrada.

Se inició otra ejecución: `forecast-ci-prueba-rbknc`. Si aparecen redirects o endpoints adicionales, investigarlos
antes de ampliar la lista. No usar una regla de salida general a Internet.

La segunda ejecución pudo clonar `main`, commit
`ccbdcaf67fd6f4636b81feac59914cb6d58a319a`, y falló en `npm ci` porque no había
lockfile válido. La revisión de ese commit confirma que su package.json tampoco
define `test` ni `lint:front`. La rama de trabajo actual sí versiona lockfile,
pruebas y lint. Es necesario integrar esos cambios en main antes de exigir un
resultado verde; no sustituir `npm ci` por una instalación no reproducible ni
omitir las pruebas para ocultar la diferencia entre ramas.

La definición actual incluye diagnóstico explícito de esos prerrequisitos y
`npm ping` para comprobar npm independientemente de la preparación de main.
La ejecución `forecast-ci-prueba-447gk` confirmó `npm ping` con `PONG 177ms` y
clonó el mismo commit de main. Se detuvo con el diagnóstico explícito de lockfile
faltante. Queda comprobada la salida a ambos destinos; los tests de aplicación
en el clúster siguen pendientes de integrar el código preparado en main.

## Ejecución exitosa verificada

El usuario integró los cambios y ejecutó `forecast-ci-prueba-a89q2z`, que terminó
en `Succeeded` el 27 de noviembre de 2026 a las 21:11 (Bogotá). El resultado
registró el commit `815d9f0d4f979e65bf3cf1b06fe67629708ab975`.
Los logs confirman 122 pruebas aprobadas, ninguna fallida, y lint del front
completado. Queda validado el CI manual desde GitHub en el clúster.
La construcción/publicación de imagen y el despliegue mediante Argo CD siguen
pendientes; esta prueba no modificó Postgres ni desplegó la aplicación.

## Argo CD para entrega

El usuario indicó usar el Argo corporativo para CD. Puede sincronizar Git desde
dentro del clúster; el webhook externo no es requisito para esta sincronización.
La activación automática de CI y la referencia de imagen aprobada que consume
Argo son partes separadas que todavía deben definirse.

La API Argo está instalada y el usuario puede crear Application en `--config`,
pero eso no prueba que el controlador observe ese namespace. La lectura del
ArgoCD y los AppProject centrales en `openshift-gitops` fue denegada; no hay
Application ni NamespaceManagement del tenant en los namespaces consultados.
Hace falta identificar instancia, namespace de registro y AppProject permitidos.
No se instalará otro controlador ni se ampliarán sus permisos por suposición.

El manifiesto antiguo de Application sigue apuntando a `v2`, `forecast-app` y
a una base con BuildConfig y Route n8n. No aplicarlo al tenant actual. Preparar
la configuración nueva cuando los recursos y permisos de sincronización estén
identificados, sin prune de datos ni sincronización de manifiestos obsoletos.

Referencias:

- [Tenant onboarding: egress e ingress](https://source.redhat.com/departments/strategy_and_operations/it/datacenter_infrastructure/itcloudservices/itocp/itocp_wiki/tenant_onboarding_and_administration~23).
- [Sincronización automática de Argo CD](https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/).
- [Applications en otros namespaces](https://argo-cd.readthedocs.io/en/stable/operator-manual/app-any-namespace/).

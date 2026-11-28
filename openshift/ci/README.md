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

La política `TenantEgress/default` en el namespace build contiene una denegación
final y no permite GitHub/npm. La guía corporativa define `TenantEgress` en cada
namespace de trabajo, no en el namespace `--config`.

## Cambio de egress preparado, pendiente de aprobación

`habilitar-egress.sh` preserva las reglas existentes y propone agregar TCP/443
a `github.com` y `registry.npmjs.org` antes de la denegación final. Comprueba el
servidor y usa resourceVersion para no pisar cambios concurrentes. Por defecto
solo valida mediante admisión con dry-run.

```bash
bash openshift/ci/habilitar-egress.sh --dry-run
```

La validación server-side fue aceptada. **La aplicación efectiva fue rechazada
por revisión automática y no se ejecutó:** ampliar persistentemente egress de
todo el namespace requiere aprobación explícita del usuario. No ejecutar la
opción `--apply` hasta recibirla. El permiso afectaría a todos los pods del
namespace de build, no solo a esta ejecución; no publica servicios de entrada.

Tras la aprobación y aplicación, comprobar reconciliación/conectividad y crear
otro PipelineRun. Si aparecen redirects o endpoints adicionales, investigarlos
antes de ampliar la lista. No usar una regla de salida general a Internet.

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

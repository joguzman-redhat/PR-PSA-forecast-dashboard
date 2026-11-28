# Despliegue oficial en OpenShift

El dashboard interno está desplegado en
[Cloud Forecast NOLA](https://forecast-nola.apps.int.prod-scale-spoke1-dc-rdu3.itup.redhat.com).
Se accede desde la red corporativa/VPN. La Route usa el shard interno y termina
TLS; el dashboard sirve consultas de lectura sin autenticación de aplicación,
según el alcance inicial acordado. Tener el enlace no constituye control de
acceso individual. El modelo de access control queda para otro release.

## Destino y componentes

Clúster: `prod-scale-spoke1-dc-rdu3`. AppCode: `NLFC-001`.

| Namespace | Uso |
| --- | --- |
| `nola-consulting-services-tenant--runtime-int` | API/dashboard, Postgres, n8n y backups |
| `nola-consulting-services-tenant--pipeline` | OpenShift Pipelines: pruebas y construcción |
| `nola-consulting-services-tenant--config` | Configuración del tenant |
| `openshift-gitops` | Argo CD central existente; requiere permisos de su administrador |

La fuente vigente del runtime es [`runtime/`](runtime/), con Kustomize.
`base/` y la antigua Application son referencias legacy; no representan este
despliegue. API y archivos estáticos comparten una imagen. Postgres y n8n tienen
Services internos y PVC independientes; no tienen Route pública. n8n se
administra por [port-forward temporal](operations/README.md#n8n-interno).

Las referencias inmutables están en
[`runtime/kustomization.yaml`](runtime/kustomization.yaml):

- API: `images.paas.redhat.com/nola-consulting-services-tenant/forecast-api`.
- n8n 2.48.8: copia en `images.paas.redhat.com/nola-consulting-services-tenant/forecast-n8n`.
- Postgres 16: `registry.redhat.io/rhel9/postgresql-16`, por digest.

Los PVC usan `rh-restricted-iscsi` y etiquetas del AppCode. `Retain` conserva
volúmenes ante ciertas eliminaciones; no sustituye un backup. El histórico
financiero ya fue importado y comparado con la fuente en siete tablas. La
adopción explícita del baseline y las migraciones están documentadas en
[`runtime/README.md`](runtime/README.md); un rollout no debe volver a importar
el histórico ni ejecutar SQL manualmente dentro del pod.

## Secretos existentes

Las credenciales están fuera de Git y no se obtienen de `infra/.env`.
En runtime existen `forecast-postgres-admin` (administración),
`forecast-api-reader` (solo lectura), `forecast-etl-writer` (escritura del ETL),
`forecast-n8n-secrets` (clave de cifrado) y `forecast-registry-pull` (descarga de
imágenes). El OBC `forecast-backups` proporciona su ConfigMap y Secret S3.
La construcción utiliza `images-paas-push-config` en el namespace pipeline.
No copiar valores a manifiestos, historial de shell, issues ni logs.

La API usa el rol lector y `FORECAST_READ_ONLY=true`. El ETL permanece en n8n:
el usuario configurará después la cuenta, el workflow exportado y sus
credenciales. La instalación actual de n8n es nueva y persistente; no se ha
migrado el estado de la instancia local.

## CI y entrega: estado actual

La Pipeline manual de pruebas pudo clonar GitHub y completó pruebas/lint.
La Pipeline `forecast-build-push` construye un commit exacto, prueba antes de
publicar y devuelve un digest; `forecast-build-push-9kk6r` completó ese ciclo y
su imagen ya se desplegó después del Job de migraciones. Consultar [`ci/build-push.md`](ci/build-push.md) para ejecutar y
promover una imagen. Las salidas específicas aprobadas para GitHub, npm y
`registry.access.redhat.com`, `access.redhat.com` y `cdn01.quay.io` en TCP/443
permiten esas operaciones; no equivalen a
salida general a Internet.

**Todavía no hay webhook ni promoción automática de extremo a extremo.**
Los cambios de `codex/openshift-integracion` deben integrarse en `main` antes
de que Argo pueda consumir esta configuración como fuente oficial.

La configuración preparada reutiliza Argo CD central; no crea otra instancia:

- [`argocd/forecast-project.yaml`](argocd/forecast-project.yaml): proyecto limitado al repo y runtime.
- [`argocd/forecast-application.yaml`](argocd/forecast-application.yaml): rama `main`, ruta `openshift/runtime`.

El usuario o administrador de Argo debe registrar el repositorio privado y
aplicar esos dos recursos en la instancia central: el intento de alta del repo
con la cuenta actual fue denegado por permisos. No guardar su token en Git.
La Application preparada habilita self-heal, conserva prune desactivado e
ignora únicamente las réplicas de `forecast-n8n` para permitir su backup.
Confirmar esa excepción antes de habilitar el consentimiento correspondiente
en el CronJob. Ver [coordinación con Argo](operations/s3-backup.md#coordinación-con-argo).

## Operación y comprobación

```bash
oc get deployments,pods,pvc,route -n nola-consulting-services-tenant--runtime-int
oc rollout status deployment/forecast-api -n nola-consulting-services-tenant--runtime-int --timeout=180s
oc get pipelineruns -n nola-consulting-services-tenant--pipeline
oc get cronjobs,jobs -n nola-consulting-services-tenant--runtime-int
```

Comprobar el dashboard, `/health/live` y `/health` en la URL interna después de
cada entrega. Una prueba del pipeline no demuestra que el rollout o una
migración hayan terminado correctamente.

Los backups financieros y de n8n/clave están programados cada doce horas hacia
el bucket corporativo privado, con TLS y SSE-S3. n8n se pausa para copiar SQLite
con coherencia y luego se restaura su réplica. Ambos primeros respaldos terminaron con PUT/HEAD y checksum confirmados;
ambos se descargaron y verificaron sin modificar el estado oficial. Crear un
CronJob por sí solo no acredita recuperación integral. Consultar
[`operations/README.md`](operations/README.md) y
[`operations/s3-backup.md`](operations/s3-backup.md).

Los objetivos son RPO de 24 horas y RTO de cuatro horas en horario laboral.
No se ha ensayado una restauración en otra base, conforme a la decisión del
usuario. Las políticas de red del tenant son aditivas; revisar su efecto real
antes de afirmar aislamiento entre pods. Las restricciones gestionadas por
la plataforma no se reemplazan desde estos manifiestos.

El OBC existente está versionado en
[`operations/s3-bucket/`](operations/s3-bucket/). Sus protecciones
`Prune=false` y `Delete=false` impiden su eliminación automática desde Argo;
no protegen frente a un borrado manual. **No borrar el ObjectBucketClaim**:
la política de reclaim de la plataforma puede eliminar también el bucket y
sus backups. Estas anotaciones no cambian esa política real.

La evidencia y los límites de la validación están en [Estado del despliegue](ESTADO-DESPLIEGUE.md).

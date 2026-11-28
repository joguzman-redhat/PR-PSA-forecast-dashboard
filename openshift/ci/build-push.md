# Construcción de imagen en el registro del tenant

El repositorio destino es
`images.paas.redhat.com/nola-consulting-services-tenant/forecast-api`.
La consulta autenticada de scopes del robot existente confirmó `push` y `pull`
para ese repositorio. No se imprimieron ni guardaron valores de credenciales en
Git. El Secret existente `images-paas-push-config` se monta solo en el paso
que construye/publica la imagen, no en el paso que ejecuta las pruebas.

## Una revisión, una imagen

`forecast-build-push` acepta un SHA completo, obtiene exactamente ese commit,
verifica su SHA y ejecuta pruebas y lint. Solo después obtiene
el mismo SHA en un segundo pod, verifica de nuevo el commit y construye/publica.
No comparte volúmenes persistentes entre tareas. Usa un tag con SHA y devuelve como resultados el commit, digest y
referencia inmutable `repositorio@sha256:…`. No despliega nada ni accede a
Postgres. El trigger automático futuro debe resolver el commit de main y aplicar
la validación de origen/evento antes de iniciar esta PipelineRun; esta interfaz
manual permite construir un commit revisado de la rama de integración inicial.

```bash
oc apply -f openshift/ci/build-push.yaml
# Cambiar revision en una copia del run al commit revisado que ya exista en GitHub.
oc create -f openshift/ci/build-push-run.yaml
oc get pipelineruns -n nola-consulting-services-tenant--pipeline
```

La revisión fija de ejemplo corresponde al commit que completó 123 tests y
publicación de imagen desde la rama de integración; debe reemplazarse para incluir cualquier cambio nuevo de runtime
o de migraciones. No construir una imagen nueva antes de publicar en GitHub el
commit que contiene dichos cambios.

## Seguridad de la construcción

Las pruebas corren en una tarea separada con el ServiceAccount
`forecast-ci-prueba`, sin Secret del registro y con `RuntimeDefault`, sin
escalación de privilegios y eliminando capabilities. Para la publicación se
reutiliza el ServiceAccount `pipeline`, al que la plataforma ya asignó
`pipelines-scc-clusterrole`. No se crean SCC, ClusterRole ni RoleBinding nuevos;
no se monta un token de API en el pod. El builder usa el digest de imagen y
`SETFCAP` de la Task `buildah` instalada en `openshift-pipelines` al inspeccionarla.
El contenedor de build corre como root dentro del contenedor, con
`privileged: false`, `vfs` y aislamiento chroot; los contenedores de aplicación
se configuran aparte y no heredan esos permisos. No presentar esta variante
como rootless. La admisión y construcción se validaron en el clúster; un fallo futuro no
autoriza habilitar un contenedor privilegiado ni modificar la SCC automáticamente.

La primera ejecución fue rechazada porque el perfil seccomp explícito del paso
de pruebas no es admitido por la SCC legacy del builder. La separación mantiene
ese perfil en el pod de pruebas. El pod de publicación sigue el patrón de la Task
`buildah` instalada y no solicita un perfil seccomp que esa SCC rechaza. Su paso
de descarga corre como usuario no root, sin escalación ni capabilities; solo el
paso Buildah utiliza root/SETFCAP. Esta compatibilidad no acredita seccomp en el
pod del builder y no altera la SCC existente.

El contexto Docker utiliza la lista blanca existente y no incluye secretos,
volúmenes, dumps, datos financieros ni dependencias generadas. La autenticación
se adapta de dockercfg a auth.json en un directorio fuera del contexto, con
permisos privados; el archivo se elimina al terminar el paso. TLS permanece
habilitado en pull y push. El builder carga `redhat-ca-bundle` (clave
`ca-bundle.crt`, verificada por metadatos) en su trust store corporativo mediante
`update-ca-trust`; no desactiva la validación de certificados. No activar logs
de depuración de credenciales.

El Dockerfile de aplicación debe usar una base admitida. Si Buildah necesita
acceso a `registry.access.redhat.com`, comprobar y aprobar el egress específico;
el hecho de que kubelet pueda descargar el builder no acredita que el pod pueda
descargar una base. El registro corporativo ya tiene sus rangos S3 en la lista
de salida inicial del tenant; si falla una redirección nueva, investigarla antes
de ampliar permisos.

## Entrega a Argo CD

Tras una PipelineRun exitosa:

```bash
bash openshift/ci/build-image-patch.sh forecast-build-push-<sufijo> > /ruta/privada/kustomization.yaml
```

Este comando requiere Python 3 con PyYAML, comprueba éxito, SHA y repositorio/digest,
y **solo imprime** una Kustomization actualizada. Sustituye la entrada compartida
`images` de la API, conservando las imágenes de Postgres y n8n. Así Deployment y
Job de migraciones consumen el mismo digest. Falla si falta esa entrada o su forma
es desconocida. No parchea la aplicación ni modifica Git.

Revisar el resultado y copiarlo a `openshift/runtime/kustomization.yaml`; ejecutar
`oc kustomize openshift/runtime` y comprobar el mismo digest en `forecast-api` y
`forecast-schema` antes de integrar el cambio en Git y sincronizar con Argo.
No redirigir el helper directamente sobre su archivo de entrada. El comentario
incluye el commit probado para conservar esa evidencia en la revisión. No generar
PAT ni crear pushes automáticos hasta disponer del mecanismo corporativo con
alcance mínimo. Argo debe consumir el digest aprobado, no un tag mutable.

## Evidencia real y límites

- `forecast-build-push-9kk6r` terminó `Succeeded`: 123 tests, lint, build y push
  del commit `a1a87c7a444590338e821aa6cdb9036e5f9a8968`.
- Se promovió su digest compartido a API y migraciones; el Job completó antes
  del rollout y la comprobación HTTP/conciliación pasó después.
- Salidas TCP/443 aprobadas específicamente para firmas y capas:
  `registry.access.redhat.com`, `access.redhat.com`, `cdn01.quay.io`, además de GitHub/npm.
- No configura webhook, push automático del digest a Git ni Argo central.
  Ver [evidencia completa](../ESTADO-DESPLIEGUE.md).

Referencias primarias:

- Task `buildah` instalada en `openshift-pipelines`, consultada por API.
- [Contexto de seguridad de OpenShift Pipelines](https://docs.redhat.com/en/documentation/red_hat_openshift_pipelines/1.21/html/securing_openshift_pipelines/configuring-security-context-for-pods).
- [Alternativas Buildah como usuario no root](https://docs.redhat.com/en/documentation/red_hat_openshift_pipelines/1.22/html/securing_openshift_pipelines/unprivileged-building-of-container-images-using-buildah).

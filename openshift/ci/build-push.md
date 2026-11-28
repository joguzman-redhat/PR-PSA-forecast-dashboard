# Construcción de imagen en el registro del tenant

El repositorio destino es
`images.paas.redhat.com/nola-consulting-services-tenant/forecast-api`.
La consulta autenticada de scopes del robot existente confirmó `push` y `pull`
para ese repositorio. No se imprimieron ni guardaron valores de credenciales en
Git. El Secret existente `images-paas-push-config` se monta solo en el paso
que construye/publica la imagen, no en el paso que ejecuta las pruebas.

## Una revisión, una imagen

`forecast-build-push` acepta un SHA completo, obtiene exactamente ese commit,
verifica su SHA y ejecuta pruebas y lint. Solo después construye y publica la
misma carpeta. Usa un tag con SHA y devuelve como resultados el commit, digest y
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

La revisión fija de ejemplo corresponde al main que completó 122 tests en la
prueba manual; debe reemplazarse para incluir cualquier cambio nuevo de runtime
o de migraciones. No construir una imagen nueva antes de publicar en GitHub el
commit que contiene dichos cambios.

## Seguridad de la construcción

Se reutiliza el ServiceAccount `pipeline`, al que la plataforma ya asignó
`pipelines-scc-clusterrole`. No se crean SCC, ClusterRole ni RoleBinding nuevos;
no se monta un token de API en el pod. El builder usa el digest de imagen y
`SETFCAP` de la Task `buildah` instalada en `openshift-pipelines` al inspeccionarla.
El contenedor de build corre como root dentro del contenedor, con
`privileged: false`, `vfs` y aislamiento chroot; los contenedores de aplicación
se configuran aparte y no heredan esos permisos. No presentar esta variante
como rootless. La admisión y construcción reales aún deben validarse en el
clúster: un fallo no autoriza habilitar un contenedor privilegiado ni modificar
la SCC automáticamente.

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
bash openshift/ci/build-image-patch.sh forecast-build-push-<sufijo> > /ruta/privada/imagen-api.patch.json
```

Este comando comprueba éxito, SHA y repositorio/digest y **solo imprime** un
parche de Deployment. No parchea la aplicación ni modifica Git. Integrar ese
parche en los manifiestos GitOps revisados y sincronizar mediante el Argo
corporativo, o usarlo durante el bootstrap manual explícito antes de activar
GitOps. No generar PAT ni crear pushes automáticos hasta disponer del mecanismo
corporativo con alcance mínimo. Una imagen debe quedar rastreable al commit
probado; Argo debe consumir el digest de esa entrega, no un tag `latest` mutable.

## Evidencia pendiente

- La autorización de `push/pull` fue comprobada por lectura de scopes, sin subir
  capas ni modificar el repositorio remoto desde esta implementación.
- La sintaxis YAML/Bash fue validada; la primera ejecución real corresponde al
  operador principal, que controla las mutaciones del clúster.
- No se han afirmado construcción, push, rollout ni pruebas de restauración
  completados por guardar estos manifiestos.

Referencias primarias:

- Task `buildah` instalada en `openshift-pipelines`, consultada por API.
- [Contexto de seguridad de OpenShift Pipelines](https://docs.redhat.com/en/documentation/red_hat_openshift_pipelines/1.21/html/securing_openshift_pipelines/configuring-security-context-for-pods).
- [Alternativas Buildah como usuario no root](https://docs.redhat.com/en/documentation/red_hat_openshift_pipelines/1.22/html/securing_openshift_pipelines/unprivileged-building-of-container-images-using-buildah).

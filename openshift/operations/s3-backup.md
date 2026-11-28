# Backups programados al bucket corporativo

El bucket privado `forecast-backups` fue aprovisionado mediante ObjectBucketClaim
y está separado del volumen de Postgres. El CronJob usa su ConfigMap y Secret
del mismo nombre; las credenciales no forman parte de Git ni de los argumentos
del proceso curl.

```bash
oc apply -k openshift/operations/s3-backup
oc create job --from=cronjob/forecast-postgres-backup forecast-postgres-backup-inicial -n nola-consulting-services-tenant--runtime-int
oc logs -f job/forecast-postgres-backup-inicial -n nola-consulting-services-tenant--runtime-int
```

El cron financiero se ejecuta a las 00:00 y 12:00 de Bogotá, sin solapar ejecuciones. La
primera prueba manual es necesaria: aceptar el YAML o ver el CronJob no acredita
que haya un respaldo en S3. El Job no despliega la aplicación ni ejecuta el ETL.

Cada ejecución produce un `pg_dump` custom consistente, sin propietarios ni ACL.
Comprueba que su índice se puede leer y lo sube por HTTPS mediante SigV4. La
solicitud incluye el SHA-256 del contenido y cifrado SSE-S3 (`AES256`). Después,
HEAD debe confirmar tamaño, metadato SHA-256 y cifrado. Solo entonces se sube el
checksum acompañante y se registra el éxito. Los logs contienen identificador
del objeto, tamaño y digest; no incluyen filas financieras ni credenciales.

Las claves tienen formato `financial/<UTC>-<pod>.dump` y su `.sha256`. No se usa
un nombre fijo que sustituya al último backup. No hay operaciones DELETE ni
pruning: se conservan todos los objetos hasta que el responsable configure y
apruebe una política de ciclo de vida/retención en el bucket. Los límites de
historial del CronJob eliminan historial de Jobs, no objetos respaldados.

El dump existe temporalmente en un volumen efímero del pod con permisos privados.
Se borra al terminar el script y el volumen desaparece con el pod. Los archivos
viajan con TLS validado y quedan cifrados del lado de S3. No se usa `--insecure`,
una ACL pública, un token de API Kubernetes ni acceso al volumen de Postgres.

La cuenta de base usada es el propietario financiero actual, mediante referencias
al Secret `forecast-postgres-admin`; esto no concede permisos a la ServiceAccount
de Kubernetes. El Secret del bucket contiene las dos claves de su usuario IAM.
Rotarlas mediante el procedimiento corporativo del ObjectBucketClaim; cada Job
nuevo recibe los valores actuales. Una rotación durante una ejecución puede
hacerla fallar y requiere revisar/reintentar el respaldo.

## Evidencia para operación

- Revisar `lastSuccessfulTime` del CronJob y el resultado del último Job.
- Registrar el nombre de objeto, su tamaño/digest y la fecha del último éxito.
- Confirmar con una lectura/descarga real que se puede recuperar el objeto.
- Medir y registrar una restauración segura antes de afirmar cumplimiento de RTO.
- Si se retrasa un backup, investigar el fallo antes de que el último éxito
  supere las 24 horas. No hay correo de fallos, conforme al alcance acordado.

La programación de 12 horas da margen para el RPO objetivo de 24 horas, pero no
lo garantiza si los Jobs fallan sin intervención. El RTO sigue siendo objetivo
hasta verificar recuperación. No restaurar sobre la base oficial para ensayarlo.

## Recuperación

Elegir un objeto completo cuyo Job haya confirmado éxito y obtenerlo mediante
acceso autenticado al bucket. Descargar también su checksum y compararlo antes
de importar. Al descifrar SSE-S3 mediante GET autorizado, S3 devuelve el dump
custom de Postgres; no es un archivo GPG. Este dump no se debe pasar al script
`restore-postgres.sh`, que espera un archivo cifrado con GPG.

Antes de la importación, detener las escrituras, pausar la reconciliación y
confirmar una base de reemplazo vacía. Un operador puede transmitir el dump a
`pg_restore` dentro del pod de Postgres con `--no-owner --no-acl --exit-on-error
--single-transaction`, sin `--clean` ni borrado de la base actual. Después
conciliar el ledger real de migraciones y verificar Snapshots, períodos,
Project ID y cifras por la API antes de volver a servir tráfico. Conservar el
estado anterior hasta completar la validación.

## Backup coherente de n8n y su clave

El segundo CronJob, `forecast-n8n-backup`, se ejecuta a las 00:15 y 12:15 de
Bogotá. Esta copia hace una interrupción breve de n8n para copiar coherentemente
su SQLite; debe programarse fuera de las Ejecuciones previstas del workflow.
Los usuarios pueden ver interrumpido el editor durante esa ventana. El comando
manual para comprobar la primera copia es:

```bash
oc create job --from=cronjob/forecast-n8n-backup forecast-n8n-backup-inicial -n nola-consulting-services-tenant--runtime-int
oc logs -f job/forecast-n8n-backup-inicial -n nola-consulting-services-tenant--runtime-int
oc rollout status deployment/forecast-n8n -n nola-consulting-services-tenant--runtime-int --timeout=180s
```

El pod de mantenimiento se sitúa obligatoriamente en el nodo del pod n8n activo
para compartir el volumen RWO. Su ServiceAccount separada solo puede consultar
el Deployment n8n, consultar/cambiar su subrecurso scale y listar los pods del
namespace. No puede modificar otros Deployments ni leer Secrets mediante la API.
Monta el PVC en solo lectura, el Secret de la clave y las credenciales del bucket.
El token de Kubernetes solo se monta en este pod de mantenimiento; n8n y la API
siguen sin token. Esta ampliación de RBAC debe revisarse antes de aplicar.

El script registra la réplica original (debe ser exactamente una), solicita cero,
espera la desaparición de los pods de n8n y vuelve a comprobar la quiescencia.
Archiva `n8n-state/` y `n8n-encryption-key/N8N_ENCRYPTION_KEY`, comprueba que no
haya sido reactivado durante la copia y restablece la réplica antes de subir el
archivo. La copia usa el mismo uploader verificado con HTTPS, SSE-S3 y HEAD,
bajo la clave `n8n/<UTC>-<pod>.tar.gz`, con su checksum acompañante.

El bloque de salida intenta restablecer n8n incluso si falla la copia o recibe
SIGTERM. No puede garantizar recuperación ante SIGKILL, fallo de nodo o pérdida
total de API: en esos casos revisar inmediatamente la escala y reponer una
réplica si corresponde. No se sobrescribe una escala distinta introducida por
otro operador. Como el pod de backup monta RWO, el nuevo pod de n8n podría
esperar a que finalice el Job si se programa en otro nodo. Comprobar readiness
después del Job, no dar por disponible n8n únicamente al ver `replicas: 1`.

Si n8n no tiene un pod en ejecución antes del backup, la afinidad impedirá
arrancar el Job. El Job tiene deadline y no puede detener una instancia desde
un pod que todavía no ha arrancado. El cron usa `concurrencyPolicy: Forbid` y
no reintenta automáticamente una intervención que haya fallado.

### Coordinación con Argo

Cuando Argo gestione n8n, su Application debe ignorar `/spec/replicas` únicamente
para el Deployment `forecast-n8n` y usar `RespectIgnoreDifferences=true`. Después
de verificar esa configuración, establecer
`N8N_BACKUP_ARGO_REPLICA_IGNORE_CONFIRMED=true` en el CronJob y guardar la decisión
en Git. La configuración por defecto es `false`: si detecta tracking de Argo y
no consta esa confirmación, el script falla antes de escalar. No deshabilitar
globalmente la reconciliación ni ignorar todas las diferencias de la aplicación.

### Recuperación de n8n desde S3

Usar un objeto completo cuyo Job haya confirmado éxito y verificar su checksum.
El GET autenticado a S3 devuelve el tar.gz descifrado por SSE-S3; no es GPG.
Preparar un PVC de reemplazo vacío, mantener n8n detenido y pausar su
reconciliación. Restaurar `n8n-state/` al directorio persistente y recuperar la
clave exacta de `n8n-encryption-key/N8N_ENCRYPTION_KEY` en el Secret correspondiente,
sin imprimirla ni publicarla. Arrancar la misma versión de n8n y comprobar
readiness y credenciales antes de reanudar las Ejecuciones. No sobrescribir un
PVC con datos ni probar restauración sobre la instancia oficial.

## Alcance de verificación

Los dos cron respaldan piezas distintas: base financiera, y estado/clave de
n8n. Ningún Job exitoso de una pieza demuestra recuperación completa de ambas.
Registrar la primera ejecución real de cada uno y una lectura/descarga de sus
objetos. El RTO sigue pendiente hasta verificar una restauración segura.

La conectividad efectiva al endpoint S3 y el cifrado deben verificarse mediante
el primer Job. Las reglas de egress del tenant pueden necesitar permitir el
destino corporativo específico; no ampliar salida a Internet de forma general.

Referencias: [curl SigV4](https://curl.se/docs/manpage.html#--aws-sigv4),
[S3 PutObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html).

El uploader normaliza únicamente endpoints AWS heredados con la forma exacta
`s3-<región>.amazonaws.com` a `s3.<región>.amazonaws.com`, verificando que la región
coincida con `BUCKET_REGION`. En este tenant, `s3-us-east-1.amazonaws.com` pasa a
`s3.us-east-1.amazonaws.com`. No modifica el ConfigMap del OBC ni las reglas de
salida: conserva HTTPS, firma SigV4, nombre del bucket y verificación del objeto.

El uploader firma las cabeceras `x-amz-*` y el SHA-256 real de cada archivo con
Python 3 (biblioteca estándar), enviando la configuración privada a curl por una
tubería. No usa el firmador incorporado de curl 7.76: esa implementación calcula
el hash desde `postfields`, y no firma las cabeceras adicionales que usa el
backup. Véanse el [código oficial de curl 7.76.1](https://github.com/curl/curl/blob/curl-7_76_1/lib/http_aws_sigv4.c)
y las [reglas de firma S3](https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html).
La comparación offline con el firmador independiente del SDK AWS se ejecuta con
`python3 openshift/operations/s3-backup/test-sign-s3.py` (requiere `botocore` solo
en el entorno de verificación; el Job no lo requiere).

Ante errores se informa el estado HTTP, el resultado de transporte y únicamente
los campos XML `Code`/`Message` filtrados. No se imprime la respuesta completa,
credenciales, cabeceras de autorización, petición canónica ni cadena de firma.

El Job n8n publica el PVC al nodo en modo RW, igual que el pod de n8n,
y mantiene `volumeMounts.state.readOnly: true` para que el contenedor de backup
solo pueda leerlo. La afinidad obliga al mismo nodo. Esto evita solicitar
publicaciones CSI simultáneas RO y RW del mismo dispositivo; sigue siendo
necesario validar el segundo montaje con el driver instalado. El script no copia
SQLite hasta confirmar que n8n terminó. No se amplían permisos RBAC.
Kubernetes distingue el [montaje del contenedor](https://kubernetes.io/docs/concepts/storage/volumes/)
y el modo de acceso [RWO, que admite varios pods del mismo nodo](https://kubernetes.io/docs/concepts/storage/persistent-volumes/).

El OBC deseado está en `openshift/operations/s3-bucket`. Declara la política
`objectbucket.io/reclaimPolicy: Delete` con la que se creó el recurso y conserva
`Prune=false,Delete=false` para impedir su eliminación automática por Argo.
Eliminar manualmente el OBC queda fuera de las operaciones de backup.

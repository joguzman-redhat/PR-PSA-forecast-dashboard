# Backup financiero programado al bucket corporativo

El bucket privado `forecast-backups` fue aprovisionado mediante ObjectBucketClaim
y está separado del volumen de Postgres. El CronJob usa su ConfigMap y Secret
del mismo nombre; las credenciales no forman parte de Git ni de los argumentos
del proceso curl.

```bash
oc apply -k openshift/operations/s3-backup
oc create job --from=cronjob/forecast-postgres-backup forecast-postgres-backup-inicial -n nola-consulting-services-tenant--runtime-int
oc logs -f job/forecast-postgres-backup-inicial -n nola-consulting-services-tenant--runtime-int
```

El cron se ejecuta a las 00:00 y 12:00 de Bogotá, sin solapar ejecuciones. La
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

## Alcance

Este cron respalda **solo la base financiera**. No respalda SQLite ni la clave
de cifrado de n8n: su copia coherente requiere la ventana de mantenimiento
descrita en [operación de n8n](README.md). No afirmar recuperación completa de
la aplicación únicamente porque el backup financiero esté programado.

La conectividad efectiva al endpoint S3 y el cifrado deben verificarse mediante
el primer Job. Las reglas de egress del tenant pueden necesitar permitir el
destino corporativo específico; no ampliar salida a Internet de forma general.

Referencias: [curl SigV4](https://curl.se/docs/manpage.html#--aws-sigv4),
[S3 PutObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html).

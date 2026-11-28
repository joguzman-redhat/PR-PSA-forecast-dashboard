# Operación y recuperación

Los CronJobs `forecast-postgres-backup` y `forecast-n8n-backup` están aplicados
en el runtime y programados cada doce horas hacia el bucket corporativo privado
`forecast-backups`. Usan HTTPS y solicitan cifrado SSE-S3 (`AES256`); incluyen
comprobación del objeto y checksum. El backup de n8n incluye su clave y pausa
la réplica durante la copia coherente de SQLite. Esta interrupción programada
fue aprobada por el usuario. Ver [operación S3](s3-backup.md) para horarios,
permisos, coordinación con Argo, límites y comprobación de resultados.

La primera ejecución encontró un fallo de firma S3; la corrección y la
verificación de subida/lectura siguen en curso. No dar por cumplido el RPO
hasta obtener evidencia de objetos recuperables de ambos CronJobs. Los
comandos siguientes se conservan como alternativa manual cifrada con GPG.

Estos comandos usan la sesión autenticada de `oc` y verifican el servidor y el
namespace oficial. No leen `infra/.env` ni imprimen credenciales. Se ejecutan
desde el repositorio con Bash, Python 3 y, para respaldar, GPG. El destino es
explícito y debe pertenecer al usuario autorizado para custodiar los datos.

## n8n interno

La instalación nueva usa la versión `2.48.8`, comprobada en la instancia local
del usuario, un PVC propio y la clave de `forecast-n8n-secrets`, campo
`N8N_ENCRYPTION_KEY`. La clave se crea fuera de Git y debe conservarse junto al
respaldo. No se cambia durante un rollout ni se copia automáticamente el estado
de la instancia local.

```bash
oc port-forward -n nola-consulting-services-tenant--runtime-int service/forecast-n8n 5678:5678 --address=127.0.0.1
```

Abrir `http://localhost:5678`. El usuario crea su cuenta, importa el workflow
existente y configura las credenciales después del despliegue. Cerrar la terminal
o interrumpir el port-forward elimina ese acceso temporal. No hay Route de n8n.
Los callbacks OAuth o webhooks externos se diseñan por separado: la URL local
no permite recibir peticiones desde Internet.

n8n conserva su base SQLite y estado en el PVC. Las ejecuciones exitosas y
manuales no guardan payloads completos; las fallidas se podan a los siete días
o mil ejecuciones. Esto no borra los Snapshots financieros, que viven en
Postgres. La configuración puede ajustarse explícitamente en un release futuro.

## Respaldar Postgres

Se genera un dump consistente, en formato custom, sin propiedad ni ACL. Se cifra
durante la transferencia: el archivo local se publica solo si el dump y el
cifrado terminan correctamente. GPG debe tener previamente la clave pública
confiable del destinatario y se pasa su huella completa, no una contraseña.

```bash
bash openshift/operations/backup-postgres.sh /destino/privado/forecast-2026-11-27.dump.gpg HUELLA_GPG_COMPLETA
```

El directorio debe existir. El comando rechaza una ruta relativa, un archivo
existente o un destinatario que no tenga disponible la clave pública. Se imprime
un SHA-256 del archivo cifrado; guardar ese resultado en el registro de operación.
Conservar la clave privada de descifrado de manera independiente del backup.

Este script presupone el contenedor `postgres` del Deployment
`forecast-postgres`, con las variables `POSTGRESQL_USER`, `POSTGRESQL_PASSWORD`
y `POSTGRESQL_DATABASE` de la imagen de Postgres. La contraseña solo se utiliza
dentro del contenedor. No es necesario copiarla al equipo ni al historial de shell.

## Respaldar n8n y su clave

Copiar una base SQLite mientras escribe no garantiza coherencia. Planificar una
interrupción breve, pausar la sincronización automática de Argo para n8n y
esperar a que no queden Ejecuciones activas. El usuario debe verificar su estado
en el editor antes de parar el servicio. Después:

```bash
oc scale deployment/forecast-n8n -n nola-consulting-services-tenant--runtime-int --replicas=0
oc wait --for=delete pod -n nola-consulting-services-tenant--runtime-int -l app=forecast-n8n --timeout=120s
bash openshift/operations/backup-n8n.sh /destino/privado/n8n-2026-11-27.tar.gz.gpg HUELLA_GPG_COMPLETA
oc scale deployment/forecast-n8n -n nola-consulting-services-tenant--runtime-int --replicas=1
oc rollout status deployment/forecast-n8n -n nola-consulting-services-tenant--runtime-int --timeout=180s
```

Reanudar la sincronización de Argo después de verificar el servicio. El script
no escala el servicio por su cuenta y rechaza continuar si detecta réplicas o
pods de n8n. Crea un pod auxiliar temporal, sin token de API, con el PVC en modo
solo lectura; copia la clave a memoria y transmite el archivo directamente al
cifrador local. El pod se elimina al terminar y tiene un plazo máximo de diez
minutos. La imagen se obtiene del Deployment actual, para conservar la versión.

El archivo contiene `state/` (la carpeta persistente completa) y
`backup-key/N8N_ENCRYPTION_KEY` (la clave necesaria para las credenciales). No
publicar ni subir este contenido descifrado a Git, chat o logs.

## Restaurar Postgres sin borrar la base actual

Primero detener escrituras del workflow y de cualquier migración, pausar la
sincronización automática y mantener la API sin tráfico durante la intervención.
Una restauración completa se hace **antes** de ejecutar la inicialización del
esquema en una base de reemplazo vacía. La base ya inicializada no está vacía,
aunque todavía no tenga proyectos: el script la rechaza. No hay `DROP`,
`--clean` ni adopción implícita de su esquema.

```bash
bash openshift/operations/restore-postgres.sh /destino/privado/forecast-2026-11-27.dump.gpg --confirm-empty-official-database
```

El script verifica que no existan tablas, vistas ni secuencias de usuario y usa
una única transacción de `pg_restore`; un error detiene la importación. Si hace
falta sustituir una base con datos, esa decisión y su preparación quedan fuera
del comando: respaldar primero, aprobar el objetivo exacto y preparar una base
vacía de reemplazo en una ventana de mantenimiento. No crear una base temporal
de pruebas ni sobrescribir el servicio oficial para simular una recuperación.

Tras la importación, conciliar el historial real de migraciones con el ejecutor
de esquema. Una base restaurada sin su ledger no se adopta automáticamente.
Verificar períodos, Snapshots, Project ID y cifras mediante la API antes de
reanudar la API y el workflow. Los conteos del ADR son ejemplos históricos,
no constantes para aceptar el estado actual.

## Restaurar n8n

No usar el archivo de n8n como un dump financiero. Preparar un PVC de reemplazo
vacío, mantener n8n detenido y pausar Argo. Con un pod auxiliar de mantenimiento
que monte ese PVC, restaurar el contenido de `state/` en la carpeta persistente,
preservando permisos. Recuperar `backup-key/N8N_ENCRYPTION_KEY` en el Secret
`forecast-n8n-secrets` sin imprimirla ni guardarla en un archivo versionado.
Arrancar la misma versión de imagen que produjo el backup y verificar readiness,
inicio de sesión y lectura de las credenciales. No cambiar simultáneamente la
versión de n8n y su base interna; las migraciones internas pueden no admitir
reversión. Solo después reanudar Argo y las Ejecuciones.

No se automatiza la sustitución de un PVC con datos ni la escritura de la clave
durante una restauración: requieren un objetivo de recuperación confirmado.
Guardar el PVC anterior hasta completar la validación. El helper de backup monta
el PVC en solo lectura y no sirve como herramienta de restauración.

## Objetivos y pendientes operativos

Los objetivos aceptados son RPO de 24 horas y RTO de cuatro horas durante horario
laboral. La programación S3 de doce horas y el destino corporativo independiente
ya están configurados. Falta confirmar la primera subida y lectura de ambos
backups después de corregir el fallo de firma, y registrar su fecha, objeto,
tamaño y checksum. Revisar `lastSuccessfulTime` y los Jobs; el usuario vigila
los fallos y no se han configurado notificaciones externas.

No hay política automática de borrado en S3: los objetos usan nombres únicos y
se conservan hasta acordar/aplicar retención corporativa. Custodiar las
credenciales del bucket y la clave de n8n con acceso restringido. SSE-S3 cifra
los objetos en el servidor; quien pueda descargarlos con autorización obtiene
el contenido descifrado. Los archivos `.gpg` de los comandos manuales requieren
además la clave privada de su destinatario.

No se ha ensayado una restauración en otra base por decisión del usuario, ni
se autoriza sobrescribir la oficial para probarla. El RTO queda como objetivo
sin tiempo de recuperación demostrado. La importación inicial comprobada no
sustituye una prueba de recuperación desde el backup programado.

ITUP no incluye backup automático de volúmenes según la guía consultada. No
interpretar `Retain`, un PVC o un archivo en el mismo clúster como reemplazo de
un backup independiente. Un CronJob aceptado tampoco acredita una subida exitosa.

## Referencias

- [Instalación n8n y persistencia de SQLite](https://docs.n8n.io/hosting/installation/docker/).
- [Health y readiness de n8n](https://docs.n8n.io/hosting/logging-monitoring/monitoring/).
- [Retención de ejecuciones](https://docs.n8n.io/hosting/configuration/environment-variables/executions/).
- [Guía corporativa de almacenamiento](https://source.redhat.com/departments/strategy_and_operations/it/datacenter_infrastructure/itcloudservices/itocp/itocp_wiki/storage_offerings).
- [ADR de identidad](../../docs/adr/0003-identidad-por-project-id.md).

Los scripts de mantenimiento fijan el nombre del contexto validado y el servidor
explícito en cada llamada mediante `runtime_oc`; cambiar el contexto activo en
otra terminal no cambia su destino. No crean copias de kubeconfig ni leen `.env`.

El OBC existente está versionado en
[`s3-bucket/`](s3-bucket/). Sus protecciones
`Prune=false` y `Delete=false` impiden su eliminación automática desde Argo;
no protegen frente a un borrado manual. **No borrar el ObjectBucketClaim**:
la política de reclaim de la plataforma puede eliminar también el bucket y
sus backups. Estas anotaciones no cambian esa política real.

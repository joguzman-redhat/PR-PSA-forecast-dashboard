# Runtime oficial

Destino: `nola-consulting-services-tenant--runtime-int`. Estos manifiestos
reemplazan la base legacy solo para este tenant. No aplicar la base antigua.

## Secretos previos, fuera de Git

- `forecast-postgres-admin`: `POSTGRESQL_USER=forecast_owner`,
  `POSTGRESQL_PASSWORD`, `POSTGRESQL_DATABASE=forecast`, `POSTGRESQL_ADMIN_PASSWORD`.
- `forecast-api-reader`: `PGUSER=forecast_reader`, `PGPASSWORD`, `PGDATABASE=forecast`.
- `forecast-etl-writer`: `PGUSER=forecast_writer`, `PGPASSWORD`, `PGDATABASE=forecast`.

Usar contraseñas generadas independientes, sin pegarlas en logs o comandos
versionados. La API solo recibe el secreto lector; el Job de migración recibe
la cuenta administrativa de Postgres para gestionar roles y sus contraseñas.
El ServiceAccount no monta token de Kubernetes.

Antes de aplicar, sustituir `forecast-api:pending` por el digest construido y
verificado mediante un overlay de Kustomize o editar la referencia versionada.
Confirmar admisión de PVC, imagen y host de Route. La Route usa `shard: internal`;
no publicar rutas de Postgres o del editor de n8n.

## Esquema y migraciones

La misma imagen de API contiene un CLI independiente:

```bash
node src/migrate.js --migrate
```

Solo inicializa si no hay objetos en `public`. Usa el esquema canónico incluido
en la imagen y el baseline versionado que fija sus hashes y los de las
migraciones ya absorbidas. Registra el esquema y ese baseline en una transacción,
con bloqueo asesor de sesión. Las migraciones nuevas deben ser posteriores al
último nombre aplicado y dejar al ejecutor el control de la transacción; no
pueden incluir BEGIN/COMMIT/ROLLBACK propios. Cada migración y su hash se
registran en la misma transacción. Un archivo aplicado modificado o ausente
provoca fallo. Una base existente sin ledger no se adopta automáticamente.

El Job es un hook `Sync` de onda -1. Postgres, su PVC, Service y la cuenta de
servicio están en onda -2; la API en la onda por defecto. No usar `PostSync`
para inicializar una base necesaria para readiness. Un fallo del hook detiene
la promoción. El Job puede recrearse: el historial evita repetir migraciones.
El esquema de operación `forecast_ops` no se concede al escritor ni al lector.

## Importación inicial del histórico

Preferir restaurar un archivo completo, `--no-owner --no-acl` y con owner final
`forecast_owner`, en la base real de destino **vacía**, antes de ejecutar el Job.
No crear otra base temporal ni borrar una base existente para ensayar restores.
Verificar en la fuente que el esquema corresponde al baseline actual y a los
ADR, y conservar un backup recuperable antes de transformar o mover datos.

Después de restaurar, comparar la huella estructural de origen y destino.
El CLI permite emitir la consulta estática para ejecutarla con `psql -At`:

```bash
node src/migrate.js --fingerprint-sql
```

El hash es SHA256 del texto exacto devuelto por esa consulta, más un salto de
línea (como `psql -At ... | sha256sum`). No incluye datos, owners ni privilegios;
no sustituye comparar Snapshots, períodos, conteos ni cifras. Incluye columnas,
defaults, restricciones, definiciones de vistas, funciones, índices y triggers.
La comparación requiere mismo major de Postgres y mismo search_path (`public`
visible). Conservar la evidencia de que la fuente estaba en el baseline actual.

La adopción es una operación administrativa única y explícita:

```bash
FORECAST_ADOPT_BASELINE_SHA256=<hash-estructural-fuente-verificada> \
FORECAST_ADOPT_BACKUP_REFERENCE=<referencia-backup-verificado> \
  node src/migrate.js --adopt-baseline
```

Rechaza una base vacía, una huella distinta y una base ya registrada. Registra
baseline y referencia de backup sin reejecutar las transformaciones históricas;
el operador es responsable de la verificación previa del baseline de la fuente.
Después ejecuta migraciones realmente nuevas y configura permisos. No usar la
adopción para saltar una migración pendiente o para silenciar diferencias.

El CLI usa `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER=postgres`, `PGPASSWORD` y
`FORECAST_READER_PASSWORD`/`FORECAST_WRITER_PASSWORD` para roles. Las contraseñas
no se imprimen; el log solo identifica migraciones aplicadas o errores.
No ejecutar el proceso API con estas credenciales administrativas.

## Acceso de lectura

La API recibe `FORECAST_READ_ONLY=true`, omite `POST /api/reload` y además usa
un rol con SELECT y `default_transaction_read_only=on`. La vida usa
`/health/live`; readiness comprueba Postgres y su esquema mediante `/health`.
Sin datos, el estado vacío existente sigue disponible; no se activa demo.

Las políticas gestionadas por el tenant son aditivas. Estos manifiestos no
prometen aislamiento entre pods anulando `internal-1`, ni modifican esa política.
Conservar las reglas de plataforma y verificar el control de red efectivo antes
de afirmar aislamiento adicional. n8n y backups se documentan separadamente.

El Job espera a que Postgres acepte conexiones antes de ejecutar migraciones,
con el mismo plazo total de 300 segundos del Job. Esto cubre reinicios del
Deployment durante un cambio de imagen. El propietario `forecast_owner` tiene
`USAGE` y `SELECT` sobre el historial en `forecast_ops` para que el backup incluya
esos metadatos; no tiene permisos para escribirlos. El lector y el escritor del
ETL no reciben acceso a ese esquema.

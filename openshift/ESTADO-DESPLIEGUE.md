# Estado comprobado del despliegue

Fecha de operación: 27 de noviembre de 2026 (Bogotá; Jobs con fecha UTC del 28).
Rama de integración: `codex/openshift-integracion`. Esta evidencia describe el
clúster; no sustituye la integración en `main` ni configura Argo central.

## Aplicación e histórico

- URL: https://forecast-nola.apps.int.prod-scale-spoke1-dc-rdu3.itup.redhat.com/
- API, Postgres y n8n desplegados en `nola-consulting-services-tenant--runtime-int`.
- Route admitida por el shard interno, TLS validado y dashboard abierto desde VPN.
- `/health` respondió OK con 13 Cargas; `/api/reload` devuelve 404 en modo lector.
- El dashboard cargó tablas con histórico; la conciliación existente de cifras pasó.
- Se restauró el dump de la fuente local en el destino inicialmente vacío, en una
  transacción. La fuente no se modificó. Conteos y hashes de siete tablas públicas
  coinciden. La adopción explícita del baseline terminó en `forecast-schema-adopt`.
- El dump privado previo tiene SHA-256
  `af856a84118139d475184493880ee880ad6f8c0a85062781fcbebece9adf7936`.
  El archivo y los logs con valores financieros están fuera de Git.
- API/n8n están en el registro corporativo del tenant; las referencias por digest
  están en `runtime/kustomization.yaml`. Los Secrets se generaron fuera de Git.

## Respaldos

- OBC `forecast-backups` Bound; credenciales proporcionadas por la plataforma.
- `forecast-postgres-backup-firmado` completó PUT, HEAD y checksum en S3 con
  cifrado SSE-S3 AES256. Objeto:
  `financial/20261128T025950Z-forecast-postgres-backup-firmado-hlkp8.dump`.
- Tamaño: 1047471 bytes; SHA-256:
  `d7f2b4de317c0e8c230aafeea1dfad129e85216d064f250aa8c30ea7774ca5d1`.
- `forecast-postgres-backup-lectura` descargó ese objeto a almacenamiento efímero,
  comprobó el mismo SHA-256 y leyó su índice mediante `pg_restore --list`.
  No modificó ninguna base. Cron financiero: 00:00/12:00, America/Bogota.
- `forecast-n8n-backup-verificado` completó pausa, copia, restablecimiento y S3:
  `n8n/20261128T030528Z-forecast-n8n-backup-verificado-fzmp5.tar.gz`, 526183 bytes,
  SHA-256 `3a83b8f46445030ce63c5305802deff6aea1667be9c851ace5d6c7ae6ad71930`.
  n8n quedó listo 1/1; Cron habilitado 00:15/12:15, America/Bogota.
- `forecast-n8n-backup-lectura` descargó el archivo, verificó el SHA-256 y
  confirmó que contiene SQLite y su clave, sin imprimir contenidos ni restaurar.
- El dashboard actualizado mostró cinco tablas y 254 filas renderizadas,
  sin error de carga. API, Postgres y n8n terminaron listos 1/1.
- No hay borrado de objetos: retención/ciclo de vida por acordar. RPO 24h y RTO 4h
  son objetivos; no se midió una restauración integral. Por decisión del usuario
  no se creó una base temporal ni se sobrescribió la oficial para ensayarla.

## CI/CD y límites pendientes

- `forecast-ci-prueba-a89q2z`: 122 tests y lint sobre main `815d9f0`.
- Suite final en integración: 123 tests y lint aprobados.
- `forecast-build-push-9kk6r`: Succeeded, commit
  `a1a87c7a444590338e821aa6cdb9036e5f9a8968`, 123 tests, lint, build y push.
  API y Job de migraciones usan el mismo digest
  `sha256:17836f80b5edd3489143e71d791b04c60ee890b23d30f514ca3471c6762caefd`.
  `forecast-schema` completó las migraciones/permisos antes del rollout de API.
  Rollout completado; salud y conciliación financiera aprobadas después.
- Los primeros builds fallaron por firma/CDN bloqueados; las autorizaciones
  específicas se aplicaron conservando reglas previas y Deny final.
- Salidas específicas autorizadas: GitHub, npm, registry.access.redhat.com,
  access.redhat.com (firmas), cdn01.quay.io (capas), únicamente en `--pipeline`.
- Argo central denegó alta de repositorio a la cuenta actual. El usuario eligió
  configurarlo personalmente con `argocd/forecast-project.yaml` y
  `argocd/forecast-application.yaml`, después de integrar esta rama en main.
  No se creó otra instancia de Argo ni un controlador con acceso a Secrets.
- No hay webhook GitHub ni promoción automática commit→digest→Git implementados.
- `internal-1` es una política aditiva de plataforma con permisos amplios dentro
  del namespace. No se cambió ni se afirma aislamiento fino entre componentes.
  La Route interna no es autenticación individual ni prueba acceso exclusivo a
  los empleados elegidos; el usuario pospuso access control.

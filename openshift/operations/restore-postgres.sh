#!/usr/bin/env bash
# Restore only into an explicitly empty official database, never DROP or --clean.
set -euo pipefail
source "$(dirname "$0")/common.sh"
[[ $# -eq 2 && "$2" == --confirm-empty-official-database ]] || {
  echo "Uso: $0 /ruta/backup.dump.gpg --confirm-empty-official-database" >&2; exit 2;
}
require_runtime_context
require_archive "$1"
command -v gpg >/dev/null || { echo 'Falta GPG.' >&2; exit 2; }
relations=$(oc exec -n "$runtime_namespace" deployment/forecast-postgres -c postgres -- \
  sh -ceu 'PGPASSWORD="$POSTGRESQL_PASSWORD" exec psql --host=127.0.0.1 --username="$POSTGRESQL_USER" --dbname="$POSTGRESQL_DATABASE" --no-psqlrc -At -v ON_ERROR_STOP=1 -c "$1"' \
  sh "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S')")
[[ "$relations" == 0 ]] || {
  echo 'Restauración rechazada: la base contiene relaciones. No se borró nada.' >&2; exit 1;
}
# One pg_restore transaction avoids leaving a partially imported schema/data.
gpg --decrypt "$1" | oc exec -i -n "$runtime_namespace" deployment/forecast-postgres -c postgres -- \
  sh -ceu 'PGPASSWORD="$POSTGRESQL_PASSWORD" exec pg_restore --host=127.0.0.1 --username="$POSTGRESQL_USER" --dbname="$POSTGRESQL_DATABASE" --no-owner --no-acl --exit-on-error --single-transaction'
echo 'Restauración terminada. Verificar Snapshots, períodos y cifras por la API antes de habilitar la aplicación.'

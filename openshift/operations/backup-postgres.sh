#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
[[ $# -eq 2 ]] || { echo "Uso: $0 /ruta/backup.dump.gpg HUELLA_GPG" >&2; exit 2; }
require_runtime_context
require_encrypted_destination "$1" "$2"
umask 077
output=$1 recipient=$2
partial=$(mktemp "$(dirname "$output")/.forecast-pg.XXXXXXXX")
trap 'rm -f "$partial"' EXIT
oc exec -n "$runtime_namespace" deployment/forecast-postgres -c postgres -- \
  sh -ceu 'PGPASSWORD="$POSTGRESQL_PASSWORD" exec pg_dump --host=127.0.0.1 --username="$POSTGRESQL_USER" --dbname="$POSTGRESQL_DATABASE" --format=custom --no-owner --no-acl' \
  | gpg --batch --yes --encrypt --recipient "$recipient" --output "$partial"
[[ -s "$partial" ]] || { echo 'El respaldo está vacío.' >&2; exit 1; }
ln "$partial" "$output"
printf 'Respaldo cifrado creado: %s\n' "$output"
sha256sum "$output"

#!/usr/bin/env bash
# Financial backup to the provisioned corporate bucket. Never prints secrets.
set -euo pipefail
umask 077
: "${PGHOST:?}" "${PGUSER:?}" "${PGPASSWORD:?}" "${PGDATABASE:?}" "${POD_NAME:?}"
[[ ${POD_NAME} =~ ^[a-z0-9-]+$ ]] || { echo 'Nombre de pod inválido.' >&2; exit 2; }
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
dump=/work/forecast.dump
trap 'rm -f "$dump"' EXIT
pg_dump --format=custom --no-owner --no-acl --file="$dump"
[[ -s "$dump" ]] || { echo 'pg_dump no generó un respaldo.' >&2; exit 1; }
pg_restore --list "$dump" >/dev/null
bash /opt/backup/upload.sh "$dump" "financial/${timestamp}-${POD_NAME}.dump"

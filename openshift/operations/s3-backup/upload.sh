#!/usr/bin/env bash
# Upload an already consistent private archive and verify it in corporate S3.
set -euo pipefail
umask 077
[[ $# -eq 2 && -s "$1" && "$2" =~ ^[A-Za-z0-9/._-]+$ && "$2" != *..* ]] || {
  echo 'Se requiere un archivo existente y una clave de objeto válida.' >&2; exit 2;
}
: "${AWS_ACCESS_KEY_ID:?}" "${AWS_SECRET_ACCESS_KEY:?}"
: "${BUCKET_HOST:?}" "${BUCKET_NAME:?}" "${BUCKET_REGION:?}"
[[ ${BUCKET_PORT:-443} == 443 && ${BUCKET_HOST} =~ ^[a-zA-Z0-9.-]+$ &&
   ${BUCKET_NAME} =~ ^[a-z0-9][a-z0-9.-]+[a-z0-9]$ &&
   ${BUCKET_REGION} =~ ^[a-z0-9-]+$ ]] || {
  echo 'Configuración del bucket no válida o no HTTPS.' >&2; exit 2;
}
dump=$1 key=$2
headers=/work/head.headers
trap 'rm -f /work/head.headers /work/response.xml /work/checksum.txt' EXIT
digest=$(sha256sum "$dump")
digest=${digest%% *}
bytes=$(stat -c %s "$dump")
printf '%s  %s\n' "$digest" "${key##*/}" > /work/checksum.txt
endpoint="https://${BUCKET_HOST}/${BUCKET_NAME}"

signed_curl() {
  # Process substitution keeps the access keys out of process arguments and files.
  curl --silent --show-error --fail --connect-timeout 10 --max-time 300 \
    --retry 2 --retry-delay 2 --aws-sigv4 "aws:amz:${BUCKET_REGION}:s3" \
    --config <(printf 'user = "%s:%s"\n' "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY") \
    "$@"
}

status=$(signed_curl --upload-file "$dump" \
  --header "x-amz-content-sha256: $digest" \
  --header "x-amz-meta-sha256: $digest" \
  --header 'x-amz-server-side-encryption: AES256' \
  --output /work/response.xml --write-out '%{http_code}' "$endpoint/$key")
[[ "$status" == 200 ]] || { echo "S3 PUT no confirmó éxito: HTTP $status" >&2; exit 1; }
signed_curl --head --output "$headers" "$endpoint/$key"
tr -d '\r' < "$headers" > /work/response.xml
grep -Eiq "^content-length: ${bytes}$" /work/response.xml || {
  echo 'S3 HEAD no confirmó el tamaño del respaldo.' >&2; exit 1;
}
grep -Eiq "^x-amz-meta-sha256: ${digest}$" /work/response.xml || {
  echo 'S3 HEAD no confirmó los metadatos SHA-256.' >&2; exit 1;
}
grep -Eiq '^x-amz-server-side-encryption: AES256$' /work/response.xml || {
  echo 'S3 HEAD no confirmó cifrado SSE-S3.' >&2; exit 1;
}
checksum_hash=$(sha256sum /work/checksum.txt)
checksum_hash=${checksum_hash%% *}
status=$(signed_curl --upload-file /work/checksum.txt \
  --header "x-amz-content-sha256: $checksum_hash" \
  --header 'x-amz-server-side-encryption: AES256' \
  --output /work/response.xml --write-out '%{http_code}' "$endpoint/$key.sha256")
[[ "$status" == 200 ]] || { echo "S3 PUT del checksum falló: HTTP $status" >&2; exit 1; }
printf 'Backup confirmado: key=%s bytes=%s sha256=%s encryption=AES256\n' "$key" "$bytes" "$digest"

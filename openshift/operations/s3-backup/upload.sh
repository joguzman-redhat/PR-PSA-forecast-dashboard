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
# Some legacy OBCs publish s3-<region>.amazonaws.com, including the invalid
# s3-us-east-1.amazonaws.com. Normalize only that exact AWS endpoint family.
bucket_host=$BUCKET_HOST
if [[ "$bucket_host" =~ ^s3-([a-z]{2}(-[a-z]+)+-[0-9]+)\.amazonaws\.com$ ]]; then
  legacy_region=${BASH_REMATCH[1]}
  [[ "$BUCKET_REGION" =~ ^(us|eu|ap|ca|me|sa|af|il|mx)-(central|north|south|east|west|northeast|southeast)-[1-9][0-9]*$ && "$legacy_region" == "$BUCKET_REGION" ]] || {
    echo 'El endpoint AWS y la región del bucket no coinciden.' >&2; exit 2;
  }
  bucket_host="s3.${BUCKET_REGION}.amazonaws.com"
fi
dump=$1 key=$2
headers=/work/head.headers
trap 'rm -f /work/head.headers /work/response.xml /work/checksum.txt' EXIT
digest=$(sha256sum "$dump")
digest=${digest%% *}
bytes=$(stat -c %s "$dump")
printf '%s  %s\n' "$digest" "${key##*/}" > /work/checksum.txt
endpoint="https://${bucket_host}/${BUCKET_NAME}"

report_s3_error() {
  local operation=$1 status=$2 transport=$3
  printf 'S3 %s falló: HTTP %s; curl=%s\n' "$operation" "$status" "$transport" >&2
  # Deliberately omit RequestId, CanonicalRequest, StringToSign and raw body.
  python3 - /work/response.xml <<'PYERROR' >&2
import os, re, sys, xml.etree.ElementTree as ET
try:
    root = ET.fromstring(open(sys.argv[1], 'rb').read(32768))
except (OSError, ET.ParseError):
    raise SystemExit(0)
for field in ('Code', 'Message'):
    node = root.find(field)
    if node is None or node.text is None:
        continue
    text = node.text
    for name in ('AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN'):
        if os.environ.get(name):
            text = text.replace(os.environ[name], '[redacted]')
    if re.search(r'credential|authorization|signature=|string.?to.?sign|canonical.?request', text, re.I):
        text = '[detalle omitido por seguridad]'
    text = re.sub(r'[^A-Za-z0-9 .,;:/_()=!?-]', ' ', text)[:300]
    print(f'S3 {field}: {text}')
PYERROR
}

signed_curl() {
  local method=$1 payload_hash=$2 url=$3
  shift 3
  local extra=()
  if [[ "$method" == PUT ]]; then
    extra+=("x-amz-server-side-encryption:AES256")
    [[ "$url" == *.sha256 ]] || extra+=("x-amz-meta-sha256:$payload_hash")
  fi
  local configuration
  configuration=$(python3 /opt/backup/sign-s3.py "$method" "$url" "$payload_hash" "${extra[@]}") || return 2
  # Sign all x-amz headers and the actual payload hash, including on curl7.76.
  # Process substitution keeps authorization out of arguments and files.
  curl --silent --show-error --connect-timeout 10 --max-time 300 \
    --retry 2 --retry-delay 2 \
    --config <(printf '%s\n' "$configuration") \
    "$@" "$url"
}

transport=0
status=$(signed_curl PUT "$digest" "$endpoint/$key" --upload-file "$dump" \
  --output /work/response.xml --write-out '%{http_code}') || transport=$?
[[ "$transport" == 0 && "$status" == 200 ]] || { report_s3_error PUT "$status" "$transport"; exit 1; }
empty_digest=$(printf '' | sha256sum)
empty_digest=${empty_digest%% *}
transport=0
status=$(signed_curl HEAD "$empty_digest" "$endpoint/$key" --head \
  --output "$headers" --write-out '%{http_code}') || transport=$?
[[ "$transport" == 0 && "$status" == 200 ]] || { : > /work/response.xml; report_s3_error HEAD "$status" "$transport"; exit 1; }
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
transport=0
status=$(signed_curl PUT "$checksum_hash" "$endpoint/$key.sha256" --upload-file /work/checksum.txt \
  --output /work/response.xml --write-out '%{http_code}') || transport=$?
[[ "$transport" == 0 && "$status" == 200 ]] || { report_s3_error PUT-checksum "$status" "$transport"; exit 1; }
printf 'Backup confirmado: key=%s bytes=%s sha256=%s encryption=AES256\n' "$key" "$bytes" "$digest"

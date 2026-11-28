#!/usr/bin/env bash
# SQLite is copied only after n8n has stopped; include its encryption key.
set -euo pipefail
source "$(dirname "$0")/common.sh"
[[ $# -eq 2 ]] || { echo "Uso: $0 /ruta/n8n.tar.gz.gpg HUELLA_GPG" >&2; exit 2; }
require_runtime_context
require_encrypted_destination "$1" "$2"
replicas=$(runtime_oc get deployment forecast-n8n -n "$runtime_namespace" --request-timeout=15s -o 'jsonpath={.spec.replicas}')
[[ "$replicas" == 0 ]] || {
  echo 'Detén n8n durante una ventana de mantenimiento antes de respaldar SQLite.' >&2; exit 1;
}
[[ -z $(runtime_oc get pods -n "$runtime_namespace" -l app=forecast-n8n --request-timeout=15s -o name) ]] || {
  echo 'Todavía existen pods de n8n; espera a su terminación.' >&2; exit 1;
}
image=$(runtime_oc get deployment forecast-n8n -n "$runtime_namespace" --request-timeout=15s -o 'jsonpath={.spec.template.spec.containers[?(@.name=="n8n")].image}')
[[ -n "$image" ]] || { echo 'No se pudo identificar la imagen de n8n.' >&2; exit 1; }
umask 077
output=$1 recipient=$2
partial=$(mktemp "$(dirname "$output")/.forecast-n8n.XXXXXXXX")
helper=''
cleanup() {
  rm -f "$partial"
  if [[ -n "$helper" ]]; then
    runtime_oc delete -n "$runtime_namespace" "$helper" --wait=false --request-timeout=15s >/dev/null
  fi
}
trap cleanup EXIT
helper=$(python3 - "$image" "$runtime_namespace" <<'PY' | runtime_oc create --request-timeout=20s -f - -o name
import json, sys
print(json.dumps({
  'apiVersion': 'v1', 'kind': 'Pod',
  'metadata': {'generateName': 'forecast-n8n-backup-', 'namespace': sys.argv[2],
               'labels': {'app.kubernetes.io/part-of': 'cloud-forecast', 'paas.redhat.com/appcode': 'NLFC-001'}},
  'spec': {'restartPolicy': 'Never', 'activeDeadlineSeconds': 600,
    'serviceAccountName': 'forecast-n8n', 'automountServiceAccountToken': False,
    'securityContext': {'runAsNonRoot': True, 'seccompProfile': {'type': 'RuntimeDefault'}},
    'containers': [{'name': 'archive', 'image': sys.argv[1], 'command': ['sh', '-c', 'sleep 600'],
      'securityContext': {'allowPrivilegeEscalation': False, 'readOnlyRootFilesystem': True,
                          'capabilities': {'drop': ['ALL']}},
      'resources': {'requests': {'cpu': '100m', 'memory': '128Mi'},
                    'limits': {'cpu': '500m', 'memory': '256Mi'}},
      'volumeMounts': [{'name': 'data', 'mountPath': '/state', 'readOnly': True},
                       {'name': 'key', 'mountPath': '/encryption-key', 'readOnly': True},
                       {'name': 'key-copy', 'mountPath': '/backup-key'}]}],
    'volumes': [{'name': 'data', 'persistentVolumeClaim': {'claimName': 'forecast-n8n-data', 'readOnly': True}},
                {'name': 'key', 'secret': {'secretName': 'forecast-n8n-secrets',
                  'items': [{'key': 'N8N_ENCRYPTION_KEY', 'path': 'N8N_ENCRYPTION_KEY'}]}},
                {'name': 'key-copy', 'emptyDir': {'medium': 'Memory', 'sizeLimit': '1Mi'}}]}}))
PY
)
runtime_oc wait -n "$runtime_namespace" "$helper" --for=condition=Ready --timeout=120s >/dev/null
# Refuse if an automatic reconciler restarted n8n during setup.
[[ $(runtime_oc get deployment forecast-n8n -n "$runtime_namespace" --request-timeout=15s -o 'jsonpath={.spec.replicas}') == 0 ]] || {
  echo 'n8n fue reactivado durante el respaldo. Pausa la reconciliación y repite.' >&2; exit 1;
}
runtime_oc exec -n "$runtime_namespace" "$helper" -c archive -- \
  sh -ceu 'cp /encryption-key/N8N_ENCRYPTION_KEY /backup-key/N8N_ENCRYPTION_KEY; tar -czf - -C / state backup-key' \
  | gpg --batch --yes --encrypt --recipient "$recipient" --output "$partial"
[[ $(runtime_oc get deployment forecast-n8n -n "$runtime_namespace" --request-timeout=15s -o 'jsonpath={.spec.replicas}') == 0 ]] || {
  echo 'n8n fue reactivado durante la copia: no se publicará un respaldo inconsistente.' >&2; exit 1;
}
ln "$partial" "$output"
printf 'Estado y clave de n8n respaldados y cifrados: %s\n' "$output"
sha256sum "$output"

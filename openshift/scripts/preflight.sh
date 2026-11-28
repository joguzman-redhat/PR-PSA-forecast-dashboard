#!/usr/bin/env bash
# Diagnóstico de solo lectura. No crea recursos ni acredita preparación operativa.
set -euo pipefail

readonly expected_server='https://api.prod-scale-spoke1-dc-rdu3.prod-scale-mgmthub1-dc-rdu3.itup.redhat.com:6443'
readonly runtime_namespace='nola-consulting-services-tenant--runtime-int'
readonly build_namespace='nola-consulting-services-tenant--pipeline'

if [[ $# -ne 0 ]]; then
  echo 'Uso: bash openshift/scripts/preflight.sh' >&2
  exit 2
fi
if ! command -v oc >/dev/null 2>&1; then
  echo 'NO LISTO: falta oc. Instalar el cliente oficial y autenticar la cuenta corporativa.' >&2
  exit 2
fi

# No leer kubeconfig, tokens, .env ni el contenido de ningún Secret.
current_server=$(oc whoami --show-server 2>/dev/null) || {
  echo 'NO LISTO: no se pudo identificar el servidor del contexto actual.' >&2
  exit 2
}
if [[ ${current_server%/} != "$expected_server" ]]; then
  echo 'NO LISTO: el contexto apunta a otro servidor; no se consultaron sus recursos.' >&2
  exit 2
fi
if ! oc whoami --request-timeout=15s >/dev/null 2>&1; then
  echo 'NO LISTO: sesión no autenticada o API inaccesible.' >&2
  exit 2
fi

printf 'Diagnóstico UTC: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo 'Servidor esperado y autenticación: verificados.'
failures=0

can_i() {
  local namespace=$1 verb=$2 resource=$3 answer
  if answer=$(oc auth can-i "$verb" "$resource" -n "$namespace" --request-timeout=15s 2>/dev/null) && [[ "$answer" == yes ]]; then
    printf 'PERMISO %s %s %s: sí\n' "$namespace" "$verb" "$resource"
  else
    printf 'PENDIENTE %s %s %s: no permitido o no verificable\n' "$namespace" "$verb" "$resource"
    failures=$((failures + 1))
  fi
}

metadata() {
  local namespace=$1 resource=$2
  # La salida es solo nombre. Ni YAML completo ni datos de Secrets/ConfigMaps.
  if ! oc get "$resource" -n "$namespace" --request-timeout=15s -o name 2>/dev/null; then
    printf 'PENDIENTE: no se pudo listar %s en %s\n' "$resource" "$namespace"
    failures=$((failures + 1))
  fi
}

for namespace in "$build_namespace" "$runtime_namespace"; do
  printf '\nNamespace: %s\n' "$namespace"
  if ! oc get namespace "$namespace" --request-timeout=15s \
      -o 'jsonpath={.metadata.name}{" type="}{.metadata.labels.tenant\.paas\.redhat\.com/namespace-type}{"\n"}' 2>/dev/null; then
    echo 'PENDIENTE: no se pudo verificar el namespace o su tipo.'
    failures=$((failures + 1))
  fi
  metadata "$namespace" resourcequotas
  metadata "$namespace" appliedclusterresourcequotas.quota.openshift.io
  metadata "$namespace" limitranges
  metadata "$namespace" networkpolicies.networking.k8s.io
done

for resource in deployments.apps services persistentvolumeclaims configmaps \
    jobs.batch routes.route.openshift.io serviceaccounts \
    networkpolicies.networking.k8s.io; do
  can_i "$runtime_namespace" create "$resource"
done
can_i "$runtime_namespace" patch deployments.apps
can_i "$runtime_namespace" get pods
can_i "$runtime_namespace" get pods/log
can_i "$runtime_namespace" create pods/portforward

metadata "$build_namespace" pipelines.tekton.dev
metadata "$build_namespace" tasks.tekton.dev
can_i "$build_namespace" create pipelines.tekton.dev
can_i "$build_namespace" create pipelineruns.tekton.dev
can_i "$build_namespace" create tasks.tekton.dev

printf '\nComprobaciones pendientes o denegadas: %s\n' "$failures"
cat <<'EOF'
NO LISTO PARA DESPLEGAR: este diagnóstico no valida el webhook corporativo,
la admisión de pods, las imágenes permitidas, el push/pull al registro, las
cuotas disponibles, la clase de almacenamiento ni el acceso de red efectivo.
Completar la matriz de evidencia en openshift/PRERREQUISITOS.md.
La existencia de una API o un permiso de usuario no acredita permisos del pipeline.
EOF
# Siempre fail-closed: no usar como gate verde de despliegue ni envolverlo con || true.
exit 3

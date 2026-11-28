#!/usr/bin/env bash
# Shared guards for explicit maintenance commands, never source credentials.
set -euo pipefail
readonly runtime_namespace=nola-consulting-services-tenant--runtime-int
readonly expected_server='https://api.prod-scale-spoke1-dc-rdu3.prod-scale-mgmthub1-dc-rdu3.itup.redhat.com:6443'

runtime_oc() {
  [[ -n ${validated_context:-} ]] || { echo 'Primero valida el contexto.' >&2; return 2; }
  command oc --context="$validated_context" --server="$expected_server" "$@"
}

require_runtime_context() {
  command -v oc >/dev/null || { echo 'Falta el cliente oc.' >&2; exit 2; }
  validated_context=$(command oc config current-context)
  [[ -n "$validated_context" ]] || { echo 'No hay contexto activo.' >&2; exit 2; }
  readonly validated_context
  [[ $(command oc --context="$validated_context" whoami --show-server --request-timeout=15s) == "$expected_server" ]] || {
    echo 'El contexto no corresponde al clúster oficial esperado.' >&2; exit 2;
  }
  runtime_oc whoami --request-timeout=15s >/dev/null
}

require_encrypted_destination() {
  local output=$1 recipient=$2
  [[ "$output" == /* && "$output" == *.gpg && ! -e "$output" ]] || {
    echo 'Indica un archivo .gpg nuevo con ruta absoluta.' >&2; exit 2;
  }
  [[ -d $(dirname "$output") ]] || { echo 'El directorio de destino no existe.' >&2; exit 2; }
  [[ "$recipient" =~ ^([A-Fa-f0-9]{40}|[A-Fa-f0-9]{64})$ ]] || {
    echo 'Indica la huella completa de la clave pública GPG del destinatario.' >&2; exit 2;
  }
  command -v gpg >/dev/null || { echo 'Falta GPG.' >&2; exit 2; }
  gpg --batch --list-keys "$recipient" >/dev/null 2>&1 || {
    echo 'La clave pública del destinatario no está disponible en GPG.' >&2; exit 2;
  }
}

require_archive() {
  [[ $# -eq 1 && "$1" == /* && -f "$1" ]] || {
    echo 'Indica un archivo existente con ruta absoluta.' >&2; exit 2;
  }
}

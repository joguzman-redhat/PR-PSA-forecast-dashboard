#!/usr/bin/env bash
# Imprime un parche de imagen a partir de una entrega verificada; no modifica Git ni el clúster.
set -euo pipefail
if [[ $# -ne 1 || ! "$1" =~ ^forecast-build-push-[a-z0-9-]+$ ]]; then
  echo "Uso: $0 forecast-build-push-<sufijo>" >&2
  exit 2
fi
expected='https://api.prod-scale-spoke1-dc-rdu3.prod-scale-mgmthub1-dc-rdu3.itup.redhat.com:6443'
[[ $(oc whoami --show-server --request-timeout=15s) == "$expected" ]] || {
  echo 'Contexto de clúster incorrecto.' >&2; exit 2;
}
oc get pipelinerun "$1" -n nola-consulting-services-tenant--pipeline \
  --request-timeout=20s -o json | python3 -c '
import json, re, sys
r = json.load(sys.stdin)
if not any(c.get("type") == "Succeeded" and c.get("status") == "True" for c in r.get("status", {}).get("conditions", [])):
    raise SystemExit("La ejecución no terminó correctamente; no se genera parche.")
results = {v["name"]: v["value"].strip() for v in r["status"].get("results", [])}
image, commit = results.get("image", ""), results.get("commit", "")
if not re.fullmatch(r"images\.paas\.redhat\.com/nola-consulting-services-tenant/forecast-api@sha256:[0-9a-f]{64}", image):
    raise SystemExit("Resultado de imagen ausente o fuera del registro/repositorio esperado.")
if not re.fullmatch(r"[0-9a-f]{40}", commit):
    raise SystemExit("Resultado de commit inválido.")
patch = {"apiVersion": "apps/v1", "kind": "Deployment", "metadata": {"name": "forecast-api"},
         "spec": {"template": {"metadata": {"annotations": {"forecast.redhat.com/source-commit": commit}},
                               "spec": {"containers": [{"name": "api", "image": image}]}}}}
print(json.dumps(patch, indent=2))
'

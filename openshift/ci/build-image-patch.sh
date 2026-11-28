#!/usr/bin/env bash
# Imprime Kustomization con digest compartido API/migraciones; no modifica Git ni el clúster.
set -euo pipefail
if [[ $# -ne 1 || ! "$1" =~ ^forecast-build-push-[a-z0-9-]+$ ]]; then
  echo "Uso: $0 forecast-build-push-<sufijo>" >&2
  exit 2
fi
source "$(dirname "$0")/../operations/common.sh"
require_runtime_context
kustomization="$(dirname "$0")/../runtime/kustomization.yaml"
runtime_oc get pipelinerun "$1" -n nola-consulting-services-tenant--pipeline \
  --request-timeout=20s -o json | python3 -c '
import json, re, sys
try:
    import yaml
except ImportError:
    raise SystemExit("Se requiere PyYAML para actualizar Kustomization.")
r = json.load(sys.stdin)
if not any(c.get("type") == "Succeeded" and c.get("status") == "True" for c in r.get("status", {}).get("conditions", [])):
    raise SystemExit("La ejecución no terminó correctamente; no se genera parche.")
results = {v["name"]: v["value"].strip() for v in r["status"].get("results", [])}
image, commit = results.get("image", ""), results.get("commit", "")
if not re.fullmatch(r"images\.paas\.redhat\.com/nola-consulting-services-tenant/forecast-api@sha256:[0-9a-f]{64}", image):
    raise SystemExit("Resultado de imagen ausente o fuera del registro/repositorio esperado.")
if not re.fullmatch(r"[0-9a-f]{40}", commit):
    raise SystemExit("Resultado de commit inválido.")
with open(sys.argv[1], encoding="utf-8") as stream:
    document = yaml.safe_load(stream)
if document.get("kind") != "Kustomization" or not isinstance(document.get("images"), list):
    raise SystemExit("Kustomization desconocida: se requiere la lista images revisada.")
repository, digest = image.split("@", 1)
entries = [entry for entry in document["images"] if entry.get("name") == repository]
if len(entries) != 1:
    raise SystemExit("Se requiere una única transformación compartida para forecast-api.")
entry = entries[0]
if set(entry) - {"name", "newName", "newTag", "digest"} or entry.get("newName", repository) != repository:
    raise SystemExit("Transformación API desconocida; revisar manualmente.")
entry.pop("newTag", None)
entry["digest"] = digest
print("# Entrega verificada desde commit " + commit)
print(yaml.safe_dump(document, sort_keys=False), end="")
' "$kustomization"

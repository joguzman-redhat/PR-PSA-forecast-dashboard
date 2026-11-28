#!/usr/bin/env bash
# Conserva las reglas existentes; agrega solo HTTPS a las fuentes de esta CI.
set -euo pipefail
mode=${1:---dry-run}
if [[ $# -gt 1 || ( "$mode" != --dry-run && "$mode" != --apply ) ]]; then
  echo "Uso: $0 [--dry-run|--apply]" >&2
  exit 2
fi
expected='https://api.prod-scale-spoke1-dc-rdu3.prod-scale-mgmthub1-dc-rdu3.itup.redhat.com:6443'
[[ $(oc whoami --show-server --request-timeout=15s) == "$expected" ]] || {
  echo 'Contexto de clúster incorrecto.' >&2; exit 2;
}
umask 077
temp_dir=$(mktemp -d)
trap 'rm -rf "$temp_dir"' EXIT
namespace=nola-consulting-services-tenant--pipeline
oc get tenantegress default -n "$namespace" --request-timeout=15s -o json > "$temp_dir/current.json"
python3 - "$temp_dir/current.json" "$temp_dir/patch.json" <<'PY'
import json, sys
from pathlib import Path
current = json.loads(Path(sys.argv[1]).read_text())
rules = current['spec']['egress']
if not rules or rules[-1].get('type') != 'Deny' or rules[-1].get('to', {}).get('cidrSelector') != '0.0.0.0/0':
    raise SystemExit('Revisar política: falta Deny final. No se aplicaron cambios.')
patch = [{'op': 'test', 'path': '/metadata/resourceVersion', 'value': current['metadata']['resourceVersion']}]
index = len(rules) - 1
for host in ('github.com', 'registry.npmjs.org', 'registry.access.redhat.com', 'access.redhat.com'):
    ports = [{'port': 443, 'protocol': 'TCP'}]
    if any(r.get('type') == 'Allow' and r.get('to', {}).get('dnsName') == host
           and (not r.get('ports') or all(p in r['ports'] for p in ports)) for r in rules):
        continue
    patch.append({'op': 'add', 'path': f'/spec/egress/{index}',
                  'value': {'type': 'Allow', 'to': {'dnsName': host}, 'ports': ports}})
    index += 1
Path(sys.argv[2]).write_text(json.dumps(patch))
PY
options=()
[[ "$mode" == --apply ]] || options+=(--dry-run=server)
oc patch tenantegress default -n "$namespace" --type=json \
  --patch-file="$temp_dir/patch.json" "${options[@]}" --request-timeout=20s -o name

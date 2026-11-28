#!/usr/bin/env bash
# Compara el front entre el arbol de trabajo y REF_BASE (por defecto HEAD) en
# modo demo, sin contenedores ni base de datos. Ver docs/VERIFICAR_FRONT.md.
set -u
REF_BASE="${1:-HEAD}"
RAIZ="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
PA_DEMO="DEMO-001"
VISTAS=(inicio trazabilidad pms detalle)
RUTAS=("/" "/#trazabilidad" "/#pms" "/#detalle/$PA_DEMO")

CHROME="$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)"
[ -n "$CHROME" ] || { echo "No hay google-chrome ni chromium en el PATH" >&2; exit 2; }

TMP="$(mktemp -d)"
WT="$TMP/base"
PIDS=()
limpiar() {
  for pid in "${PIDS[@]:-}"; do [ -n "$pid" ] && kill "$pid" 2>/dev/null; done
  git -C "$RAIZ" worktree remove --force "$WT" 2>/dev/null
  rm -rf "$TMP"
}
trap limpiar EXIT

git -C "$RAIZ" worktree add --detach "$WT" "$REF_BASE" >/dev/null 2>&1 \
  || { echo "No se pudo crear el worktree de $REF_BASE" >&2; exit 2; }

puerto_libre() {
  local p=$1
  while ss -ltn | grep -q ":$p "; do p=$((p + 1)); done
  echo "$p"
}
PUERTO_BASE="$(puerto_libre 3200)"
PUERTO_ACTUAL="$(puerto_libre $((PUERTO_BASE + 1)))"

servir() { # arbol puerto
  FORECAST_DEMO=true PORT="$2" PUBLIC_DIR="$1" node "$RAIZ/infra/api/src/server.js" >"$TMP/servidor-$2.log" 2>&1 &
  PIDS+=("$!")
}
servir "$WT" "$PUERTO_BASE"
servir "$RAIZ" "$PUERTO_ACTUAL"
for p in "$PUERTO_BASE" "$PUERTO_ACTUAL"; do
  for _ in $(seq 50); do curl -sf "http://127.0.0.1:$p/health/live" >/dev/null && break; sleep 0.2; done
  curl -sf "http://127.0.0.1:$p/health/live" >/dev/null || { echo "El servidor del puerto $p no arranco" >&2; exit 2; }
done

# Las etiquetas link/script que apuntan a archivos del front se igualan para tolerar renombres.
normalizar() {
  sed -E 's#<(link|script)[^>]*(href|src)="(\./)?(css|js)/[^"]*"[^>]*>#<\1 front>#g' "$1"
}

capturar() { # lado puerto vista ruta
  local lado=$1 puerto=$2 vista=$3 ruta=$4 perfil
  perfil="$(mktemp -d "$TMP/perfil-XXXX")"
  local comun=(--headless=new --no-sandbox --disable-gpu --user-data-dir="$perfil" --virtual-time-budget=20000
    --enable-logging=stderr --v=0 --hide-scrollbars)
  "$CHROME" "${comun[@]}" --dump-dom "http://127.0.0.1:$puerto$ruta" >"$TMP/$lado-$vista.dom" 2>"$TMP/$lado-$vista.log"
  "$CHROME" "${comun[@]}" --window-size=1400,3000 --screenshot="$TMP/$lado-$vista.png" \
    "http://127.0.0.1:$puerto$ruta" >/dev/null 2>>"$TMP/$lado-$vista.log"
  normalizar "$TMP/$lado-$vista.dom" >"$TMP/$lado-$vista.norm"
}

diferencias=0
for i in "${!VISTAS[@]}"; do
  v="${VISTAS[$i]}"
  capturar base "$PUERTO_BASE" "$v" "${RUTAS[$i]}"
  capturar actual "$PUERTO_ACTUAL" "$v" "${RUTAS[$i]}"
  [ -s "$TMP/actual-$v.dom" ] || { echo "[$v] sin DOM: Chrome no devolvio la pagina"; diferencias=1; continue; }
  dom=identico; img=identica; extra=""
  cmp -s "$TMP/base-$v.norm" "$TMP/actual-$v.norm" || { dom=DISTINTO; diferencias=1; }
  if ! cmp -s "$TMP/base-$v.png" "$TMP/actual-$v.png"; then
    img=DISTINTA
    if command -v compare >/dev/null; then
      ae="$(compare -metric AE "$TMP/base-$v.png" "$TMP/actual-$v.png" null: 2>&1 | head -1)"
      extra=" (pixeles distintos: $ae)"
      [ "${ae%% *}" = "0" ] && { img=identica; extra=" (bytes distintos, 0 pixeles distintos)"; }
    fi
    [ "$img" = DISTINTA ] && diferencias=1
  fi
  errores=0
  for lado in base actual; do
    n="$(grep -cE ':(ERROR|WARNING):CONSOLE|Uncaught' "$TMP/$lado-$v.log")"
    errores=$((errores + n))
    [ "$n" -gt 0 ] && { echo "[$v] errores de consola en $lado:"; grep -E ':(ERROR|WARNING):CONSOLE|Uncaught' "$TMP/$lado-$v.log" | head -5; }
  done
  [ "$errores" -gt 0 ] && diferencias=1
  echo "[$v] DOM: $dom | captura: $img$extra | errores de consola: $errores"
  if [ "$dom" = DISTINTO ]; then diff <(cat "$TMP/base-$v.norm") <(cat "$TMP/actual-$v.norm") | head -10; fi
done

if [ "$diferencias" -eq 0 ]; then echo "Resultado: sin diferencias ($REF_BASE vs arbol de trabajo)"; else echo "Resultado: HAY diferencias o errores ($REF_BASE vs arbol de trabajo)"; fi
exit "$diferencias"

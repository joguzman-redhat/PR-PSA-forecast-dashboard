#!/usr/bin/env bash
# =============================================================================
# Despliegue n8n (Podman) + ngrok
# Fedora / RHEL — usuario no root
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

# El authtoken de ngrok (y cualquier otro secreto local) vive en .env, que no
# se sube a git. Ver .env.example para la lista de variables esperadas.
[ -f .env ] && set -a && source .env && set +a
: "${NGROK_AUTHTOKEN:?Falta NGROK_AUTHTOKEN. Ponlo en infra/.env (copia infra/.env.example) con tu authtoken de https://dashboard.ngrok.com/get-started/your-authtoken}"

# ── Variables ─────────────────────────────────────────────────────────────────
N8N_VERSION="latest"
N8N_PORT=5678
DASHBOARDS_DIR="${HOME}/.n8n-data/dashboards"
TIMEZONE="America/Mexico_City"
# Nota: los datos internos de n8n van en volumen nombrado Podman (permisos automáticos)

# ── 1. Volumen y directorios ─────────────────────────────────────────────────
echo "[1/5] Preparando volumen y directorios..."
podman volume create n8n-data 2>/dev/null || echo "   Volumen n8n-data ya existe"
mkdir -p "${DASHBOARDS_DIR}"
chmod 777 "${DASHBOARDS_DIR}"   # permisos abiertos: solo archivos HTML generados

# Servidor HTTP estático para los dashboards (puerto 8081, solo localhost).
# Necesario porque dashboard.html hace fetch() de dashboard_data.json en la
# misma carpeta, y los navegadores bloquean fetch() sobre archivos file://.
DASHBOARD_HTTP_PORT=8081
pkill -f "http.server ${DASHBOARD_HTTP_PORT} --directory" 2>/dev/null || true
sleep 1
setsid nohup python3 -m http.server "${DASHBOARD_HTTP_PORT}" \
  --directory "${DASHBOARDS_DIR}" --bind 127.0.0.1 \
  > /tmp/dashboard-server.log 2>&1 < /dev/null &
disown
echo "   Servidor de dashboards: http://localhost:${DASHBOARD_HTTP_PORT}/"

# ── 2. ngrok ──────────────────────────────────────────────────────────────────
echo "[2/5] Configurando ngrok..."

if ! command -v ngrok &>/dev/null; then
  echo "   ngrok no encontrado. Instalando para Fedora/RHEL..."
  # Para otras distros ver: https://ngrok.com/download
  curl -sSLo /tmp/ngrok.tgz \
    "https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-amd64.tgz"
  tar xzf /tmp/ngrok.tgz -C "${HOME}/.local/bin/" ngrok 2>/dev/null \
    || { mkdir -p "${HOME}/.local/bin"; tar xzf /tmp/ngrok.tgz -C "${HOME}/.local/bin/"; }
  export PATH="${HOME}/.local/bin:${PATH}"
  rm /tmp/ngrok.tgz
fi

ngrok config add-authtoken "${NGROK_AUTHTOKEN}"

# ── 3. Túnel ngrok en background (ANTES de levantar n8n) ──────────────────────
# Necesitamos la URL pública de ngrok para inyectarla como WEBHOOK_URL al
# contenedor; si no, n8n genera los webhooks apuntando a localhost y Google
# Drive / OAuth2 no pueden llamarlos de vuelta.
echo "[3/5] Iniciando túnel ngrok..."
pkill -f "ngrok http" 2>/dev/null || true
sleep 1
nohup ngrok http "${N8N_PORT}" \
  --log=stdout \
  --log-format=json \
  > /tmp/ngrok-n8n.log 2>&1 &

echo "   Esperando URL pública de ngrok..."
NGROK_URL=""
for i in $(seq 1 15); do
  NGROK_URL=$(curl -s http://localhost:4040/api/tunnels \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['tunnels'][0]['public_url'])" 2>/dev/null || true)
  [ -n "${NGROK_URL}" ] && break
  sleep 1
done

if [ -z "${NGROK_URL}" ]; then
  echo "   ERROR: no se pudo obtener la URL de ngrok. Revisa /tmp/ngrok-n8n.log"
  exit 1
fi
echo "   Túnel ngrok activo: ${NGROK_URL}"

# ── 4. Contenedor n8n ─────────────────────────────────────────────────────────
echo "[4/5] Levantando contenedor n8n..."

# n8n se conecta a LiteLLM por nombre de contenedor (http://litellm:4000), no
# por host.containers.internal: en Podman rootless con red "pasta" (default
# sin --network explicito) ese gateway especial dejo de aceptar conexiones al
# puerto 4000 tras recrear contenedores, y el nodo HTTP Request de n8n se
# quedaba colgado hasta hacer timeout (120s) en vez de fallar rapido. Unir
# ambos contenedores a la red bridge de LiteLLM evita depender de ese gateway.
if ! podman network exists litellm_litellm_network 2>/dev/null; then
  echo "   ERROR: la red 'litellm_litellm_network' no existe. Levanta primero el stack de LiteLLM"
  echo "   (docker-compose/podman-compose en ~/Documents/LiteLLM) antes de correr este script."
  exit 1
fi

# Detener y eliminar contenedor previo si existe
podman rm -f n8n 2>/dev/null || true

podman run -d \
  --name n8n \
  --restart unless-stopped \
  --network litellm_litellm_network \
  -p "${N8N_PORT}:5678" \
  -v "n8n-data:/home/node/.n8n:z" \
  -v "${DASHBOARDS_DIR}:/home/node/dashboards:z" \
  -e N8N_PORT=5678 \
  -e N8N_PROTOCOL=http \
  -e N8N_HOST=localhost \
  -e N8N_PUSH_BACKEND=websocket \
  -e WEBHOOK_URL="${NGROK_URL}/" \
  -e GENERIC_TIMEZONE="${TIMEZONE}" \
  -e N8N_LOG_LEVEL=info \
  -e EXECUTIONS_DATA_SAVE_ON_ERROR=all \
  -e EXECUTIONS_DATA_SAVE_ON_SUCCESS=all \
  -e EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=true \
  -e N8N_METRICS=true \
  -e N8N_RESTRICT_FILE_ACCESS_TO="/home/node/dashboards;~/.n8n-files" \
  "docker.io/n8nio/n8n:${N8N_VERSION}"

# n8n tiene que hablar con el Postgres de Cloud Forecast, que vive en la red
# del compose de infra/ y se publica solo en 127.0.0.1 (no expuesto a la LAN).
# Como este script recrea el contenedor, un `podman network connect` hecho a
# mano se perderia: hay que rehacerlo aqui en cada despliegue.
if podman network exists infra_default 2>/dev/null; then
  podman network connect infra_default n8n 2>/dev/null \
    && echo "   n8n conectado a infra_default (Postgres en 'postgres:5432')" \
    || echo "   n8n ya estaba en infra_default"
else
  echo "   AVISO: la red 'infra_default' no existe todavia. Levanta el stack de"
  echo "   Cloud Forecast con 'cd infra && ./forecast.sh up' y vuelve a conectar:"
  echo "     podman network connect infra_default n8n"
fi

echo "   Esperando a que n8n inicie (15 s)..."
sleep 15

podman inspect --format '{{.State.Status}}' n8n | grep -q running \
  && echo "   n8n corriendo OK" \
  || { echo "   ERROR: n8n no arrancó. Revisa: podman logs n8n"; exit 1; }

# ── 5. Resumen ────────────────────────────────────────────────────────────────
echo ""
echo "[5/5] Despliegue completado"
echo "========================================="
echo "  n8n local:   http://localhost:${N8N_PORT}"
echo "  ngrok URL:   ${NGROK_URL}"
echo "  Dashboards:  ${DASHBOARDS_DIR}
  Datos n8n:   podman volume inspect n8n-data"
echo "========================================="
echo ""
echo "PRÓXIMOS PASOS:"
echo "  1. Abre http://localhost:${N8N_PORT} y crea usuario admin"
echo "  2. Importa los flujos desde flows/"
echo "  3. Configura credenciales según docs/credentials_guide.md"
echo "  4. Copia la URL ngrok a los webhooks de Google Drive si es necesario"
echo ""
echo "IMPORTANTE: la URL de ngrok gratis cambia cada vez que se reinicia el túnel,"
echo "y queda fija en WEBHOOK_URL dentro del contenedor n8n al crearlo. Si solo"
echo "corres 'ngrok http ${N8N_PORT}' tras un reinicio, n8n seguirá anunciando la"
echo "URL vieja. Vuelve a correr este script completo para regenerar ambos."
echo ""
echo "Comandos útiles:"
echo "  podman logs -f n8n          # Ver logs en tiempo real"
echo "  podman stop n8n             # Detener n8n"
echo "  podman start n8n            # Iniciar n8n"
echo "  curl http://localhost:4040/api/tunnels  # Ver URL ngrok activa"

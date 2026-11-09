#!/usr/bin/env bash
# Manejo del stack de Cloud Forecast: Postgres + API/dashboard + n8n + nginx.
# Todo vive en el mismo docker-compose.yml, un solo comando.
#
#   ./forecast.sh up       levanta postgres, api, n8n, nginx
#   ./forecast.sh public   lo mismo + ngrok (tunel publico para n8n)
#   ./forecast.sh seed     carga los JSON del PoC a Postgres
#   ./forecast.sh clean    borra todos los registros (schema y volumen intactos)
#   ./forecast.sh rebuild  reconstruye la imagen de la API y recrea el contenedor
#   ./forecast.sh logs     sigue los logs de la API
#   ./forecast.sh psql     abre una consola SQL
#   ./forecast.sh down     apaga (los volumenes de datos se conservan)
set -euo pipefail
cd "$(dirname "$0")"

# Para que los echos de abajo reflejen lo que de verdad va a usar
# podman-compose (que lee .env solo), lo cargamos tambien aqui.
[ -f .env ] && set -a && source .env && set +a

case "${1:-up}" in
  up)
    podman-compose up -d
    echo
    echo "Dashboard -> http://localhost:${API_PORT:-3000}/"
    echo "API       -> http://localhost:${API_PORT:-3000}/api/proyectos"
    echo "n8n       -> http://localhost:${N8N_NGINX_PORT:-8080}/  (via nginx)"
    echo "           http://localhost:${N8N_PORT:-5678}/  (directo, sin nginx)"
    ;;

  public)
    podman-compose --profile public up -d
    echo
    echo "Dashboard -> http://localhost:${API_PORT:-3000}/"
    echo "n8n       -> http://localhost:${N8N_NGINX_PORT:-8080}/  (local)"
    if [ -n "${NGROK_DOMAIN:-}" ]; then
      echo "n8n       -> https://${NGROK_DOMAIN}/  (publico, ngrok)"
    else
      echo "n8n (publico) -> esperando URL de ngrok..."
      # La API web de ngrok dentro del contenedor solo escucha en loopback
      # interno (no hay como mapearla al host), asi que la URL se lee del
      # log de arranque en vez de pegarle a :4040.
      NGROK_URL=""
      for i in $(seq 1 15); do
        NGROK_URL=$(podman logs forecast-ngrok 2>&1 | grep '"started tunnel"' | tail -1 \
          | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['url'])" 2>/dev/null || true)
        [ -n "${NGROK_URL}" ] && break
        sleep 1
      done
      if [ -n "${NGROK_URL}" ]; then
        echo "n8n (publico) -> ${NGROK_URL}/"
      else
        echo -e "\rn8n (publico) -> no respondio a tiempo, revisa: podman logs forecast-ngrok"
      fi
    fi
    ;;

  rebuild)
    podman-compose build api
    # `podman-compose up --build` reusa el contenedor viejo aunque la imagen
    # cambie, y uno termina probando codigo que ya no existe. Recrear es la
    # unica forma de que el cambio entre.
    podman rm -f forecast-api >/dev/null 2>&1 || true
    podman-compose up -d api
    ;;

  seed)
    podman exec forecast-api node src/seed.js
    curl -fsS -X POST "http://localhost:${API_PORT:-3000}/api/reload" >/dev/null \
      && echo "cache de historia invalidada"
    ;;

  clean)
    # Borra todos los registros pero mantiene el schema y el volumen.
    podman exec forecast-postgres psql -U "${POSTGRES_USER:-forecast}" -d "${POSTGRES_DB:-forecast}" \
      -c "TRUNCATE movimiento, revenue_anual, revenue_mes, proyecto, carga CASCADE;"
    echo "✓ Registros eliminados (schema y volumen intactos)"
    curl -fsS -X POST "http://localhost:${API_PORT:-3000}/api/reload" >/dev/null 2>&1 || true
    echo "✓ Cache de historia invalidada"
    ;;

  migrate)
    # Aplica todas las migraciones en orden (idempotentes)
    for sql in db/migraciones/*.sql; do
      [ -f "$sql" ] || continue
      echo "Aplicando $(basename "$sql")..."
      podman exec -i forecast-postgres psql -U "${POSTGRES_USER:-forecast}" -d "${POSTGRES_DB:-forecast}" < "$sql"
    done
    echo "✓ Migraciones aplicadas"
    ;;
  logs)    podman-compose logs -f api ;;
  psql)    podman exec -it forecast-postgres psql -U "${POSTGRES_USER:-forecast}" -d "${POSTGRES_DB:-forecast}" ;;
  # --profile public para que tambien apague/borre ngrok si estaba arriba.
  down)    podman-compose --profile public down ;;
  destroy) podman-compose --profile public down -v ;;   # borra tambien el historico
  *)       echo "uso: $0 {up|public|rebuild|seed|migrate|logs|psql|down|destroy|clean}" >&2; exit 1 ;;
esac

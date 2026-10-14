#!/usr/bin/env bash
# Manejo del stack de Cloud Forecast: Postgres + API/dashboard + n8n + nginx.
#
#   ./forecast.sh up       levanta todo (postgres, api, n8n, nginx)
#   ./forecast.sh seed     carga los JSON del PoC a Postgres
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

  logs)    podman-compose logs -f api ;;
  psql)    podman exec -it forecast-postgres psql -U "${POSTGRES_USER:-forecast}" -d "${POSTGRES_DB:-forecast}" ;;
  down)    podman-compose down ;;
  destroy) podman-compose down -v ;;   # borra tambien el historico
  *)       echo "uso: $0 {up|rebuild|seed|logs|psql|down|destroy}" >&2; exit 1 ;;
esac

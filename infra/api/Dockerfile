FROM registry.access.redhat.com/ubi9/nodejs-22:latest

USER 0

WORKDIR /app

# Build context es el root del repo (no infra/api/): asi la imagen puede
# empaquetar tambien el dashboard estatico, que OpenShift no puede montar en
# tiempo de ejecucion como hace el bind-mount de Podman Compose.
COPY infra/api/package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY infra/api/src ./src
COPY infra/db/init ./db/init
COPY infra/db/migraciones ./db/migraciones
COPY infra/db/runtime ./db/runtime
COPY index.html ./public/
COPY css ./public/css
COPY js ./public/js
COPY vendor ./public/vendor

ENV FORECAST_DB_DIR=/app/db

USER 1001

EXPOSE 3000
CMD ["node", "src/server.js"]

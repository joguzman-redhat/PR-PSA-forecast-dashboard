FROM docker.io/library/node:22-alpine

WORKDIR /app

# Build context es el root del repo (no infra/api/): asi la imagen puede
# empaquetar tambien el dashboard estatico, que OpenShift no puede montar en
# tiempo de ejecucion como hace el bind-mount de Podman Compose.
COPY infra/api/package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY infra/api/src ./src
COPY index.html app.js styles.css ./public/
COPY vendor ./public/vendor

EXPOSE 3000
CMD ["node", "src/server.js"]

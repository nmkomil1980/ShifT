FROM node:24-alpine
WORKDIR /app

# Install production dependencies (pg, web-push). Copy manifests first so the
# npm layer is cached when only source changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY assets ./assets

RUN mkdir -p /app/data && chown -R node:node /app
USER node

ENV HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/app/data/shiftflow.db NODE_ENV=production
EXPOSE 3000
VOLUME ["/app/data"]

HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "src/server.js"]

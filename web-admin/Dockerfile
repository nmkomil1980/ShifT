# --- build the React app ---
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Optional Sentry DSN baked in at build time (empty -> monitoring disabled).
ARG VITE_SENTRY_DSN=""
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
RUN npm run build

# --- serve static files + reverse-proxy /api via Caddy (automatic HTTPS) ---
FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443

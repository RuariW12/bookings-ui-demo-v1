# Build context is the repo root (interface-v1/), so paths are repo-relative.

# --- build the SPA -----------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

COPY bookings-ui/package*.json ./
RUN npm ci

COPY bookings-ui/ ./

# Entra config is compiled into the bundle at build time (public SPA, no secret).
ARG VITE_ENTRA_CLIENT_ID
ARG VITE_ENTRA_TENANT_ID
ARG VITE_REDIRECT_URI
RUN npm run build

# --- serve with Caddy (auto-HTTPS) -------------------------------------------
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
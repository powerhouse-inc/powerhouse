# ============================================================
# Base stage: node + pnpm + ph-cmd + initialized project
# ============================================================
FROM node:24-alpine AS base

WORKDIR /app

RUN apk add --no-cache python3 make g++ git bash \
    && ln -sf /usr/bin/python3 /usr/bin/python

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

RUN pnpm config set @jsr:registry https://npm.jsr.io

ARG TAG=latest
RUN pnpm add -g ph-cmd@$TAG prettier

RUN case "$TAG" in \
        *dev*) ph init project --dev --package-manager pnpm ;; \
        *staging*) ph init project --staging --package-manager pnpm ;; \
        *) ph init project --package-manager pnpm ;; \
    esac

# ============================================================
# Connect build stage: build vanilla SPA (no packages)
# ============================================================
FROM base AS connect-build

ARG PH_CONNECT_BASE_PATH="/"

WORKDIR /app/project
RUN ph connect build --base ${PH_CONNECT_BASE_PATH}

# ============================================================
# Connect target: nginx serving static files
# ============================================================
FROM nginx:alpine AS connect

RUN apk add --no-cache gettext

COPY docker/nginx.conf.template /etc/nginx/nginx.conf.template
COPY --from=connect-build /app/project/.ph/connect-build/dist /var/www/html/project
COPY docker/connect-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENV PORT=3001
ENV PH_CONNECT_BASE_PATH="/"
ENV PH_REGISTRY_PACKAGES=""
ENV PH_REGISTRY_URL="https://registry.dev.vetra.io"
ENV PH_PACKAGE_REGISTRY_URL=""

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:${PORT}/health || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]

# ============================================================
# Switchboard target: node running ph switchboard
# ============================================================
FROM node:24-alpine AS switchboard

WORKDIR /app

RUN apk add --no-cache curl

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

RUN pnpm config set @jsr:registry https://npm.jsr.io

ARG TAG=latest
RUN pnpm add -g ph-cmd@$TAG

COPY --from=base /app/project /app/project

WORKDIR /app/project

COPY docker/switchboard-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000
ENV PH_REGISTRY_PACKAGES=""
ENV PH_REGISTRY_URL="https://registry.dev.vetra.io"
ENV PH_PACKAGE_REGISTRY_URL=""

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]

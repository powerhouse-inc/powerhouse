# ============================================================
# Base stage: node + pnpm + ph-cmd + initialized project
# ============================================================
FROM node:24-alpine AS base

WORKDIR /app

RUN apk add --no-cache python3 make g++ git bash \
    && ln -sf /usr/bin/python3 /usr/bin/python

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

RUN pnpm config set @jsr:registry https://npm.jsr.io \
 && pnpm config set minimum-release-age 0

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
# Bakes the packages registry URL into the dist powerhouse.config.json as the
# top-level `packageRegistryUrl` the SPA reads at runtime. Without it the field
# is absent and Connect's package manager fetches nothing (registryUrl === null
# short-circuits useRegistryPackages). Overridable via --build-arg.
ARG PH_CONNECT_PACKAGES_REGISTRY="https://registry.dev.vetra.io"

WORKDIR /app/project
RUN ph connect build --base ${PH_CONNECT_BASE_PATH} --packages-registry ${PH_CONNECT_PACKAGES_REGISTRY}

# ============================================================
# Connect target: nginx serving static files (runs as non-root)
# ============================================================
FROM nginx:alpine AS connect

# Install envsubst for config templating, and chown the nginx runtime
# directories so the built-in `nginx` user (UID 101) can write the
# rendered config, the pid file, and runtime caches. Pod can then run
# with runAsNonRoot: true, runAsUser: 101.
RUN apk add --no-cache gettext jq && \
    chown -R nginx:nginx /etc/nginx /var/cache/nginx /var/log/nginx && \
    touch /var/run/nginx.pid && chown nginx:nginx /var/run/nginx.pid

COPY --chown=nginx:nginx docker/nginx.conf.template /etc/nginx/nginx.conf.template
COPY --chown=nginx:nginx --from=connect-build /app/project/.ph/connect-build/dist /var/www/html/project
COPY --chown=nginx:nginx docker/connect-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

USER nginx

ENV PORT=3001
ENV PH_CONNECT_BASE_PATH="/"

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:${PORT}/health || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]

# ============================================================
# Switchboard target: node running @powerhousedao/switchboard
# ============================================================
FROM node:24-alpine AS switchboard

WORKDIR /app

RUN apk add --no-cache curl git

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate \
 && pnpm config set minimum-release-age 0

ARG TAG=latest
ARG GIT_SHA=unknown
RUN echo '{"name":"app","version":"1.0.0","type":"module","private":true}' > package.json \
 && printf 'allowBuilds:\n  "@apollo/protobufjs": true\n  "@parcel/watcher": true\n  esbuild: true\n  protobufjs: true\n  "@datadog/pprof": true\n' > pnpm-workspace.yaml \
 && pnpm add --shamefully-hoist @powerhousedao/switchboard@$TAG

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

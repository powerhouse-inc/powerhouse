# syntax=docker/dockerfile:1
# Multi-stage Dockerfile for the test-package-e2e flow.
# Produces two images, `connect` and `switchboard`, both built on a base that
# scaffolds a Powerhouse project and installs the package published to the
# host registry (reached via host.docker.internal).
#
# Build:
#   docker build --target connect    -t test-pkg-e2e-connect    .
#   docker build --target switchboard -t test-pkg-e2e-switchboard .

# -----------------------------------------------------------------------------
# Base: scaffold project + install the published package
# -----------------------------------------------------------------------------
FROM node:24-alpine AS base

WORKDIR /app

RUN apk add --no-cache python3 make g++ git bash curl \
    && ln -sf /usr/bin/python3 /usr/bin/python

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

# Channel for the project's @powerhousedao/* deps. Pass --build-arg TAG=staging
# (or latest) to switch. "dev" matches publish-package.ts default.
ARG TAG=dev
ARG PACKAGE_NAME=test-todo-package
ARG REGISTRY_URL=http://host.docker.internal:8080

# Route every install through the local registry (which uplinks to npmjs).
RUN echo "registry=${REGISTRY_URL}/" > /root/.npmrc

# Install ph-cmd globally. Use --no-frozen-lockfile semantics by relying on
# pnpm's default; this is a throwaway image so we don't pin a lockfile.
RUN pnpm add -g ph-cmd@${TAG}

# Scaffold a fresh consumer project.
RUN case "$TAG" in \
        *dev*) ph init project --dev --pnpm ;; \
        *staging*) ph init project --staging --pnpm ;; \
        *) ph init project --pnpm ;; \
    esac

WORKDIR /app/project

# CACHEBUST invalidates just the install layer below, so a re-run picks up a
# freshly published `test-todo-package@1.0.0` even though the version string
# didn't change. Pass --build-arg CACHEBUST=$(date +%s) (or any unique
# value) from the orchestrator. Earlier layers stay cached.
ARG CACHEBUST=0
RUN echo "cachebust=${CACHEBUST}" > /dev/null

# Register the package without --local — Switchboard loads it from the
# registry over HTTP at runtime, and Connect fetches it in the browser via
# ph-packages.json. ph install only writes powerhouse.config.json here:
#   - packageRegistryUrl: ${REGISTRY_URL}  (reached as host.docker.internal
#     from inside this container at runtime)
#   - packages[].provider = "registry"
RUN ph install "${PACKAGE_NAME}" --registry "${REGISTRY_URL}"

# -----------------------------------------------------------------------------
# Connect: build static assets and serve via nginx
# -----------------------------------------------------------------------------
FROM base AS connect-builder

ARG PH_CONNECT_BASE_PATH="/"
# powerhouse.config.json holds the container-side URL (host.docker.internal),
# which the browser running on the host can't resolve. PH_CONNECT_PACKAGES_REGISTRY
# overrides what gets baked into ph-packages.json — the browser uses this
# URL to fetch the package from the registry at runtime.
ARG BROWSER_REGISTRY_URL=http://localhost:8080
ENV PH_CONNECT_PACKAGES_REGISTRY=${BROWSER_REGISTRY_URL}
RUN ph connect build --base ${PH_CONNECT_BASE_PATH}

FROM nginx:alpine AS connect
RUN apk add --no-cache gettext

COPY docker/nginx.conf /etc/nginx/nginx.conf.template
COPY --from=connect-builder /app/project/.ph/connect-build/dist /var/www/html/project

ENV PORT=3001
ENV PH_CONNECT_BASE_PATH="/"

COPY docker/connect-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["/docker-entrypoint.sh"]

# -----------------------------------------------------------------------------
# Switchboard: node runtime
# -----------------------------------------------------------------------------
FROM base AS switchboard

# PH_REGISTRY_URL overrides powerhouse.config.json's packageRegistryUrl
# (which `ph init` defaults to the public dev registry — `ph install` won't
# overwrite an existing value). With this set, the HTTP package loader pulls
# `test-todo-package` from our local registry on the host.
ARG REGISTRY_URL=http://host.docker.internal:8080
ENV PH_REGISTRY_URL=${REGISTRY_URL}
# `ph switchboard --port 4001` starts the server. The default drive is created
# automatically; remote drives can also be created via GraphQL at runtime.
ENV PORT=4001
ENV NODE_ENV=production

EXPOSE 4001
CMD ["sh", "-c", "ph switchboard --port ${PORT}"]

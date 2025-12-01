FROM node:22-alpine AS build

# Install dependencies
RUN apk update && apk add git curl

WORKDIR /app

# Set up pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack install --global pnpm@10.22.0
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# Environment variables
ENV HUSKY=0

# Heroku sets PORT at runtime
ARG PORT=3000
ENV PORT=$PORT

# Build arguments for configuration
ARG TAG=latest
ARG PH_PACKAGES=""
ARG PH_CONNECT_BASE_PATH=""
ARG PH_CONNECT_SENTRY_DSN=""
ARG PH_CONNECT_SENTRY_ENV=""
ARG PH_CONNECT_SENTRY_AUTH_TOKEN=""
ARG PH_CONNECT_SENTRY_ORG=""
ARG PH_CONNECT_SENTRY_PROJECT=""

ENV TAG=$TAG
ENV PH_PACKAGES=$PH_PACKAGES
ENV PH_CONNECT_SENTRY_DSN=$PH_CONNECT_SENTRY_DSN
ENV PH_CONNECT_SENTRY_ENV=$PH_CONNECT_SENTRY_ENV
ENV PH_CONNECT_SENTRY_AUTH_TOKEN=$PH_CONNECT_SENTRY_AUTH_TOKEN
ENV PH_CONNECT_SENTRY_ORG=$PH_CONNECT_SENTRY_ORG
ENV PH_CONNECT_SENTRY_PROJECT=$PH_CONNECT_SENTRY_PROJECT

# Install ph-cmd
RUN pnpm add -g ph-cmd@$TAG

# Initialize project based on tag
RUN ph init project --$TAG --pnpm

WORKDIR /app/project

# Install additional Powerhouse packages if specified
RUN if [ -n "$PH_PACKAGES" ]; then \
        set -euxo pipefail && \
        PKGS=$(echo "$PH_PACKAGES" | tr ',' ' ') && \
        echo "Installing Powerhouse packages: $PKGS" && \
        ph install $PKGS; \
    fi

# Normalize base path and build Connect in a single RUN command
# This ensures the normalized path is used by Vite during the build
RUN NORMALIZED_BASE_PATH="${PH_CONNECT_BASE_PATH:-/}" && \
    NORMALIZED_BASE_PATH="${NORMALIZED_BASE_PATH#.}" && \
    if [ "${NORMALIZED_BASE_PATH#/}" = "$NORMALIZED_BASE_PATH" ]; then \
        NORMALIZED_BASE_PATH="/$NORMALIZED_BASE_PATH"; \
    fi && \
    if [ "${NORMALIZED_BASE_PATH%/}" = "$NORMALIZED_BASE_PATH" ]; then \
        NORMALIZED_BASE_PATH="$NORMALIZED_BASE_PATH/"; \
    fi && \
    export PH_CONNECT_BASE_PATH="$NORMALIZED_BASE_PATH" && \
    echo "Building Connect with base path: $PH_CONNECT_BASE_PATH" && \
    ph connect build

# Production stage with nginx (using fholzer/nginx-brotli for Brotli support)
FROM fholzer/nginx-brotli:latest

# Install gettext for runtime envsubst and bash for entrypoint
RUN apk add --no-cache gettext bash

# Copy built application
COPY --from=build /app/project/.ph/connect-build/dist /app/dist

# Copy nginx configuration template
COPY config/nginx.conf.template /etc/nginx/nginx.conf.template

# Set PH_CONNECT_BASE_PATH (will be normalized at runtime by entrypoint)
ARG PH_CONNECT_BASE_PATH=""
ENV PH_CONNECT_BASE_PATH=$PH_CONNECT_BASE_PATH

# Copy and set up entrypoint script
COPY heroku-entrypoint.sh /usr/local/bin/heroku-entrypoint.sh
RUN chmod +x /usr/local/bin/heroku-entrypoint.sh

# Create necessary directories
RUN mkdir -p /app

WORKDIR /app

# Expose port (Heroku will set PORT at runtime)
EXPOSE $PORT

# Use entrypoint to substitute PORT at runtime and start nginx
ENTRYPOINT ["/usr/local/bin/heroku-entrypoint.sh"]

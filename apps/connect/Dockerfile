FROM alpine:latest AS build

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    nodejs \
    npm \
    python3 \
    make \
    g++ \
    py3-setuptools \
    nginx \
    brotli \
    nginx-mod-http-brotli \
    certbot \
    certbot-nginx \
    curl \
    bash \
    git \
    gettext \
    libavif \
    libavif-dev \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && npm install -g pnpm

# Build arguments
# Other
ARG TAG=latest
ENV TAG=$TAG

# Install ph-cmd
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Use hoisted node-linker for containerd/k8s overlay filesystem compatibility
RUN pnpm config set node-linker hoisted

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf.template

# Environment variables
ENV NODE_ENV=production
ENV PORT=4000
ENV PH_CONNECT_SENTRY_DSN=""
ENV PH_CONNECT_SENTRY_ENV=""
ENV PH_PACKAGES=""
ENV PH_CONNECT_BASE_PATH="/"
WORKDIR /app

# Configure JSR registry for @jsr scoped packages
RUN pnpm config set @jsr:registry https://npm.jsr.io

# Create and initialize the project
RUN pnpm add -g ph-cmd@$TAG
RUN if [[ "$TAG" == *"dev"* ]]; then \
        ph init project --dev --package-manager pnpm; \
    elif [[ "$TAG" == *"staging"* ]]; then \
        ph init project --staging --package-manager pnpm; \
    else \
        ph init project --package-manager pnpm; \
    fi

WORKDIR /app/project

# Copy and set up entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE $PORT

HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

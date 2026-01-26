# Build stage
FROM node:22-alpine AS build

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++ git bash \
    && ln -sf /usr/bin/python3 /usr/bin/python

# Setup pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

# Configure JSR registry
RUN pnpm config set @jsr:registry https://npm.jsr.io

# Build arguments
ARG TAG=latest
ARG PH_PACKAGES=""
ARG PH_CONNECT_BASE_PATH="/"

# Install ph-cmd and prettier
RUN pnpm add -g ph-cmd@$TAG prettier

RUN case "$TAG" in \
        *dev*) ph init project --dev --package-manager pnpm ;; \
        *staging*) ph init project --staging --package-manager pnpm ;; \
        *) ph init project --package-manager pnpm ;; \
    esac

WORKDIR /app/project

# Install PH packages if provided
RUN if [ -n "$PH_PACKAGES" ]; then \
        IFS=',' ; for pkg in $PH_PACKAGES; do \
            echo "Installing package: $pkg"; \
            ph install "$pkg"; \
        done; \
    fi

# Build connect
RUN ph connect build --base ${PH_CONNECT_BASE_PATH}

# Final stage - nginx only
FROM nginx:alpine

# Install envsubst for config templating
RUN apk add --no-cache gettext

# Copy nginx config template
COPY nginx.conf /etc/nginx/nginx.conf.template

# Copy built static files from build stage
COPY --from=build /app/project/.ph/connect-build/dist /var/www/html/project

# Environment variables for nginx config
ENV PORT=3001
ENV PH_CONNECT_BASE_PATH="/"

# Copy and setup entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:${PORT}/health || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]

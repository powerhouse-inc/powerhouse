# Build stage
FROM node:24-alpine AS build

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

# Install ph-cmd, prisma, and prettier
RUN pnpm add -g ph-cmd@$TAG prisma@5.17.0 prettier

# Initialize project based on tag
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

# Regenerate Prisma client for Alpine Linux (linux-musl-openssl-3.0.x)
# The document-drive package ships with darwin-arm64 binaries, we need to regenerate
RUN prisma generate --schema node_modules/document-drive/dist/prisma/schema.prisma

# Final stage - slim node image
FROM node:24-alpine

WORKDIR /app

# Install runtime dependencies (curl for health checks, openssl for Prisma)
RUN apk add --no-cache curl openssl

# Setup pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

# Configure JSR registry
RUN pnpm config set @jsr:registry https://npm.jsr.io

# Install ph-cmd and prisma globally (needed at runtime)
ARG TAG=latest
RUN pnpm add -g ph-cmd@$TAG prisma@5.17.0

# Copy built project from build stage
COPY --from=build /app/project /app/project

WORKDIR /app/project

# Copy entrypoint
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=""
ENV SKIP_DB_MIGRATIONS="false"

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]

FROM node:22 AS build
WORKDIR /app
COPY . .
RUN chmod +x entrypoint.sh
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack install --global pnpm@9.8.0
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

ENV HUSKY=false

# Packages
ENV PH_PACKAGES=""

# Nx
ENV NX_SOCKET_DIR="/tmp/nx"
ENV NX_DAEMON=false

# Auth
ENV PH_SWITCHBOARD_AUTH_ENABLED=false
ENV PH_SWITCHBOARD_ADMINS_LIST="0x123,0x456"
ENV PH_SWITCHBOARD_USERS_LIST="0x123,0x456"
ENV PH_SWITCHBOARD_GUESTS_LIST="0x123,0x456"

# Database
ENV PH_SWITCHBOARD_DATABASE_URL="dev.db"
ENV PH_SWITCHBOARD_REDIS_URL=""
ENV SKIP_DB_MIGRATIONS="false"

# Heroku Workaround
ENV PORT=4001 

# Switchboard
ENV PH_SWITCHBOARD_PORT=$PORT

# Other
ARG TAG=latest
ENV TAG=$TAG
# RUN apk add --no-cache openssl
# Configure JSR registry for @jsr scoped packages
RUN pnpm config set @jsr:registry https://npm.jsr.io
RUN pnpm add -g ph-cmd@$TAG prisma@5.17.0
RUN case "$TAG" in \
        *dev*) ph init project --dev --package-manager pnpm ;; \
        *staging*) ph init project --staging --package-manager pnpm ;; \
        *) ph init project --package-manager pnpm ;; \
    esac

WORKDIR /app/project

# Use hoisted node-linker for containerd/k8s overlay filesystem compatibility
# This must be set AFTER ph init and in the project directory
RUN pnpm config set node-linker hoisted --location project

# Install curl for health checks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

EXPOSE $PORT

HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]

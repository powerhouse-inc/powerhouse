FROM node:22-alpine AS build
RUN apk update && apk add git
WORKDIR /app
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

# Switchboard
ENV PH_SWITCHBOARD_PORT=4001

# Other
ENV PH_TAG=latest

RUN pnpm add -g ph-cmd@$PH_TAG && \
    ph setup-globals && \
    ph use $PH_TAG

# Copy and set up entrypoint script
COPY . .
RUN chmod +x entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]

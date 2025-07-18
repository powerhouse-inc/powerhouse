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
RUN pnpm add -g ph-cmd@$TAG

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

# Create and initialize the project
RUN ph init project --package-manager pnpm --version ${TAG}
WORKDIR /app/project

# Copy and set up entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE $PORT

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

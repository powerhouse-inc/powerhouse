FROM node:lts-alpine AS builder
ARG BASE_PATH="/"
ENV BASE_PATH=${BASE_PATH}
ARG PH_CONNECT_ROUTER_BASENAME=${BASE_PATH}
ARG SENTRY_ORG=""
ENV SENTRY_ORG=${SENTRY_ORG}

ARG SENTRY_PROJECT=""
ENV SENTRY_PROJECT=${SENTRY_PROJECT}

ARG SENTRY_AUTH_TOKEN=""
ENV SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN}

WORKDIR /opt/app
COPY . .
RUN npm install -g husky vite
RUN npm install --frozen-lockfile --force

RUN npm run build:web -- --base ${BASE_PATH}

# Production image, copy all the files and run next
FROM macbre/nginx-brotli:latest AS runner

ARG X_TAG
WORKDIR /opt/app
ENV NODE_ENV=production
ARG PORT=80
ENV PORT=${PORT}
ARG BASE_PATH=""
ENV BASE_PATH=${BASE_PATH}
ENV PH_CONNECT_ROUTER_BASENAME=${PH_CONNECT_ROUTER_BASENAME}
ARG PH_CONNECT_SENTRY_DSN=""
ENV PH_CONNECT_SENTRY_DSN=${PH_CONNECT_SENTRY_DSN}
ARG PH_CONNECT_SENTRY_ENV=""
ENV PH_CONNECT_SENTRY_ENV=${PH_CONNECT_SENTRY_ENV}
COPY --from=builder /opt/app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf.template
COPY nginx.sh /usr/share/nginx/nginx.sh
RUN chmod +x /usr/share/nginx/nginx.sh
ENTRYPOINT ["/usr/share/nginx/nginx.sh"]
FROM node:lts-alpine AS builder
ARG BASE_PATH="/"
ENV BASE_PATH=${BASE_PATH}

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
ARG BASE_PATH="/"
ENV BASE_PATH=${BASE_PATH}
COPY --from=builder /opt/app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf.template
ENTRYPOINT sh -c "/usr/share/nginx/html/vite-envs.sh && /usr/share/nginx/html/nginx.sh && nginx -g 'daemon off;' && tail -f /var/log/nginx/error.log"
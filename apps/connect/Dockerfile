FROM node:22-alpine AS build

WORKDIR /app
# Install system dependencies required by node-gyp
RUN apk add --no-cache python3 make g++ py3-setuptools && \
    ln -sf /usr/bin/python3 /usr/bin/python
RUN [ ! -e /lib/libssl.so.3 ] && ln -s /usr/lib/libssl.so.3 /lib/libssl.so.3 || echo "Link already exists"
ARG NX_SOCKET_DIR=""
ENV NX_SOCKET_DIR=${NX_SOCKET_DIR}
RUN npm install --global pnpm@10
COPY . .
RUN pnpm install --frozen-lockfile --filter @powerhousedao/connect...
ENV NX_DAEMON=false
ENV NX_ISOLATE_PLUGINS=false
ARG BASE_PATH="/"
ENV BASE_PATH=${BASE_PATH}
ARG PH_PACKAGES
ENV PH_PACKAGES=${PH_PACKAGES}
RUN if [ -n "${PH_PACKAGES}" ]; then pnpm add --filter @powerhousedao/connect ${PH_PACKAGES//,/ }; fi
RUN pnpm nx run @powerhousedao/connect:build --base ${BASE_PATH}
RUN mkdir pruned && pnpm --filter "@powerhousedao/connect" deploy --prod pruned --legacy

# Final production image
FROM macbre/nginx-brotli:latest AS runner
WORKDIR /app
ENV NODE_ENV=production
ARG PORT=80
ENV PORT=${PORT}
ARG BASE_PATH=""
ENV BASE_PATH=${BASE_PATH}
ARG PH_CONNECT_ROUTER_BASENAME
ENV PH_CONNECT_ROUTER_BASENAME=${PH_CONNECT_ROUTER_BASENAME}
ARG PH_CONNECT_SENTRY_DSN=""
ENV PH_CONNECT_SENTRY_DSN=${PH_CONNECT_SENTRY_DSN}
ARG PH_CONNECT_SENTRY_ENV=""
ENV PH_CONNECT_SENTRY_ENV=${PH_CONNECT_SENTRY_ENV}
COPY --from=build /app/pruned/dist /usr/share/nginx/html
COPY --from=build /app/pruned/nginx.conf /etc/nginx/conf.d/default.conf.template
COPY --from=build /app/pruned/nginx.sh /usr/share/nginx/nginx.sh
RUN chmod +x /usr/share/nginx/nginx.sh
RUN [ ! -e /lib/libssl.so.3 ] && ln -s /usr/lib/libssl.so.3 /lib/libssl.so.3 || echo "Link already exists"
ENTRYPOINT ["/usr/share/nginx/nginx.sh"]

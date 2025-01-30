FROM node:20-alpine AS build

WORKDIR /app
RUN [ ! -e /lib/libssl.so.3 ] && ln -s /usr/lib/libssl.so.3 /lib/libssl.so.3 || echo "Link already exists"
RUN npm install --global pnpm
COPY . .
RUN pnpm install
RUN pnpm build:all
RUN pnpm --filter "@powerhousedao/connect" build:web
RUN mkdir pruned && pnpm --filter "@powerhousedao/connect" deploy --prod pruned

# Final production image
FROM macbre/nginx-brotli:latest AS runner
WORKDIR /app
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
COPY --from=build /app/pruned/dist /usr/share/nginx/html
COPY --from=build /app/apps/connect/nginx.conf /etc/nginx/conf.d/default.conf.template
COPY --from=build /app/apps/connect/nginx.sh /usr/share/nginx/nginx.sh
RUN chmod +x /usr/share/nginx/nginx.sh
RUN [ ! -e /lib/libssl.so.3 ] && ln -s /usr/lib/libssl.so.3 /lib/libssl.so.3 || echo "Link already exists"
ENTRYPOINT ["/usr/share/nginx/nginx.sh"]
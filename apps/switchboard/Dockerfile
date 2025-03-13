# FROM node:22-alpine AS build

# WORKDIR /app
# RUN [ ! -e /lib/libssl.so.3 ] && ln -s /usr/lib/libssl.so.3 /lib/libssl.so.3 || echo "Link already exists"
# RUN npm install --global pnpm@9
# COPY . .
# RUN pnpm install
# RUN pnpm run build
# ENV API_ORIGIN=http://localhost:3000
# ENV JWT_SECRET="secret"
# ENV PORT=4001
# ENV ADMIN_USERS="0x123,0x456"
# ENV DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
# ENV REDIS_URL=redis://localhost:6379
# ENV REDIS_TLS_URL=rediss://localhost:6379
# ARG PH_PACKAGES
# ENV PH_PACKAGES=${PH_PACKAGES}
# RUN node dist/src/install-packages.js
# CMD pnpx prisma generate && pnpm start

FROM node:22-alpine AS build
RUN apk update && apk add git
WORKDIR /app
RUN [ ! -e /lib/libssl.so.3 ] && ln -s /usr/lib/libssl.so.3 /lib/libssl.so.3 || echo "Link already exists"
RUN npm install --global pnpm@9 husky
COPY . .
ARG PH_PACKAGES
ENV PH_PACKAGES=${PH_PACKAGES}
RUN pnpm install --filter @powerhousedao/switchboard... 
RUN pnpm nx run @powerhousedao/switchboard:build
RUN pnpm --filter "@powerhousedao/switchboard" deploy --prod pruned
RUN rm -rf pruned/node_modules/.pnpm/@prisma+client@5.17.0_prisma@5.17.0 && cp -R ./node_modules/.pnpm/@prisma+client@5.17.0_prisma@5.17.0 pruned/node_modules/.pnpm

# Final production image
FROM node:22-alpine AS runner

WORKDIR /app
COPY --from=build /app/pruned/dist dist
COPY --from=build /app/pruned/node_modules node_modules
COPY --from=build /app/pruned/package.json package.json
COPY --from=build /app/pruned/powerhouse.config.json powerhouse.config.json
# COPY --from=build /app/package.json package.json
RUN [ ! -e /lib/libssl.so.3 ] && ln -s /usr/lib/libssl.so.3 /lib/libssl.so.3 || echo "Link already exists"
ENV DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
ARG PH_PACKAGES
ENV PH_PACKAGES=${PH_PACKAGES}
CMD node dist/src/index.js
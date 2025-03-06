FROM node:22-alpine AS build

WORKDIR /app
RUN [ ! -e /lib/libssl.so.3 ] && ln -s /usr/lib/libssl.so.3 /lib/libssl.so.3 || echo "Link already exists"
RUN npm install --global pnpm@9
COPY . .
RUN pnpm install
RUN cp -r ./packages/document-drive/prisma/schema.prisma ./schema.prisma
RUN pnpm nx run @powerhousedao/switchboard:build
ENV API_ORIGIN=http://localhost:3000
ENV JWT_SECRET="secret"
ENV PORT=4001
ENV ADMIN_USERS="0x123,0x456"
ENV DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
ENV REDIS_URL=redis://localhost:6379
ENV REDIS_TLS_URL=rediss://localhost:6379
ENV PH_PACKAGES=
CMD pnpm nx run @powerhousedao/switchboard:start
# RUN mkdir pruned && pnpm --filter "@powerhousedao/switchboard" deploy --prod pruned

# # Final production image
# FROM node:22-alpine AS production

# WORKDIR /app

# COPY --from=build /app/pruned .
# RUN [ ! -e /lib/libssl.so.3 ] && ln -s /usr/lib/libssl.so.3 /lib/libssl.so.3 || echo "Link already exists"
# ENV DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
# CMD npx prisma generate --schema schema.prisma && node dist/src/index.js

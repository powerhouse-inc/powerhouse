FROM node:20-alpine AS build

WORKDIR /app
RUN [ ! -e /lib/libssl.so.3 ] && ln -s /usr/lib/libssl.so.3 /lib/libssl.so.3 || echo "Link already exists"
RUN npm install --global pnpm
COPY . .
RUN pnpm install
RUN cp -r ./packages/document-drive/prisma/schema.prisma ./schema.prisma
RUN pnpm build:all
RUN mkdir pruned && pnpm --filter "@powerhousedao/switchboard" deploy --prod pruned

# Final production image
FROM oven/bun:alpine

WORKDIR /app

COPY --from=build /app/pruned/dist dist
COPY --from=build /app/pruned/node_modules node_modules
COPY --from=build /app/schema.prisma schema.prisma
RUN [ ! -e /lib/libssl.so.3 ] && ln -s /usr/lib/libssl.so.3 /lib/libssl.so.3 || echo "Link already exists"
ENV DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
CMD bunx prisma generate --schema schema.prisma && bun dist/index.js

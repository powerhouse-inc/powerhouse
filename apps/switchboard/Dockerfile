FROM node:20-alpine AS build

WORKDIR /app

RUN npm install --global pnpm
RUN pnpm --version
COPY . .
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter "@powerhousedao/switchboard" build 
RUN mkdir pruned && pnpm --filter "@powerhousedao/switchboard" deploy --prod pruned

# Final production image
FROM oven/bun:alpine

WORKDIR /app

COPY --from=build /app/pruned/dist dist
COPY --from=build /app/pruned/node_modules node_modules

ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
CMD bun dist/index.js

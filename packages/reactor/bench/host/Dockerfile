# Bench host image. Built from the monorepo root (see docker-compose context).
# Installs the full pnpm workspace, then runs the bench host shim via tsx so
# no per-package compile step is needed.
FROM node:24-alpine AS deps

WORKDIR /app

RUN apk add --no-cache python3 make g++ git \
    && ln -sf /usr/bin/python3 /usr/bin/python

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.json tsconfig.options.json ./
COPY apps ./apps
COPY clis ./clis
COPY packages ./packages
COPY test ./test
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile --filter "@powerhousedao/reactor-bench-host..."

# Build workspace dependencies so the runtime can resolve the published
# entrypoints (dist/index.js) of the reactor + transitive workspace packages.
RUN pnpm --filter "@powerhousedao/reactor-bench-host^..." build

FROM node:24-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache tini
ENV NODE_ENV=production

COPY --from=deps /app /app

WORKDIR /app/packages/reactor/bench/host

EXPOSE 8080
EXPOSE 9090

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--import", "tsx", "src/main.ts"]

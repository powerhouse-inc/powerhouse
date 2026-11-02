# syntax=docker/dockerfile:1

# corepack left Node in 25, and node:lts has moved past 24.
FROM node:24 AS build
ENV FORCE_COLOR=0

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

WORKDIR /app
# Install from the manifests alone so a docs-only change reuses this layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack install && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Ship the built site and a static server only, so a push carries the site
# and not the toolchain.
FROM node:24-alpine
WORKDIR /app
RUN npm install --no-save --no-package-lock serve-handler@6.1.7 && npm cache clean --force
COPY server.mjs ./
COPY --from=build /app/build ./build
ENV PORT=3000
EXPOSE $PORT
ENTRYPOINT ["node", "server.mjs"]

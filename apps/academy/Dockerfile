# syntax=docker/dockerfile:1

# corepack left Node in 25, and node:lts has moved past 24.
FROM node:24 AS base
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
RUN chmod +x entrypoint.sh
RUN pnpm build
ENV PORT=3000
EXPOSE $PORT
ENTRYPOINT ["./entrypoint.sh"]
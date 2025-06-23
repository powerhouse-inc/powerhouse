# syntax=docker/dockerfile:1

FROM node:lts AS base
ENV FORCE_COLOR=0

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack install --global pnpm@10.1.0
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

WORKDIR /app
COPY . .
RUN chmod +x entrypoint.sh
RUN pnpm install
RUN pnpm build
ENV PORT=3000
EXPOSE $PORT
ENTRYPOINT ["./entrypoint.sh"]
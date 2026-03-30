FROM node:24-slim AS install

RUN npm install -g pnpm@10.18.0
ARG TAG=latest
WORKDIR /app
RUN pnpm init && pnpm add @powerhousedao/registry@${TAG}

FROM node:24-slim

WORKDIR /app
COPY --from=install /app /app

ENV PORT=4873
ENV REGISTRY_STORAGE=/data/storage
ENV REGISTRY_CDN_CACHE=/data/cdn-cache

VOLUME /data
EXPOSE 4873

ENV PATH="/app/node_modules/.bin:$PATH"

ENTRYPOINT ["ph-registry"]

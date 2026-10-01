# Context: the output of `pnpm --filter @powerhousedao/registry deploy --prod`.
FROM node:24-slim
WORKDIR /app
COPY . /app
ENV PORT=4873 \
    REGISTRY_STORAGE=/data/storage \
    REGISTRY_CDN_CACHE=/data/cdn-cache
EXPOSE 4873
ENTRYPOINT ["node", "/app/dist/cli.mjs"]

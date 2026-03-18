FROM node:22-slim AS base
RUN npm install -g pnpm@10.18.0
WORKDIR /app

# -- Install stage (prod deps only) --
FROM base AS install
COPY package.json ./
# Resolve pnpm catalog: references to allow standalone install
RUN sed -i 's/"catalog:"/"*"/g' package.json
RUN pnpm install --prod

# -- Build stage --
FROM base AS build
COPY package.json tsconfig.json ./
COPY src/ src/
# Resolve pnpm catalog: references to allow standalone install
RUN sed -i 's/"catalog:"/"*"/g' package.json
# Inline the extended tsconfig options so tsc works without the monorepo root
RUN echo '{ \
  "compilerOptions": { \
    "module": "NodeNext", \
    "target": "ESNext", \
    "sourceMap": true, \
    "declaration": true, \
    "declarationMap": true, \
    "strict": true, \
    "verbatimModuleSyntax": true, \
    "isolatedModules": true, \
    "skipLibCheck": true, \
    "moduleDetection": "force", \
    "outDir": "./dist", \
    "types": ["node"] \
  }, \
  "include": ["src/**/*"] \
}' > tsconfig.json
RUN pnpm install
RUN pnpm add -D typescript @types/node
RUN pnpm exec tsc

# -- Runtime stage --
FROM node:22-slim
WORKDIR /app

COPY --from=install /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY static/ ./static/

ENV PORT=4873
ENV REGISTRY_STORAGE=/data/storage
ENV REGISTRY_CDN_CACHE=/data/cdn-cache

VOLUME /data
EXPOSE 4873

CMD ["node", "dist/cli.js"]

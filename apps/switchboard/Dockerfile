FROM node:lts-alpine AS deps
WORKDIR /opt/app
COPY package.json pnpm-lock.yaml .
RUN npm install -g pnpm
RUN pnpm install

FROM node:lts-alpine AS builder
WORKDIR /opt/app
ENV NODE_ENV=production
ARG BASE_PATH=""
ARG ASSET_PREFIX=""
ENV NEXT_PUBLIC_SWITCHBOARD_GRAPHQL_HOST="https://apps.powerhouse.io/develop/powerhouse/switchboard"
COPY . .
COPY --from=deps /opt/app/node_modules ./node_modules
RUN npm install -g pnpm
RUN pnpm build

# Production image, copy all the files and run next
FROM node:lts-alpine AS runner
ARG X_TAG
WORKDIR /opt/app
EXPOSE 3000
COPY --from=builder /opt/app/next.config.mjs ./
COPY --from=builder /opt/app/public ./public
COPY --from=builder /opt/app/.next ./.next
COPY --from=builder /opt/app/node_modules ./node_modules
ENV NEXT_PUBLIC_SWITCHBOARD_GRAPHQL_HOST="https://apps.powerhouse.io/develop/powerhouse/switchboard"
CMD ["node_modules/.bin/next", "start"]

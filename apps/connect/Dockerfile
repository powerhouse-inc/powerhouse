FROM node:lts-alpine AS builder
ARG BASE_PATH="/alpha/makerdao/connect"
ENV BASE_PATH=${BASE_PATH}

WORKDIR /opt/app
COPY . .
RUN npm install -g husky vite
RUN npm install --frozen-lockfile
RUN npm run build:web --base ${BASE_PATH}

# Production image, copy all the files and run next
FROM nginx:latest AS runner

ARG X_TAG
WORKDIR /opt/app
ENV NODE_ENV=production

COPY --from=builder /opt/app/dist /usr/share/nginx/html


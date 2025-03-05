FROM node:22-alpine AS build

WORKDIR /app
RUN [ ! -e /lib/libssl.so.3 ] && ln -s /usr/lib/libssl.so.3 /lib/libssl.so.3 || echo "Link already exists"
COPY . .
RUN npm install --global pnpm@9
RUN pnpm install
RUN pnpm build
ENV ADMIN_USERS="admin"
CMD node dist/src/index.js

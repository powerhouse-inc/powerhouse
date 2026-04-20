# switchboard-lb — OpenResty L7 load balancer
#
# Two targets:
#   dev     — adds busted (+ gcc/musl-dev to compile lua-term). Used by
#             docker-compose for local iteration. Config/Lua are volume-
#             mounted at runtime, not copied in.
#   runtime — lean image for CI/prod. Copies conf/ and lua/ in so the
#             image is self-contained. Not used by the local dev loop.
#
# Pinned base image: see https://hub.docker.com/r/openresty/openresty/tags

ARG OPENRESTY_VERSION=1.27.1.1-alpine

FROM openresty/openresty:${OPENRESTY_VERSION} AS dev

# Alpine packages busted for Lua 5.1, matching the Lua API version OpenResty's
# LuaJIT exposes. We avoid luarocks on LuaJIT here because the current
# manifest exceeds LuaJIT's 65K-constants-per-function limit.
RUN apk add --no-cache lua5.1-busted \
    && ln -s /usr/bin/busted-5.1 /usr/local/bin/busted

EXPOSE 8080
CMD ["openresty", "-g", "daemon off;"]


FROM openresty/openresty:${OPENRESTY_VERSION} AS runtime

COPY conf/ /usr/local/openresty/nginx/conf/
COPY lua/  /usr/local/openresty/nginx/lua/

EXPOSE 8080
CMD ["openresty", "-g", "daemon off;"]

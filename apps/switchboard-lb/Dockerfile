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
# nginx-lua-prometheus pinned ref. Three pure-Lua files fetched into
# /usr/local/openresty/nginx/lua/ so they're picked up by lua_package_path
# (see conf/nginx.conf). The -alpine-fat base bundles many resty libs but
# not this one, so it would buy +400MB of image with nothing relevant in it.
ARG PROM_REF=0.20240525

FROM openresty/openresty:${OPENRESTY_VERSION} AS dev

# Alpine packages busted for Lua 5.1, matching the Lua API version OpenResty's
# LuaJIT exposes. We avoid luarocks on LuaJIT here because the current
# manifest exceeds LuaJIT's 65K-constants-per-function limit.
#
# websocat is the WS client used by test/integration/m3_ws_reload.sh — a
# single static Rust binary in Alpine 3.21+ community. curl is used by
# test/integration/m3.sh via `docker exec` to poll /__hc/status, which is
# bound to 127.0.0.1 and only reachable from inside the container. Both
# stay in the dev stage only; runtime image doesn't ship test tooling.
RUN apk add --no-cache lua5.1-busted websocat curl \
    && ln -s /usr/bin/busted-5.1 /usr/local/bin/busted

ARG PROM_REF
# Land the prometheus files in /usr/local/openresty/site/lualib/, which is
# already on OpenResty's default lua_package_path. We deliberately avoid
# /usr/local/openresty/nginx/lua/ because the dev compose mounts ./lua
# there read-only, masking any image-baked files at that path.
RUN BASE="https://raw.githubusercontent.com/knyar/nginx-lua-prometheus/${PROM_REF}" \
    && wget -q -O /usr/local/openresty/site/lualib/prometheus.lua "${BASE}/prometheus.lua" \
    && wget -q -O /usr/local/openresty/site/lualib/prometheus_keys.lua "${BASE}/prometheus_keys.lua" \
    && wget -q -O /usr/local/openresty/site/lualib/prometheus_resty_counter.lua "${BASE}/prometheus_resty_counter.lua"

EXPOSE 8080
CMD ["openresty", "-g", "daemon off;"]


FROM openresty/openresty:${OPENRESTY_VERSION} AS runtime

COPY conf/ /usr/local/openresty/nginx/conf/
COPY lua/  /usr/local/openresty/nginx/lua/

ARG PROM_REF
# Land the prometheus files in /usr/local/openresty/site/lualib/, which is
# already on OpenResty's default lua_package_path. We deliberately avoid
# /usr/local/openresty/nginx/lua/ because the dev compose mounts ./lua
# there read-only, masking any image-baked files at that path.
RUN BASE="https://raw.githubusercontent.com/knyar/nginx-lua-prometheus/${PROM_REF}" \
    && wget -q -O /usr/local/openresty/site/lualib/prometheus.lua "${BASE}/prometheus.lua" \
    && wget -q -O /usr/local/openresty/site/lualib/prometheus_keys.lua "${BASE}/prometheus_keys.lua" \
    && wget -q -O /usr/local/openresty/site/lualib/prometheus_resty_counter.lua "${BASE}/prometheus_resty_counter.lua"

EXPOSE 8080
CMD ["openresty", "-g", "daemon off;"]

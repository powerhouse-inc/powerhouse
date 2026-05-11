#!/usr/bin/env sh
# Run the LB Lua busted suite inside the dev container.
#
# The spec files require("spec.spec_helper"), so busted runs from
# /usr/local/openresty/nginx/test (parent of spec/) with LUA_PATH
# extended to also reach ../lua/route.lua and ../lua/metrics.lua.

set -eu

cd "$(dirname "$0")/.."

exec docker compose run --rm --entrypoint sh lb -c \
    'cd /usr/local/openresty/nginx/test && LUA_PATH="./?.lua;./?/init.lua;../lua/?.lua;;" busted --pattern=_spec spec/'

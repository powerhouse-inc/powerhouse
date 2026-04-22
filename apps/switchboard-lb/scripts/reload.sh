#!/usr/bin/env sh
# Test the running LB's config and, if valid, reload workers gracefully.
# Override the target container with LB_CONTAINER=... if your compose project
# produces a different name.

set -eu

CONTAINER="${LB_CONTAINER:-switchboard-lb-lb-1}"
CONF=/usr/local/openresty/nginx/conf/nginx.conf

echo "[reload] testing config in $CONTAINER..."
if ! docker exec "$CONTAINER" openresty -t -c "$CONF"; then
    echo "[reload] config test FAILED — not reloading" >&2
    exit 1
fi

echo "[reload] config ok, reloading..."
docker exec "$CONTAINER" openresty -s reload
echo "[reload] done"

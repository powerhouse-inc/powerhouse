#!/usr/bin/env sh
# M3 + §9 Q3: WebSocket connection survives `nginx -s reload`.
#
# Opens a real WS to /graphql/subscriptions through the LB, exchanges a
# frame, runs `openresty -s reload`, exchanges another frame, and asserts
# the connection is still up and frames still round-trip. The whole flow
# runs inside the LB container because that's where websocat lives — it
# was added to the dev stage of the Dockerfile in M3.
#
# Requires `docker compose up -d --build` to already be running.

set -eu

COMPOSE_PROJECT="${COMPOSE_PROJECT:-switchboard-lb}"
LB_CONTAINER="${LB_CONTAINER:-${COMPOSE_PROJECT}-lb-1}"

# Sanity: container exists.
if ! docker inspect "$LB_CONTAINER" >/dev/null 2>&1; then
    echo "FAIL  LB container '$LB_CONTAINER' not found. Set LB_CONTAINER=... or COMPOSE_PROJECT=..."
    exit 1
fi

# Run the whole exchange inside the container. Single `docker exec` keeps
# state (FIFOs, background pids) co-located. The script signals failure
# with a non-zero exit; we relay it as the script's exit status.
docker exec -i "$LB_CONTAINER" sh -eu <<'INNER'
PASS=0
FAIL=0

check() {
    label="$1"
    cond="$2"
    if [ "$cond" = "1" ]; then
        echo "PASS  $label"
        PASS=$((PASS + 1))
    else
        echo "FAIL  $label"
        FAIL=$((FAIL + 1))
    fi
}

WORKDIR=/tmp/m3-ws
rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"
mkfifo "$WORKDIR/in"
: > "$WORKDIR/out"

# Hold the input FIFO open for writing — without this, websocat sees EOF
# the moment the first echo finishes and shuts down. `sleep 600` is well
# past the test's lifetime.
sleep 600 > "$WORKDIR/in" &
HOLD_PID=$!

# websocat: read stdin from the FIFO, write echoed frames to the out file.
websocat -t ws://127.0.0.1:8080/graphql/subscriptions \
    < "$WORKDIR/in" > "$WORKDIR/out" 2>&1 &
WS_PID=$!

cleanup() {
    kill $WS_PID 2>/dev/null || true
    kill $HOLD_PID 2>/dev/null || true
    rm -rf "$WORKDIR"
}
trap cleanup EXIT

# 1. Wait for handshake + greeting frame from the stub.
sleep 1
if grep -q '"upstream":"sb-' "$WORKDIR/out"; then
    backend=$(awk -F'"' '/upstream/ { print $4; exit }' "$WORKDIR/out")
    echo "        connected via backend $backend"
    check "WS handshake completes through LB" 1
else
    echo "        out: $(cat "$WORKDIR/out")"
    check "WS handshake completes through LB" 0
    echo ""
    echo "Results: $PASS passed, $FAIL failed"
    exit 1
fi

# 2. Pre-reload echo round trip.
echo "ping-pre-reload" > "$WORKDIR/in"
sleep 0.5
if grep -q "ping-pre-reload" "$WORKDIR/out"; then
    check "pre-reload echo round-trip" 1
else
    check "pre-reload echo round-trip" 0
fi

# 3. Reload nginx. `openresty -t` first so a config error fails loud
#    before we drop the new workers in.
if ! openresty -t -c /usr/local/openresty/nginx/conf/nginx.conf >/dev/null 2>&1; then
    echo "FAIL  openresty -t reported config invalid"
    exit 1
fi
openresty -s reload
sleep 1

# 4. WS process must still be alive after reload.
if kill -0 $WS_PID 2>/dev/null; then
    check "WS process alive after reload" 1
else
    check "WS process alive after reload" 0
fi

# 5. Post-reload echo round trip — connection still functional.
echo "ping-post-reload" > "$WORKDIR/in"
sleep 0.5
if grep -q "ping-post-reload" "$WORKDIR/out"; then
    check "post-reload echo round-trip (frame survives reload)" 1
else
    echo "        post-reload tail:"
    tail -n 5 "$WORKDIR/out" | sed 's/^/        /'
    check "post-reload echo round-trip (frame survives reload)" 0
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
INNER

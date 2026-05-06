#!/usr/bin/env sh
# M1 integration assertions: proxy plumbing.
#
# Asserts the LB forwards every upstream-bound route to the pool with the
# path preserved, passes X-Request-Id through untouched, and sends WS
# upgrade headers to the subscription backend.
#
# Requires `docker compose up -d` (or --build) to already be running.

set -eu

LB="${LB_URL:-http://127.0.0.1:8080}"
PASS=0
FAIL=0

check() {
    label="$1"
    expected="$2"
    actual="$3"
    if [ "$actual" = "$expected" ]; then
        echo "PASS  $label"
        PASS=$((PASS + 1))
    else
        echo "FAIL  $label"
        echo "        expected: '$expected'"
        echo "        got:      '$actual'"
        FAIL=$((FAIL + 1))
    fi
}

header_value() {
    # Extract a header value from a `curl -D -` dump. Case-insensitive.
    dump="$1"
    name="$2"
    printf '%s' "$dump" | awk -v IGNORECASE=1 -v h="$name:" '
        tolower($1) == tolower(h) {
            sub(/^[^:]+:[[:space:]]*/, "")
            sub(/[[:space:]]+$/, "")
            print
            exit
        }
    '
}

status_code() {
    dump="$1"
    printf '%s' "$dump" | awk 'NR==1 {print $2; exit}'
}

# 1. /health served locally — no X-Upstream-Id from any stub.
resp=$(curl -sS -D - -o /dev/null "$LB/health")
check "health 200"              "200" "$(status_code "$resp")"
check "health no upstream id"   ""    "$(header_value "$resp" X-Upstream-Id)"

# 2. POST /graphql — prefix match, path preserved.
# Body content is irrelevant to the path/method/X-Request-Id invariants
# this script checks. Header-based routing (M2) means the LB does not
# parse the body at all; missing Drive-Id falls back to round-robin.
resp=$(curl -sS -D - -o /dev/null -X POST \
    -H "Content-Type: application/json" \
    --data '{"query":"{ __typename }"}' \
    "$LB/graphql")
check "graphql POST 200"            "200"      "$(status_code "$resp")"
check "graphql path preserved"      "/graphql" "$(header_value "$resp" X-Upstream-Path)"
check "graphql method preserved"    "POST"     "$(header_value "$resp" X-Upstream-Method)"

# 3. POST /graphql/reactor — prefix match, path preserved.
resp=$(curl -sS -D - -o /dev/null -X POST \
    -H "Content-Type: application/json" \
    --data '{"query":"{ __typename }"}' \
    "$LB/graphql/reactor")
check "graphql/reactor POST 200"         "200"              "$(status_code "$resp")"
check "graphql/reactor path preserved"   "/graphql/reactor" "$(header_value "$resp" X-Upstream-Path)"

# 4. GET /d/:drive — regex match.
resp=$(curl -sS -D - -o /dev/null "$LB/d/my-drive")
check "d/:drive GET 200"            "200"         "$(status_code "$resp")"
check "d/:drive path preserved"     "/d/my-drive" "$(header_value "$resp" X-Upstream-Path)"

# 5. /d/:drive trailing slash — regex must reject (proves pattern precision).
status=$(curl -sS -o /dev/null -w "%{http_code}" "$LB/d/my-drive/")
check "d/:drive trailing slash rejected" "404" "$status"

# 6. X-Request-Id passthrough — stub echoes whatever the client sent.
REQ_ID="m1-test-rid-abc123"
resp=$(curl -sS -D - -o /dev/null -X POST \
    -H "Content-Type: application/json" \
    -H "X-Request-Id: $REQ_ID" \
    --data '{"query":"{ __typename }"}' \
    "$LB/graphql")
check "X-Request-Id passthrough" "$REQ_ID" "$(header_value "$resp" X-Request-Id)"

# 7. WS upgrade reaches the pool and the stub completes the handshake.
# Stubs (M3) speak real WebSocket via lua-resty-websocket-server, so a
# proper upgrade returns 101 with Sec-WebSocket-Accept set. We close the
# connection immediately after the handshake — frame echo is exercised
# in m3_ws_reload.sh, not here.
resp=$(curl -sS -D - -o /dev/null --max-time 5 \
    -H "Connection: Upgrade" \
    -H "Upgrade: websocket" \
    -H "Sec-WebSocket-Version: 13" \
    -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    "$LB/graphql/subscriptions" || true)
check "subscriptions handshake completes"  "101" "$(status_code "$resp")"
sec_accept=$(header_value "$resp" Sec-WebSocket-Accept)
if [ -n "$sec_accept" ]; then
    echo "PASS  subscriptions Sec-WebSocket-Accept present"
    PASS=$((PASS + 1))
else
    echo "FAIL  subscriptions Sec-WebSocket-Accept missing"
    FAIL=$((FAIL + 1))
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]

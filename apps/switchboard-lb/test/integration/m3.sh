#!/usr/bin/env sh
# M3 integration assertions: active health checks + 502 → 503 mapping.
#
# Verifies that lua-resty-upstream-healthcheck marks a stopped backend
# down within ~6s, that requests pinned to a down backend return 503
# (not 502, not silently re-routed), that other-pin traffic is unaffected,
# and that the backend rejoins the ring on recovery.
#
# Requires `docker compose up -d --build` to already be running.

set -eu

LB="${LB_URL:-http://127.0.0.1:8080}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-switchboard-lb}"
LB_CONTAINER="${LB_CONTAINER:-${COMPOSE_PROJECT}-lb-1}"
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

post_graphql() {
    drive_id="$1"
    curl -sS -D - -o /dev/null -X POST \
        -H "Content-Type: application/json" \
        -H "Drive-Id: $drive_id" \
        --data-binary '{"query":"{ __typename }"}' \
        "$LB/graphql"
}

pin_backend() {
    # Single POST pinned via the Drive-Id header; returns X-Upstream-Id.
    resp=$(post_graphql "$1")
    header_value "$resp" X-Upstream-Id
}

# Resolve a docker-compose service name (sb-N) to the IP that nginx
# resolved when it loaded the upstream block. /__hc/status reports peers
# by IP:port, so we need this mapping to poll the right line.
peer_ip_for() {
    docker inspect -f \
        '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \
        "${COMPOSE_PROJECT}-$1-1" 2>/dev/null
}

# Poll /__hc/status (loopback-only on :9090, moved off :8080 in M4) until
# the named peer reaches the desired state (UP|DOWN). Times out after ~12s
# — slightly more than interval*fall (6s) and interval*rise (4s) plus headroom.
hc_wait_for() {
    peer="$1"
    state="$2"
    deadline=$(( $(date +%s) + 12 ))
    while [ "$(date +%s)" -lt "$deadline" ]; do
        # Status page lines look like:  Primary Peers
        #     172.24.0.3:8080 UP
        # Match the peer line and check the state token.
        actual=$(docker exec "$LB_CONTAINER" \
            curl -s "http://127.0.0.1:9090/__hc/status" 2>/dev/null \
            | awk -v p="$peer" '$1 == p { print $2; exit }')
        if [ "$actual" = "$state" ]; then
            return 0
        fi
        sleep 0.5
    done
    return 1
}

# 0. Sanity: make sure the LB actually started with M3 wiring. /__hc/status
#    returns 404 if the metrics listener isn't loaded, 200 with text otherwise.
hc_status=$(docker exec "$LB_CONTAINER" \
    curl -s -o /dev/null -w '%{http_code}' \
    "http://127.0.0.1:9090/__hc/status" 2>/dev/null || echo "000")
check "hc status endpoint reachable" "200" "$hc_status"

if [ "$hc_status" != "200" ]; then
    echo "Aborting — healthcheck wiring not loaded. Did you run \`docker compose build && docker compose up -d\`?"
    exit 1
fi

# 1. Steady state — pin two ids that hash to different backends.
TS=$(date +%s)
ID_X="m3-x-$TS"
B_X=$(pin_backend "$ID_X")
echo "        ID_X='$ID_X' pins to '$B_X'"

# Find an ID_Y that pins to a different backend. Try up to 20 candidates.
ID_Y=""
B_Y=""
i=0
while [ "$i" -lt 20 ]; do
    cand="m3-y-$TS-$i"
    bcand=$(pin_backend "$cand")
    if [ -n "$bcand" ] && [ "$bcand" != "$B_X" ]; then
        ID_Y="$cand"
        B_Y="$bcand"
        break
    fi
    i=$((i + 1))
done

if [ -z "$ID_Y" ]; then
    echo "FAIL  could not find an ID_Y that hashes to a different backend"
    FAIL=$((FAIL + 1))
    exit 1
fi
echo "        ID_Y='$ID_Y' pins to '$B_Y'"

# 2. Stop B(X). Wait for the healthcheck to mark it DOWN.
echo "        stopping $B_X..."
B_X_IP=$(peer_ip_for "$B_X")
if [ -z "$B_X_IP" ]; then
    echo "FAIL  could not resolve IP for $B_X"
    exit 1
fi
docker compose -p "$COMPOSE_PROJECT" stop "$B_X" >/dev/null 2>&1
if hc_wait_for "${B_X_IP}:8080" "DOWN"; then
    echo "PASS  ${B_X} marked DOWN by healthcheck"
    PASS=$((PASS + 1))
else
    echo "FAIL  ${B_X} did not transition to DOWN within 12s"
    FAIL=$((FAIL + 1))
fi

# 3. Pinned-to-X traffic returns 503 (no live backend in this ring slot).
all_503=1
i=0
while [ "$i" -lt 5 ]; do
    resp=$(post_graphql "$ID_X")
    s=$(status_code "$resp")
    if [ "$s" != "503" ]; then
        all_503=0
        echo "        unexpected status: $s"
    fi
    i=$((i + 1))
done
check "pinned-to-down id returns 503 (5/5)" "1" "$all_503"

# 4. Pinned-to-Y traffic still works — other backends unaffected.
all_y=1
i=0
while [ "$i" -lt 5 ]; do
    cur=$(pin_backend "$ID_Y")
    if [ "$cur" != "$B_Y" ]; then
        all_y=0
        echo "        pinned-to-Y drifted: '$cur' != '$B_Y'"
    fi
    i=$((i + 1))
done
check "pinned-to-other-backend traffic intact" "1" "$all_y"

# 5. Restart B(X). Wait for the healthcheck to mark it UP.
echo "        starting $B_X..."
docker compose -p "$COMPOSE_PROJECT" start "$B_X" >/dev/null 2>&1
# IP can change after restart on some docker setups — re-resolve.
B_X_IP=$(peer_ip_for "$B_X")
if hc_wait_for "${B_X_IP}:8080" "UP"; then
    echo "PASS  ${B_X} marked UP after recovery"
    PASS=$((PASS + 1))
else
    echo "FAIL  ${B_X} did not transition back to UP within 12s"
    FAIL=$((FAIL + 1))
fi

# 6. Pinned-to-X recovers — same backend ID, no migration.
recovered_to=$(pin_backend "$ID_X")
check "pin recovers to original backend" "$B_X" "$recovered_to"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]

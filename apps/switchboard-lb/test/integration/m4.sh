#!/usr/bin/env sh
# M4 integration assertions: Prometheus metrics + :9090 listener.
#
# Verifies that /metrics is exposed only on the loopback :9090 listener
# (never on :8080), that /__hc/status moved from :8080 to :9090, and that
# lb_requests_total and lb_request_duration_seconds appear with the
# expected labels after generating a representative mix of traffic.
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

# Match against /metrics output. Prometheus output sorts labels
# alphabetically, so we use grep -E and don't assume label order.
assert_metric_present() {
    label="$1"
    pattern="$2"
    if printf '%s' "$METRICS" | grep -Eq "$pattern"; then
        echo "PASS  $label"
        PASS=$((PASS + 1))
    else
        echo "FAIL  $label"
        echo "        pattern not found: $pattern"
        FAIL=$((FAIL + 1))
    fi
}

# 0. /metrics MUST NOT be exposed on :8080.
metrics_8080=$(curl -s -o /dev/null -w '%{http_code}' "$LB/metrics" 2>/dev/null)
check "/metrics returns 404 on :8080" "404" "$metrics_8080"

# 0b. /metrics IS reachable on :9090 via docker exec.
metrics_9090=$(docker exec "$LB_CONTAINER" \
    curl -s -o /dev/null -w '%{http_code}' \
    "http://127.0.0.1:9090/metrics" 2>/dev/null || echo "000")
check "/metrics returns 200 on :9090" "200" "$metrics_9090"

if [ "$metrics_9090" != "200" ]; then
    echo "Aborting — metrics listener not reachable. Did you run \`docker compose build && docker compose up -d\`?"
    exit 1
fi

# 1. Generate traffic across all the route classes.
TS=$(date +%s)

# graphql with a Drive-Id header — pinned route.
post_graphql "m4-drive-$TS" >/dev/null

# graphql without Drive-Id — round-robin fallback path.
curl -sS -o /dev/null -X POST \
    -H "Content-Type: application/json" \
    --data-binary '{"query":"{ __typename }"}' \
    "$LB/graphql" >/dev/null

# drive 2xx
curl -sS -o /dev/null "$LB/d/m4-test-drive" >/dev/null

# health (locally served, no upstream)
curl -sS -o /dev/null "$LB/health" >/dev/null

# 2. Scrape metrics. nginx-lua-prometheus syncs per-worker counters to the
# shared dict on a 1s interval (resty.counter default). Wait two intervals
# to make sure all the requests above are visible at scrape time.
sleep 2
METRICS=$(docker exec "$LB_CONTAINER" \
    curl -s "http://127.0.0.1:9090/metrics" 2>/dev/null)

# lb_requests_total — one assertion per class.
assert_metric_present 'lb_requests_total class=graphql' \
    'lb_requests_total\{[^}]*class="graphql"'
assert_metric_present 'lb_requests_total class=drive' \
    'lb_requests_total\{[^}]*class="drive"'
assert_metric_present 'lb_requests_total class=health' \
    'lb_requests_total\{[^}]*class="health"'

# lb_request_duration_seconds histogram — only graphql/drive paths emit it
# (subscription is excluded; health has no upstream_response_time so the
# observe call is skipped).
assert_metric_present 'lb_request_duration_seconds_bucket class=graphql' \
    'lb_request_duration_seconds_bucket\{[^}]*class="graphql"'

# 3. /__hc/status moved from :8080 to :9090.
hc_9090=$(docker exec "$LB_CONTAINER" \
    curl -s -o /dev/null -w '%{http_code}' \
    "http://127.0.0.1:9090/__hc/status" 2>/dev/null || echo "000")
check "/__hc/status returns 200 on :9090" "200" "$hc_9090"

hc_8080=$(curl -s -o /dev/null -w '%{http_code}' "$LB/__hc/status" 2>/dev/null)
check "/__hc/status returns 404 on :8080" "404" "$hc_8080"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]

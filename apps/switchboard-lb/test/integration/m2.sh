#!/usr/bin/env sh
# M2 integration assertions: header-based pinning.
#
# Asserts that /graphql requests with a `Drive-Id` header land on the
# same backend every time, that requests without the header still
# succeed (round-robin fallback), and that /health and /d/:drive are
# unaffected by the routing path.
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

post_graphql_with_drive() {
    drive_id="$1"
    curl -sS -D - -o /dev/null -X POST \
        -H "Content-Type: application/json" \
        -H "Drive-Id: $drive_id" \
        --data-binary '{"query":"{ __typename }"}' \
        "$LB/graphql"
}

post_graphql_no_drive() {
    curl -sS -D - -o /dev/null -X POST \
        -H "Content-Type: application/json" \
        --data-binary '{"query":"{ __typename }"}' \
        "$LB/graphql"
}

# 1. Pinning via Drive-Id header — same id hits the same backend 5/5.
TS=$(date +%s)
ID="pin-$TS"

first=""
same=1
i=0
while [ "$i" -lt 5 ]; do
    resp=$(post_graphql_with_drive "$ID")
    u=$(header_value "$resp" X-Upstream-Id)
    if [ -z "$first" ]; then
        first="$u"
    elif [ "$u" != "$first" ]; then
        same=0
    fi
    i=$((i + 1))
done
check "Drive-Id pinning: 5/5 same backend" "1" "$same"
[ -n "$first" ] && echo "        pinned to: $first"

# 2. Different drive ids should generally hit different backends across the
#    sample. Not strictly guaranteed, but consistent hashing over enough
#    distinct ids should produce >1 distinct backend in 10 trials.
distinct=$(
    i=0
    while [ "$i" -lt 10 ]; do
        resp=$(post_graphql_with_drive "drive-$TS-$i")
        header_value "$resp" X-Upstream-Id
        i=$((i + 1))
    done | sort -u | wc -l
)
if [ "$distinct" -gt 1 ]; then
    echo "PASS  distinct Drive-Id values spread across >1 backend ($distinct)"
    PASS=$((PASS + 1))
else
    echo "FAIL  distinct Drive-Id values all hit one backend ($distinct)"
    FAIL=$((FAIL + 1))
fi

# 3. Missing Drive-Id header — request still succeeds (round-robin fallback).
resp=$(post_graphql_no_drive)
status=$(status_code "$resp")
# Any 2xx/4xx from the backend is fine; what matters is it didn't 4xx at the LB
# layer for missing routing info.
if [ "${status%??}" = "2" ] || [ "${status%??}" = "4" ]; then
    echo "PASS  missing Drive-Id reaches a backend (status $status)"
    PASS=$((PASS + 1))
else
    echo "FAIL  missing Drive-Id should reach a backend (got $status)"
    FAIL=$((FAIL + 1))
fi

# 4. Non-/graphql routes unaffected.
resp=$(curl -sS -D - -o /dev/null "$LB/health")
check "health 200 (local)"          "200" "$(status_code "$resp")"
check "health has no X-Upstream-Id" ""    "$(header_value "$resp" X-Upstream-Id)"

resp=$(curl -sS -D - -o /dev/null "$LB/d/my-drive")
check "d/:drive 200 (proxied)" "200" "$(status_code "$resp")"
u=$(header_value "$resp" X-Upstream-Id)
if [ -n "$u" ]; then
    echo "PASS  d/:drive reached a backend ($u)"
    PASS=$((PASS + 1))
else
    echo "FAIL  d/:drive did not reach any backend"
    FAIL=$((FAIL + 1))
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]

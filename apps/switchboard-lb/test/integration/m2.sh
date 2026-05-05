#!/usr/bin/env sh
# M2 integration assertions: body-based pinning.
#
# Asserts that /graphql requests with a routing identifier land on the
# same backend every time; that multi-id / missing-id / malformed bodies
# return the documented 4xx; that oversized bodies are rejected; and
# that /health and /d/:drive are unaffected by the body-parse path.
#
# The pinning assertions require the upstream to be `hash $doc_id
# consistent` (M2 stage 3). Run this script after the balancer flip.
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

post_graphql() {
    # Reads the body from stdin. Avoids shell-quoting pain and argv size
    # limits for large payloads.
    curl -sS -D - -o /dev/null -X POST \
        -H "Content-Type: application/json" \
        --data-binary @- \
        "$LB/graphql"
}

# 1. Pinning via variables.identifier — same id hits the same backend 5/5.
TS=$(date +%s)
ID="pin-$TS"
body='{"variables":{"identifier":"'$ID'"}}'

first=""
same=1
i=0
while [ "$i" -lt 5 ]; do
    resp=$(printf '%s' "$body" | post_graphql)
    u=$(header_value "$resp" X-Upstream-Id)
    if [ -z "$first" ]; then
        first="$u"
    elif [ "$u" != "$first" ]; then
        same=0
    fi
    i=$((i + 1))
done
check "identifier pinning: 5/5 same backend" "1" "$same"
[ -n "$first" ] && echo "        pinned to: $first"

# 2. Pinning via envelopes[0].channelMeta.id — same channel, same backend 5/5.
CH="ch-$TS"
body='{"variables":{"envelopes":[{"channelMeta":{"id":"'$CH'"}}]}}'

first=""
same=1
i=0
while [ "$i" -lt 5 ]; do
    resp=$(printf '%s' "$body" | post_graphql)
    u=$(header_value "$resp" X-Upstream-Id)
    if [ -z "$first" ]; then
        first="$u"
    elif [ "$u" != "$first" ]; then
        same=0
    fi
    i=$((i + 1))
done
check "pushSyncEnvelopes pinning: 5/5 same backend" "1" "$same"
[ -n "$first" ] && echo "        pinned to: $first"

# 3. 409 branches.
resp=$(printf '%s' '{"variables":{"identifiers":["a","b"]}}' | post_graphql)
check "409 deleteDocuments identifiers[]" "409" "$(status_code "$resp")"

resp=$(printf '%s' '{"variables":{"sourceParentIdentifier":"p1","targetParentIdentifier":"p2"}}' | post_graphql)
check "409 cross-parent moveRelationship" "409" "$(status_code "$resp")"

resp=$(printf '%s' '{"variables":{"envelopes":[{"channelMeta":{"id":"a"}},{"channelMeta":{"id":"b"}}]}}' | post_graphql)
check "409 cross-channel pushSyncEnvelopes" "409" "$(status_code "$resp")"

resp=$(printf '%s' '{"variables":{"input":{"filter":{"documentId":["a","b"]}}}}' | post_graphql)
check "409 multi-element touchChannel" "409" "$(status_code "$resp")"

resp=$(printf '%s' '{"variables":{"foo":"bar"}}' | post_graphql)
check "409 no routing identifier" "409" "$(status_code "$resp")"

# 4. 400 branches.
resp=$(printf '%s' '{ not json' | post_graphql)
check "400 malformed JSON" "400" "$(status_code "$resp")"

resp=$(printf '%s' '{"query":"{ __typename }"}' | post_graphql)
check "400 missing variables" "400" "$(status_code "$resp")"

# 5. 413 — body > 256 KiB.
big=$(head -c 300000 /dev/zero | tr '\0' 'x')
body='{"variables":{"identifier":"'$big'"}}'
resp=$(printf '%s' "$body" | post_graphql)
check "413 body over 256 KiB" "413" "$(status_code "$resp")"

# 6. Non-/graphql routes unaffected — no body parse, Lua does not fire.
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

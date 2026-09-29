#!/bin/sh
# Usage: verify.sh <holds|violated> <main-module> <invariant[,invariant...]> <max-steps>
# Bounded model checking with Apalache. Log and counterexample: out/verify-<main>-<invariant>.*
set -u
cd "$(dirname "$0")/.." || exit 1
expect="$1"; main="$2"; inv="$3"; steps="$4"
mkdir -p out
base="out/verify-$main-$(echo "$inv" | tr ',' '+')"
quint=$(command -v quint || echo ../node_modules/.bin/quint)
if [ ! -x "$quint" ]; then
  echo "FAIL verify $main $inv: quint not found (run through pnpm spec:verify)"
  exit 1
fi
# A fresh server per run, so no run attaches to a stale or busy one.
port=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1])')
rm -f "$base.itf.json"
start=$(date +%s)
# Hard cap (macOS has no timeout): VERIFY_TIMEOUT seconds, default 900.
perl scripts/with-timeout.pl "${VERIFY_TIMEOUT:-900}" \
  "$quint" verify PeerAgreement.qnt --main="$main" --invariant="$inv" --max-steps="$steps" \
  --apalache-config=apalache.json --server-endpoint="localhost:$port" \
  --out-itf="$base.itf.json" > "$base.log" 2>&1
code=$?
secs=$(( $(date +%s) - start ))
pkill -f "apalache.jar server --port=$port\$" 2>/dev/null
if [ "$code" -eq 124 ]; then
  echo "FAIL verify $main $inv: timed out after ${secs}s at ${VERIFY_TIMEOUT:-900}s cap ($base.log)"
  exit 1
elif [ "$expect" = holds ] && [ "$code" -eq 0 ] && grep -q "No violation found" "$base.log"; then
  echo "ok   verify $main $inv holds to $steps steps (${secs}s)"
elif [ "$expect" = violated ] && [ "$code" -eq 1 ] && grep -q "Found an issue" "$base.log"; then
  echo "ok   verify $main $inv violated in $(python3 -c "import json;print(len(json.load(open('$base.itf.json'))['states'])-1)") steps (${secs}s, $base.itf.json)"
else
  echo "FAIL verify $main $inv: expected $expect, quint exited $code after ${secs}s ($base.log)"
  exit 1
fi

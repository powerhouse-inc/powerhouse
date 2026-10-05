#!/bin/sh
# Usage: expect-violation.sh <main-module> <invariant>...
# Passes when the simulator violates every invariant listed. Traces: out/<main>-<invariant>.itf.json.
set -u
cd "$(dirname "$0")/.." || exit 1
main="$1"; shift
steps="${MAX_STEPS:-50}"; samples="${MAX_SAMPLES:-100000}"
mkdir -p out
status=0
for inv in "$@"; do
  base="out/$main-$inv"
  quint run PeerAgreement.qnt --main="$main" --invariant="$inv" \
    --max-steps="$steps" --max-samples="$samples" --seed="${SEED:-0x1}" \
    --mbt --out-itf="$base.itf.json" > "$base.log" 2>&1
  code=$?
  if [ "$code" -eq 1 ] && grep -q "Invariant violated" "$base.log"; then
    echo "ok   sim $main $inv violated ($base.itf.json)"
  else
    echo "FAIL sim $main $inv: expected a violation, quint exited $code ($base.log)"
    status=1
  fi
done
exit $status

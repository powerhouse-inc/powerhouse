#!/bin/sh
# Usage: expect-hold.sh <main-module> <invariant>...
# Passes when the simulator finds no violation of the listed invariants.
set -u
cd "$(dirname "$0")/.." || exit 1
main="$1"; shift
steps="${MAX_STEPS:-40}"; samples="${MAX_SAMPLES:-20000}"
mkdir -p out
base="out/$main-holds"
quint run PeerAgreement.qnt --main="$main" --invariants "$@" \
  --max-steps="$steps" --max-samples="$samples" --seed="${SEED:-0x1}" > "$base.log" 2>&1
code=$?
if [ "$code" -eq 0 ]; then
  echo "ok   sim $main holds: $*"
else
  echo "FAIL sim $main: quint exited $code ($base.log)"
fi
exit $code

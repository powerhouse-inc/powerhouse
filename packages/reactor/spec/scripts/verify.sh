#!/bin/sh
# Usage: verify.sh <holds|violated> <main-module> <invariant> <max-steps>
# Bounded model checking with Apalache. Logs and counterexamples: out/verify-<main>-<invariant>.*
set -u
cd "$(dirname "$0")/.." || exit 1
expect="$1"; main="$2"; inv="$3"; steps="$4"
mkdir -p out
base="out/verify-$main-$inv"
start=$(date +%s)
quint verify PeerAgreement.qnt --main="$main" --invariant="$inv" --max-steps="$steps" \
  --out-itf="$base.itf.json" > "$base.log" 2>&1
code=$?
secs=$(( $(date +%s) - start ))
if [ "$expect" = holds ] && [ "$code" -eq 0 ] && grep -q "No violation found" "$base.log"; then
  echo "ok   verify $main $inv holds to $steps steps (${secs}s)"
elif [ "$expect" = violated ] && [ "$code" -eq 1 ] && grep -q "Found an issue" "$base.log"; then
  echo "ok   verify $main $inv violated within $steps steps (${secs}s, $base.itf.json)"
else
  echo "FAIL verify $main $inv: expected $expect, quint exited $code after ${secs}s ($base.log)"
  exit 1
fi

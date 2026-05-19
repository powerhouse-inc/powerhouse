#!/usr/bin/env bash
# Benchmark runner for tsc/tsgo and eslint/oxlint.
# Each command is run twice: cold (after clearing relevant caches) and warm.
# Captured: real wall-clock seconds via `/usr/bin/time -p`.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT="$ROOT/benchmarks/results.json"
LOGDIR="$ROOT/benchmarks/logs"
mkdir -p "$LOGDIR"

bench() {
  local name="$1"; shift
  local mode="$1"; shift
  local cmd="$*"
  local log="$LOGDIR/${name}-${mode}.log"
  echo ">>> [$name/$mode] $cmd"
  local start end
  start=$(date +%s.%N)
  bash -c "$cmd" >"$log" 2>&1
  local rc=$?
  end=$(date +%s.%N)
  local elapsed
  elapsed=$(awk -v s="$start" -v e="$end" 'BEGIN { printf "%.2f", e - s }')
  echo "    rc=$rc elapsed=${elapsed}s"
  echo "{\"name\":\"$name\",\"mode\":\"$mode\",\"rc\":$rc,\"elapsed\":$elapsed}" >> "$OUT.jsonl"
}

clean_tsbuild() {
  find . -name '*.tsbuildinfo' -not -path '*/node_modules/*' -delete 2>/dev/null
  find . -type d -name '.tsbuild' -not -path '*/node_modules/*' -exec rm -rf {} + 2>/dev/null
  find . -type d -name 'ts-build' -not -path '*/node_modules/*' -exec rm -rf {} + 2>/dev/null
}

clean_eslint_cache() {
  find . -name '.eslintcache' -not -path '*/node_modules/*' -delete 2>/dev/null
}

: > "$OUT.jsonl"

echo "=== TSC baseline ==="
clean_tsbuild
bench tsc cold "pnpm typecheck"
bench tsc warm "pnpm typecheck"

if [ -x "node_modules/.bin/tsgo" ]; then
  echo "=== TSGO ==="
  clean_tsbuild
  bench tsgo cold "node_modules/.bin/tsgo --build"
  bench tsgo warm "node_modules/.bin/tsgo --build"
fi

echo "=== ESLint baseline ==="
clean_eslint_cache
bench eslint cold "NODE_OPTIONS=--max-old-space-size=8192 pnpm exec eslint --config eslint.config.js --quiet --cache --cache-strategy content ."
bench eslint warm "NODE_OPTIONS=--max-old-space-size=8192 pnpm exec eslint --config eslint.config.js --quiet --cache --cache-strategy content ."

if [ -x "node_modules/.bin/oxlint" ]; then
  echo "=== Oxlint ==="
  bench oxlint cold "pnpm exec oxlint"
  bench oxlint warm "pnpm exec oxlint"
fi

echo
echo "Results: $OUT.jsonl"
cat "$OUT.jsonl"

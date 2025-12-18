#!/usr/bin/env bash
set -euo pipefail

TEST_FILE="packages/reactor-api/test/two-reactor-gql-sync.test.ts"
PERF_DIR=".perf"
mkdir -p "$PERF_DIR"

ts="$(date +%Y%m%d-%H%M%S)"
mode="${1:-cpu}" # cpu | bubble
name="two-reactor-gql-tests-${ts}"

echo "Profiling: ${TEST_FILE}"
echo "Mode: ${mode}"
echo "Output dir: ${PERF_DIR}"
echo

if [[ "$mode" == "bubble" ]]; then
  # Async wait-time profile (timers/promises/I/O)
  # Writes an HTML report (Clinic output folder)
  pnpm dlx clinic bubbleprof -- node --import=tsx \
    node_modules/vitest/vitest.mjs run \
    --pool=threads --poolOptions.threads.minThreads=1 --poolOptions.threads.maxThreads=1 \
    --isolate=false \
    "$TEST_FILE"
  echo
  echo "Bubbleprof complete. Look for the generated clinic-bubbleprof-* folder / HTML."
  exit 0
fi

# CPU sampling profile (flame chart)
export NODE_OPTIONS="--cpu-prof --cpu-prof-dir=${PERF_DIR} --cpu-prof-name=${name}.cpuprofile"

pnpm exec vitest run \
  --pool=threads --poolOptions.threads.minThreads=1 --poolOptions.threads.maxThreads=1 \
  --isolate=false \
  "$TEST_FILE" \
  | tee "${PERF_DIR}/${name}.marks.log"

echo
echo "CPU profile written to: ${PERF_DIR}/${name}.cpuprofile"
echo "Log written to:         ${PERF_DIR}/${name}.marks.log"
echo
echo "Open the .cpuprofile in https://www.speedscope.app"

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

BUILD_OTEL=false
[[ " $* " == *" --otel"* ]] && BUILD_OTEL=true

TOTAL_STEPS=3
$BUILD_OTEL && TOTAL_STEPS=4
STEP=0

echo "Building packages..."

STEP=$((STEP + 1)); echo "  [${STEP}/${TOTAL_STEPS}] document-model"
pnpm --filter document-model run tsc --build

STEP=$((STEP + 1)); echo "  [${STEP}/${TOTAL_STEPS}] @powerhousedao/reactor"
pnpm --filter @powerhousedao/reactor run build
pnpm --filter @powerhousedao/reactor run build:bundle

if $BUILD_OTEL; then
  STEP=$((STEP + 1)); echo "  [${STEP}/${TOTAL_STEPS}] @powerhousedao/opentelemetry-instrumentation-reactor"
  pnpm --filter @powerhousedao/opentelemetry-instrumentation-reactor run build
fi

STEP=$((STEP + 1)); echo "  [${STEP}/${TOTAL_STEPS}] Running migrations"
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" \
  pnpm --filter document-drive run migrate

echo "Done. Starting reactor-direct..."
echo ""

exec tsx "${SCRIPT_DIR}/scripts/profiling/reactor-direct.ts" "$@"

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

BUILD_OTEL=false
DB_URL=""
for arg in "$@"; do
  [[ "$arg" == "--otel" ]] && BUILD_OTEL=true
done
for i in "$@"; do
  if [[ "$i" == "--db" ]]; then
    shift; DB_URL="$1"; break
  fi
  case "$i" in --db=*) DB_URL="${i#*=}"; break ;; esac
done

TOTAL_STEPS=3
$BUILD_OTEL && TOTAL_STEPS=$((TOTAL_STEPS + 1))
[[ "$DB_URL" == postgresql://* ]] && TOTAL_STEPS=$((TOTAL_STEPS + 1))
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

if [[ "$DB_URL" == postgresql://* ]]; then
  STEP=$((STEP + 1)); echo "  [${STEP}/${TOTAL_STEPS}] Running migrations"
  DATABASE_URL="$DB_URL" pnpm --filter document-drive run migrate
fi

echo "Done. Starting reactor-direct..."
echo ""

exec tsx "${SCRIPT_DIR}/scripts/profiling/reactor-direct.ts" "$@"

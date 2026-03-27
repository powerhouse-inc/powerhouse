#!/usr/bin/env bash
# Shared build script for profiling tools.
# Usage: build-packages.sh [--otel] [--migrate <postgresql-url>] [--with-switchboard]
#
# Flags:
#   --otel                Build @powerhousedao/opentelemetry-instrumentation-reactor
#   --migrate <url>       Run document-drive migrations against a PostgreSQL URL
#   --with-switchboard    Also build vetra, switchboard, and reactor-api
set -euo pipefail

BUILD_OTEL=false
WITH_SWITCHBOARD=false
MIGRATE_URL=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --otel) BUILD_OTEL=true; shift ;;
    --with-switchboard) WITH_SWITCHBOARD=true; shift ;;
    --migrate) MIGRATE_URL="${2?'--migrate requires a PostgreSQL URL'}"; shift 2 ;;
    *) echo "Error: unknown option '$1'"; exit 1 ;;
  esac
done

TOTAL_STEPS=2
$BUILD_OTEL && TOTAL_STEPS=$((TOTAL_STEPS + 1))
[[ "$MIGRATE_URL" == postgresql://* ]] && TOTAL_STEPS=$((TOTAL_STEPS + 1))
$WITH_SWITCHBOARD && TOTAL_STEPS=$((TOTAL_STEPS + 3))
STEP=0

echo "Building packages..."

step() {
  # step <label> <cmd> [args...]
  local label="$1"; shift
  STEP=$((STEP + 1))
  echo "  [${STEP}/${TOTAL_STEPS}] ${label}"
  if ! "$@"; then
    echo "Error: ${label} failed — aborting"
    exit 1
  fi
}

step "document-model" \
  pnpm --filter document-model run tsc --build

step "@powerhousedao/reactor (declarations)" \
  pnpm --filter @powerhousedao/reactor run build
# bundle counts as part of the same step number
if ! pnpm --filter @powerhousedao/reactor run build:bundle; then
  echo "Error: @powerhousedao/reactor bundle failed — aborting"
  exit 1
fi

if $BUILD_OTEL; then
  step "@powerhousedao/opentelemetry-instrumentation-reactor" \
    pnpm --filter @powerhousedao/opentelemetry-instrumentation-reactor run build
fi

if [[ "$MIGRATE_URL" == postgresql://* ]]; then
  step "migrations (document-drive)" \
    env DATABASE_URL="$MIGRATE_URL" pnpm --filter document-drive run migrate
fi

if $WITH_SWITCHBOARD; then
  step "@powerhousedao/vetra (declarations)" \
    pnpm --filter @powerhousedao/vetra run tsc --build
  # bundle counts as part of the same step number
  if ! pnpm --filter @powerhousedao/vetra run build:bundle; then
    echo "Error: @powerhousedao/vetra bundle failed — aborting"
    exit 1
  fi

  step "@powerhousedao/switchboard" \
    pnpm --filter @powerhousedao/switchboard run tsc --build

  step "@powerhousedao/reactor-api (build:misc)" \
    pnpm --filter @powerhousedao/reactor-api run build:misc
fi

echo "Build complete."
echo

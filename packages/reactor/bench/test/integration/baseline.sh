#!/usr/bin/env bash
# Run a single bench iteration at the current REACTOR_WORKERS value.
#
# Brings up postgres + bench-host (rebuilding the image), waits for /healthz,
# then runs the k6 loadtest as a one-shot --profile loadtest service.
#
# Defaults:
#   REACTOR_WORKERS=0   in-process executor
#   NUM_DRIVES=8
#   VUS=32
#   DURATION=60s
#
# Override any of the above by exporting the env var before invoking.

set -euo pipefail

cd "$(dirname "$0")/../.."

export REACTOR_WORKERS="${REACTOR_WORKERS:-0}"
export NUM_DRIVES="${NUM_DRIVES:-8}"
export VUS="${VUS:-32}"
export DURATION="${DURATION:-60s}"

echo "[baseline] REACTOR_WORKERS=${REACTOR_WORKERS} NUM_DRIVES=${NUM_DRIVES} VUS=${VUS} DURATION=${DURATION}"

docker compose up -d --build --wait --wait-timeout 240 postgres bench-host

docker compose --profile loadtest run --rm loadtest

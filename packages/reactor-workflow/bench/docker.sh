#!/bin/sh
# Runs a bench command in a Linux container with a CPU quota and memory limit,
# next to the profiling stack's Postgres. Usage: bench/docker.sh <cpus> <memory> <command...>
set -e
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
CPUS=$1
MEM=$2
shift 2
# Mounted at its own path, so pnpm's symlinks resolve inside the container.
exec docker run --rm \
  --cpus="$CPUS" --memory="$MEM" --memory-swap="$MEM" \
  --network profiling_default \
  -v "$ROOT:$ROOT" \
  -w "$ROOT/packages/reactor-workflow" \
  node:24-bookworm-slim "$@"

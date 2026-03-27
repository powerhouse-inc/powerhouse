#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROFILING_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Extract flags relevant to the build step without consuming them from $@
# (all args are still forwarded to reactor-direct.ts below).
BUILD_OTEL=false
DB_URL=""
prev_arg=""
for arg in "$@"; do
  [[ "$arg" == "--otel" ]] && BUILD_OTEL=true
  if [[ "$prev_arg" == "--db" ]]; then DB_URL="$arg"; fi
  case "$arg" in --db=*) DB_URL="${arg#*=}" ;; esac
  prev_arg="$arg"
done

BUILD_ARGS=()
$BUILD_OTEL && BUILD_ARGS+=(--otel)
[[ "$DB_URL" == postgresql://* ]] && BUILD_ARGS+=(--migrate "$DB_URL")

bash "${PROFILING_DIR}/build-packages.sh" "${BUILD_ARGS[@]+"${BUILD_ARGS[@]}"}"

echo "Starting reactor-direct..."
echo ""

exec tsx "${SCRIPT_DIR}/scripts/profiling/reactor-direct.ts" "$@"

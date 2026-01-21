#!/usr/bin/env bash
set -euo pipefail

# Run Switchboard with Pyroscope continuous profiling (no CPU profiling)
# Usage: ./scripts/switchboard-pyroscope.sh [--v2|--legacy] [switchboard-options...]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Default storage mode (v2)
STORAGE_V2="true"
STORAGE_MODE_LABEL="v2"

# Parse our flags (before passing rest to switchboard)
SWITCHBOARD_ARGS=()
while [[ $# -gt 0 ]]; do
  case $1 in
    --v2)
      STORAGE_V2="true"
      STORAGE_MODE_LABEL="v2"
      shift
      ;;
    --legacy)
      STORAGE_V2=""
      STORAGE_MODE_LABEL="legacy"
      shift
      ;;
    --help|-h)
      echo "Usage: ./scripts/profiling/switchboard-pyroscope.sh [options] [switchboard-options...]"
      echo ""
      echo "Options:"
      echo "  --legacy   Use legacy storage (REACTOR_STORAGE_V2=false)"
      echo "  --v2       Use new storage (default)"
      echo "  --help     Show this help message"
      echo ""
      echo "All other options are passed to switchboard."
      exit 0
      ;;
    *)
      SWITCHBOARD_ARGS+=("$1")
      shift
      ;;
  esac
done

# Set storage mode
if [ -n "$STORAGE_V2" ]; then
  export REACTOR_STORAGE_V2="true"
else
  export REACTOR_STORAGE_V2="false"
fi

# Set up Pyroscope profiling on port 4040
export PYROSCOPE_SERVER_ADDRESS="http://localhost:4040"
export PYROSCOPE_APPLICATION_NAME="powerhouse-mono-switchboard"
# Optional: Add tags for better organization
# export PYROSCOPE_TAGS="env=development,scenario=profiling"

echo "=========================================="
echo "Switchboard with Pyroscope Profiling"
echo "=========================================="
echo "Pyroscope: ${PYROSCOPE_SERVER_ADDRESS}"
echo "Application: ${PYROSCOPE_APPLICATION_NAME}"
echo "Storage mode: ${STORAGE_MODE_LABEL}"
if [ -n "$STORAGE_V2" ]; then
  echo "  REACTOR_STORAGE_V2=true"
fi
echo ""
echo "Note: Make sure Pyroscope server is running on port 4040"
echo "  Run: docker-compose -f docker-compose.pyroscope.yml up -d"
echo "  Or: docker run -it -p 4040:4040 grafana/pyroscope:latest server"
echo "  View UI: http://localhost:4040"
echo ""
echo "Press Ctrl+C to stop"
echo "=========================================="
echo

# Check if switchboard is installed
SWITCHBOARD_PATH="${SCRIPT_DIR}/apps/switchboard/dist/src/index.js"
if [ ! -f "$SWITCHBOARD_PATH" ]; then
  echo "Error: Switchboard not found at ${SWITCHBOARD_PATH}"
  echo "Please install @powerhousedao/switchboard first"
  exit 1
fi

# Run switchboard directly
echo "Starting Switchboard with Pyroscope profiling..."
echo

node "$SWITCHBOARD_PATH" "${SWITCHBOARD_ARGS[@]}"

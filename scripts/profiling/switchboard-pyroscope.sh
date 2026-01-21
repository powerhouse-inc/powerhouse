#!/usr/bin/env bash
set -euo pipefail

# Run Switchboard with Pyroscope continuous profiling (no CPU profiling)
# Usage: ./scripts/switchboard-pyroscope.sh [--mode v2|legacy] [--postgres URL] [switchboard-options...]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Default storage mode (v2)
STORAGE_V2="true"
STORAGE_MODE_LABEL="v2"
DATABASE_URL=""

# Parse our flags (before passing rest to switchboard)
SWITCHBOARD_ARGS=()
while [[ $# -gt 0 ]]; do
  case $1 in
    --mode|-m)
      if [ -z "${2:-}" ]; then
        echo "Error: --mode/-m requires a value (v2 or legacy)"
        exit 1
      fi
      case "$2" in
        v2)
          STORAGE_V2="true"
          STORAGE_MODE_LABEL="v2"
          ;;
        legacy)
          STORAGE_V2=""
          STORAGE_MODE_LABEL="legacy"
          ;;
        *)
          echo "Error: --mode/-m must be 'v2' or 'legacy', got: $2"
          exit 1
          ;;
      esac
      shift 2
      ;;
    --postgres|-p)
      if [ -z "${2:-}" ]; then
        echo "Error: --postgres/-p requires a database URL"
        echo "Example: --postgres postgresql://user:pass@host:port/database"
        exit 1
      fi
      DATABASE_URL="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: ./scripts/profiling/switchboard-pyroscope.sh [options] [switchboard-options...]"
      echo ""
      echo "Options:"
      echo "  --mode, -m <v2|legacy> Storage mode: 'v2' for new storage (default) or 'legacy' for legacy storage"
      echo "  --postgres, -p <url>   Set PostgreSQL database URL (sets both PH_REACTOR_DATABASE_URL and DATABASE_URL)"
      echo "  --help, -h              Show this help message"
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

# Set database URLs if provided
if [ -n "$DATABASE_URL" ]; then
  export PH_REACTOR_DATABASE_URL="$DATABASE_URL"
  export DATABASE_URL="$DATABASE_URL"
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
if [ -n "$DATABASE_URL" ]; then
  echo "Database: PostgreSQL"
  # Mask password in URL for display
  MASKED_URL=$(echo "$DATABASE_URL" | sed -E 's|://([^:]+):([^@]+)@|://\1:***@|')
  echo "  PH_REACTOR_DATABASE_URL=${MASKED_URL}"
  echo "  DATABASE_URL=${MASKED_URL}"
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

# Track the node process and forward signals
node "$SWITCHBOARD_PATH" ${SWITCHBOARD_ARGS[@]+"${SWITCHBOARD_ARGS[@]}"} &
NODE_PID=$!

cleanup() {
  echo ""
  echo "Stopping switchboard (PID: $NODE_PID)..."
  kill -TERM "$NODE_PID" 2>/dev/null
  wait "$NODE_PID" 2>/dev/null
  echo "Stopped."
  exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for node process
wait "$NODE_PID"

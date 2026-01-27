#!/usr/bin/env bash
set -euo pipefail

# Run Switchboard with different runtimes (node vs bun) for comparison
# Usage: ./scripts/profiling/switchboard-runtime.sh [--runtime node|bun] [--mode v2|legacy] [--postgres URL] [switchboard-options...]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Defaults
RUNTIME="node"
STORAGE_V2="true"
STORAGE_MODE_LABEL="v2"
DATABASE_URL=""

# Parse our flags (before passing rest to switchboard)
SWITCHBOARD_ARGS=()
while [[ $# -gt 0 ]]; do
  case $1 in
    --runtime|-r)
      if [ -z "${2:-}" ]; then
        echo "Error: --runtime/-r requires a value (node or bun)"
        exit 1
      fi
      case "$2" in
        node|bun)
          RUNTIME="$2"
          ;;
        *)
          echo "Error: --runtime/-r must be 'node' or 'bun', got: $2"
          exit 1
          ;;
      esac
      shift 2
      ;;
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
      echo "Usage: ./scripts/profiling/switchboard-runtime.sh [options] [switchboard-options...]"
      echo ""
      echo "Options:"
      echo "  --runtime, -r <node|bun>  Runtime to use (default: node)"
      echo "  --mode, -m <v2|legacy>    Storage mode: 'v2' (default) or 'legacy'"
      echo "  --postgres, -p <url>      Set PostgreSQL database URL"
      echo "  --help, -h                Show this help message"
      echo ""
      echo "All other options are passed to switchboard."
      echo ""
      echo "Examples:"
      echo "  ./scripts/profiling/switchboard-runtime.sh --runtime node"
      echo "  ./scripts/profiling/switchboard-runtime.sh --runtime bun"
      echo "  ./scripts/profiling/switchboard-runtime.sh -r bun -m legacy"
      exit 0
      ;;
    *)
      SWITCHBOARD_ARGS+=("$1")
      shift
      ;;
  esac
done

# Check runtime is available
if ! command -v "$RUNTIME" &> /dev/null; then
  echo "Error: $RUNTIME is not installed or not in PATH"
  if [ "$RUNTIME" = "bun" ]; then
    echo "Install bun: curl -fsSL https://bun.sh/install | bash"
  fi
  exit 1
fi

# Get runtime version
RUNTIME_VERSION=$("$RUNTIME" --version 2>&1 | head -1)

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

echo "=========================================="
echo "Switchboard Runtime Comparison"
echo "=========================================="
echo "Runtime: ${RUNTIME} (${RUNTIME_VERSION})"
echo "Storage mode: ${STORAGE_MODE_LABEL}"
if [ -n "$STORAGE_V2" ]; then
  echo "  REACTOR_STORAGE_V2=true"
fi
if [ -n "$DATABASE_URL" ]; then
  echo "Database: PostgreSQL"
  MASKED_URL=$(echo "$DATABASE_URL" | sed -E 's|://([^:]+):([^@]+)@|://\1:***@|')
  echo "  DATABASE_URL=${MASKED_URL}"
fi
echo ""
echo "Press Ctrl+C to stop"
echo "=========================================="
echo

# Check if switchboard is installed
SWITCHBOARD_PATH="${SCRIPT_DIR}/apps/switchboard/dist/src/index.js"
if [ ! -f "$SWITCHBOARD_PATH" ]; then
  echo "Error: Switchboard not found at ${SWITCHBOARD_PATH}"
  echo "Run: NODE_OPTIONS='--max-old-space-size=8192' pnpm tsc:build"
  exit 1
fi

# Run switchboard
echo "Starting Switchboard with ${RUNTIME}..."
START_TIME=$(date +%s%3N)
echo

# Track the process and forward signals
"$RUNTIME" "$SWITCHBOARD_PATH" ${SWITCHBOARD_ARGS[@]+"${SWITCHBOARD_ARGS[@]}"} &
PROC_PID=$!

cleanup() {
  echo ""
  echo "Stopping switchboard (PID: $PROC_PID)..."
  kill -TERM "$PROC_PID" 2>/dev/null
  wait "$PROC_PID" 2>/dev/null
  echo "Stopped."
  exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for process
wait "$PROC_PID"

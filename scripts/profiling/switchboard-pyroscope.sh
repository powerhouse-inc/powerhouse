#!/usr/bin/env bash
set -euo pipefail

# Run Switchboard with Pyroscope continuous profiling (wall:wall + CPU mode)
# Usage: ./scripts/profiling/switchboard-pyroscope.sh [--runtime node|bun] [--mode v2|legacy] [--postgres URL] [switchboard-options...]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Defaults
RUNTIME="node"
STORAGE_V2="true"
STORAGE_MODE_LABEL="v2"
DATABASE_URL=""
OTEL_ENDPOINT=""

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
    --otel)
      if [ -n "${2:-}" ] && [[ "$2" != --* ]]; then
        OTEL_ENDPOINT="$2"
        shift 2
      else
        OTEL_ENDPOINT="http://localhost:4318"
        shift 1
      fi
      ;;
    --help|-h)
      echo "Usage: ./scripts/profiling/switchboard-pyroscope.sh [options] [switchboard-options...]"
      echo ""
      echo "Options:"
      echo "  --runtime, -r <node|bun>  Runtime to use (default: node)"
      echo "  --mode, -m <v2|legacy>    Storage mode: 'v2' (default) or 'legacy'"
      echo "  --postgres, -p <url>      Set PostgreSQL database URL"
      echo "  --otel [endpoint]         Enable OpenTelemetry metrics export (default: http://localhost:4318)"
      echo "  --help, -h                Show this help message"
      echo ""
      echo "All other options are passed to switchboard."
      echo ""
      echo "Examples:"
      echo "  ./scripts/profiling/switchboard-pyroscope.sh"
      echo "  ./scripts/profiling/switchboard-pyroscope.sh --runtime bun"
      echo "  ./scripts/profiling/switchboard-pyroscope.sh -r bun -m legacy"
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

# Set up Pyroscope profiling on port 4040
# Note: Pyroscope uses @datadog/pprof (a native addon via V8 C++ APIs) which Bun does not support.
# See: https://github.com/oven-sh/bun/issues/20516
PYROSCOPE_ENABLED=""
if [ "$RUNTIME" = "node" ]; then
  PYROSCOPE_ENABLED="true"
  export PYROSCOPE_SERVER_ADDRESS="http://localhost:4040"
  export PYROSCOPE_APPLICATION_NAME="powerhouse-mono-switchboard"
  export PYROSCOPE_WALL_ENABLED="true"
  # CPU profiling is always enabled alongside wall:wall mode
  # Optional: Add tags for better organization
  # export PYROSCOPE_TAGS="env=development,scenario=profiling"
fi

echo "=========================================="
echo "Switchboard with Pyroscope Profiling"
echo "=========================================="
echo "Runtime: ${RUNTIME} (${RUNTIME_VERSION})"
if [ -n "$PYROSCOPE_ENABLED" ]; then
  echo "Pyroscope: ${PYROSCOPE_SERVER_ADDRESS}"
  echo "Application: ${PYROSCOPE_APPLICATION_NAME}"
  echo "Profiling: wall:wall + CPU"
else
  echo "Pyroscope: disabled (@datadog/pprof native addon is incompatible with bun)"
fi
echo "Storage mode: ${STORAGE_MODE_LABEL}"
if [ -n "$OTEL_ENDPOINT" ]; then
  echo "OTel endpoint: ${OTEL_ENDPOINT}"
fi
if [ -n "$STORAGE_V2" ]; then
  echo "  REACTOR_STORAGE_V2=true"
fi
if [ -n "$DATABASE_URL" ]; then
  echo "Database: PostgreSQL"
  MASKED_URL=$(echo "$DATABASE_URL" | sed -E 's|://([^:]+):([^@]+)@|://\1:***@|')
  echo "  PH_REACTOR_DATABASE_URL=${MASKED_URL}"
  echo "  DATABASE_URL=${MASKED_URL}"
fi
if [ -n "$PYROSCOPE_ENABLED" ]; then
  echo ""
  echo "Note: Make sure Pyroscope server is running on port 4040"
  echo "  Run: docker-compose -f docker-compose.pyroscope.yml up -d"
  echo "  Or: docker run -it -p 4040:4040 grafana/pyroscope:latest server"
  echo "  View UI: http://localhost:4040"
fi
echo ""
echo "Press Ctrl+C to stop"
echo "=========================================="
echo

# Build all required packages
TOTAL_STEPS=5
[ -n "$OTEL_ENDPOINT" ] && TOTAL_STEPS=6
STEP=0

echo "Building packages..."

STEP=$((STEP + 1)); echo "  [${STEP}/${TOTAL_STEPS}] document-model"
if ! pnpm --filter document-model run tsc --build; then
  echo "Error: document-model build failed — aborting"
  exit 1
fi

STEP=$((STEP + 1)); echo "  [${STEP}/${TOTAL_STEPS}] @powerhousedao/reactor"
if ! pnpm --filter @powerhousedao/reactor run build; then
  echo "Error: reactor build failed — aborting"
  exit 1
fi
if ! pnpm --filter @powerhousedao/reactor run build:bundle; then
  echo "Error: reactor bundle build failed — aborting"
  exit 1
fi

if [ -n "$OTEL_ENDPOINT" ]; then
  STEP=$((STEP + 1)); echo "  [${STEP}/${TOTAL_STEPS}] @powerhousedao/opentelemetry-instrumentation-reactor"
  if ! pnpm --filter @powerhousedao/opentelemetry-instrumentation-reactor run build; then
    echo "Error: opentelemetry-instrumentation-reactor build failed — aborting"
    exit 1
  fi
fi

STEP=$((STEP + 1)); echo "  [${STEP}/${TOTAL_STEPS}] document-drive migrations"
if [ -n "$DATABASE_URL" ]; then
  if ! pnpm --filter document-drive run migrate; then
    echo "Error: database migration failed — aborting"
    exit 1
  fi
else
  echo "  (skipped — no --postgres provided)"
fi

STEP=$((STEP + 1)); echo "  [${STEP}/${TOTAL_STEPS}] @powerhousedao/switchboard"
if ! pnpm --filter @powerhousedao/switchboard run tsc --build; then
  echo "Error: switchboard build failed — aborting"
  exit 1
fi

STEP=$((STEP + 1)); echo "  [${STEP}/${TOTAL_STEPS}] @powerhousedao/reactor-api"
if ! pnpm --filter @powerhousedao/reactor-api run build:misc; then
  echo "Error: reactor-api build:misc failed — aborting"
  exit 1
fi

echo "Build complete."
echo

# Resolve switchboard path
SWITCHBOARD_PATH="${SCRIPT_DIR}/apps/switchboard/dist/src/index.js"
if [ ! -f "$SWITCHBOARD_PATH" ]; then
  echo "Error: Switchboard not found at ${SWITCHBOARD_PATH}"
  exit 1
fi

# Export OTel endpoint for switchboard to consume.
# switchboard reads OTEL_EXPORTER_OTLP_ENDPOINT in src/metrics.ts to
# initialise a MeterProvider and export reactor metrics via OTLP HTTP.
if [ -n "$OTEL_ENDPOINT" ]; then
  export OTEL_EXPORTER_OTLP_ENDPOINT="$OTEL_ENDPOINT"
fi

# Run switchboard
if [ -n "$PYROSCOPE_ENABLED" ] && [ -n "$OTEL_ENDPOINT" ]; then
  echo "Starting Switchboard with ${RUNTIME}, Pyroscope profiling and OTel metrics..."
elif [ -n "$PYROSCOPE_ENABLED" ]; then
  echo "Starting Switchboard with ${RUNTIME} and Pyroscope profiling..."
elif [ -n "$OTEL_ENDPOINT" ]; then
  echo "Starting Switchboard with ${RUNTIME} and OTel metrics..."
else
  echo "Starting Switchboard with ${RUNTIME}..."
fi
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

#!/usr/bin/env bash
set -euo pipefail

# Run Switchboard with Pyroscope continuous profiling (no CPU profiling)
# Usage: ./scripts/switchboard-pyroscope.sh [switchboard-options...]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

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

node "$SWITCHBOARD_PATH" "$@"

#!/usr/bin/env bash
#
# Run burst-load experiments across a sparse (N, mutationInterval) matrix.
# Uses --duration for burst length and --drain for recovery time.
#
# Goal: establish coarse capacity boundary points for N up to 50.
#
# Usage: cd test/test-connect && bash run-burst-experiments.sh
#
# After completion, run: .venv/bin/python3 src/parse-experiments.py
#

set -euo pipefail

PORT=4001
DURATION=10000       # 10 second burst
DRAIN=90000          # 90 second drain
S_MAX=10000          # post-consolidation threshold
LOG_BASE="./logs"

# Experiment matrix: (clients, mutationInterval_ms, label)
# M ≈ 2000 / interval (generateOperations produces avg 2 ops per call)
#
# Prior results show:
#   N=4,M≈20 → STABLE    N=10,M≈20 → STABLE    N=10,M≈10 → FAILED
#   Everything N≥20 at M≈10 → FAILED
#   Anomaly: higher M (better batching) survives where lower M fails
#
# This matrix maps the boundary with finer granularity:
#   - N=5..8 to find where failures start
#   - M≈5 (int=400) and M≈15 (int=130) to map the M dimension
#   - N=15 to fill the N=10..20 gap
EXPERIMENTS=(
  # Boundary exploration: N=5..8
  "5   200  N5_M10"       # just above N=4 (survived), M≈10
  "5   100  N5_M20"       # just above N=4, M≈20
  "6   200  N6_M10"       # N=6, M≈10
  "8   200  N8_M10"       # N=8, M≈10, approaching N=10 (failed)
  "8   100  N8_M20"       # N=8, M≈20

  # M dimension at N=10 (M≈10 failed, M≈20 survived)
  "10  400  N10_M5"       # N=10, M≈5, does lower M help?
  "10  130  N10_M15"      # N=10, M≈15, between M=10(fail) and M=20(survive)

  # Fill N=10..20 gap
  "15  200  N15_M10"      # N=15, M≈10
  "15  100  N15_M20"      # N=15, M≈20, between N=10(survive) and N=20(fail) at M≈20

  # Lower M at high N
  "20  400  N20_M5"       # N=20, M≈5, does very low M save high N?
)

echo "========================================"
echo "Burst-Load Capacity Experiments"
echo "========================================"
echo "Burst duration: ${DURATION}ms"
echo "Drain time: ${DRAIN}ms"
echo "S_max: ${S_MAX}"
echo "Total experiments: ${#EXPERIMENTS[@]}"
echo ""

STARTED_AT=$(date +%s)
IDX=0

for exp in "${EXPERIMENTS[@]}"; do
  read -r CLIENTS INTERVAL LABEL <<< "$exp"
  IDX=$((IDX + 1))

  echo "────────────────────────────────────────"
  echo "[$IDX/${#EXPERIMENTS[@]}] $LABEL: N=$CLIENTS, interval=${INTERVAL}ms, burst=${DURATION}ms, drain=${DRAIN}ms"
  echo "────────────────────────────────────────"

  npx tsx src/orchestrator.ts \
    --port "$PORT" \
    --clients "$CLIENTS" \
    --duration "$DURATION" \
    --mutation-interval "$INTERVAL" \
    --drain "$DRAIN" \
    --max-skip-threshold "$S_MAX" \
    --log-dir "$LOG_BASE" \
    || true  # Don't abort on failure

  echo ""
  echo "  Experiment $LABEL complete."
  echo ""

  # Brief pause to let the port free up
  sleep 2
done

ELAPSED=$(( $(date +%s) - STARTED_AT ))
echo "========================================"
echo "All experiments complete in ${ELAPSED}s"
echo "Logs in: $LOG_BASE"
echo ""
echo "Next: .venv/bin/python3 src/parse-experiments.py"
echo "Then: .venv/bin/python3 src/burst-model.py --experimental experiments.json"
echo "========================================"

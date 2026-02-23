#!/usr/bin/env bash
#
# Run reshuffle stability experiments across different (N, mutationInterval) configs.
# Each experiment runs the orchestrator for a short duration and logs results.
#
# Usage: cd test/test-connect && bash run-experiments.sh
#
# After completion, run: .venv/bin/python3 src/parse-experiments.py
#

set -euo pipefail

PORT=4001
DURATION=45000   # 45 seconds per experiment
LOG_BASE="./logs"

# Experiment matrix: (clients, mutationInterval_ms, label)
# M ≈ 2000 / interval (generateOperations produces avg 2 ops per call)
# Goal: one green (stable) and one red (unstable) point for each N=1..10
EXPERIMENTS=(
  # N=1: only stable point
  "1   200  N1_M10_green"     # N=1, M≈10  → X_crit=82ms  (stable)

  # N=2
  "2   800  N2_M2.5_green"    # N=2, M≈2.5 → stable
  "2   200  N2_M10_red"       # N=2, M≈10  → unstable

  # N=3
  "3  1000  N3_M2_green"      # N=3, M≈2   → stable
  "3   400  N3_M5_red"        # N=3, M≈5   → unstable

  # N=4
  "4  2000  N4_M1_green"      # N=4, M≈1   → X_crit=62ms  (stable)
  "4   400  N4_M5_red"        # N=4, M≈5   → X_crit=12ms  (unstable)

  # N=5
  "5  2000  N5_M1_green"      # N=5, M≈1   → X_crit=40ms  (stable)
  "5   667  N5_M3_red"        # N=5, M≈3   → X_crit=13ms  (unstable)

  # N=6
  "6  2000  N6_M1_green"      # N=6, M≈1   → X_crit=28ms  (stable)
  "6  1000  N6_M2_red"        # N=6, M≈2   → X_crit=6ms   (unstable)

  # N=7
  "7  4000  N7_M0.5_green"    # N=7, M≈0.5 → X_crit=33ms  (stable)
  "7  1000  N7_M2_red"        # N=7, M≈2   → X_crit=8ms   (unstable)

  # N=8
  "8  4000  N8_M0.5_green"    # N=8, M≈0.5 → X_crit=26ms  (stable)
  "8  2000  N8_M1_red"        # N=8, M≈1   → X_crit=13ms  (unstable)

  # N=9
  "9  5000  N9_M0.4_green"    # N=9, M≈0.4 → X_crit=26ms  (stable)
  "9  2000  N9_M1_red"        # N=9, M≈1   → X_crit=10ms  (unstable)

  # N=10
  "10  8000  N10_M0.25_green" # N=10, M≈0.25 → X_crit=33ms (stable)
  "10  2000  N10_M1_red"      # N=10, M≈1   → X_crit=8ms   (unstable)
)

echo "========================================"
echo "Reshuffle Stability Experiments"
echo "========================================"
echo "Duration per experiment: ${DURATION}ms"
echo "Total experiments: ${#EXPERIMENTS[@]}"
echo ""

STARTED_AT=$(date +%s)
IDX=0

for exp in "${EXPERIMENTS[@]}"; do
  read -r CLIENTS INTERVAL LABEL <<< "$exp"
  IDX=$((IDX + 1))

  echo "────────────────────────────────────────"
  echo "[$IDX/${#EXPERIMENTS[@]}] $LABEL: N=$CLIENTS, interval=${INTERVAL}ms"
  echo "────────────────────────────────────────"

  # Run the orchestrator. It creates its own timestamped log dir.
  npx tsx src/orchestrator.ts \
    --port "$PORT" \
    --clients "$CLIENTS" \
    --duration "$DURATION" \
    --mutation-interval "$INTERVAL" \
    --log-dir "$LOG_BASE" \
    || true  # Don't abort on failure (unstable configs will have non-zero exit)

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
echo "========================================"

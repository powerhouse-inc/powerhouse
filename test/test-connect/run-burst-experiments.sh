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
# Model boundary: (N-1)*M ≈ 83  (K_STORE=12, S_max=10000, T_burst=10s)
#
# Known results:
#   N=8:  M≈10 pass, M≈20 fail     → need lowest fail (try M≈15)
#   N=10: M≈5 pass,  M≈10 fail     → boundary found
#   N=15: M≈10 fail                 → need lowest fail (try M≈5)
#   N=20: M≈5 fail                  → need pass (try M≈3)
#   N=30: M≈10 fail                 → need lowest fail (try M≈5) + pass (try M≈2)
#   N=40: M≈10 fail                 → need lowest fail (try M≈5) + pass (try M≈2)
#   N=50: M≈10 fail                 → need lowest fail (try M≈5) + pass (try M≈1.5)
#
# Strategy: 1 lowest-fail + 1 potential-pass per N where needed
EXPERIMENTS=(
  # N=5: pass near boundary + fail above
  "5   100  N5_M20"       # (N-1)*M = 4*20 = 80 < 83, expect PASS (near line)
  "5   70   N5_M29"       # (N-1)*M = 4*29 = 116 > 83, expect FAIL

  # N=10: confirm boundary
  "10  400  N10_M5"       # (N-1)*M = 9*5 = 45 < 83, expect PASS
  "10  200  N10_M10"      # (N-1)*M = 9*10 = 90 > 83, expect FAIL

  # N=20: find pass below M≈5(fail)
  "20  670  N20_M3"       # (N-1)*M = 19*3 = 57 < 83, expect PASS

  # N=30: lowest fail + potential pass
  "30  400  N30_M5"       # (N-1)*M = 29*5 = 145 > 83, expect FAIL
  "30 1000  N30_M2"       # (N-1)*M = 29*2 = 58 < 83, expect PASS

  # N=40: lowest fail + potential pass
  "40  400  N40_M5"       # (N-1)*M = 39*5 = 195 > 83, expect FAIL
  "40 1000  N40_M2"       # (N-1)*M = 39*2 = 78 < 83, expect PASS

  # N=50: lowest fail + potential pass
  "50  400  N50_M5"       # (N-1)*M = 49*5 = 245 > 83, expect FAIL
  "50 1300  N50_M1.5"     # (N-1)*M = 49*1.5 = 74 < 83, expect PASS
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

#!/usr/bin/env bash
# Run 8: host pool size sweep. For each (REACTOR_DB_POOL_SIZE_HOST,
# REACTOR_WORKERS) pair in the cartesian product, runs a fixed-duration k6
# load against the bench-host and queries Prometheus for the matrix headline
# numbers. Appends each row to BASELINE.md and emits a parseable summary on
# stdout so a follow-up script can pull richer metrics by timestamp.
#
# Inputs (env overrides):
#   POOL_LIST     space-separated host pool sizes (default: "16 32 64 96")
#   WORKER_LIST   space-separated worker counts (default: "4 8")
#   NUM_DRIVES    drives created per run (default: 64)
#   VUS           k6 virtual users (default: 128)
#   DURATION      k6 steady-state duration (default: 60s)
#   SETTLE_SECONDS  seconds to let metrics settle before querying (default: 5)

set -euo pipefail

cd "$(dirname "$0")/../.."

POOL_LIST="${POOL_LIST:-16 32 64 96}"
WORKER_LIST="${WORKER_LIST:-4 8}"
export NUM_DRIVES="${NUM_DRIVES:-64}"
export VUS="${VUS:-128}"
export DURATION="${DURATION:-60s}"
SETTLE_SECONDS="${SETTLE_SECONDS:-5}"
PROM_URL="http://127.0.0.1:9091"
BASELINE_FILE="test/integration/BASELINE.md"

echo "[run8] pool sweep: ${POOL_LIST}"
echo "[run8] worker sweep: ${WORKER_LIST}"
echo "[run8] VUS=${VUS} DURATION=${DURATION} NUM_DRIVES=${NUM_DRIVES}"
echo "[run8] starting observability stack (prometheus + grafana)"
docker compose --profile observability up -d --wait --wait-timeout 120

query_prom() {
  local q="$1"
  curl -fsSG --data-urlencode "query=${q}" "${PROM_URL}/api/v1/query" \
    | python3 -c 'import json,sys;d=json.load(sys.stdin);r=d.get("data",{}).get("result",[]);print(r[0]["value"][1] if r else "NaN")'
}

run_one() {
  local POOL="$1"
  local W="$2"

  echo
  echo "[run8] =========================="
  echo "[run8] POOL=${POOL} WORKERS=${W}"
  echo "[run8] =========================="

  export REACTOR_WORKERS="${W}"
  export REACTOR_DB_POOL_SIZE_HOST="${POOL}"

  docker compose up -d --wait --wait-timeout 240 postgres bench-host
  docker compose --profile loadtest run --rm \
    -e BENCH_URL=http://bench-host:8080 \
    -e VUS="${VUS}" \
    -e DURATION="${DURATION}" \
    -e NUM_DRIVES="${NUM_DRIVES}" \
    loadtest

  echo "[run8] settling ${SETTLE_SECONDS}s before querying Prometheus"
  sleep "${SETTLE_SECONDS}"

  local WINDOW_END
  WINDOW_END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  local DURATION_S
  DURATION_S="$(printf '%s' "${DURATION}" | sed 's/s$//')"
  local WIN="${DURATION_S}s"

  local THR P50 P95 P99
  THR="$(query_prom "avg_over_time(rate(reactor_queue_jobs_completed_total[30s])[${WIN}:5s])")"
  P50="$(query_prom "histogram_quantile(0.5, sum by (le) (rate(reactor_job_total_duration_bucket[${WIN}])))")"
  P95="$(query_prom "histogram_quantile(0.95, sum by (le) (rate(reactor_job_total_duration_bucket[${WIN}])))")"
  P99="$(query_prom "histogram_quantile(0.99, sum by (le) (rate(reactor_job_total_duration_bucket[${WIN}])))")"

  local fmt
  fmt() { awk -v n="$1" 'BEGIN { if (n == "NaN" || n == "") print "—"; else printf "%.2f", n }'; }

  printf "| %s | %s | %s | %s | %s | %s | %s | %s |\n" \
    "${POOL}" "${W}" "$(fmt "${THR}")" "$(fmt "${P50}")" "$(fmt "${P95}")" "$(fmt "${P99}")" "—" "—" \
    >> "${BASELINE_FILE}"

  echo "[run8] window_end=${WINDOW_END} pool=${POOL} workers=${W} jobs/sec=$(fmt "${THR}") p50=$(fmt "${P50}")ms p95=$(fmt "${P95}")ms p99=$(fmt "${P99}")ms"

  docker compose stop bench-host
  docker compose rm -f bench-host

  docker compose stop postgres
  docker compose rm -f postgres
}

mkdir -p "$(dirname "${BASELINE_FILE}")"

cat >> "${BASELINE_FILE}" <<'EOF'

## Run 8 matrix (host pool sweep, NUM_DRIVES=64, VUS=128, DURATION=60s)

| pool | workers | jobs/sec | p50 (ms) | p95 (ms) | p99 (ms) | k6 reqs | k6 fail% |
| ---- | ------- | -------- | -------- | -------- | -------- | ------- | -------- |
EOF

for POOL in ${POOL_LIST}; do
  for W in ${WORKER_LIST}; do
    run_one "${POOL}" "${W}"
  done
done

echo
echo "[run8] done. Results appended to ${BASELINE_FILE}."
echo "[run8] Observability still running: Grafana http://127.0.0.1:3002, Prometheus http://127.0.0.1:9091"

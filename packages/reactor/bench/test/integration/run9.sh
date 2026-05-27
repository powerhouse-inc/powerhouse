#!/usr/bin/env bash
# Run 9: NUM_DRIVES sweep. For each (NUM_DRIVES, REACTOR_WORKERS) pair,
# runs a fixed-duration k6 load and queries Prometheus for the headline
# numbers. Pool is fixed at 96 (over-provisioned per Run 8 finding).
#
# Inputs (env overrides):
#   DRIVE_LIST    space-separated drive counts (default: "64 128 256")
#   WORKER_LIST   space-separated worker counts (default: "4 8")
#   VUS           k6 virtual users (default: 128)
#   DURATION      k6 steady-state duration (default: 60s)
#   POOL_HOST     host pool size (default: 96)
#   SETTLE_SECONDS  seconds to let metrics settle before querying (default: 5)

set -euo pipefail

cd "$(dirname "$0")/../.."

DRIVE_LIST="${DRIVE_LIST:-64 128 256}"
WORKER_LIST="${WORKER_LIST:-4 8}"
export VUS="${VUS:-128}"
export DURATION="${DURATION:-60s}"
export REACTOR_DB_POOL_SIZE_HOST="${POOL_HOST:-96}"
SETTLE_SECONDS="${SETTLE_SECONDS:-5}"
PROM_URL="http://127.0.0.1:9091"
BASELINE_FILE="test/integration/BASELINE.md"

echo "[run9] drive sweep: ${DRIVE_LIST}"
echo "[run9] worker sweep: ${WORKER_LIST}"
echo "[run9] VUS=${VUS} DURATION=${DURATION} POOL_HOST=${REACTOR_DB_POOL_SIZE_HOST}"
echo "[run9] starting observability stack (prometheus + grafana)"
docker compose --profile observability up -d --wait --wait-timeout 120

query_prom() {
  local q="$1"
  curl -fsSG --data-urlencode "query=${q}" "${PROM_URL}/api/v1/query" \
    | python3 -c 'import json,sys;d=json.load(sys.stdin);r=d.get("data",{}).get("result",[]);print(r[0]["value"][1] if r else "NaN")'
}

run_one() {
  local DRIVES="$1"
  local W="$2"

  echo
  echo "[run9] =========================="
  echo "[run9] NUM_DRIVES=${DRIVES} WORKERS=${W}"
  echo "[run9] =========================="

  export REACTOR_WORKERS="${W}"
  export NUM_DRIVES="${DRIVES}"

  docker compose up -d --wait --wait-timeout 240 postgres bench-host
  docker compose --profile loadtest run --rm \
    -e BENCH_URL=http://bench-host:8080 \
    -e VUS="${VUS}" \
    -e DURATION="${DURATION}" \
    -e NUM_DRIVES="${NUM_DRIVES}" \
    loadtest

  echo "[run9] settling ${SETTLE_SECONDS}s before querying Prometheus"
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
    "${DRIVES}" "${W}" "$(fmt "${THR}")" "$(fmt "${P50}")" "$(fmt "${P95}")" "$(fmt "${P99}")" "—" "—" \
    >> "${BASELINE_FILE}"

  echo "[run9] window_end=${WINDOW_END} drives=${DRIVES} workers=${W} jobs/sec=$(fmt "${THR}") p50=$(fmt "${P50}")ms p95=$(fmt "${P95}")ms p99=$(fmt "${P99}")ms"

  docker compose stop bench-host
  docker compose rm -f bench-host

  docker compose stop postgres
  docker compose rm -f postgres
}

mkdir -p "$(dirname "${BASELINE_FILE}")"

cat >> "${BASELINE_FILE}" <<EOF

## Run 9 matrix (NUM_DRIVES sweep, VUS=${VUS}, DURATION=${DURATION}, pool=${REACTOR_DB_POOL_SIZE_HOST})

| drives | workers | jobs/sec | p50 (ms) | p95 (ms) | p99 (ms) | k6 reqs | k6 fail% |
| ------ | ------- | -------- | -------- | -------- | -------- | ------- | -------- |
EOF

for DRIVES in ${DRIVE_LIST}; do
  for W in ${WORKER_LIST}; do
    run_one "${DRIVES}" "${W}"
  done
done

echo
echo "[run9] done. Results appended to ${BASELINE_FILE}."
echo "[run9] Observability still running: Grafana http://127.0.0.1:3002, Prometheus http://127.0.0.1:9091"

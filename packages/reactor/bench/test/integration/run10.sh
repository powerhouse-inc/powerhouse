#!/usr/bin/env bash
# Run 10: host event-loop discrimination. Re-runs the workers=8 cells from
# Run 9 at NUM_DRIVES ∈ {64, 256} with the new host event-loop / CPU
# observable gauges enabled. Pulls the headline numbers per cell so the
# next analyst pass can read the matrix without a separate Prom query.
#
# Inputs (env overrides):
#   DRIVE_LIST    space-separated drive counts (default: "64 256")
#   WORKER_LIST   space-separated worker counts (default: "8")
#   VUS           k6 virtual users (default: 128)
#   DURATION      k6 steady-state duration (default: 60s)
#   POOL_HOST     host pool size (default: 96)
#   SETTLE_SECONDS  seconds to let metrics settle before querying (default: 5)

set -euo pipefail

cd "$(dirname "$0")/../.."

DRIVE_LIST="${DRIVE_LIST:-64 256}"
WORKER_LIST="${WORKER_LIST:-8}"
export VUS="${VUS:-128}"
export DURATION="${DURATION:-60s}"
export REACTOR_DB_POOL_SIZE_HOST="${POOL_HOST:-96}"
SETTLE_SECONDS="${SETTLE_SECONDS:-5}"
PROM_URL="http://127.0.0.1:9091"
BASELINE_FILE="test/integration/BASELINE.md"

echo "[run10] drive sweep: ${DRIVE_LIST}"
echo "[run10] worker sweep: ${WORKER_LIST}"
echo "[run10] VUS=${VUS} DURATION=${DURATION} POOL_HOST=${REACTOR_DB_POOL_SIZE_HOST}"
echo "[run10] starting observability stack (prometheus + grafana)"
docker compose --profile observability up -d --wait --wait-timeout 120

echo "[run10] rebuilding bench-host image to pick up eventloop instrumentation"
docker compose build bench-host

query_prom() {
  local q="$1"
  curl -fsSG --data-urlencode "query=${q}" "${PROM_URL}/api/v1/query" \
    | python3 -c 'import json,sys;d=json.load(sys.stdin);r=d.get("data",{}).get("result",[]);print(r[0]["value"][1] if r else "NaN")'
}

run_one() {
  local DRIVES="$1"
  local W="$2"

  echo
  echo "[run10] =========================="
  echo "[run10] NUM_DRIVES=${DRIVES} WORKERS=${W}"
  echo "[run10] =========================="

  export REACTOR_WORKERS="${W}"
  export NUM_DRIVES="${DRIVES}"

  docker compose up -d --wait --wait-timeout 240 postgres bench-host
  docker compose --profile loadtest run --rm \
    -e BENCH_URL=http://bench-host:8080 \
    -e VUS="${VUS}" \
    -e DURATION="${DURATION}" \
    -e NUM_DRIVES="${NUM_DRIVES}" \
    loadtest

  echo "[run10] settling ${SETTLE_SECONDS}s before querying Prometheus"
  sleep "${SETTLE_SECONDS}"

  local WINDOW_END
  WINDOW_END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  local DURATION_S
  DURATION_S="$(printf '%s' "${DURATION}" | sed 's/s$//')"
  local WIN="${DURATION_S}s"

  local THR P50 P95 P99 ELU_AVG ELD_P99_AVG CPU_AVG
  THR="$(query_prom "avg_over_time(rate(reactor_queue_jobs_completed_total[30s])[${WIN}:5s])")"
  P50="$(query_prom "histogram_quantile(0.5, sum by (le) (rate(reactor_job_total_duration_bucket[${WIN}])))")"
  P95="$(query_prom "histogram_quantile(0.95, sum by (le) (rate(reactor_job_total_duration_bucket[${WIN}])))")"
  P99="$(query_prom "histogram_quantile(0.99, sum by (le) (rate(reactor_job_total_duration_bucket[${WIN}])))")"
  ELU_AVG="$(query_prom "avg_over_time(reactor_host_eventloop_utilization[${WIN}])")"
  ELD_P99_AVG="$(query_prom "avg_over_time(reactor_host_eventloop_delay_p99[${WIN}])")"
  CPU_AVG="$(query_prom "avg_over_time(reactor_host_cpu_utilization[${WIN}])")"

  local fmt
  fmt() { awk -v n="$1" 'BEGIN { if (n == "NaN" || n == "") print "—"; else printf "%.2f", n }'; }
  fmt_ratio() { awk -v n="$1" 'BEGIN { if (n == "NaN" || n == "") print "—"; else printf "%.3f", n }'; }

  printf "| %s | %s | %s | %s | %s | %s | %s | %s | %s |\n" \
    "${DRIVES}" "${W}" "$(fmt "${THR}")" "$(fmt "${P50}")" "$(fmt "${P95}")" "$(fmt "${P99}")" \
    "$(fmt "${ELD_P99_AVG}")" "$(fmt_ratio "${ELU_AVG}")" "$(fmt_ratio "${CPU_AVG}")" \
    >> "${BASELINE_FILE}"

  echo "[run10] window_end=${WINDOW_END} drives=${DRIVES} workers=${W} jobs/sec=$(fmt "${THR}") p99=$(fmt "${P99}")ms"
  echo "[run10]   eventloop.util=$(fmt_ratio "${ELU_AVG}") eventloop.delay.p99=$(fmt "${ELD_P99_AVG}")ms cpu.util=$(fmt_ratio "${CPU_AVG}")"

  docker compose stop bench-host
  docker compose rm -f bench-host

  docker compose stop postgres
  docker compose rm -f postgres
}

mkdir -p "$(dirname "${BASELINE_FILE}")"

cat >> "${BASELINE_FILE}" <<EOF

## Run 10 matrix (host event-loop discrimination, VUS=${VUS}, DURATION=${DURATION}, pool=${REACTOR_DB_POOL_SIZE_HOST})

| drives | workers | jobs/sec | p50 (ms) | p95 (ms) | p99 (ms) | loop.delay.p99 (ms) | loop.util | cpu.util |
| ------ | ------- | -------- | -------- | -------- | -------- | ------------------- | --------- | -------- |
EOF

for DRIVES in ${DRIVE_LIST}; do
  for W in ${WORKER_LIST}; do
    run_one "${DRIVES}" "${W}"
  done
done

echo
echo "[run10] done. Results appended to ${BASELINE_FILE}."
echo "[run10] Observability still running: Grafana http://127.0.0.1:3002, Prometheus http://127.0.0.1:9091"

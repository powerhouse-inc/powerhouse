#!/usr/bin/env bash
# Run 11: sharded projection scaling sweep. Tests whether moving the per-
# queueKey projection chain off the host event loop and into N worker
# threads buys back the throughput Run 10 said was loop-bound. Matrix:
#   (NUM_DRIVES, N_PROJECTION_SHARDS) in {(64,1),(64,2),(64,4),(64,8),(256,4)}
# Fixed: REACTOR_WORKERS=8, VUS=128, DURATION=60s. Host pool shrinks to 32
# (less work on the host loop now); each shard owns its own pool of 16.
#
# Inputs (env overrides):
#   CELL_LIST                space-separated NUM_DRIVES:N_SHARDS pairs
#                            (default: "64:1 64:2 64:4 64:8 256:4")
#   VUS                      k6 virtual users (default: 128)
#   DURATION                 k6 steady-state duration (default: 60s)
#   POOL_HOST                host pool size (default: 32)
#   POOL_PROJECTION          per-shard pool size (default: 16)
#   POSTGRES_MAX_CONNECTIONS postgres max_connections (default: 256)
#   SETTLE_SECONDS           seconds to let metrics settle (default: 5)
#   REACTOR_WORKERS          executor worker count (default: 8, fixed)

set -euo pipefail

cd "$(dirname "$0")/../.."

CELL_LIST="${CELL_LIST:-64:1 64:2 64:4 64:8 256:4}"
export VUS="${VUS:-128}"
export DURATION="${DURATION:-60s}"
export REACTOR_WORKERS="${REACTOR_WORKERS:-8}"
export REACTOR_DB_POOL_SIZE_HOST="${POOL_HOST:-32}"
export REACTOR_DB_POOL_SIZE_PROJECTION="${POOL_PROJECTION:-16}"
export POSTGRES_MAX_CONNECTIONS="${POSTGRES_MAX_CONNECTIONS:-256}"
SETTLE_SECONDS="${SETTLE_SECONDS:-5}"
PROM_URL="http://127.0.0.1:9091"
BASELINE_FILE="test/integration/BASELINE.md"

echo "[run11] cell sweep: ${CELL_LIST}"
echo "[run11] REACTOR_WORKERS=${REACTOR_WORKERS} VUS=${VUS} DURATION=${DURATION}"
echo "[run11] POOL_HOST=${REACTOR_DB_POOL_SIZE_HOST} POOL_PROJECTION=${REACTOR_DB_POOL_SIZE_PROJECTION} MAX_CONN=${POSTGRES_MAX_CONNECTIONS}"
echo "[run11] starting observability stack (prometheus + grafana)"
docker compose --profile observability up -d --wait --wait-timeout 120

echo "[run11] rebuilding bench-host image to pick up projection-shard wiring"
docker compose build bench-host

query_prom() {
  local q="$1"
  curl -fsSG --data-urlencode "query=${q}" "${PROM_URL}/api/v1/query" \
    | python3 -c 'import json,sys;d=json.load(sys.stdin);r=d.get("data",{}).get("result",[]);print(r[0]["value"][1] if r else "NaN")'
}

run_one() {
  local DRIVES="$1"
  local SHARDS="$2"

  echo
  echo "[run11] =========================="
  echo "[run11] NUM_DRIVES=${DRIVES} N_PROJECTION_SHARDS=${SHARDS}"
  echo "[run11] =========================="

  export N_PROJECTION_SHARDS="${SHARDS}"
  export NUM_DRIVES="${DRIVES}"

  docker compose up -d --wait --wait-timeout 240 postgres bench-host
  docker compose --profile loadtest run --rm \
    -e BENCH_URL=http://bench-host:8080 \
    -e VUS="${VUS}" \
    -e DURATION="${DURATION}" \
    -e NUM_DRIVES="${NUM_DRIVES}" \
    loadtest

  echo "[run11] settling ${SETTLE_SECONDS}s before querying Prometheus"
  sleep "${SETTLE_SECONDS}"

  local WINDOW_END
  WINDOW_END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  local DURATION_S
  DURATION_S="$(printf '%s' "${DURATION}" | sed 's/s$//')"
  local WIN="${DURATION_S}s"

  local THR P50 P95 P99 ELU_AVG ELD_P99_AVG CPU_AVG CHAIN_AVG ACQ_P50
  THR="$(query_prom "avg_over_time(rate(reactor_queue_jobs_completed_total[30s])[${WIN}:5s])")"
  P50="$(query_prom "histogram_quantile(0.5, sum by (le) (rate(reactor_job_total_duration_bucket[${WIN}])))")"
  P95="$(query_prom "histogram_quantile(0.95, sum by (le) (rate(reactor_job_total_duration_bucket[${WIN}])))")"
  P99="$(query_prom "histogram_quantile(0.99, sum by (le) (rate(reactor_job_total_duration_bucket[${WIN}])))")"
  ELU_AVG="$(query_prom "avg_over_time(reactor_host_eventloop_utilization[${WIN}])")"
  ELD_P99_AVG="$(query_prom "avg_over_time(reactor_host_eventloop_delay_p99[${WIN}])")"
  CPU_AVG="$(query_prom "avg_over_time(reactor_host_cpu_utilization[${WIN}])")"
  CHAIN_AVG="$(query_prom "avg_over_time(reactor_readmodel_coordinator_chain_depth[${WIN}])")"
  ACQ_P50="$(query_prom "histogram_quantile(0.5, sum by (le) (rate(reactor_db_pool_acquire_wait_duration_bucket[${WIN}])))")"

  local fmt
  fmt() { awk -v n="$1" 'BEGIN { if (n == "NaN" || n == "") print "—"; else printf "%.2f", n }'; }
  fmt_ratio() { awk -v n="$1" 'BEGIN { if (n == "NaN" || n == "") print "—"; else printf "%.3f", n }'; }

  printf "| %s | %s | %s | %s | %s | %s | %s | %s | %s | %s | %s |\n" \
    "${DRIVES}" "${SHARDS}" "$(fmt "${THR}")" "$(fmt "${P50}")" "$(fmt "${P95}")" "$(fmt "${P99}")" \
    "$(fmt "${ELD_P99_AVG}")" "$(fmt_ratio "${ELU_AVG}")" "$(fmt_ratio "${CPU_AVG}")" \
    "$(fmt "${CHAIN_AVG}")" "$(fmt "${ACQ_P50}")" \
    >> "${BASELINE_FILE}"

  echo "[run11] window_end=${WINDOW_END} drives=${DRIVES} shards=${SHARDS} jobs/sec=$(fmt "${THR}") p99=$(fmt "${P99}")ms"
  echo "[run11]   eventloop.util=$(fmt_ratio "${ELU_AVG}") loop.delay.p99=$(fmt "${ELD_P99_AVG}")ms cpu.util=$(fmt_ratio "${CPU_AVG}")"
  echo "[run11]   chain.depth.avg=$(fmt "${CHAIN_AVG}") pool.acquire.p50=$(fmt "${ACQ_P50}")ms"

  docker compose stop bench-host
  docker compose rm -f bench-host

  docker compose stop postgres
  docker compose rm -f postgres
}

mkdir -p "$(dirname "${BASELINE_FILE}")"

cat >> "${BASELINE_FILE}" <<EOF

## Run 11 matrix (sharded projection sweep, VUS=${VUS}, DURATION=${DURATION}, workers=${REACTOR_WORKERS}, pool_host=${REACTOR_DB_POOL_SIZE_HOST}, pool_proj=${REACTOR_DB_POOL_SIZE_PROJECTION})

| drives | shards | jobs/sec | p50 (ms) | p95 (ms) | p99 (ms) | loop.delay.p99 (ms) | loop.util | cpu.util | chain.depth | acq.p50 (ms) |
| ------ | ------ | -------- | -------- | -------- | -------- | ------------------- | --------- | -------- | ----------- | ------------ |
EOF

for CELL in ${CELL_LIST}; do
  DRIVES="${CELL%%:*}"
  SHARDS="${CELL##*:}"
  run_one "${DRIVES}" "${SHARDS}"
done

echo
echo "[run11] done. Results appended to ${BASELINE_FILE}."
echo "[run11] Observability still running: Grafana http://127.0.0.1:3002, Prometheus http://127.0.0.1:9091"

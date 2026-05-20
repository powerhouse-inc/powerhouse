#!/usr/bin/env bash
# Scaling matrix: sweep REACTOR_WORKERS over {0,1,2,4,8}, run a fixed-duration
# k6 load against the bench-host at each setting, and append a row to
# BASELINE.md with throughput + latency pulled from Prometheus.
#
# Observability stack (prometheus + grafana) stays up after the matrix so the
# operator can inspect series in Grafana on http://127.0.0.1:3002.
#
# Inputs (env overrides):
#   WORKER_LIST   space-separated worker counts (default: "0 1 2 4 8")
#   NUM_DRIVES    drives created per run (default: 8)
#   VUS           k6 virtual users (default: 32)
#   DURATION      k6 steady-state duration (default: 60s)
#   SETTLE_SECONDS  seconds to let metrics settle before querying (default: 5)
#
# Acceptance: throughput at 4 workers >= 3.0x throughput at workers=1.

set -euo pipefail

cd "$(dirname "$0")/../.."

WORKER_LIST="${WORKER_LIST:-0 1 2 4 8}"
export NUM_DRIVES="${NUM_DRIVES:-8}"
export VUS="${VUS:-32}"
export DURATION="${DURATION:-60s}"
SETTLE_SECONDS="${SETTLE_SECONDS:-5}"
PROM_URL="http://127.0.0.1:9091"
BASELINE_FILE="test/integration/BASELINE.md"

echo "[matrix] worker sweep: ${WORKER_LIST}"
echo "[matrix] VUS=${VUS} DURATION=${DURATION} NUM_DRIVES=${NUM_DRIVES}"
echo "[matrix] starting observability stack (prometheus + grafana)"
docker compose --profile observability up -d --wait --wait-timeout 120

mkdir -p "$(dirname "${BASELINE_FILE}")"
if ! grep -q "^| workers " "${BASELINE_FILE}" 2>/dev/null; then
  cat >> "${BASELINE_FILE}" <<'EOF'

## Matrix run

| workers | jobs/sec | p50 (ms) | p95 (ms) | p99 (ms) | k6 reqs | k6 fail% |
| ------- | -------- | -------- | -------- | -------- | ------- | -------- |
EOF
fi

query_prom() {
  local q="$1"
  curl -fsSG --data-urlencode "query=${q}" "${PROM_URL}/api/v1/query" \
    | python3 -c 'import json,sys;d=json.load(sys.stdin);r=d.get("data",{}).get("result",[]);print(r[0]["value"][1] if r else "NaN")'
}

run_one() {
  local W="$1"

  echo
  echo "[matrix] =========================="
  echo "[matrix] REACTOR_WORKERS=${W}"
  echo "[matrix] =========================="

  export REACTOR_WORKERS="${W}"

  docker compose up -d --build --wait --wait-timeout 240 postgres bench-host
  docker compose --profile loadtest run --rm \
    -e BENCH_URL=http://bench-host:8080 \
    -e VUS="${VUS}" \
    -e DURATION="${DURATION}" \
    -e NUM_DRIVES="${NUM_DRIVES}" \
    loadtest

  echo "[matrix] settling ${SETTLE_SECONDS}s before querying Prometheus"
  sleep "${SETTLE_SECONDS}"

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

  printf "| %s | %s | %s | %s | %s | %s | %s |\n" \
    "${W}" "$(fmt "${THR}")" "$(fmt "${P50}")" "$(fmt "${P95}")" "$(fmt "${P99}")" "—" "—" \
    >> "${BASELINE_FILE}"

  echo "[matrix] workers=${W} jobs/sec=$(fmt "${THR}") p50=$(fmt "${P50}")ms p95=$(fmt "${P95}")ms p99=$(fmt "${P99}")ms"

  docker compose stop bench-host
  docker compose rm -f bench-host

  docker compose stop postgres
  docker compose rm -f postgres
}

for W in ${WORKER_LIST}; do
  run_one "${W}"
done

echo
echo "[matrix] done. Results appended to ${BASELINE_FILE}."
echo "[matrix] Observability still running: Grafana http://127.0.0.1:3002, Prometheus http://127.0.0.1:9091"
echo "[matrix] To stop the observability stack: docker compose --profile observability down"

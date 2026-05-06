#!/usr/bin/env sh
# Bring up the real switchboard stack (3 instances behind the LB) plus
# Prometheus + Grafana, then run the k6 mixed-load scenario. The stack is
# left running on exit so the dashboards stay live for inspection.
#
# Tear down with:
#   docker compose -f docker-compose.yml -f docker-compose.real.yml \
#     --profile observability --profile loadtest down -v

set -eu

cd "$(dirname "$0")/../.."

echo "[mixed-load] starting real switchboard stack + observability..."
# --wait blocks until services with healthchecks (sb-1/2/3) report healthy.
# Without it, k6 setup() races the switchboard cold-start and gets 503s.
docker compose \
    -f docker-compose.yml -f docker-compose.real.yml \
    --profile observability \
    up -d --build --wait --wait-timeout 180

echo "[mixed-load] running k6..."
docker compose \
    -f docker-compose.yml -f docker-compose.real.yml \
    --profile loadtest \
    run --rm loadtest-mixed

echo ""
echo "[mixed-load] dashboards:"
echo "  Grafana:    http://127.0.0.1:3001 (anonymous admin)"
echo "  Prometheus: http://127.0.0.1:9091"
echo ""
echo "[mixed-load] tear down with:"
echo "  docker compose -f docker-compose.yml -f docker-compose.real.yml \\"
echo "    --profile observability --profile loadtest down -v"

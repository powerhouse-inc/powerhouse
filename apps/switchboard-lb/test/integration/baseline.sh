#!/usr/bin/env sh
# M0 baseline: measure nginx-alone overhead on /health before any Lua enters
# the path. Record results in test/integration/BASELINE.md.
#
# Requires `docker compose up -d` to already be running.

set -eu

cd "$(dirname "$0")/../.."

docker compose --profile loadtest run --rm loadtest

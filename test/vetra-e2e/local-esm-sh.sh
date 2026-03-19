#!/usr/bin/env bash
set -euo pipefail

REGISTRY_PORT="${REGISTRY_PORT:-4873}"
ESMSH_PORT="${ESMSH_PORT:-8080}"

cat > /tmp/esmsh.local.json <<EOF
{
  "port": ${ESMSH_PORT},
  "npmRegistry": "http://host.docker.internal:${REGISTRY_PORT}"
}
EOF

docker run --rm \
  -p "${ESMSH_PORT}:80" \
  -v /tmp/esmsh.local.json:/etc/esmsh/config.json \
  ghcr.io/esm-dev/esm.sh:latest
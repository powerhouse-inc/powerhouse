#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "Building packages..."

echo "  [1/3] document-model"
pnpm --filter document-model run tsc --build

echo "  [2/3] @powerhousedao/reactor"
pnpm --filter @powerhousedao/reactor run build
pnpm --filter @powerhousedao/reactor run build:bundle

echo "  [3/3] Running migrations"
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" \
  pnpm --filter document-drive run migrate

echo "Done. Starting reactor-direct..."
echo ""

exec tsx "${SCRIPT_DIR}/scripts/profiling/reactor-direct.ts" "$@"

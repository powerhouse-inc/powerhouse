#!/bin/sh
set -e

if [ -n "$PH_REACTOR_DATABASE_URL" ] && [ "$SKIP_DB_MIGRATIONS" != "true" ]; then
    echo "[entrypoint] Running migrations..."
    node node_modules/@powerhousedao/switchboard/dist/src/migrate.js
fi

echo "[entrypoint] Starting switchboard on port ${PORT:-3000}..."
export PH_SWITCHBOARD_PORT="${PORT:-3000}"
exec node node_modules/@powerhousedao/switchboard/dist/src/index.js

#!/bin/sh
set -e

# Install additional packages at startup if PH_PACKAGES is set
if [ -n "$PH_PACKAGES" ]; then
    echo "[entrypoint] Installing packages: $PH_PACKAGES"
    OLD_IFS="$IFS"
    IFS=','
    for pkg in $PH_PACKAGES; do
        IFS="$OLD_IFS"
        pkg=$(echo "$pkg" | xargs) # trim whitespace
        if [ -n "$pkg" ]; then
            echo "[entrypoint] Installing $pkg..."
            pnpm add "$pkg" --shamefully-hoist || echo "[entrypoint] Warning: failed to install $pkg"
        fi
    done
    IFS="$OLD_IFS"
fi

SB_DIST="node_modules/@powerhousedao/switchboard/dist"

# Resolve entry points: new layout uses flat .mjs files, old uses src/*.js
if [ -f "$SB_DIST/migrate.mjs" ]; then
    MIGRATE="$SB_DIST/migrate.mjs"
    ENTRY="$SB_DIST/index.mjs"
else
    MIGRATE="$SB_DIST/src/migrate.js"
    ENTRY="$SB_DIST/src/index.js"
fi

if [ -n "$PH_REACTOR_DATABASE_URL" ] && [ "$SKIP_DB_MIGRATIONS" != "true" ]; then
    echo "[entrypoint] Running migrations..."
    node "$MIGRATE"
fi

echo "[entrypoint] Starting switchboard on port ${PORT:-3000}..."
export PH_SWITCHBOARD_PORT="${PORT:-3000}"
exec node "$ENTRY"

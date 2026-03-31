#!/bin/sh
set -e

# Install additional packages at startup if PH_PACKAGES is set
if [ -n "$PH_PACKAGES" ]; then
    # Point @powerhousedao scoped packages at the Vetra registry while
    # keeping npm as the default for all other dependencies
    if [ -n "$PH_REGISTRY_URL" ]; then
        echo "[entrypoint] Configuring @powerhousedao registry: $PH_REGISTRY_URL"
        pnpm config set @powerhousedao:registry "$PH_REGISTRY_URL"
    fi
    echo "[entrypoint] Installing packages: $PH_PACKAGES"
    echo "$PH_PACKAGES" | tr ',' '\n' | while read -r pkg; do
        pkg=$(echo "$pkg" | xargs)
        if [ -n "$pkg" ]; then
            echo "[entrypoint] Installing $pkg..."
            pnpm add "$pkg" --shamefully-hoist || echo "[entrypoint] Warning: failed to install $pkg"
        fi
    done
fi

if [ -n "$PH_REACTOR_DATABASE_URL" ] && [ "$SKIP_DB_MIGRATIONS" != "true" ]; then
    echo "[entrypoint] Running migrations..."
    node node_modules/@powerhousedao/switchboard/dist/src/migrate.js
fi

echo "[entrypoint] Starting switchboard on port ${PORT:-3000}..."
export PH_SWITCHBOARD_PORT="${PORT:-3000}"
exec node node_modules/@powerhousedao/switchboard/dist/src/index.js

#!/bin/sh
set -e
cd /app/powerhouse 

if [ ! -z "$PH_PACKAGES" ]; then
  # Convert comma-separated list to space-separated
  PACKAGES=$(echo $PH_PACKAGES | tr ',' ' ')
  # Install each package
  for pkg in $PACKAGES; do
    echo "[entrypoint] Installing package: $pkg"
    ph install $pkg
  done
fi

echo "[entrypoint] Starting switchboard..."
export SWITCHBOARD_PORT="${PORT:-4001}"
ph switchboard --port $SWITCHBOARD_PORT

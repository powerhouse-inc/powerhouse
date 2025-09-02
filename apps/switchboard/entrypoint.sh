#!/bin/sh
set -e

if [ ! -z "$PH_PACKAGES" ]; then
  # Convert comma-separated list to space-separated
  PACKAGES=$(echo $PH_PACKAGES | tr ',' ' ')
  # Install each package
  for pkg in $PACKAGES; do
    echo "[entrypoint] Installing package: $pkg"
    ph install $pkg
  done
fi

# Check if DATABASE_URL starts with postgres and run Prisma db push
if [ ! -z "$DATABASE_URL" ] && echo "$DATABASE_URL" | grep -q "^postgres"; then
  echo "[entrypoint] DATABASE_URL starts with postgres, running Prisma db push..."
  prisma db push --schema node_modules/document-drive/dist/prisma/schema.prisma
fi

echo "[entrypoint] Starting switchboard..."
export SWITCHBOARD_PORT="${PORT:-4001}"
ph switchboard --port $SWITCHBOARD_PORT

#!/bin/bash
set -e

export PNPM_HOME="/root/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"

if [ ! -d "$PNPM_HOME" ]; then
  pnpm setup
fi

echo "[entrypoint] Installing ph-cmd globally with pnpm..."
pnpm add -g ph-cmd@$TAG

echo "[entrypoint] Running ph setup-globals..."
ph setup-globals
ph use $TAG

if [ ! -z "$PH_PACKAGES" ]; then
  echo "[entrypoint] Installing packages: $PH_PACKAGES"
  PACKAGES=$(echo $PH_PACKAGES | tr ',' ' ')
  ph install $PACKAGES
fi

cat $HOME/.ph/powerhouse.config.json
echo "[entrypoint] Starting switchboard..."
exec ph switchboard 
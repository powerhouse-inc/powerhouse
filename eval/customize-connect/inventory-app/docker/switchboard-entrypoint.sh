#!/bin/sh
set -e

# Regenerate Prisma client for current platform (fixes darwin-arm64 vs linux-musl-openssl mismatch)
echo "[entrypoint] Regenerating Prisma client for current platform..."
prisma generate --schema node_modules/document-drive/dist/prisma/schema.prisma

# Run migrations if DATABASE_URL is postgres and migrations not skipped
if [ -n "$DATABASE_URL" ] && echo "$DATABASE_URL" | grep -q "^postgres" && [ "$SKIP_DB_MIGRATIONS" != "true" ]; then
    echo "[entrypoint] Running Prisma db push..."
    prisma db push --schema node_modules/document-drive/dist/prisma/schema.prisma --skip-generate
    echo "[entrypoint] Running migrations..."
    ph switchboard --migrate
fi

echo "[entrypoint] Starting switchboard on port ${PORT:-3000}..."
exec ph switchboard --port ${PORT:-3000}

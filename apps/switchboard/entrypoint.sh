#!/bin/sh
set -e

# Run Prisma db push if DATABASE_URL is postgres and migrations not skipped
if [ -n "$DATABASE_URL" ] && echo "$DATABASE_URL" | grep -q "^postgres" && [ "$SKIP_DB_MIGRATIONS" != "true" ]; then
    echo "[entrypoint] Running Prisma db push..."
    prisma db push --schema node_modules/document-drive/dist/prisma/schema.prisma --skip-generate
fi

echo "[entrypoint] Starting switchboard on port ${PORT:-3000}..."
exec ph switchboard --port ${PORT:-3000}

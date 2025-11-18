#!/bin/bash

set -e

echo "Setting up Postgres database for benchmarks..."

export DATABASE_URL="postgresql://postgres:postgres@localhost:5400/postgres"

cd "$(dirname "$0")/../../../document-drive"

pnpm prisma db push --skip-generate

echo "Database setup complete!"

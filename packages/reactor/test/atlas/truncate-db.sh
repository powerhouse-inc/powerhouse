#!/bin/bash

set -e

export DATABASE_URL="postgresql://postgres:postgres@localhost:5400/postgres"

echo "Truncating all database tables..."

# Truncate legacy Prisma tables (document-drive)
psql "$DATABASE_URL" <<-EOSQL
  TRUNCATE TABLE "Attachment" CASCADE;
  TRUNCATE TABLE "Operation" CASCADE;
  TRUNCATE TABLE "DriveDocument" CASCADE;
  TRUNCATE TABLE "Document" CASCADE;
  TRUNCATE TABLE "Drive" CASCADE;
  TRUNCATE TABLE "SynchronizationUnit" CASCADE;
EOSQL

# Truncate new reactor tables (if they exist)
psql "$DATABASE_URL" <<-EOSQL
  DO \$\$
  BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'Operation') THEN
      TRUNCATE TABLE "Operation" CASCADE;
    END IF;
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'Keyframe') THEN
      TRUNCATE TABLE "Keyframe" CASCADE;
    END IF;
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'Document') THEN
      TRUNCATE TABLE "Document" CASCADE;
    END IF;
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'DocumentRelationship') THEN
      TRUNCATE TABLE "DocumentRelationship" CASCADE;
    END IF;
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'IndexerState') THEN
      TRUNCATE TABLE "IndexerState" CASCADE;
    END IF;
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'DocumentSnapshot') THEN
      TRUNCATE TABLE "DocumentSnapshot" CASCADE;
    END IF;
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'SlugMapping') THEN
      TRUNCATE TABLE "SlugMapping" CASCADE;
    END IF;
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'ViewState') THEN
      TRUNCATE TABLE "ViewState" CASCADE;
    END IF;
  END \$\$;
EOSQL

echo "Database truncation complete!"

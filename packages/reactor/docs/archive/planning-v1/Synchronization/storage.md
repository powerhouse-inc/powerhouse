# Synchronization Storage Implementation

This document specifies the database schema and implementation plan for the persistent storage of synchronization metadata in the Reactor system.

## Overview

The synchronization system requires two storage interfaces for durable persistence:

1. **ISyncRemoteStorage** - Stores remote configurations (what to sync and where)
2. **ISyncCursorStorage** - Stores synchronization progress cursors (what has been synced)

While the initial implementation uses in-memory storage, this document provides the plan for Kysely-based persistent storage using PostgreSQL (via PGlite).

## Storage Architecture

```
ISyncManager (owns both storage interfaces)
    |
    |-- ISyncRemoteStorage (manages remote configurations)
    |       |
    |       `-- sync_remotes table
    |
    `-- ISyncCursorStorage (tracks sync progress)
            |
            `-- sync_cursors table (FK to sync_remotes)
```

The `ISyncManager` creates remotes on startup by reading from `ISyncRemoteStorage`. When creating channels, it passes `ISyncCursorStorage` to the `IChannelFactory`. Each `IChannel` is responsible for updating its cursor as operations are applied.

## Database Schema

### Table: sync_remotes

Stores remote configurations that define what to synchronize and how.

```sql
CREATE TABLE sync_remotes (
  -- Primary identifier
  name TEXT PRIMARY KEY,

  -- Collection and channel configuration
  collection_id TEXT NOT NULL,
  channel_type TEXT NOT NULL,
  channel_parameters JSONB NOT NULL DEFAULT '{}',

  -- Remote filter configuration
  filter_document_ids JSONB,
  filter_scopes JSONB,
  filter_branch TEXT NOT NULL DEFAULT 'main',

  -- Push channel health tracking
  push_state TEXT NOT NULL DEFAULT 'idle',
  push_last_success_utc_ms BIGINT,
  push_last_failure_utc_ms BIGINT,
  push_failure_count INTEGER NOT NULL DEFAULT 0,

  -- Pull channel health tracking
  pull_state TEXT NOT NULL DEFAULT 'idle',
  pull_last_success_utc_ms BIGINT,
  pull_last_failure_utc_ms BIGINT,
  pull_failure_count INTEGER NOT NULL DEFAULT 0,

  -- Audit timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_remotes_collection ON sync_remotes(collection_id);
```

**Field Descriptions:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | TEXT | Unique identifier for this remote (e.g., "drive-a-to-b") |
| `collection_id` | TEXT | Collection this remote tracks (typically from `driveCollectionId()`) |
| `channel_type` | TEXT | Channel implementation type (e.g., "internal", "gql") |
| `channel_parameters` | JSONB | Channel-specific configuration (URLs, auth tokens, etc.) |
| `filter_document_ids` | JSONB | Optional array of documentIds to filter |
| `filter_scopes` | JSONB | Optional array of scopes to filter |
| `filter_branch` | TEXT | Branch to synchronize |
| `push_state` | TEXT | Health state: "idle", "running", or "error" |
| `push_last_success_utc_ms` | BIGINT | Timestamp of last successful push |
| `push_last_failure_utc_ms` | BIGINT | Timestamp of last failed push |
| `push_failure_count` | INTEGER | Consecutive push failure count |
| `pull_state` | TEXT | Health state: "idle", "running", or "error" |
| `pull_last_success_utc_ms` | BIGINT | Timestamp of last successful pull |
| `pull_last_failure_utc_ms` | BIGINT | Timestamp of last failed pull |
| `pull_failure_count` | INTEGER | Consecutive pull failure count |

**Design Notes:**

- `channel_parameters` is stored as JSONB to support arbitrary channel configurations
- Filter arrays (`filter_document_ids`, `filter_scopes`) are stored as JSONB for flexibility
- Health tracking is denormalized into the remote record for efficient status queries
- Push and pull channels have independent health tracking since they operate autonomously

### Table: sync_cursors

Stores synchronization progress cursors that track which operations have been processed.

```sql
CREATE TABLE sync_cursors (
  -- Primary identifier (one cursor per remote)
  remote_name TEXT PRIMARY KEY,

  -- Cursor position
  cursor_ordinal BIGINT NOT NULL DEFAULT 0,
  last_synced_at_utc_ms BIGINT,

  -- Audit timestamp
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Cascade delete when remote is removed
  FOREIGN KEY (remote_name) REFERENCES sync_remotes(name) ON DELETE CASCADE
);

CREATE INDEX idx_sync_cursors_ordinal ON sync_cursors(cursor_ordinal);
```

**Field Descriptions:**

| Field | Type | Description |
|-------|------|-------------|
| `remote_name` | TEXT | References sync_remotes.name |
| `cursor_ordinal` | BIGINT | Last processed ordinal (exclusive) from operation_index_operations |
| `last_synced_at_utc_ms` | BIGINT | Timestamp of last successful sync |

**Design Notes:**

- One cursor per remote (collection-based optimization)
- `cursor_ordinal` references `operation_index_operations.ordinal` for collection-based queries
- Cascading delete ensures orphaned cursors are automatically removed
- `cursor_ordinal` is exclusive (next fetch starts at `cursor_ordinal + 1`)

## Kysely Type Definitions

Add the following to `src/storage/kysely/types.ts`:

```typescript
export interface SyncRemoteTable {
  name: string;
  collectionId: string;
  channelType: string;
  channelParameters: unknown;
  filterDocumentIds: unknown | null;
  filterScopes: unknown | null;
  filterBranch: string;
  pushState: string;
  pushLastSuccessUtcMs: bigint | null;
  pushLastFailureUtcMs: bigint | null;
  pushFailureCount: number;
  pullState: string;
  pullLastSuccessUtcMs: bigint | null;
  pullLastFailureUtcMs: bigint | null;
  pullFailureCount: number;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}

export interface SyncCursorTable {
  remoteName: string;
  cursorOrdinal: bigint;
  lastSyncedAtUtcMs: bigint | null;
  updatedAt: Generated<Date>;
}

export type SyncRemoteRow = Selectable<SyncRemoteTable>;
export type InsertableSyncRemote = Insertable<SyncRemoteTable>;
export type UpdateableSyncRemote = Updateable<SyncRemoteTable>;

export type SyncCursorRow = Selectable<SyncCursorTable>;
export type InsertableSyncCursor = Insertable<SyncCursorTable>;
export type UpdateableSyncCursor = Updateable<SyncCursorTable>;
```

Then update the `Database` interface:

```typescript
export interface Database {
  Operation: OperationTable;
  Keyframe: KeyframeTable;
  document_collections: DocumentCollectionTable;
  operation_index_operations: OperationIndexOperationTable;
  sync_remotes: SyncRemoteTable;
  sync_cursors: SyncCursorTable;
}
```

**Type Mapping Notes:**

- JSONB columns map to `unknown` type (will be cast at runtime)
- BIGINT columns map to TypeScript `bigint`
- Nullable columns have `| null` union type
- Generated columns use `Generated<T>` wrapper
- Follow existing patterns from `OperationTable` and `KeyframeTable`

## Implementation Architecture

### KyselySyncRemoteStorage

Implementation of `ISyncRemoteStorage` using Kysely.

```typescript
export class KyselySyncRemoteStorage implements ISyncRemoteStorage {
  constructor(private db: Kysely<Database>) {}

  async list(signal?: AbortSignal): Promise<RemoteRecord[]> {
    // Check abort signal
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    // Query all remotes
    const rows = await this.db
      .selectFrom("sync_remotes")
      .selectAll()
      .execute();

    // Transform rows to RemoteRecord
    return rows.map(rowToRemoteRecord);
  }

  async get(name: string, signal?: AbortSignal): Promise<RemoteRecord> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const row = await this.db
      .selectFrom("sync_remotes")
      .selectAll()
      .where("name", "=", name)
      .executeTakeFirst();

    if (!row) {
      throw new Error(`Remote not found: ${name}`);
    }

    return rowToRemoteRecord(row);
  }

  async upsert(remote: RemoteRecord, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    await this.db.transaction().execute(async (trx) => {
      const insertable = remoteRecordToRow(remote);

      await trx
        .insertInto("sync_remotes")
        .values(insertable)
        .onConflict((oc) =>
          oc.column("name").doUpdateSet({
            ...insertable,
            updatedAt: sql`NOW()`,
          })
        )
        .execute();
    });
  }

  async remove(name: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    await this.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom("sync_remotes")
        .where("name", "=", name)
        .execute();
    });
  }
}
```

**Key Implementation Details:**

- Constructor takes `Kysely<Database>` instance (dependency injection)
- AbortSignal checked at start of each method
- Transactions used for write operations
- Transform functions convert between DB rows and domain types
- Upsert uses `onConflict` with `doUpdateSet` for idempotent updates
- Cascade delete handles cursor cleanup automatically

### KyselySyncCursorStorage

Implementation of `ISyncCursorStorage` using Kysely.

```typescript
export class KyselySyncCursorStorage implements ISyncCursorStorage {
  constructor(private db: Kysely<Database>) {}

  async list(remoteName: string, signal?: AbortSignal): Promise<RemoteCursor[]> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const rows = await this.db
      .selectFrom("sync_cursors")
      .selectAll()
      .where("remoteName", "=", remoteName)
      .execute();

    return rows.map(rowToRemoteCursor);
  }

  async get(remoteName: string, signal?: AbortSignal): Promise<RemoteCursor> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const row = await this.db
      .selectFrom("sync_cursors")
      .selectAll()
      .where("remoteName", "=", remoteName)
      .executeTakeFirst();

    if (!row) {
      return {
        remoteName,
        cursorOrdinal: 0,
      };
    }

    return rowToRemoteCursor(row);
  }

  async upsert(cursor: RemoteCursor, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    await this.db.transaction().execute(async (trx) => {
      const insertable = remoteCursorToRow(cursor);

      await trx
        .insertInto("sync_cursors")
        .values(insertable)
        .onConflict((oc) =>
          oc.column("remoteName").doUpdateSet({
            ...insertable,
            updatedAt: sql`NOW()`,
          })
        )
        .execute();
    });
  }

  async remove(remoteName: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    await this.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom("sync_cursors")
        .where("remoteName", "=", remoteName)
        .execute();
    });
  }
}
```

**Key Implementation Details:**

- `get()` returns default cursor (ordinal 0) if not found
- Cursor updates are transactional to ensure consistency
- `list()` returns array for interface compatibility (though typically one cursor per remote)

### Transform Functions

Helper functions to convert between database rows and domain types:

```typescript
function rowToRemoteRecord(row: SyncRemoteRow): RemoteRecord {
  return {
    name: row.name,
    collectionId: row.collectionId,
    channelConfig: {
      type: row.channelType,
      parameters: (row.channelParameters as Record<string, any>) ?? {},
    },
    filter: {
      documentId: (row.filterDocumentIds as string[]) ?? undefined,
      scope: (row.filterScopes as string[]) ?? undefined,
      branch: row.filterBranch,
    },
    options: {},
    status: {
      push: {
        state: row.pushState as "idle" | "running" | "error",
        lastSuccessUtcMs: row.pushLastSuccessUtcMs
          ? Number(row.pushLastSuccessUtcMs)
          : undefined,
        lastFailureUtcMs: row.pushLastFailureUtcMs
          ? Number(row.pushLastFailureUtcMs)
          : undefined,
        failureCount: row.pushFailureCount,
      },
      pull: {
        state: row.pullState as "idle" | "running" | "error",
        lastSuccessUtcMs: row.pullLastSuccessUtcMs
          ? Number(row.pullLastSuccessUtcMs)
          : undefined,
        lastFailureUtcMs: row.pullLastFailureUtcMs
          ? Number(row.pullLastFailureUtcMs)
          : undefined,
        failureCount: row.pullFailureCount,
      },
    },
  };
}

function remoteRecordToRow(remote: RemoteRecord): InsertableSyncRemote {
  return {
    name: remote.name,
    collectionId: remote.collectionId,
    channelType: remote.channelConfig.type,
    channelParameters: remote.channelConfig.parameters,
    filterDocumentIds: remote.filter.documentId ?? null,
    filterScopes: remote.filter.scope ?? null,
    filterBranch: remote.filter.branch,
    pushState: remote.status.push.state,
    pushLastSuccessUtcMs: remote.status.push.lastSuccessUtcMs
      ? BigInt(remote.status.push.lastSuccessUtcMs)
      : null,
    pushLastFailureUtcMs: remote.status.push.lastFailureUtcMs
      ? BigInt(remote.status.push.lastFailureUtcMs)
      : null,
    pushFailureCount: remote.status.push.failureCount,
    pullState: remote.status.pull.state,
    pullLastSuccessUtcMs: remote.status.pull.lastSuccessUtcMs
      ? BigInt(remote.status.pull.lastSuccessUtcMs)
      : null,
    pullLastFailureUtcMs: remote.status.pull.lastFailureUtcMs
      ? BigInt(remote.status.pull.lastFailureUtcMs)
      : null,
    pullFailureCount: remote.status.pull.failureCount,
  };
}

function rowToRemoteCursor(row: SyncCursorRow): RemoteCursor {
  return {
    remoteName: row.remoteName,
    cursorOrdinal: Number(row.cursorOrdinal),
    lastSyncedAtUtcMs: row.lastSyncedAtUtcMs
      ? Number(row.lastSyncedAtUtcMs)
      : undefined,
  };
}

function remoteCursorToRow(cursor: RemoteCursor): InsertableSyncCursor {
  return {
    remoteName: cursor.remoteName,
    cursorOrdinal: BigInt(cursor.cursorOrdinal),
    lastSyncedAtUtcMs: cursor.lastSyncedAtUtcMs
      ? BigInt(cursor.lastSyncedAtUtcMs)
      : null,
  };
}
```

**Transform Notes:**

- JSONB fields cast to expected types with runtime validation
- bigint ↔ number conversions for ordinals and timestamps
- Nullable fields handle undefined/null conversions
- Arrays default to undefined if null in database

## Migration Strategy

### Migration File: 010_create_sync_tables.ts

Location: `src/storage/migrations/010_create_sync_tables.ts`

```typescript
import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("sync_remotes")
    .addColumn("name", "text", (col) => col.primaryKey())
    .addColumn("collection_id", "text", (col) => col.notNull())
    .addColumn("channel_type", "text", (col) => col.notNull())
    .addColumn("channel_parameters", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`)
    )
    .addColumn("filter_document_ids", "jsonb")
    .addColumn("filter_scopes", "jsonb")
    .addColumn("filter_branch", "text", (col) =>
      col.notNull().defaultTo("main")
    )
    .addColumn("push_state", "text", (col) => col.notNull().defaultTo("idle"))
    .addColumn("push_last_success_utc_ms", "bigint")
    .addColumn("push_last_failure_utc_ms", "bigint")
    .addColumn("push_failure_count", "integer", (col) =>
      col.notNull().defaultTo(0)
    )
    .addColumn("pull_state", "text", (col) => col.notNull().defaultTo("idle"))
    .addColumn("pull_last_success_utc_ms", "bigint")
    .addColumn("pull_last_failure_utc_ms", "bigint")
    .addColumn("pull_failure_count", "integer", (col) =>
      col.notNull().defaultTo(0)
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`NOW()`)
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`NOW()`)
    )
    .execute();

  await db.schema
    .createIndex("idx_sync_remotes_collection")
    .on("sync_remotes")
    .column("collection_id")
    .execute();

  await db.schema
    .createTable("sync_cursors")
    .addColumn("remote_name", "text", (col) => col.primaryKey())
    .addColumn("cursor_ordinal", "bigint", (col) => col.notNull().defaultTo(0))
    .addColumn("last_synced_at_utc_ms", "bigint")
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`NOW()`)
    )
    .addForeignKeyConstraint(
      "fk_sync_cursors_remote_name",
      ["remote_name"],
      "sync_remotes",
      ["name"],
      (cb) => cb.onDelete("cascade")
    )
    .execute();

  await db.schema
    .createIndex("idx_sync_cursors_ordinal")
    .on("sync_cursors")
    .column("cursor_ordinal")
    .execute();
}
```

### Registration in migrator.ts

Add to `src/storage/migrations/migrator.ts`:

```typescript
import * as migration010 from "./010_create_sync_tables.js";

const migrations = {
  // ... existing migrations
  "010_create_sync_tables": migration010,
};
```

## Usage Example

```typescript
import { Kysely } from "kysely";
import { KyselyPGlite } from "kysely-pglite";
import { KyselySyncRemoteStorage } from "./storage/kysely/sync-remote-storage";
import { KyselySyncCursorStorage } from "./storage/kysely/sync-cursor-storage";

const kyselyPGlite = await KyselyPGlite.create();
const db = new Kysely<Database>({
  dialect: kyselyPGlite.dialect,
});

const remoteStorage = new KyselySyncRemoteStorage(db);
const cursorStorage = new KyselySyncCursorStorage(db);

const remote: RemoteRecord = {
  name: "drive-a-to-b",
  collectionId: "main:drive-123",
  channelConfig: {
    type: "gql",
    parameters: { url: "https://api.example.com/graphql" },
  },
  filter: {
    branch: "main",
  },
  options: {},
  status: {
    push: { state: "idle", failureCount: 0 },
    pull: { state: "idle", failureCount: 0 },
  },
};

await remoteStorage.upsert(remote);

const cursor: RemoteCursor = {
  remoteName: "drive-a-to-b",
  cursorOrdinal: 42,
  lastSyncedAtUtcMs: Date.now(),
};

await cursorStorage.upsert(cursor);
```

## Testing Strategy

1. **Unit Tests** - Test transform functions independently
2. **Integration Tests** - Test storage classes against real PGlite database
3. **Migration Tests** - Verify schema creation and indexes
4. **Constraint Tests** - Verify cascade deletes and FK constraints
5. **Concurrency Tests** - Test transaction isolation and concurrent updates

## Future Enhancements

1. **Compression** - Consider compressing large JSONB fields
2. **Partitioning** - Partition cursors by time if volume grows
3. **Archival** - Archive old cursor history for audit purposes
4. **Monitoring** - Add health check queries for stale cursors
5. **Sharding** - Support multiple databases for horizontal scaling

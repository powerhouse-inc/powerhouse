# Synchronization Storage

## Summary

The synchronization subsystem needs durable state that is independent from the rest of the reactor so that pull/push schedulers can restart, resume, and audit their work without replaying the entire action log. This storage keeps track of:

- **Remote registry** — the list of remotes (`name`, channel configuration, filter, options, operational status).
- **Per-remote cursors** — for every `(remote, collectionId)` pair we store the last ordinal pulled from the `IOperationIndex`, along with the `ViewFilter` that was used to derive that stream.
- **Derived collections** — the exact `collectionId`s a remote cares about (deterministically derived from drive/branch pairs via `driveCollectionId(branch, driveId)`) so sync and the operation index agree on namespace.
- **Health metadata** — timestamps and failure counts that allow the scheduler to backoff or surface telemetry.

The storage implementation is intentionally lightweight: a single relational database (Kysely + PG/PGLite) with JSON columns for filters/options. Because `IOperationIndex` already holds the operations themselves, no operation payloads live here—only metadata that lets the sync manager resume querying the index.

## Interface

```tsx
type RemoteRecord = {
  name: string;
  channelType: string;
  channelConfig: JsonObject;
  filter: RemoteFilter;
  options?: RemoteOptions;
  status: RemoteStatus;
  lastError?: string;
  createdAtUtcMs: number;
  updatedAtUtcMs: number;
};

type RemoteStatus = {
  push: ChannelHealth;
  pull: ChannelHealth;
};

type ChannelHealth = {
  state: "idle" | "running" | "error";
  lastSuccessUtcMs?: number;
  lastFailureUtcMs?: number;
  failureCount: number;
};

type RemoteCursor = {
  remoteName: string;
  collectionId: string; // e.g. collection.main.doc-123
  cursorOrdinal: number; // last processed ordinal (exclusive)
  view: ViewFilter;
  lastPulledAtUtcMs?: number;
};

export interface ISyncStorage {
  listRemotes(signal?: AbortSignal): Promise<RemoteRecord[]>;
  getRemote(name: string, signal?: AbortSignal): Promise<RemoteRecord | null>;
  upsertRemote(remote: RemoteRecord, signal?: AbortSignal): Promise<void>;
  removeRemote(name: string, signal?: AbortSignal): Promise<void>;

  listCursors(remoteName: string, signal?: AbortSignal): Promise<RemoteCursor[]>;
  getCursor(
    remoteName: string,
    collectionId: string,
    signal?: AbortSignal,
  ): Promise<RemoteCursor | null>;
  upsertCursor(cursor: RemoteCursor, signal?: AbortSignal): Promise<void>;
  removeCursor(
    remoteName: string,
    collectionId: string,
    signal?: AbortSignal,
  ): Promise<void>;
}
```

### Notes

- `channelType` + `channelConfig` tell the orchestrator how to re-create an `IChannel` implementation on restart (for example, `websocket` with URL/headers).
- `RemoteFilter` and `RemoteOptions` are the same structures defined in `Synchronization/interface.md`.
- `RemoteCursor.cursorOrdinal` is always **exclusive** (i.e. the next call to `IOperationIndex.find` uses this ordinal as `cursor`).
- Collection identifiers are always computed with `driveCollectionId(branch, driveId)`; today that means only drive documents can seed sync cursors.

## Schema

```sql
CREATE TABLE sync_remotes (
  name TEXT PRIMARY KEY,
  channel_type TEXT NOT NULL,
  channel_config JSONB NOT NULL,
  filter JSONB NOT NULL,
  options JSONB,
  status JSONB NOT NULL,     -- RemoteStatus as JSON
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sync_remote_collections (
  remote_name TEXT NOT NULL REFERENCES sync_remotes(name) ON DELETE CASCADE,
  collection_id TEXT NOT NULL,
  cursor_ordinal BIGINT NOT NULL DEFAULT 0,
  view JSONB NOT NULL,                -- ViewFilter
  last_pulled_at TIMESTAMPTZ,
  PRIMARY KEY (remote_name, collection_id)
);

CREATE INDEX idx_sync_remote_collections_cursor
  ON sync_remote_collections(remote_name, cursor_ordinal DESC);

CREATE TABLE sync_remote_health (
  remote_name TEXT NOT NULL REFERENCES sync_remotes(name) ON DELETE CASCADE,
  channel_kind TEXT NOT NULL,                     -- "push" | "pull"
  state TEXT NOT NULL,
  last_success TIMESTAMPTZ,
  last_failure TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (remote_name, channel_kind)
);
```

### Access Patterns

1. **Remote bootstrap** — `ISyncManager` loads all rows from `sync_remotes`, instantiates channels using `channel_type` + `channel_config`, then seeds local state with any `sync_remote_collections` rows.
2. **Scheduler tick** — look up the cursor for `(remote, collectionId)`, call `IOperationIndex.find(collectionId, cursor, view, paging)`, then update `cursor_ordinal` + `last_pulled_at` in a single statement.
3. **Filter change** — update `sync_remotes.filter`, recompute desired `collection_id`s, and add/remove rows in `sync_remote_collections` so future pulls know which collections to track.
4. **Health updates** — whenever a push/pull cycle completes or fails, update the corresponding `sync_remote_health` row; `status` on `sync_remotes` caches the latest snapshot for quick API responses.

This schema keeps the synchronization metadata compact, traceable, and independent from the operation index. Because it never stores actual operations, it is easy to replicate or snapshot and can be truncated/rebuilt purely from remote definitions and cursors. Workflows that need additional telemetry (e.g., per-remote lag metrics) can query `cursor_ordinal` alongside the `IOperationIndex`’s latest ordinal to compute drift without touching the operation store.

---
toc_max_heading_level: 3
---

# Storage backends and scaling

The reactor persists every operation through a Kysely-backed storage layer. You pick the backend and the execution topology on the [`ReactorBuilder`](/academy/Reference/Reactor/WorkingWithTheReactor) before you call `build()`. This page covers the default in-memory backend, switching to Postgres, and the two scaling paths: an executor worker pool and sharded projection workers.

Both scaling features are recent and design-doc-tracked. Where a path is not yet stable, this page says so.

## Default: in-memory PGlite

Out of the box the builder gives you an in-memory [PGlite](https://pglite.dev/) database. When you build a reactor with only document models registered, the builder calls an internal `createDefaultDatabase()` that constructs `new Kysely({ dialect: new PGliteDialect(new PGlite()) })`.

```typescript
import { ReactorBuilder } from "@powerhousedao/reactor";

const reactor = await new ReactorBuilder()
  .withDocumentModelSources([myDocumentModel])
  .build();
```

`new PGlite()` with no arguments is **in-memory**. Nothing is written to disk and nothing survives the process. This is the right backend for unit tests and local development, where you want a fresh, isolated database every run with no external service.

What you get in this path:

- Migrations run automatically. The migration strategy defaults to `"auto"`, so the builder runs `runMigrations(db, REACTOR_SCHEMA)` to create the `reactor` schema and apply the current migration set.
- All storage operates under the `"reactor"` Postgres schema (`REACTOR_SCHEMA === "reactor"`).
- A single in-process executor runs jobs (`maxConcurrency` defaults to `1`).
- An in-process read-model coordinator keeps the document view and indexer up to date.
- `module.pools` is `[]` — there is no `pg.Pool` to instrument.

State is ephemeral. Move to Postgres when you need data to survive a restart, when more than one process must share storage, or when you scale to a worker pool or projection shards (neither can run on PGlite — see below).

## Choosing a backend

The builder picks the base database in this precedence order, inside `buildModule()`:

1. The instance you passed to `withKysely(...)`, if any.
2. A Postgres pool, if the worker pool is enabled and a worker DB config is set.
3. The in-memory PGlite default.

### Bring your own Kysely instance

`withKysely` injects a pre-built Kysely instance and overrides default database creation.

```typescript
withKysely(kysely: Kysely<Database>): this
```

`Database` is the combined schema the reactor operates over:

```typescript
type Database = StorageDatabase & DocumentViewDatabase & DocumentIndexerDatabase;
```

`StorageDatabase` holds the operation log and sync tables (`Operation`, `Keyframe`, `document_collections`, `operation_index_operations`, `sync_remotes`, `sync_cursors`, `sync_dead_letters`); the other two cover the document view and the document indexer. `Database`, `StorageDatabase`, `DocumentIndexerDatabase`, and `OperationTable` are exported from the package root.

A persistent backend needs a Postgres-compatible dialect and the `reactor` schema. Pass a real Postgres `Kysely` here when you want to control pool construction yourself; otherwise use the worker DB config (next section), which builds the pool for you. If you build the pool yourself, register its instrumentation with `withInstrumentedPool(instrumentation)` so pool stats surface through `module.pools`.

### Postgres via the worker DB config

When the worker pool is enabled (below), the builder builds the parent reactor's Postgres pool for you from the `DbConfig` you pass to `withWorkerDbConfig`. The internal `createPostgresDatabase` constructs a `pg.Pool` and wraps it in a `PostgresDialect`:

```typescript
new Pool({
  host: config.host,
  port: config.port,
  database: config.database,
  user: config.user,
  password: config.password,
  ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
  application_name: config.applicationName,
  max: config.poolSize,
  connectionTimeoutMillis: config.connectionTimeoutMillis,
  idleTimeoutMillis: config.idleTimeoutMillis,
});
```

The pool is instrumented with `instrumentPgPool(pool, config.applicationName ?? "reactor-host")` and exposed via `module.pools`.

### Migrations

The migration strategy is set with `withMigrationStrategy`:

```typescript
withMigrationStrategy(strategy: MigrationStrategy): this
// MigrationStrategy = "auto" | "manual" | "none"
```

Default is `"auto"`. Only `"auto"` runs migrations during `buildModule()`. A migration failure throws `` `Database migration failed: ${error.message}` ``. For `"manual"` or `"none"`, run migrations yourself with the exported helpers:

```typescript
import { runMigrations, getMigrationStatus, REACTOR_SCHEMA } from "@powerhousedao/reactor";

const result = await runMigrations(db, REACTOR_SCHEMA);
if (!result.success && result.error) {
  throw result.error;
}
```

`runMigrations` returns `{ success, migrationsExecuted, error? }` and never throws on a migration error — it reports the error in the result. Use `getMigrationStatus(db, REACTOR_SCHEMA)` to inspect applied versus pending migrations without running them.

## Scaling with a worker pool

The executor worker pool moves job execution out of the main thread into N `node:worker_threads` workers. Each worker opens its own Postgres pool and runs document models in isolation. Jobs route to a worker stickily by document id, so all work for one document lands on the same worker.

Enable it with `withWorkerPool`, register document models as **importable sources** (`{ filePath }` or `{ packageName }` — workers re-import them; a live module cannot cross the thread boundary), and supply connection info:

```typescript
import { ReactorBuilder } from "@powerhousedao/reactor";

const reactor = await new ReactorBuilder()
  .withDocumentModelSources([
    { packageName: "@my-org/account-document-model", subpath: "document-models" },
  ])
  .withWorkerPool({
    enabled: true,
    numWorkers: 4,
    workerType: "thread",
  })
  .withWorkerDbConfig({
    host: "localhost",
    port: 5432,
    database: "reactor",
    user: "reactor",
    password: process.env.PGPASSWORD!,
  })
  .build();
```

### Config shapes

`WorkerPoolConfig`:

```typescript
type WorkerPoolConfig = {
  enabled: boolean;                 // when false, the executor runs in-process
  numWorkers: number;               // number of worker instances to spawn
  workerType: "thread" | "process"; // worker isolation mode
  heartbeatMs?: number;             // optional heartbeat interval (ms)
  workerPgPoolSize?: number;        // optional per-worker pg pool size override
};
```

`enabled` gates everything; when `false` the executor stays in-process. `numWorkers` becomes the number of workers the manager spawns at `start()` and the modulus used for sticky routing.

`DbConfig`:

```typescript
type DbConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  applicationName?: string;
  poolSize?: number;
  connectionTimeoutMillis?: number; // pg defaults to 0 (unlimited wait) if omitted
  idleTimeoutMillis?: number;       // pg defaults to 10000 if omitted
};
```

`DbConfig` is sent across worker IPC, so it must be JSON-clonable. `ssl: true` maps to `{ rejectUnauthorized: false }`; `poolSize` maps to pg's `max`; `applicationName` maps to `application_name`.

A signature verifier is optional: when `withWorkerSignatureVerifierSpec` is omitted, workers perform no executor-side signature verification (parity with the in-process executor's default). To opt in, pass a `FactorySpec`: a `ModuleRef` (one of `{ packageName, exportName }` or `{ filePath, exportName }`) plus optional JSON-clonable `initArgs`. The worker imports the named export and invokes it to construct its signature verifier.

### How sources resolve

`buildModule()` resolves every registered source in one pass: file and package sources are imported host-side and their exports scanned for `DocumentModelModule` values; the resulting modules are registered on the host registry (identically in both executor modes), and the importable sources form the manifest each worker imports at boot. The host and workers are derived from the same list, so they cannot diverge.

### Build-time constraints that throw

When `workerPool.enabled` is `true`, `buildModule()` enforces the wiring up front. Each of these throws:

- No importable sources: `"workerPool.enabled requires at least one worker-importable document-model source ({ filePath } or { packageName })."`
- A model registered only as a live module: `"workerPool.enabled requires worker-importable sources, but these models were registered only as live modules: ..."` — provide a `{ filePath }` or `{ packageName }` source for each (a live module for the same `documentType@version` may coexist; the importable source covers it).
- No worker DB config (and no custom factory or executor): `"workerPool.enabled requires withWorkerDbConfig (or a custom withWorkerFactory / withExecutor)."`

The DB-config check only applies when the builder needs to build the default thread transport — that is, when you have not supplied a custom `withWorkerFactory` or `withExecutor`.

The worker pool requires a real Postgres server. PGlite cannot be shared across threads, so the parent and the workers must point at the same Postgres instance. This is why `withWorkerDbConfig` is mandatory: the in-memory default does not work here. When the pool is enabled and a worker DB config is set, the builder builds the parent's database from that same config.

### Custom transports

`withWorkerFactory` injects a custom `WorkerFactory`, skipping the default thread-transport wiring:

```typescript
type WorkerFactory = (index: number) => IExecutorWorker;
```

Use this for tests or an alternative transport. When you supply one, the DB-config and verifier-spec validations above no longer apply (the builder is not building the default transport).

:::warning Not yet stable
`workerType: "process"` is declared in `WorkerPoolConfig`, but the built-in factory only ever spawns a `node:worker_threads` worker. To run workers as separate processes today you must supply your own `withWorkerFactory`. `heartbeatMs` and the heartbeat message are scaffolding for a future phase and are not yet active.
:::

## Projection shards

Projection shards move read-model indexing out of the main thread. Instead of the in-process read-model coordinator, the builder installs a shard manager that fans `JOB_WRITE_READY` events to N projection workers, sharded by document id. Each worker materializes the built-in read models against its own Postgres pool and re-emits `JOB_READ_READY` and read-model events back to the host bus, so [synchronization](/academy/Reference/Reactor/Synchronization), awaiters, and observers see them exactly once per job.

Configure shards with `withProjectionShards`. This path reuses the same `DbConfig` you set with `withWorkerDbConfig`, so that call is mandatory.

```typescript
import { ReactorBuilder } from "@powerhousedao/reactor";

const reactor = await new ReactorBuilder()
  .withDocumentModelSources([
    { packageName: "@my-org/account-document-model", subpath: "document-models" },
  ])
  .withWorkerDbConfig({
    host: "localhost",
    port: 5432,
    database: "reactor",
    user: "reactor",
    password: process.env.PGPASSWORD!,
  })
  .withProjectionShards({
    shardCount: 4,
    preReadyKinds: ["document-view"],
    postReadyKinds: ["document-indexer"],
  })
  .build();
```

### Config shape

`ProjectionShardBuilderConfig`:

```typescript
type ProjectionShardBuilderConfig = {
  shardCount: number;
  preReadyKinds: BuiltInReadModelKind[];
  postReadyKinds: BuiltInReadModelKind[];
  poolSize?: number;
  initTimeoutMs?: number;
  shutdownGraceMs?: number;
  drainTimeoutMs?: number;
  chainDepthReportIntervalMs?: number;
};
// BuiltInReadModelKind = "document-view" | "document-indexer"
```

`preReadyKinds` run before a job reaches `READ_READY`; `postReadyKinds` run after. `poolSize` overrides the reused worker DB pool size for the shard pools only; the builder forces their `application_name` to `"reactor-projection-shard"`.

Defaults applied when the optional fields are omitted: `initTimeoutMs` 30000, `shutdownGraceMs` 5000, `drainTimeoutMs` 30000, `chainDepthReportIntervalMs` 250.

### Build-time constraints that throw

- `withProjectionShards` without `withWorkerDbConfig`: `"withProjectionShards requires withWorkerDbConfig; projection workers need connection info to open their own pools."`
- `shardCount < 1`: `` `ProjectionShardManager: shardCount must be >= 1 (got ${shardCount})` ``.

Shards can run on their own or alongside the worker pool. They replace the read-model coordinator; the executor side is independent. As with the worker pool, projection shards require real Postgres — the workers open their own pools and PGlite cannot be shared across threads.

`withProjectionWorkerFactory` injects a custom `ProjectionWorkerFactory` and skips the default thread-transport wiring, mirroring `withWorkerFactory` on the pool:

```typescript
type ProjectionWorkerFactory = (shardIndex: number, shardId: string) => IProjectionTransport;
```

:::warning Not yet stable
Projection shards are a recent, design-doc-tracked feature. The shard-manager class itself is internal; you configure it through `withProjectionShards` and the public `ProjectionShardBuilderConfig`, `BuiltInReadModelKind`, `ProjectionWorkerFactory`, and `IProjectionTransport` types.
:::

## Decision guide

- **In-memory PGlite (default).** Dev and tests. Zero setup, ephemeral, single process. Use it unless you need one of the below.
- **Postgres (`withKysely` or `withWorkerDbConfig`).** When state must survive a restart or be shared across processes.
- **Worker pool (`withWorkerPool`).** When job execution is CPU-bound and one thread is the bottleneck. Requires Postgres and document-model specs.
- **Projection shards (`withProjectionShards`).** When read-model indexing is the bottleneck. Requires Postgres. Combine with the worker pool when both write and read paths need to scale.

Both scaling paths require real Postgres and trade simplicity for throughput. Start in-memory, move to Postgres for persistence, and reach for the worker pool or shards only when a single thread is the proven bottleneck.

For the full list of builder methods, see the builder table on [Advanced Reactor Usage](/academy/Reference/Reactor/AdvancedReactorUsage). For the read-model and processor side of indexing, see [Processors](/academy/Reference/Reactor/Processors) and [Document model registry](/academy/Reference/Reactor/DocumentModelRegistry). For the client surface that talks to a built reactor, see [IReactorClient](/academy/Reference/Reactor/ReactorClient).

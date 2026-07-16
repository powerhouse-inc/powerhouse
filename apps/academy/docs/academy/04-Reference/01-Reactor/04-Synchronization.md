---
toc_max_heading_level: 3
---

# Synchronization and remote drives

Sync makes one reactor mirror operations with a remote drive. The local reactor pushes operations it produces and pulls operations the remote produces, so two reactors converge on the same document history. You need it whenever a reactor must share state with another reactor: a Connect tab syncing to a Switchboard server, or two services replicating a drive.

The sync subsystem lives in `@powerhousedao/reactor`. The orchestrator is `ISyncManager`; each remote drive is a `Remote` backed by an `IChannel`. Today the only shipped transport is GraphQL over HTTP: `GqlRequestChannel` (the client/poller side, used by Connect) and `GqlResponseChannel` (the server/push side, used by Switchboard). The channel config `type` string is `"gql"`.

For the reactor itself and the builder, see [Working with the Reactor](/academy/Reference/Reactor/WorkingWithTheReactor) and [Advanced Reactor Usage](/academy/Reference/Reactor/AdvancedReactorUsage). For sync error categories and auth failures, see [Error handling](/academy/Reference/Reactor/ErrorHandling).

## Enabling sync on a reactor

Sync is off by default. A reactor has no sync manager unless you call either `withChannelScheme` or `withSync` on the `ReactorBuilder`. Use one or the other, not both.

### The shortcut: `withChannelScheme`

`withChannelScheme(scheme)` builds the channel factory and `SyncBuilder` for you, then starts the sync manager during `build()`. Pick the scheme by which side you are:

- `ChannelScheme.CONNECT` builds a `GqlRequestChannelFactory` (the polling client side).
- `ChannelScheme.SWITCHBOARD` builds a `GqlResponseChannelFactory` (the push server side).

```typescript
import { ReactorBuilder, ChannelScheme } from "@powerhousedao/reactor";

const module = await new ReactorBuilder()
  .withDocumentModelSources([/* ... */])
  .withChannelScheme(ChannelScheme.CONNECT)
  .withJwtHandler(async (url) => getTokenForAudience(url)) // optional, CONNECT only
  .buildModule();

const sync = module.syncModule?.syncManager; // ISyncManager | undefined
```

`withJwtHandler` only flows through the `CONNECT` factory; on the `SWITCHBOARD` path it is ignored. The handler is called per request with the target URL and returns the bearer token or `undefined` when unauthenticated:

```typescript
type JwtHandler = (url: string) => Promise<string | undefined>;
```

If you set both `withChannelScheme` and `withSync`, only the scheme path runs and your custom `SyncBuilder` is discarded. The scheme path always constructs a fresh `SyncBuilder` with the scheme's factory.

### Full control: `withSync`

Pass a pre-configured `SyncBuilder` when you need a custom channel factory, custom storages, or different limits. The reactor builder still calls `syncManager.startup()` for you on this path.

```typescript
import {
  ReactorBuilder,
  SyncBuilder,
  GqlRequestChannelFactory,
} from "@powerhousedao/reactor";

const syncBuilder = new SyncBuilder()
  .withChannelFactory(new GqlRequestChannelFactory(logger, jwtHandler, queue))
  .withMaxInboxBatchSize(32)
  .withMaxDeadLettersPerRemote(100);

const module = await new ReactorBuilder()
  .withDocumentModelSources([/* ... */])
  .withSync(syncBuilder)
  .buildModule();
```

If neither method is called, `module.syncModule` is `undefined` and the reactor does not sync.

## `SyncBuilder` reference

`SyncBuilder` configures the sync module. Every `withX` method returns `this`. The only required call is `withChannelFactory` — `build`/`buildModule` throws `"Channel factory is required"` without it.

| Method | Effect | Required |
| --- | --- | --- |
| `withChannelFactory(factory: IChannelFactory)` | Sets the transport factory. | Yes |
| `withRemoteStorage(storage: ISyncRemoteStorage)` | Overrides where remote records persist. Defaults to a Kysely-backed store on the reactor database. | No |
| `withCursorStorage(storage: ISyncCursorStorage)` | Overrides sync-cursor storage. Defaults to a Kysely-backed store. | No |
| `withDeadLetterStorage(storage: ISyncDeadLetterStorage)` | Overrides dead-letter storage. Defaults to a Kysely-backed store. | No |
| `withMaxDeadLettersPerRemote(limit: number)` | Caps retained dead letters per remote. Default `100`. | No |
| `withMaxInboxBatchSize(limit: number)` | Caps how many inbound operations apply per batch. Default `32`. | No |

Terminal methods. `build(...)` returns the `ISyncManager`; `buildModule(...)` returns the full `InProcessSyncModule` (`{ remoteStorage, cursorStorage, deadLetterStorage, channelFactory, syncManager }`). Both take, in order: `reactor`, `logger`, `operationIndex`, `eventBus`, `db`, `driveContainerTypes`.

```typescript
buildModule(
  reactor: IReactor,
  logger: ILogger,
  operationIndex: IOperationIndex,
  eventBus: IEventBus,
  db: Kysely<Database>,
  driveContainerTypes: ReadonlySet<string>,
): InProcessSyncModule
```

Neither `build` nor `buildModule` calls `startup()`. If you construct a `SyncBuilder` directly instead of going through `ReactorBuilder`, you must call `syncManager.startup()` yourself before adding remotes.

## Adding a remote

`ISyncManager.add` registers a remote drive, persists it, creates its channel, and calls `channel.init()`.

```typescript
add(
  name: string,
  collectionId: DriveCollectionId,
  channelConfig: ChannelConfig,
  filter?: RemoteFilter,
  options?: RemoteOptions,
  id?: string,
): Promise<Remote>;
```

- `name` is the unique key for the remote across the manager. Reusing a name throws ``Remote with name '${name}' already exists``.
- `collectionId` identifies the drive to sync. Build it with `DriveCollectionId.forDrive(driveId, branch?)` (branch defaults to `"main"`).
- `channelConfig` wires the transport.
- `filter` defaults to `{ documentId: [], scope: [], branch: "" }` (no restriction).
- `options` defaults to `{ sinceTimestampUtcMs: "0" }` (sync from the start of history).
- `id` defaults to a generated UUID.

If `channel.init()` throws, `add` rolls the remote back out of both the map and storage and rethrows the original error. Calling `add` after `shutdown()` throws `"SyncManager is shutdown and cannot add remotes"`.

### `ChannelConfig`

```typescript
type ChannelConfig = { type: string; parameters: Record<string, unknown> };
```

For the GraphQL request channel, `type` is `"gql"` and `parameters` must include `url`. The factory validates `parameters` at `add`/startup time and throws if `url` is missing or empty:

```typescript
{
  type: "gql",
  parameters: {
    url: "https://switchboard.example/d/my-drive/graphql",
    // optional, with their defaults:
    // pollIntervalMs: 2000,
    // retryBaseDelayMs: 1000,
    // retryMaxDelayMs: 300000,
    // maxQueueDepth: 100,
    // backpressureCheckIntervalMs: 500,
    // fetchFn: customFetch,
  },
}
```

Any optional parameter present with the wrong type throws at registration, for example `'"pollIntervalMs" parameter must be a number'`.

### `RemoteFilter`

```typescript
type RemoteFilter = { documentId: string[]; scope: string[]; branch: string };
```

An empty `documentId` or `scope` array means "no restriction" on that dimension. An empty `branch` string means "no branch restriction". Otherwise the filter is a membership or equality test against each operation.

### `RemoteOptions`

```typescript
type RemoteOptions = {
  sinceTimestampUtcMs?: string; // stringified UTC ms; "0"/undefined sync from start
  pollBehavior?: PollBehavior;  // defaults to Auto
};
```

When `sinceTimestampUtcMs` is set and not `"0"`, outbox operations older than that timestamp are excluded.

### `ChannelScheme`

```typescript
enum ChannelScheme {
  CONNECT = "connect",
  SWITCHBOARD = "switchboard",
}
```

`CONNECT` selects `GqlRequestChannelFactory` (polls and pushes). `SWITCHBOARD` selects `GqlResponseChannelFactory` (push-driven, server-side). `GqlRequestChannelFactory` takes `(logger, jwtHandler, queue)` — the queue is needed for poll backpressure. `GqlResponseChannelFactory` takes `(logger)`.

### How Connect adds a drive

The app-level helper `addRemoteDrive(url, driveId?, options?)` in `@powerhousedao/reactor-browser` shows the canonical call. It reads `window.ph.reactorClient` and the sync manager (throwing `"ReactorClient not initialized"` or `"Sync not initialized"` if absent), fetches `{ id, graphqlEndpoint }` from `url`, then registers the remote:

```typescript
const collectionId = DriveCollectionId.forDrive(resolvedDriveId);

await sync.add(
  crypto.randomUUID(), // name
  collectionId,
  { type: "gql", parameters: { url: driveInfo.graphqlEndpoint } },
  undefined, // filter -> no restriction
  options?.pollBehavior ? { pollBehavior: options.pollBehavior } : undefined,
);
```

Before adding, it dedupes against `sync.list().find((r) => r.meta.collectionId.equals(collectionId))`. If `add` throws and `isDriveAuthError(error)` is true, it shows the drive-auth modal and rethrows. To remove a drive, find every remote whose `meta.collectionId.equals(...)` and call `sync.remove(remote.meta.name)`.

## Polling and pulling

`PollBehavior` controls a remote's poll schedule:

```typescript
enum PollBehavior {
  Auto = "auto",
  Manual = "manual",
}
```

- `Auto` (default): the channel runs its interval timer in the background. The first tick fires immediately on `init()`, then repeats at `pollIntervalMs` (default 2000 ms).
- `Manual`: the channel registers and connects, but the timer never ticks on its own. Pull on demand with `ISyncManager.triggerPull(name)`.

```typescript
triggerPull(name: string): void;
```

`triggerPull` runs one pull cycle. For a `Manual` remote it does not start recurring polling — the remote stays Manual and a single fetch runs. `triggerPull` on a missing remote throws ``Remote with name '${name}' does not exist``. On a `GqlResponseChannel` (Switchboard side) `triggerPull` is a no-op, because that channel is push-driven.

Polling also applies backpressure: a tick defers when the reactor queue depth exceeds `maxQueueDepth` and rechecks after `backpressureCheckIntervalMs`. Transient poll failures retry with exponential backoff between `retryBaseDelayMs` and `retryMaxDelayMs`.

## Watching sync status

There are three views into sync state: per-document status, per-job completion, and per-remote connection state.

### Per-document status

```typescript
getSyncStatus(documentId: string): SyncStatus | undefined;
onSyncStatusChange(callback: SyncStatusChangeCallback): () => void;
```

`getSyncStatus` returns `undefined` for a document that has never been tracked. `onSyncStatusChange` returns an unsubscribe function. `SyncStatusChangeCallback` is `(documentId: string, status: SyncStatus) => void`.

```typescript
enum SyncStatus {
  Synced = "SYNCED",
  Outgoing = "OUTGOING",
  Incoming = "INCOMING",
  OutgoingAndIncoming = "OUTGOING_AND_INCOMING",
  Error = "ERROR",
}
```

Status derives from mailbox depth: any error gives `Error`; pending in both directions gives `OutgoingAndIncoming`; otherwise `Incoming`, `Outgoing`, or `Synced`.

### Per-job completion

```typescript
waitForSync(jobId: string, signal?: AbortSignal): Promise<SyncResult>;
```

`waitForSync` resolves when the job's sync operations finish. It resolves on both success and failure — a failed sync resolves with `status: "failed"`, it does not reject. The promise only rejects on abort or manager shutdown. If the job already finished, it returns the cached result immediately.

```typescript
type SyncResult = {
  jobId: string;
  status: "succeeded" | "failed";
  syncOperationCount: number;
  successCount: number;
  failureCount: number;
  errors: Array<{ remoteName: string; documentId: string; error: string }>;
};
```

`SyncResult` is the documented return shape but is not exported as a named type from `@powerhousedao/reactor`; treat it structurally.

Note the worker boundary. When the sync manager runs in a SharedWorker and you hold the tab-side RPC proxy, `waitForSync` always rejects with `"waitForSync is not supported over the worker RPC boundary"`. Use `getSyncStatus`/`onSyncStatusChange` or per-remote connection state instead.

### Per-remote connection state

Each `Remote` exposes its live channel. Read or subscribe to its connection state:

```typescript
getConnectionState(): ConnectionStateSnapshot;
onConnectionStateChange(cb: (snapshot: ConnectionStateSnapshot) => void): () => void;
```

```typescript
type ConnectionState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "error";

type ConnectionStateSnapshot = {
  state: ConnectionState;
  failureCount: number;
  lastSuccessUtcMs: number;
  lastFailureUtcMs: number;
  pushBlocked: boolean;
  pushFailureCount: number;
  receivingPages: boolean;
  requiresAuth: boolean; // only meaningful while state === "error"
};
```

`requiresAuth` is set when the remote rejected the caller as unauthenticated (HTTP 401/403 or a Forbidden GraphQL error) and is only meaningful while `state` is `"error"`. See [Error handling](/academy/Reference/Reactor/ErrorHandling) for the full error taxonomy and `isDriveAuthError`.

### React hooks

`@powerhousedao/reactor-browser` exposes two hooks:

```typescript
const sync = useSync();        // ISyncManager | undefined
const remotes = useSyncList(); // Remote[]
```

`useSync` returns the sync manager off the reactor client module, or `undefined` when sync is not wired. `useSyncList` returns `sync.list()` (or `[]`). It recomputes on every render and does not subscribe to add/remove, so combine it with a connection-state subscription if you need a re-render when state changes:

```typescript
const remotes = useSyncList();
const remote = remotes.find((r) =>
  r.meta.collectionId.equals(DriveCollectionId.forDrive(driveId)),
);
const snapshot = remote?.channel.getConnectionState();
// remote.meta is cloneable; remote.channel is the live channel.
// To read the GraphQL URL: (remote.channel as GqlRequestChannel).config.url
```

### Sync events

The sync subsystem uses a 20000-range event namespace, distinct from the 10000-range reactor events. Subscribe through the reactor's `IEventBus` (see the event-bus section on [Working with the Reactor](/academy/Reference/Reactor/WorkingWithTheReactor)).

```typescript
const SyncEventTypes = {
  SYNC_PENDING: 20001,
  SYNC_SUCCEEDED: 20002,
  SYNC_FAILED: 20003,
  DEAD_LETTER_ADDED: 20004,
  CONNECTION_STATE_CHANGED: 20005,
} as const;
```

Payload shapes:

```typescript
type SyncPendingEvent = {
  jobId: string;
  syncOperationCount: number;
  remoteNames: string[];
};

type SyncSucceededEvent = { jobId: string; syncOperationCount: number };

type SyncFailedEvent = {
  jobId: string;
  successCount: number;
  failureCount: number;
  errors: Array<{ remoteName: string; documentId: string; error: string }>;
};

type ConnectionStateChangedEvent = {
  remoteName: string;
  remoteId: string;
  previous: ConnectionState;
  current: ConnectionState;
  snapshot: ConnectionStateSnapshot;
};
```

`CONNECTION_STATE_CHANGED` (20005) fires on every channel transition; subscribe to it for a global view across all remotes. The manager does not track the prior state, so `previous` currently mirrors `current` — read `snapshot.state` rather than relying on `previous`. `SYNC_SUCCEEDED`/`SYNC_FAILED` back `waitForSync`; prefer `waitForSync` over subscribing to them directly.

## Dead letters

A dead letter is a sync operation that failed and cannot be retried — a bad signature, a hash mismatch, or an unrecoverable transport error. When a channel routes an operation to its dead-letter mailbox, the sync manager logs it, quarantines the document, persists a record to dead-letter storage, and emits `DEAD_LETTER_ADDED`.

```typescript
type DeadLetterAddedEvent = {
  id: string;
  jobId: string;
  remoteName: string;
  documentId: string;
  errorSource: ChannelErrorSource;
};

enum ChannelErrorSource {
  None = "none",
  Channel = "channel",
  Inbox = "inbox",
  Outbox = "outbox",
}
```

Quarantine is per document. Once a document is quarantined, its inbound operations are dropped and its outbound operations are filtered out, so a single poisoned document does not stall the rest of the drive. Each remote retains at most `maxDeadLettersPerRemote` (default 100) dead letters; the oldest are evicted past that. Subscribe to `DEAD_LETTER_ADDED` to surface failures that need manual intervention.

## Gotchas

| Call | Throws |
| --- | --- |
| `SyncBuilder.build`/`buildModule` without `withChannelFactory` | `"Channel factory is required"` |
| `sync.add(name, ...)` with a duplicate name | ``Remote with name '${name}' already exists`` |
| `sync.add` after `shutdown()` | `"SyncManager is shutdown and cannot add remotes"` |
| `sync.startup()` after `shutdown()` | `"SyncManager is already shutdown and cannot be started"` |
| `getByName` / `triggerPull` / `remove` on an unknown remote | ``Remote with name '${name}' does not exist`` |
| `getById` on an unknown remote | ``Remote with id '${id}' does not exist`` |
| `add` with a `"gql"` config missing/empty `url` | `'GqlRequestChannelFactory requires "url" parameter in config.parameters'` |
| `waitForSync` over the worker RPC proxy | `"waitForSync is not supported over the worker RPC boundary"` |

## Not yet stable

- The `IChannelFactory.instance` parameters `cursorStorage` and `operationIndex` are marked for removal in source. Do not depend on the factory signature staying fixed.
- `GqlResponseChannel`/`GqlResponseChannelFactory` are Switchboard-side primitives, relevant to reactor-api wiring rather than typical app code.
- `ConnectionStateChangedEvent.previous` does not currently carry the real prior state.

## Related

- [Working with the Reactor](/academy/Reference/Reactor/WorkingWithTheReactor) — the event bus and reactor lifecycle.
- [Advanced Reactor Usage](/academy/Reference/Reactor/AdvancedReactorUsage) — `ReactorBuilder` and low-level `IReactor`.
- [Error handling](/academy/Reference/Reactor/ErrorHandling) — sync error categories, `isDriveAuthError`, retries.
- [Storage and scaling](/academy/Reference/Reactor/StorageAndScaling) — storage backends behind cursors and dead letters.
- [Processors](/academy/Reference/Reactor/Processors) and [Building a processor](/academy/Build/WorkWithData/BuildingAProcessor) — reacting to synced operations.

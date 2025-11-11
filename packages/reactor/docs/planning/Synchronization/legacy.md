# Legacy Synchronization Bridge

## Goal

- Ship synchronization for Reactor quickly by reusing the proven `document-drive` implementation instead of building the greenfield system described in `interface.md` and `index.md`.
- Preserve the legacy behavior so Switchboard remotes, pull responders, and sync status dashboards keep working while the rest of the rewrite lands.
- Wrap legacy pieces behind Reactor-facing interfaces so we can iterate toward the new channel-based design incrementally.

## Legacy System Summary

### Core manager

- `SynchronizationManager` (`packages/document-drive/src/server/sync-manager.ts:30`) is a thin service that knows how to:
  - Resolve synchronization units (`documentId`, `scope`, `branch`, `documentType`) via `getSynchronizationUnitsIds` and `getSynchronizationUnits` (lines 43-118) by querying the storage-layer `findStorageUnitsBy` filter and then asking `IDriveOperationStorage.getSynchronizationUnitsRevision`.
  - Load operations for a unit with cursor-like filters (`since`, `fromRevision`, `limit`) in `getOperationData` (line 146). It reconstructs the document through `getDocument` (line 214) which first checks the cache, then falls back to `IDocumentStorage`, calls `garbageCollectDocumentOperations`, and replays reducers via the injected `DocumentModelModule[]`.
  - Track combined push/pull health per unit by storing status in the specialized `SyncUnitMap` (`packages/document-drive/src/server/sync-unit-map.ts`) and emitting `"syncStatus"` events (lines 275-333).
  - Bootstrap a drive’s sync metadata during initialization through `initializeDriveSyncStatus` (line 386), deciding whether to flag pull/push as `INITIAL_SYNC` based on Drive local state (`triggers`/`listeners`).

### Push path (legacy “listeners”)

- `ListenerManager` (`packages/document-drive/src/server/listener/listener-manager.ts:28`) manages the push side. Important call sites:
  - `getListenerSyncUnits` (line 456) uses the `SynchronizationManager` query APIs to translate a listener’s `ListenerFilter` into the set of `SynchronizationUnit`s that must stay up to date.
  - `_triggerUpdate` (line 214) diffs listener state against the latest revisions, calls `syncManager.getOperationData` per unit, batches them into `StrandUpdate` payloads, and invokes the listener’s transmitter (`switchboard push`, `internal`, etc.).
  - `getStrands` (line 490) exposes the same logic to pull-based transmitters (e.g., GraphQL pull responders) so another server can fetch pending strands on demand.
  - `updateListenerRevision` and `SyncronizationUnitState` keep per-listener revision cursors using `SyncUnitMap<SyncronizationUnitState>`, preventing duplicate pushes.

### Pull path (legacy “triggers”)

- `BaseDocumentDriveServer.startSyncRemoteDrive` (`packages/document-drive/src/server/base-server.ts:365`) spins up pull loops per remote trigger. For each trigger:
  - Marks drive + unit statuses as `"SYNCING"` via `synchronizationManager.updateSyncStatus`.
  - Delegates to `PullResponderTransmitter.setupPull` (`packages/document-drive/src/server/listener/transmitter/pull-responder.ts:729`), which repeatedly calls the remote GraphQL `sync.strands` endpoint, enqueues incoming operations through `saveStrand`, and acknowledges remote revisions.
  - Uses listener metadata (drive local state) to stitch push acknowledgements back into listener revisions when the remote returns success.
- `stopSyncRemoteDrive` (base-server line 489) tears down pull loops and clears sync status.

### Data structures worth reusing

- `SynchronizationUnit` / `SynchronizationUnitQuery` / `SynchronizationUnitId` / `OperationUpdate` / `StrandUpdate` / `SyncStatus` (`packages/document-drive/src/server/types.ts:120-200`).
- `SyncUnitMap` (keyed by `documentId|scope|branch`) for efficient lookups (`packages/document-drive/src/server/sync-unit-map.ts`).
- `StrandUpdateSource`, transmitters, and debounce helpers around listener updates (`packages/document-drive/src/server/listener/transmitter/types.ts:34`).

## Proposed Reactor Fit

### Dependency mapping

| Legacy dependency | Reactor counterpart | Notes |
| --- | --- | --- |
| `IDriveOperationStorage.getSynchronizationUnitsRevision` | `IOperationStore.getRevisions` + `ISyncStore.findStorageUnitsBy` | Wrap inside an adapter that fans out `findStorageUnitsBy` queries and then calls `getRevisions(documentId, branch)` to build the unit metadata array the legacy manager expects. |
| `IDocumentStorage` + `ICache` | `IDocumentStorage` (still used) + `IWriteCache` | Replace the cache calls with `IWriteCache.getState/putState`, using the Reactor `IDocumentModelRegistry` for reducer lookup instead of passing raw `DocumentModelModule[]`. |
| `DocumentModelModule[]` injection | `IDocumentModelRegistry.getModules()` | Provide a thin shim returning the modules array for `SynchronizationManager.setDocumentModelModules`. |
| `IEventEmitter` | `IEventBus` | Adapt legacy `emit("syncStatus")` to broadcast through a Reactor event channel (`SyncEventTypes.STATUS_CHANGED`) so other subsystems can subscribe without depending on the old EventEmitter signature. |
| Drive local state (`listeners`, `triggers`) | Reactor `Remote` records | Persist `Remote` definitions in the document-drive document for now (same schema) and expose them through an adapter that satisfies the new `Remote` interface (`docs/planning/Synchronization/interface.md`). |

### Component bridge

1. **LegacySynchronizationManagerAdapter**
   - Hosts the verbatim class from `packages/document-drive/src/server/sync-manager.ts` with only constructor swaps for the new dependencies noted above.
   - Exposes both the legacy API (needed by the listener stack) and a thin shim that satisfies the Reactor `ISynchronizationManager` (`get`, `add`, `remove`, `list`, `setFilter`) by storing `Remote` metadata and instantiating listeners/triggers lazily.

2. **LegacyListenerManagerBridge**
   - Reuse `ListenerManager` wholesale, but replace places that directly reference drive documents with a `RemoteDescriptor` object (`remoteName`, `channel`, `filter`, `options`). Each remote becomes a pseudo-drive id until we migrate the storage shape.
   - Wrap listener transmitters (`switchboard push`, `internal`, etc.) inside `IChannel` mailboxes. Example: a `RemoteChannelBridge` can feed `ListenerManager.triggerUpdate` whenever Reactor emits `OperationEventTypes.OPERATION_WRITTEN`, and consume `channel.inbox` by calling `Reactor.load(...)` after `PullResponderTransmitter.getStrands`.

3. **Remote scheduler**
   - The existing debounce/polling logic in `_triggerUpdate` and `PullResponderTransmitter.setupPull` already encapsulates backoff, limits, and retry behavior. We can keep those loops exactly as-is, but move their lifecycle management under a Reactor service that starts/stops them when `ISynchronizationManager.add/remove` is called.

4. **Status propagation**
   - Keep the `SyncUnitMap` implementation and `getCombinedSyncUnitStatus` ordering.
   - Adapt `updateSyncStatus` to publish two Reactor events: a drive-scoped aggregate (`RemoteStatusChanged`) and per-unit updates (`SyncUnitStatusChanged`). Consumers such as UI or metrics can subscribe without touching legacy classes.

### Push flow inside Reactor

1. Reactor job executor emits `OperationEventTypes.OPERATION_WRITTEN`.
2. `LegacyListenerManagerBridge` subscribes to that event, calls `triggerUpdate({ type: "local" })`, and receives the set of affected remotes via `_checkFilter`.
3. For each remote, it uses `syncManager.getOperationData` to build `StrandUpdate`s and hands them to the remote’s `IChannel.send`.
4. The channel forwards the job handles to transport-specific code (Switchboard push, WebSocket, HTTP, etc.). Completion/ack events call `updateListenerRevision` so the bridge knows which revisions are fully applied.

### Pull flow inside Reactor

1. Each remote can declare pull capabilities (exactly the legacy `Trigger` data) in `Remote.options`.
2. `LegacySynchronizationManagerAdapter` starts the pull loop by calling the existing `PullResponderTransmitter.setupPull`, but instead of invoking `saveStrand` on `BaseDocumentDriveServer`, it enqueues Reactor `load` jobs via `IQueue.enqueue({ kind: "load", operations })`.
3. Acknowledgements received from the remote call back into `updateSyncStatus` and `updateListenerRevision`, keeping both push and pull cursors aligned.
4. Any errors during pull loops flow into the Reactor event bus so observability matches the rest of the system.

## Implementation Steps

1. **Extract + wrap storage adapters**
   - Build `LegacySyncStoreAdapter` that implements the two `SynchronizationManager` storage calls on top of `ISyncStore` and `IOperationStore`.
   - Build `LegacyWriteCacheAdapter` that uses `IWriteCache` and `IDocumentModelRegistry` to reproduce `getDocument`.

2. **Port the manager and map dependencies**
   - Copy `SynchronizationManager` into `packages/reactor/src/synchronization/legacy-manager.ts`.
   - Replace imports with Reactor shims and wire it into the Reactor dependency injection graph alongside the queue, event bus, and registry.

3. **Bridge listeners/remotes**
   - Copy `ListenerManager` (and supporting transmitter implementations) into the Reactor package.
   - Replace drive-specific terminology with `Remote`, but keep the data flow identical: remote filters still expand into `SynchronizationUnit`s, `_triggerUpdate` still streams operations, and transmitters still call `transmit(strands, source)`.
   - Add an adapter that satisfies the new `ISynchronizationManager` interface by delegating to listener/trigger setup internally.

4. **Hook into Reactor events**
   - Subscribe to `OperationEventTypes.OPERATION_WRITTEN` so push updates fire whenever the queue finishes a job.
   - Surface sync status changes as Reactor events for observability/tooling.
   - Create a small `RemoteJobFactory` that converts incoming strand operations (from pull) into Reactor `load` jobs.

5. **Persist remote definitions**

   - Use the existing document-drive document schema (listeners + triggers) as the source of truth in the short term—e.g., store it under a `reactor-sync` document type so both the legacy and future systems can read it.
   - Build helper methods to load/save remotes so `ISynchronizationManager.add/remove/setFilter` mutate that document and then call into the listener bridge.

6. **Tests / validation**
   - Replay the existing `packages/document-drive/test/sync-manager.test.ts` and `packages/document-drive/test/flaky/synchronization-manager.test.ts` suites against the adapter to guarantee functional parity.
   - Add integration tests that enqueue local mutations, verify `IChannel.outbox` receives strands, and that mocked pull responders enqueue Reactor load jobs.

## Open Questions / Risks

- **Drive identifiers:** Legacy code assumes a `driveId` that groups listeners + triggers. Reactor’s `Remote` objects may not have one-to-one mapping. Short term we can treat `remote.name` as the drive id, but we should confirm nothing else in the listener stack depends on drive relationships (e.g., parent/child documents).
- **Operation filtering:** Legacy `getOperationData` filters by `fromRevision` and `limit`, but not by `branch` when reading from per-document caches (`TODO filter by branch`). When wrapping inside Reactor we should fix this or document the limitation so forks/branches do not corrupt sync state.
- **Event contract:** The legacy `"syncStatus"` emitter only exposes documentId/scope/branch. If Reactor needs richer telemetry (e.g., remote info, channel id), we may extend the payload before we stabilize the adapter interface.
- **Eventually replacing transmitters:** Keeping `SwitchboardPushTransmitter` and `PullResponderTransmitter` unmodified means we still rely on the GraphQL API shape from document-drive. When the new `IChannel` transports are ready we can progressively replace these transmitters without touching the manager.

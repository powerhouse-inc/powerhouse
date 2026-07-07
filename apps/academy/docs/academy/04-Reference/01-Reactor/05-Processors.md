---
toc_max_heading_level: 3
---

# Processors

A **processor** receives operations after the write phase and performs side effects: analytics rollups, relational indexing, webhooks, dispatching follow-up actions. Its `onOperations` method runs **post-ready** — after the reactor emits `JOB_READ_READY` for a chain, when the document is already readable and consistent.

This is the contrast with **read models**. Read models index **pre-ready**: their `indexOperations` runs before `JOB_READ_READY` fires, so they gate read-after-write consistency. A reader holding a [consistency token](/academy/Reference/Reactor/WorkingWithTheReactor) is unblocked only once the pre-ready models finish. Processors are not on that critical path; they observe operations only after readers can already see them. For the full pre-ready/post-ready ordering see [Working with the Reactor](/academy/Reference/Reactor/WorkingWithTheReactor), and for read models see [Advanced Reactor Usage](/academy/Reference/Reactor/AdvancedReactorUsage).

This page is the reactor-side reference: the types you implement, the manager that drives them, and how catch-up works. For the editor-side authoring flow (scaffolding a processor in a package) see the [processor tutorial](/academy/Build/WorkWithData/BuildingAProcessor).

:::warning Not stable yet
Processors run only on the **in-process reactor path**. On the SharedWorker reactor path, processor registration is **not bridged** — Connect logs a warning and skips every factory (`apps/connect/src/store/reactor.ts`). Worker-hosted reactors do not run processors today.
:::

## Registering a processor

Register a factory with the **processor manager**. The manager interface is `IProcessorManager`:

```typescript
import type { IProcessorManager, ProcessorFactory } from "@powerhousedao/reactor";

interface IProcessorManager {
  registerFactory(identifier: string, factory: ProcessorFactory): Promise<void>;
  unregisterFactory(identifier: string): Promise<void>;
  get(processorId: string): TrackedProcessor | undefined;
  getAll(): TrackedProcessor[];
}
```

`identifier` is the registration key and the `factoryId` prefix of every processor the factory produces. Real callers pass the package name. Registering the same `identifier` twice unregisters the prior factory first, so re-registration is idempotent.

The manager is not a method on `IReactor`. It lives on the in-process reactor module as `processorManager`. In Connect you reach it through the browser-path reactor module:

```typescript
const reactorModule =
  reactorClientModule.kind === "browser"
    ? reactorClientModule.reactorModule
    : undefined;

await reactorModule?.processorManager.registerFactory(id, factory);
```

### What the factory receives and returns

A `ProcessorFactory` is called once per drive. It receives the drive header and returns the processors for that drive:

```typescript
import type { PHDocumentHeader } from "document-model";

type ProcessorFactory = (
  driveHeader: PHDocumentHeader,
  processorApp?: ProcessorApp,
) => Promise<ProcessorRecord[]> | ProcessorRecord[];
```

Return `[]` to create no processors for a drive. The factory may be sync or async. The `processorApp?` parameter is part of the type but the manager **never supplies it** — it calls `factory(driveHeader)` with one argument. Read the running app from `module.processorApp` instead (see [the processor host](#the-processor-host)).

If the factory throws, the manager catches it, logs `Factory '<id>' failed for drive '<driveId>'`, and skips that drive. Registration does not crash.

Each element of the returned array is a `ProcessorRecord` — the exact shape the factory must produce:

```typescript
type ProcessorRecord = {
  processor: IProcessor;
  filter: ProcessorFilter;
  startFrom?: "beginning" | "current";
};
```

`processor` and `filter` are required. `startFrom` is covered under [catch-up and ordering](#catch-up-and-ordering).

### The IProcessor interface

```typescript
interface IProcessor {
  onOperations(operations: OperationWithContext[]): Promise<void>;
  onDisconnect(): Promise<void>;
}
```

`onOperations` is called post-ready with the operations that matched this processor's filter, during both live routing and backfill. Each `OperationWithContext` is `{ operation, context }`; `context` carries `documentId`, `documentType`, `scope`, `branch`, the global `ordinal`, and optionally `resultingState`.

`onDisconnect` runs when the factory is unregistered or its drive is deleted. The manager wraps this call: a throw is caught and logged, never propagated.

Most processors subclass `RelationalDbProcessor` rather than implementing `IProcessor` by hand. Its constructor takes `(namespace, filter, relationalDb)`, and you implement `onOperations`, `initAndUpgrade`, and `onDisconnect`. See [Storage and scaling](/academy/Reference/Reactor/StorageAndScaling) for the relational DB surface.

### A complete factory builder

Packages export a `ProcessorFactoryBuilder`, not a bare factory. The builder receives the [host module](#the-processor-host) and returns a `ProcessorFactory`:

```typescript
type ProcessorFactoryBuilder = (
  module: IProcessorHostModule,
) => Promise<ProcessorFactory> | ProcessorFactory;
```

This is the shape codegen emits for a relational processor:

```typescript
import type {
  IProcessorHostModule,
  ProcessorApp,
  ProcessorFactoryBuilder,
  ProcessorFilter,
  ProcessorRecord,
} from "@powerhousedao/reactor-browser";
import type { PHDocumentHeader } from "document-model";
import { TodoIndexer } from "./processor.js";

export const todoIndexerFactoryBuilder: ProcessorFactoryBuilder =
  (module: IProcessorHostModule) =>
  async (driveHeader: PHDocumentHeader, processorApp?: ProcessorApp) => {
    const namespace = TodoIndexer.getNamespace(driveHeader.id);
    const store = await module.relationalDb.createNamespace<TodoIndexer>(namespace);

    const filter: ProcessorFilter = {
      branch: ["main"],
      documentId: ["*"],
      documentType: ["powerhouse/todo"],
      scope: ["global"],
    };

    const processor = new TodoIndexer(namespace, filter, store);
    return [{ processor, filter }];
  };
```

Wiring at startup is two stages: build the host module, call the builder to get a factory, then register it.

```typescript
const factory = await todoIndexerFactoryBuilder(processorHostModule);
await reactorModule.processorManager.registerFactory("@my-org/my-package", factory);
```

Processor types are re-exported from `@powerhousedao/reactor-browser` as types only. `RelationalDbProcessor` is re-exported as a value. `IProcessorManager`, `ProcessorStatus`, `TrackedProcessor`, and the concrete `ProcessorManager` class are exported from `@powerhousedao/reactor`, not from reactor-browser.

## ProcessorFilter

The filter decides which operations reach a processor:

```typescript
type ProcessorFilter = {
  documentType?: string[];
  scope?: string[];
  branch?: string[];
  documentId?: string[];
};
```

Every field is an optional array. Matching is per field: a field that is `undefined` or `[]` matches everything; a field with values matches an operation whose corresponding context value is in the array. All present fields must match.

```typescript
// Global-scope operations on any todo document, main branch only.
const filter: ProcessorFilter = {
  documentType: ["powerhouse/todo"],
  scope: ["global"],
  branch: ["main"],
  documentId: ["*"],
};
```

The `"*"` wildcard is honored **only in `documentId`**. There it means "any document". In `documentType`, `scope`, and `branch` there is no wildcard special-case: a literal `"*"` matches only an operation whose value is the string `"*"`. To match all scopes, omit `scope` or set it to `[]` — do not write `scope: ["*"]`.

:::warning Latent inconsistency
The codegen analytics template emits `scope: ["*"]`. Under the matcher this matches a scope literally named `"*"`, which matches nothing real. Set `scope` to the concrete scopes you want, or omit it.
:::

`startFrom` on the `ProcessorRecord` controls the catch-up starting point, not which operations match — see [catch-up and ordering](#catch-up-and-ordering).

## The processor host

The host module is the context a processor gets through its factory builder. The base interface is `IProcessorHostModule`:

```typescript
interface IProcessorHostModule {
  analyticsStore: IAnalyticsStore;
  relationalDb: IRelationalDb;
  processorApp: ProcessorApp;
  dispatch: IProcessorDispatch;
  getReadModel<T>(name: string): T;
  config?: Map<string, unknown>;
}
```

- **`analyticsStore`** — the analytics store for time-series rollups.
- **`relationalDb`** — an `IRelationalDb` (a Kysely instance plus `createNamespace` / `queryNamespace`) for relational indexing. See [Storage and scaling](/academy/Reference/Reactor/StorageAndScaling).
- **`processorApp`** — `"connect" | "switchboard"`. How a processor learns which app hosts it. Read this rather than the factory's `processorApp?` argument.
- **`dispatch`** — writes back to the reactor via `dispatch.execute(docId, branch, actions, signal?, meta?)`, returning `{ id, status }`. In Connect this is wired to the reactor client's async execute.
- **`getReadModel<T>(name)`** — looks up a registered read model by its `name`. Connect's implementation throws `Read model "<name>" not found` when there is no match.
- **`config?`** — optional `Map<string, unknown>` of host config.

Connect builds an extended module, `IReactorProcessorHostModule`, which adds `client: IReactorClient` and `attachments: IAttachmentClient`. It is defined in reactor-browser to avoid a circular package dependency, and sets `processorApp: "connect"`. See [IReactorClient](/academy/Reference/Reactor/ReactorClient) and the [Attachment service](/academy/Reference/Reactor/AttachmentService).

`IProcessorDispatch` and `ProcessorDispatchResult` are defined in shared but are not part of the public reactor export surface; treat the `dispatch` handle on the module as the supported entry point.

## Catch-up and ordering

Each processor has a **cursor** that records the highest operation `ordinal` it has handled. The manager tracks this per processor as `TrackedProcessor`:

```typescript
type TrackedProcessor = {
  processorId: string;       // `${factoryId}:${driveId}:${index}`
  factoryId: string;
  driveId: string;
  processorIndex: number;
  record: ProcessorRecord;
  lastOrdinal: number;
  status: ProcessorStatus;   // "active" | "errored"
  lastError: string | undefined;
  lastErrorTimestamp: Date | undefined;
  retry: () => Promise<void>;
};
```

**Ordering.** Operations arrive sorted by global ordinal. On each batch the manager filters to operations with `ordinal > lastOrdinal`, applies the filter, and calls `onOperations` on the matches. On success it advances `lastOrdinal` to the maximum ordinal in the batch (including unmatched operations), so the cursor moves forward even when nothing matched.

**`startFrom`.** When a processor is first created and no cursor row exists yet:

- `"beginning"` (the default) starts the cursor at ordinal 0, so the processor backfills the drive's full history.
- `"current"` starts the cursor at the manager's current ordinal, so the processor sees only operations from now on.

`startFrom` applies **only on first creation**. Once a cursor row exists, it is ignored — the persisted cursor wins. Restarting the reactor never re-runs `startFrom`.

**Backfill and replay.** When a processor's `lastOrdinal` is behind the manager, the manager pages through history with `operationIndex.getSinceOrdinal(lastOrdinal)`, filters each page, calls `onOperations`, advances the cursor to the page's max ordinal, persists it, and follows the continuation until exhausted. This runs when a factory registers against a drive that already has history, and after a restart to replay anything missed while the reactor was down.

**Persistence.** Cursors are stored in the `ProcessorCursor` table, keyed by `processorId`, and survive restarts. On startup the manager rehydrates every cursor, then catch-up replays the gap.

**Failure isolation.** Processors run in parallel, each in its own try/catch. If `onOperations` throws, that processor goes to `status: "errored"`, its `lastError` and `lastErrorTimestamp` are recorded, and its cursor stops advancing. Other processors are unaffected. There is no automatic retry: an errored processor stays errored and is skipped on later batches until you call `tracked.retry()` (which re-activates it and re-runs backfill) or re-register its factory. See [Error handling](/academy/Reference/Reactor/ErrorHandling).

To inspect state, use the manager: `get(processorId)` for one processor or `getAll()` for every tracked processor across all drives.

For how processors relate to sync and remote drives, see [Synchronization](/academy/Reference/Reactor/Synchronization). For the document types a filter can target, see the [Document model registry](/academy/Reference/Reactor/DocumentModelRegistry).

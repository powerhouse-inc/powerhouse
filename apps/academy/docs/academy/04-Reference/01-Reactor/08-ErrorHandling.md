---
toc_max_heading_level: 3
---

# Error handling

Errors reach your code from the reactor through three channels:

- **Mutations throw a plain `Error`.** When a job fails, [`IReactorClient`](/academy/Reference/Reactor/ReactorClient) methods like `execute`, `create`, and `deleteDocument` reject with `new Error(job.error?.message)`. The typed error class, stack, and retry history are not preserved at this boundary.
- **Aborts throw an `AbortError`.** Any call that takes an `AbortSignal` rejects with an error whose `name` is `"AbortError"` when the signal fires.
- **Subsystems export typed errors.** The registry, sync, and attachment layers throw named error classes you can discriminate with `instanceof` or a `name` check.

This page is the consolidated error reference for the reactor. For attachment errors see [Attachment service](/academy/Reference/Reactor/AttachmentService); for sync-channel behavior see [Synchronization](/academy/Reference/Reactor/Synchronization).

:::info[Import paths]
Importable error values come from `@powerhousedao/reactor`: `EventBusAggregateError`, `ModuleNotFoundError`, `DuplicateModuleError`, `InvalidModuleError`, `DuplicateManifestError`, `ChannelError`, `ChannelErrorSource`, `SyncOperationAggregateError`, `PollingChannelError`, `isDriveAuthError`, and `DRIVE_AUTH_ERROR_MESSAGES`. `@powerhousedao/reactor-browser` re-exports only `isDriveAuthError`. Attachment errors come from `@powerhousedao/reactor-attachments`. Several errors are internal and cannot be imported; this page marks each one.
:::

## Job failures

A job moves through `PENDING -> RUNNING -> WRITE_READY -> READ_READY`, or transitions to `FAILED`. Only `READ_READY` and `FAILED` are terminal. The failing error rides on the job's `JobInfo`.

### `JobInfo.error` and `errorHistory`

```typescript
import type { JobInfo, JobStatus } from "@powerhousedao/reactor";

type ErrorInfo = {
  message: string;
  stack: string;
};

type JobInfo = {
  id: string;
  documentId: string; // empty string when the job is unknown
  status: JobStatus;
  createdAtUtcIso: string;
  completedAtUtcIso?: string;
  error?: ErrorInfo; // the failing error
  errorHistory?: ErrorInfo[]; // one entry per attempt, ordered
  result?: any;
  consistencyToken: ConsistencyToken;
  meta: JobMeta;
  job?: Job; // full job object, populated on failure for debugging
};
```

`JobInfo` and `JobStatus` are exported from `@powerhousedao/reactor`. The `ErrorInfo` shape above is not exported under that name. The barrel re-exports a different `ErrorInfo` (the worker protocol's) aliased as `WorkerErrorInfo`. Treat the `{ message, stack }` on `JobInfo.error` as a structural type you match against, not one you import.

`errorHistory` holds one `ErrorInfo` per attempt, oldest first. A job that the queue retried carries every failure; `error` is the most recent. On failure the reactor also populates `job` with the full job object for debugging.

### What `execute()` and `executeBatch()` throw

The [`IReactorClient`](/academy/Reference/Reactor/ReactorClient) mutation methods do not surface the typed error. On a `FAILED` job they throw a bare `Error` carrying only the message string:

```typescript
// inside ReactorClient, after the job reaches a terminal status
if (job.status === JobStatus.FAILED) {
  throw new Error(job.error?.message);
}
```

The same pattern runs in `execute`, `executeBatch`, `create`, `deleteDocument`, `deleteDocuments`, `addRelationship`, and `removeRelationship`. Two consequences:

- The thrown `Error.message` equals `job.error?.message`, which can be `undefined` if `error` was never set. Guard for that when you display it.
- The original error class, stack, and `errorHistory` are lost at the client boundary. To inspect them, drop to the lower-level `IReactor.getJobStatus(jobId)` and read `JobInfo.error`, `JobInfo.errorHistory`, and `JobInfo.job`. See [Advanced Reactor Usage](/academy/Reference/Reactor/AdvancedReactorUsage).

```typescript
try {
  await client.execute(documentId, "main", actions);
} catch (err) {
  // err is a plain Error; err.message came from job.error?.message
  console.error("mutation failed:", err instanceof Error ? err.message : err);
}
```

Several internal write-path errors surface only as the `.message` string here and lose their typed identity at this edge: `DocumentDeletedError`, `DocumentNotFoundError`, `CreateDocumentRequiredError`, `InvalidSignatureError`, and `UpgradeManifestNotFoundError`. None are exported. Match on `err.message` if you need to branch on them, and expect that to be brittle.

## Cancellation

Every `IReactor` method that accepts an `AbortSignal` rejects when the signal is already aborted or aborts mid-flight. The reactor throws `AbortError`:

```typescript
export class AbortError extends Error {
  constructor(message?: string) {
    super(message || "Aborted");
    this.name = "AbortError";
  }
}

export const isAbortError = (error: unknown): boolean => {
  return error instanceof AbortError;
};
```

`AbortError` and `isAbortError` live in `core/types.ts` but are **not exported** from the package barrel. You cannot import either one. Because the class is unreachable, `isAbortError` (and any `instanceof AbortError` you write against the imported class) is not available to you. Match on the `name` instead, which the DOM `AbortController` also uses:

```typescript
const controller = new AbortController();

try {
  const doc = await client.get(documentId, undefined, controller.signal);
} catch (err) {
  if (err instanceof Error && err.name === "AbortError") {
    // the read was cancelled
    return;
  }
  throw err;
}
```

`isAbortError` relies on `instanceof`, so even where it is reachable it does not survive a worker or realm boundary. The `name` check survives both and is the reliable test. Note also that `ReactorClient.deleteDocument` throws a plain `new Error("Operation aborted")` (not `AbortError`) when its signal fires during cascade traversal, so prefer `name`-agnostic handling around that call.

## Event bus

`IEventBus.emit()` runs subscribers sequentially with `await` over a snapshot, collects any thrown errors, and rejects with one aggregate at the end.

```typescript
import { EventBusAggregateError } from "@powerhousedao/reactor";

export class EventBusAggregateError extends Error {
  public readonly errors: any[];
  // message: "EventBus emit failed with N error(s): <m1>; <m2>; ..."
}
```

`EventBusAggregateError.errors` holds the individual subscriber errors. Discriminate it, then iterate:

```typescript
try {
  await eventBus.emit(eventType, payload);
} catch (err) {
  if (err instanceof EventBusAggregateError) {
    for (const subscriberError of err.errors) {
      console.error(subscriberError);
    }
  }
}
```

`EventBusAggregateError` is exported from `@powerhousedao/reactor`. It is not re-exported from `@powerhousedao/reactor-browser`.

## Subsystem errors

Each subsystem defines its own error classes. Classes with a `static isError` helper are name-based and safe across worker and realm boundaries; the rest must be matched with `instanceof` or a manual `err.name` check.

### Registry and manifest errors

Thrown when registering, resolving, or upgrading document model modules. Four are importable from `@powerhousedao/reactor`; the rest are internal.

| Error | Thrown when | `static isError`? | Importable |
| --- | --- | --- | --- |
| `ModuleNotFoundError` | `getModule` / resolve finds no module for a type (and optional version) | Yes | `@powerhousedao/reactor` |
| `DuplicateModuleError` | registering a module that already exists | Yes | `@powerhousedao/reactor` |
| `InvalidModuleError` | a module is malformed | No | `@powerhousedao/reactor` |
| `DuplicateManifestError` | re-registering an upgrade manifest | Yes | `@powerhousedao/reactor` |
| `ManifestNotFoundError` | upgrade manifest lookup misses | No | internal |
| `MissingUpgradeTransitionError` | a gap in the upgrade chain | No | internal |
| `InvalidUpgradeStepError` | `getUpgradeReducer` called with a non-single-step increment | No | internal |
| `DowngradeNotSupportedError` | a downgrade is requested | (external) | internal |

`ModuleNotFoundError` carries `documentType: string` and `requestedVersion: number | undefined`:

```typescript
import { ModuleNotFoundError } from "@powerhousedao/reactor";

try {
  // ...register or resolve a document model module
} catch (err) {
  if (ModuleNotFoundError.isError(err)) {
    console.error(`no module for ${err.documentType}`, err.requestedVersion);
  }
}
```

`static isError` is the ES2024 pattern `Error.isError(err) && err.name === "<Name>"`. Use it for the four classes that have it. For `InvalidModuleError` and the internal upgrade errors, match on `err.name`. The four internal errors are reachable only from `@powerhousedao/reactor/.../src/registry/index.js`, not the package root; treat them as internal. See [Document model registry](/academy/Reference/Reactor/DocumentModelRegistry).

### Sync channel errors

Thrown by the sync manager and channels. See [Synchronization](/academy/Reference/Reactor/Synchronization) for how these land on `SyncOperation.error` and dead-letter events.

```typescript
import { ChannelError, ChannelErrorSource } from "@powerhousedao/reactor";

enum ChannelErrorSource {
  None = "none",
  Channel = "channel",
  Inbox = "inbox",
  Outbox = "outbox",
}

class ChannelError extends Error {
  source: ChannelErrorSource;
  error: Error; // the wrapped underlying error
  // message: "ChannelError[<source>]: <inner message>"
}
```

`ChannelError` wraps an underlying `Error` and tags it with a `source`. Discriminate with `instanceof`, then read `source` and `error`:

```typescript
if (err instanceof ChannelError) {
  console.error(`sync ${err.source} failed:`, err.error.message);
}
```

`SyncOperationAggregateError` collects the per-callback errors when a sync operation's status callbacks throw. Its `errors: Error[]` field holds them:

```typescript
import { SyncOperationAggregateError } from "@powerhousedao/reactor";

class SyncOperationAggregateError extends Error {
  errors: Error[];
  // message: "SyncOperation callback failed with N error(s): ..."
}
```

`ChannelError`, `ChannelErrorSource`, and `SyncOperationAggregateError` are all exported from `@powerhousedao/reactor`.

`PollingChannelError` is exported from `@powerhousedao/reactor` but is never thrown anywhere in source. Treat it as dormant; do not write `catch` logic against it.

#### Drive auth: `isDriveAuthError`

Use `isDriveAuthError` to detect that a remote rejected the caller as unauthenticated or unauthorized. It returns `true` for an HTTP 401/403 or a Forbidden/Unauthorized GraphQL response, and `false` for everything else.

```typescript
import { isDriveAuthError } from "@powerhousedao/reactor";
// also re-exported from "@powerhousedao/reactor-browser"

try {
  await reactor.addRemoteDrive(url, options);
} catch (err) {
  if (isDriveAuthError(err)) {
    // prompt the user to sign in / re-authenticate
  }
}
```

`isDriveAuthError` is gated on the internal `GraphQLRequestError` class: it returns `false` for any error that isn't an instance of it. You cannot import or construct `GraphQLRequestError`, so the helper is only meaningful on errors that originated inside the reactor's GraphQL channel and propagated out unchanged. Inside the reactor it drives `ConnectionStateSnapshot.requiresAuth`. The exported message constant `DRIVE_AUTH_ERROR_MESSAGES` (`{ forbidden, authenticationRequired }`) is shared with `reactor-api` so server throw strings and the client check stay in sync.

### Attachment errors

`@powerhousedao/reactor-attachments` exports eight error classes: `AttachmentNotFound`, `ReservationNotFound`, `InvalidAttachmentRef`, `UploadTooLarge` (maps to HTTP 413), `AttachmentAlreadyExists`, `HashMismatch`, `SizeMismatch`, and `AttachmentPending`. None have a `static isError`; discriminate with `instanceof` or `err.name`.

`AttachmentPending` is deliberately not a subclass of `AttachmentNotFound`, so callers can distinguish "retry later" from "unknown attachment". For the full table of fields and when each is thrown, see [Attachment service](/academy/Reference/Reactor/AttachmentService).

## Detecting errors

| Mechanism | Applies to | Cross-boundary safe |
| --- | --- | --- |
| `err.name === "AbortError"` | aborted reactor calls (DOM-compatible name) | Yes |
| `X.isError(err)` (static) | `ModuleNotFoundError`, `DuplicateModuleError`, `DuplicateManifestError` | Yes (name-based) |
| `err instanceof X` | `EventBusAggregateError`, `ChannelError`, `SyncOperationAggregateError`, attachment errors | No |
| `err.name === "X"` | any class above (all set `this.name`) | Yes |
| `isDriveAuthError(err)` | un-rewrapped GraphQL-channel errors only | only in-channel |

Prefer a `name` check over `instanceof` when the error may cross a worker or realm boundary, since `instanceof` fails when the class identity differs between contexts. Every reactor error sets `this.name`, so the `name` check is always available.

For building on these APIs, see [Working with the Reactor](/academy/Reference/Reactor/WorkingWithTheReactor), [IReactorClient](/academy/Reference/Reactor/ReactorClient), and [Processors](/academy/Reference/Reactor/Processors).

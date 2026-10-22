---
toc_max_heading_level: 3
---

# Undo and redo

How a document stores an undo depends on its base-reducer version, `header.protocolVersions["base-reducer"]`. The version is fixed by `CREATE_DOCUMENT` and is part of the derived document id, so a document never changes version.

| Version | `UNDO` is stored as                                   | `REDO`                                                                          |
| ------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1, 2    | a `NOOP` whose `skip` removes the operation before it | replays the undone action from the document's clipboard; version 2 refuses it once the stream holds an undo |
| 3       | refused; undo is a `RETRACT { target }` the author signs, naming the undone action by id | refused; redo is a `RETRACT` of the retraction                       |

On version 3 a retraction names its target, so where it lands in the stream does not change what it undoes. Replicas that hold the same operations derive the same state, whatever order the operations arrived in.

:::info[Feature flag]
Base-reducer 3 needs the `undoV3` reactor flag, which defaults to on. A reactor with it off refuses to create a version 3 document and never receives one from a peer.

A reactor with it on still refuses a version 3 document whose model it cannot run as version 3: the model's reducer is not built by `createReducer`, or the model cannot be loaded. The refusal is an `UnsupportedProtocolVersionError`, on writes, on reads, and on receipt from a peer before any load.

A reactor that stores version 3 documents of a model it cannot run refuses to start and names the types, as one without `undoV3` does; `withUnsupportedStoredDocuments("read-only")` starts it with those documents read-only. A model loaded after start is checked when it loads, and a refusal is logged and emitted as `STORED_MODEL_REFUSED`.
:::

## Turning it off

| Host        | Setting                                                                   |
| ----------- | ------------------------------------------------------------------------- |
| Switchboard | `REACTOR_UNDO_V3=false`                                                   |
| Connect     | `connect.reactor.featureFlags.undoV3: false` in `powerhouse.config.json`  |
| Library     | `ReactorBuilder.withExecutorConfig({ featureFlags: { undoV3: false } })` |
| ph-cli host  | `reactor.protocol.featureFlags.undoV3: false` in the host file (projected to `REACTOR_UNDO_V3`) |

`undoV3` has no prerequisites. A peer that runs without it is held from version 3 documents until it upgrades.

## Which version a document takes

A document's version is fixed when it is created, and its creator chooses it. A client chooses in one place, `IReactorClient.newDocument`, which heads an uncreated document with the versions `getCreateProtocolVersions` selects: version 3 when `undoV3` is on and the model's reducer is built by `createReducer`, otherwise version 2. `createEmpty` is `newDocument` then `create`, and `create` takes the header as given. The members of the parent drive do not narrow the base-reducer version: a peer that cannot run it is held from the document until it upgrades. A reactor that does not run the chosen version refuses the document. A call can name a version:

```typescript
const document = await client.newDocument("powerhouse/todo-list", {
  parentIdentifier: driveId,
  protocolVersions: { "base-reducer": 2 },
});
await client.drives.addFile(driveId, document);
```

A document headed outside a client, such as one from a model's `utils.createDocument()`, takes version 2, and keeps it when it is created or added to a drive. `IReactor.create` refuses a header without protocol versions.

The GraphQL light client takes the Switchboard's `createDefaults` answer for the document's type and parent as given, so a remote document's version follows the Switchboard's `undoV3`. It caps the answer at the versions its own build runs, so a newer Switchboard's base-reducer 4 becomes 3, and refuses a malformed answer or a version of another known protocol it does not run. It then fits base-reducer down to what its own `documentModels` can run. A Switchboard from before per-type selection answers for every type; against one without the query the client picks version 2, but cannot create there: it also reads the signature policy from that query.

An existing document keeps its version. To move one to version 3, copy it through `IDriveClient.copyNode` with the version to take:

```typescript
await client.drives.copyNode(driveId, nodeId, targetFolderId, undefined, {
  protocolVersions: { "base-reducer": 3 },
});
```

The copy starts from the source's current state, so the source's history cannot be undone in it. A copy without `protocolVersions` keeps its source's version. `ReactorDriveClient` replays the source's history into the copy and refuses `protocolVersions`.

## Undoing from a client

Call [`undo`, `redo` and `undoRedoAvailability`](/academy/Reference/Reactor/ReactorClient#undo) on `IReactorClient`. They work on every version.

On version 3 the client resolves the target with `undoRedoTargets` and submits a `RETRACT` of it signed by the client's own signer. On versions 1 and 2 it submits `UNDO` or `REDO`. The GraphQL light client does the same, resolving the target through the Switchboard's `undoRedoTargets` query; see [the light client's methods](/academy/Reference/ReactorBrowserClient/ApiReference#methods). Either way the author signs, so a policy must grant the author `RETRACT` for undo on version 3.

The `RETRACT` names the row the call saw as the latest, so an edit that lands in between is not undone. If the target is retracted or gone by the time the `RETRACT` runs, the write fails with `RetractionRefusedError`; the client does not resolve again or retry.

To retract a specific action, submit `retract` yourself. It is exported from `document-model` and `@powerhousedao/shared/document-model`:

```typescript
import { retract } from "document-model";

await client.execute(documentId, "main", [retract(actionId, "global")]);
```

A submitted `UNDO` or `REDO` on version 3 fails with `SubmittedUndoRefusedError`. The model's reducer refuses one the same way, so `reducer(document, undo())` on a version 3 document throws `SubmittedUndoRefusedError` rather than retracting anything. On versions 1 and 2 the reactor still resolves one and signs the `NOOP` it stores with its own signer.

## Rules on version 3

- An action is live if no live `RETRACT` names it. Liveness depends on which operations are present, not on their order.
- Undo targets the last applied content operation in the scope, by any author.
- Redo targets the last live retraction of content. Content applied after the undo leaves nothing to redo.
- `SET_NAME` and `SET_PREFERRED_EDITOR` cannot be undone. Undo passes over them, and a `RETRACT` naming one is stored but retracts nothing.
- A denied `RETRACT` retracts nothing.
- An operation that throws applies nothing. Undo passes over it.
- `skip` is only the rewind a reshuffle writes. It never undoes anything.
- Operations with the same timestamp are ordered by action id. Action ids made in one process sort in creation order, so one client's same-millisecond actions keep their order. The guarantee is per process: actions made in different processes, such as two workflow piece workers or a Connect tab and its shared worker, are ordered by id with no guarantee of creation order.
- A job's actions run in this order, not in array order. The reactor sorts every job on a version 3 document the same way its peers sort what they receive.

On execute, a `RETRACT` whose target is not in the scope's stream, or is already retracted, is refused. On sync it is admitted: a `RETRACT` that arrives before its target does nothing until the target arrives.

The rules do not run in the `auth` and `document` scopes, or in version 1 and 2 documents. A `RETRACT` submitted there is refused; one received from a peer is stored and does nothing.

## Errors

| Error                    | Fields                           | Thrown when                                                                 |
| ------------------------ | -------------------------------- | --------------------------------------------------------------------------- |
| `RetractionRefusedError` | `documentId`, `target`, `reason` | A submitted `RETRACT` names an absent target (`"target-missing"`) or one already retracted (`"target-retracted"`) |
| `ReservedActionError`    | `documentId`, `actionType`       | A write carries an action type the client may not submit, such as a `RETRACT` to a version 1 or 2 document or to the `auth` or `document` scope |
| `SubmittedUndoRefusedError` | `documentId`, `actionType`    | A write, or a peer's load, carries `UNDO` or `REDO` to a version 3 document |

All three are exported from `@powerhousedao/reactor` and are terminal: the job fails without a retry. Through `IReactorClient` they reach you as a plain `Error` carrying the message; see [Error handling](/academy/Reference/Reactor/ErrorHandling).

`undo` and `redo` on version 3 throw `Cannot undo: nothing to undo in scope history` (or `redo`) before submitting anything when there is no target.

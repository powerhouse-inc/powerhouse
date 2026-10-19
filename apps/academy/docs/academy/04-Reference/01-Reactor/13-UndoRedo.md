---
toc_max_heading_level: 3
---

# Undo and redo

How a document stores an undo depends on its base-reducer version, `header.protocolVersions["base-reducer"]`. The version is fixed by `CREATE_DOCUMENT` and is part of the derived document id, so a document never changes version.

| Version | `UNDO` is stored as                                   | `REDO`                                                                          |
| ------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1, 2    | a `NOOP` whose `skip` removes the operation before it | replays the undone action from the document's clipboard; version 2 refuses it once the stream holds an undo |
| 3       | `RETRACT { target }`, naming the undone action by id  | a `RETRACT` of the retraction                                                   |

On version 3 a retraction names its target, so where it lands in the stream does not change what it undoes. Replicas that hold the same operations derive the same state, whatever order the operations arrived in.

:::info[Feature flag]
Base-reducer 3 needs the `undoV3` reactor flag, which defaults to on. A reactor with it off refuses to create a version 3 document and never receives one from a peer.
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

A document's version is fixed when it is created. A create through a reactor with `undoV3` on takes version 3, and with it off version 2, unless the call names a version:

```typescript
const document = await client.createEmpty("powerhouse/todo-list", {
  protocolVersions: { "base-reducer": 2 },
});
```

A document headed outside a reactor, such as one from a model's `utils.createDocument()`, takes version 2, and keeps it when it is added to a drive.

An existing document keeps its version. To move one to version 3, copy it through `IDriveClient.copyNode` with the version to take:

```typescript
await client.drives.copyNode(driveId, nodeId, targetFolderId, undefined, {
  protocolVersions: { "base-reducer": 3 },
});
```

The copy starts from the source's current state, so the source's history cannot be undone in it. A copy without `protocolVersions` keeps its source's version. `ReactorDriveClient` replays the source's history into the copy and refuses `protocolVersions`.

## Undoing from a client

Call [`undo`, `redo` and `undoRedoAvailability`](/academy/Reference/Reactor/ReactorClient#undo) on `IReactorClient`. They work on every version.

On version 3 the client asks the reactor for the target, through `IReactor.resolveUndoRedo`, and submits a `RETRACT` signed by the client's signer. On versions 1 and 2 it submits `UNDO` or `REDO`.

The GraphQL light client always submits `UNDO` or `REDO`, so on version 3 the Switchboard signs the `RETRACT`; see [the light client's methods](/academy/Reference/ReactorBrowserClient/ApiReference#methods).

To retract a specific action, submit `retract` yourself. It is exported from `document-model` and `@powerhousedao/shared/document-model`:

```typescript
import { retract } from "document-model";

await client.execute(documentId, "main", [retract(actionId, "global")]);
```

A submitted `UNDO` or `REDO` still works on version 3. The reactor resolves it to a `RETRACT` and signs that with its own signer, as it signs the `NOOP` on versions 1 and 2. Both take a `count` of 1 on version 3.

## Rules on version 3

- An action is live if no live `RETRACT` names it. Liveness depends on which operations are present, not on their order.
- `UNDO` retracts the last applied content operation in the scope, by any author.
- `REDO` retracts the last live retraction of content. Content applied after the undo leaves nothing to redo.
- `SET_NAME` and `SET_PREFERRED_EDITOR` cannot be undone. `UNDO` passes over them, and a `RETRACT` naming one is stored but retracts nothing.
- A denied `RETRACT` retracts nothing.
- An operation that throws applies nothing. `UNDO` passes over it.
- `skip` is only the rewind a reshuffle writes. It never undoes anything.
- Operations with the same timestamp are ordered by action id. Action ids made in one process sort in creation order, so one client's same-millisecond actions keep their order. A `RETRACT` the reactor makes from an `UNDO` or `REDO` sorts where the submitted action would.

On execute, a `RETRACT` whose target is not in the scope's stream, or is already retracted, is refused. On sync it is admitted: a `RETRACT` that arrives before its target does nothing until the target arrives.

The rules do not run in the `auth` and `document` scopes, or in version 1 and 2 documents. A `RETRACT` submitted there is refused; one received from a peer is stored and does nothing.

## Errors

| Error                    | Fields                           | Thrown when                                                                 |
| ------------------------ | -------------------------------- | --------------------------------------------------------------------------- |
| `RetractionRefusedError` | `documentId`, `target`, `reason` | A submitted `RETRACT` names an absent target (`"target-missing"`) or one already retracted (`"target-retracted"`) |
| `ReservedActionError`    | `documentId`, `actionType`       | A write carries an action type the client may not submit, such as a `RETRACT` to a version 1 or 2 document or to the `auth` or `document` scope |

Both are exported from `@powerhousedao/reactor` and are terminal: the job fails without a retry. Through `IReactorClient` they reach you as a plain `Error` carrying the message; see [Error handling](/academy/Reference/Reactor/ErrorHandling).

`undo` and `redo` on version 3 throw `Cannot undo: nothing to undo in scope history` (or `redo`) before submitting anything when there is no target.

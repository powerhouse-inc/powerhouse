# reactor-drive

A processor-and-subgraph reimplementation of the `document-drive` document
model on top of the reactor. The drive document itself becomes a metadata-only
container. Everything that currently lives in `state.global.nodes[]` (file
nodes, folder nodes) is materialised into indexed Kysely tables by processors
and exposed back to callers through a paged GraphQL subgraph and a typed
read-model interface.

The drive-specific node actions (`ADD_FILE`, `ADD_FOLDER`, `DELETE_NODE`,
`UPDATE_FILE`, `UPDATE_NODE`, `COPY_NODE`, `MOVE_NODE`) are replaced by
the reactor's generic relationship actions (`ADD_RELATIONSHIP`,
`REMOVE_RELATIONSHIP`, plus a new `UPDATE_RELATIONSHIP`). Clients compose
the existing `CREATE_DOCUMENT` / `DELETE_DOCUMENT` actions with relationship
actions to model the same operations. The drive's own actions
(`SET_DRIVE_NAME`, `SET_DRIVE_ICON`, `SET_SHARING_TYPE`,
`SET_AVAILABLE_OFFLINE`) keep their existing shape.

## Why

`document-drive` keeps the entire child catalogue inside
`state.global.nodes[]`. Every `ADD_FILE` mutates that array; replay walks
every previously-added child; reads materialise the full state. With 10k+
children the drive is the hot spot:

- replay cost scales linearly with child count,
- snapshots in `DocumentSnapshot` get huge,
- `getDocument(driveId)` returns megabytes of JSON,
- listing children client-side requires fetching the whole array.

The recipe at `recipes/drive-override` proves the alternative: keep the
container's state O(1), and let the reactor's existing
`DocumentRelationship` index (populated by `ADD_RELATIONSHIP`) carry the
parent/child graph. That recipe stops at the bare bones — only
`SET_METADATA`, no folders, no rename collision. `reactor-drive` fills in
the rest while staying on the same scaling curve.

Once the graph is expressed as relationships, the drive-specific node
actions are redundant: anything `ADD_FILE` does can be done by
`CREATE_DOCUMENT` + `UPGRADE_DOCUMENT` + `ADD_RELATIONSHIP`, anything
`MOVE_NODE` does is `REMOVE_RELATIONSHIP` + `ADD_RELATIONSHIP`, and so
on. So instead of
maintaining two parallel vocabularies, we drop the drive-specific node
actions entirely and rely on the generic ones. The drive becomes
metadata-only and the graph becomes a first-class reactor concept.

## High-level architecture

```
+----------------------------------------+
| client composes:                       |
|   CREATE_DOCUMENT(childDoc) +          |
|   UPGRADE_DOCUMENT(childDoc) +         |
|   ADD_RELATIONSHIP(drive -> child,     |
|                    "drive/child")   |
+--------------------+-------------------+
                     | reactor.execute(...)
                     v
+----------------------------------------+
| Reactor executor                       |
|  - applies CREATE_DOCUMENT             |
|  - applies UPGRADE_DOCUMENT            |
|  - applies relationship action via     |
|    DocumentActionHandler               |
+--------------------+-------------------+
                     | Operations written, JOB_WRITE_READY
                     v
+----------------------------------------+
| ReadModelCoordinator                   |
+-------+------------------+-------------+
        |                  |
        v                  v
+---------------+   +-------------------+
| KyselyDocument|   | reactor-drive     |
| Indexer       |   | Processors        |
| (existing,    |   |  - NodeProcessor  |
|  generic)     |   +---------+---------+
+---------------+             |
                              v
                    +-------------------+
                    | reactor-drive     |
                    | tables            |
                    |  DriveNode        |
                    +---------+---------+
                              ^
                              |
+----------------------------------------+
| reactor-drive Subgraph (GraphQL)       |
|  drive(id), rootNodes, children,       |
|  descendants, ...                      |
+----------------------------------------+
```

Three pieces fit together:

1. **A small `DocumentModelModule`** for the drive document itself. State
   carries only `name`, `icon`, `sharingType`, `availableOffline`. Reducer
   handles only the drive's `SET_*` actions. No nodes, no relationships
   in state. The module is produced by the standard Powerhouse codegen
   pipeline (see "Document model definition" below).
2. **A `NodeProcessor`** that consumes both relationship operations
   (`ADD_RELATIONSHIP`, `REMOVE_RELATIONSHIP`, `UPDATE_RELATIONSHIP`,
   `REMOVE_RELATIONSHIP_SUBTREE`) of the `"drive/child"` type **and**
   name-setting operations on any document that owns a row in
   `DriveNode` (so renaming a file is a single `SET_NAME` on the file
   document, not a write against the drive). It projects everything
   into a drive-specific `DriveNode` table with the columns drive UIs
   need (kind, name, parentFolder, documentType, plus computed
   collision-resolved name).
3. **A subgraph** that exposes the projected tables with paging, joins,
   and consistency-token support — the read path that replaces
   `state.global.nodes`.

## Document model definition

The drive `DocumentModelModule` is not hand-written — it is produced
by Powerhouse's standard codegen pipeline (`ph-cli generate`),
following the same convention as every other model under
`packages/vetra/document-models/*`. The source of truth is a JSON
manifest plus a GraphQL schema; the codegen produces a `gen/`
directory of typed actions, creators, the reducer dispatcher, and
the document-model module wiring. The hand-written piece is the
reducer body for each operation, under `src/reducers/`.

### Manifest (`document-models/reactor-drive/reactor-drive.json`)

```json
{
  "id": "powerhouse/reactor-drive",
  "name": "Reactor Drive",
  "extension": ".phd",
  "specifications": [
    {
      "version": 1,
      "changeLog": [],
      "state": {
        "global": {
          "schema": "type ReactorDriveState { name: String! icon: String }",
          "initialValue": "{ \"name\": \"\", \"icon\": null }"
        },
        "local": {
          "schema": "type ReactorDriveLocalState { sharingType: String! availableOffline: Boolean! }",
          "initialValue": "{ \"sharingType\": \"PRIVATE\", \"availableOffline\": false }"
        }
      },
      "modules": [
        {
          "name": "base_operations",
          "operations": [
            {
              "name": "SET_DRIVE_NAME",
              "schema": "input SetDriveNameInput { name: String! }",
              "scope": "global"
            },
            {
              "name": "SET_DRIVE_ICON",
              "schema": "input SetDriveIconInput { icon: String }",
              "scope": "global"
            },
            {
              "name": "SET_SHARING_TYPE",
              "schema": "input SetSharingTypeInput { sharingType: String! }",
              "scope": "local"
            },
            {
              "name": "SET_AVAILABLE_OFFLINE",
              "schema": "input SetAvailableOfflineInput { availableOffline: Boolean! }",
              "scope": "local"
            }
          ]
        }
      ]
    }
  ]
}
```

The manifest is intentionally minimal: no node operations, no
relationship operations. The four drive-only `SET_*` actions are the
entire mutable surface of the document itself. All structural
operations (add/remove/rename file or folder) are reactor system
actions on relationships, not actions on this document model.

### Schema (`document-models/reactor-drive/schema.graphql`)

The flat `schema.graphql` is kept in sync with the manifest and is
what most tooling reads. Same content as above, hoisted into a single
GraphQL file with the standard Powerhouse scalar imports
(`scalar Unknown`, `scalar PHID`, etc.) at the top. Codegen reads
either the manifest or the schema; the manifest is canonical.

### Codegen output (`document-models/reactor-drive/gen/`)

Running `pnpm generate` (which invokes `ph-cli generate`) produces
the same `gen/` layout as every other vetra document model:

```
document-models/reactor-drive/
  reactor-drive.json
  schema.graphql
  gen/
    actions.ts            # discriminated action types
    creators.ts           # setDriveNameAction(), etc.
    document-model.ts     # DocumentModelModule export
    document-schema.ts    # generated state types
    document-type.ts      # documentType constant
    ph-factories.ts
    reducer.ts            # operation dispatcher
    index.ts
    schema/               # split schema files per module
    base-operations/      # per-operation generated stubs
    utils.ts
    types.ts
  src/
    reducers/
      base-operations.ts  # HAND-WRITTEN reducer body (one function per op)
    index.ts
    utils.ts
  actions.ts              # re-exports gen/actions.ts
  document-model.ts       # re-exports gen/document-model.ts (with reducer wired)
  index.ts                # public entry
  utils.ts
```

`src/reducers/base-operations.ts` is the only hand-written
business-logic file. Each function gets `(state, action, dispatch)`
and mutates the immer draft of state. For this model the bodies are
trivial (single-field assignments with input validation) — closer to
the recipe at `recipes/drive-override/src/custom-container.ts` than
to the legacy `document-drive` reducer, which had to maintain
`state.global.nodes`.

### Where this fits in the package

Keeping with vetra's layout, `document-models/` lives at the
**repo root level inside the package**, not under `src/`. The
package's main `index.ts` re-exports from `document-models/reactor-drive`
so consumers see `import { reactorDriveDocumentModel } from
"@powerhousedao/reactor-drive"` rather than a deep path.

## Relationship-action vocabulary

> Note on `CREATE_DOCUMENT` + `UPGRADE_DOCUMENT`. Throughout this doc,
> wherever a child document is brought into existence the pair always
> appears together: `CREATE_DOCUMENT` provisions an empty document of a
> given type, and `UPGRADE_DOCUMENT` advances it to the current
> document-model version (and applies any initial state). Treat them as
> an inseparable two-action prelude — never one without the other. The
> `driveActions` composer helpers below always emit the pair.

The drive uses one dedicated relationship type, `"drive/child"`, on
edges from a drive (or folder) to its children. Metadata on each edge
carries only what doesn't have a natural home elsewhere:

```ts
type DriveContainsMetadata =
  | { kind: "file" } // file name lives on the child PHDocument's header
  | { kind: "folder"; name: string }; // folders have no backing document
```

File nodes deliberately do **not** carry name on the relationship. The
file's display name is the child document's `header.name`. This avoids
the double-write that the legacy module suffers from today (rename
required mutating both the file document and the drive's
`state.global.nodes[]` entry). Renaming a file is a single action
(`SET_NAME` on the file document); the processor picks up the change
and updates the `DriveNode.name` column.

Folder nodes still carry name in metadata because folders have no
backing document. A `SET_NAME`-style action on a folder is therefore
`UPDATE_RELATIONSHIP` with new `metadata.name`.

Mapping from the legacy actions to relationship operations:

| Legacy action                       | Replacement composition                                                                                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy                              | Replacement composition                                                                                                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADD_FILE`                          | `CREATE_DOCUMENT(child, name)` + `UPGRADE_DOCUMENT(child)` + `ADD_RELATIONSHIP(parent, child.id, "drive/child", { kind: "file" })`                                                 |
| `ADD_FOLDER`                        | `ADD_RELATIONSHIP(parent, newFolderId, "drive/child", { kind: "folder", name })`                                                                                                   |
| `DELETE_NODE`                       | `REMOVE_RELATIONSHIP_SUBTREE(parent, nodeId, "drive/child")` + `DELETE_DOCUMENT(...)` for each file in the subtree                                                                 |
| `UPDATE_FILE` (rename file)         | `SET_NAME` on the file document. No drive-side action.                                                                                                                             |
| `UPDATE_FILE` (documentType)        | irrelevant — documentType lives on the child document's header                                                                                                                     |
| `UPDATE_NODE` (rename file)         | `SET_NAME` on the file document. No drive-side action.                                                                                                                             |
| `UPDATE_NODE` (rename folder)       | `UPDATE_RELATIONSHIP(parent, folderId, "drive/child", { kind: "folder", name })`                                                                                                   |
| `UPDATE_NODE` (reparent)            | `REMOVE_RELATIONSHIP(oldParent, nodeId, "drive/child")` + `ADD_RELATIONSHIP(newParent, nodeId, "drive/child", { ... })`                                                            |
| `MOVE_NODE`                         | same as the reparent form of `UPDATE_NODE`                                                                                                                                         |
| `COPY_NODE` (file)                  | `CREATE_DOCUMENT(clone, name)` + `UPGRADE_DOCUMENT(clone)` + `ADD_RELATIONSHIP(targetParent, clone.id, "drive/child", { kind: "file" })`                                           |
| `COPY_NODE` (folder)                | for each id in the subtree: generate new id (folder) or `CREATE_DOCUMENT(clone, name)` + `UPGRADE_DOCUMENT(clone)` (file), then `ADD_RELATIONSHIP` for each edge, client-side      |

Note the two single-action paths that fall out of this: renaming a
file is one action on one document; everything in the drive stays
untouched, and the processor picks up the new name from the file's
header.

The drive-only actions stay as they are:

| Drive action            | Reducer effect                       |
| ----------------------- | ------------------------------------ |
| `SET_DRIVE_NAME`        | write `state.global.name`            |
| `SET_DRIVE_ICON`        | write `state.global.icon`            |
| `SET_SHARING_TYPE`      | write `state.local.sharingType`      |
| `SET_AVAILABLE_OFFLINE` | write `state.local.availableOffline` |

## Required changes to the relationship system

Three changes are needed in the reactor itself to make the relationship
actions a complete substitute for the drive-specific node actions. These
land in `@powerhousedao/reactor` and `@powerhousedao/shared`, not in
`reactor-drive`.

### 1. `UPDATE_RELATIONSHIP` system action

Rename / metadata change without losing the row's `createdAt`. The
current contract only offers `ADD_RELATIONSHIP` and `REMOVE_RELATIONSHIP`;
renaming via remove+add resets `createdAt` (which `getOutgoing` orders
by), so paginated listings would scramble on every rename.

Wire shape:

```ts
type UpdateRelationshipActionInput = {
  sourceId: string;
  targetId: string;
  relationshipType: string;
  metadata: Record<string, unknown> | null;
};
```

Behaviour: the indexer replaces the `metadata` JSONB of the matching row
and bumps `updatedAt`. If no matching row exists, the action errors
(consistent with how `REMOVE_RELATIONSHIP` would behave on a missing
edge).

Touch points:

- `packages/shared/document-model/types.ts` — add the input type and a
  `UpdateRelationshipAction` discriminated-union member.
- `packages/reactor/src/actions/index.ts` — add `updateRelationshipAction`
  factory.
- `packages/reactor/src/executor/document-action-handler.ts` — validate
  scope (`"document"`), validate input shape, dispatch to the indexer.
- `packages/reactor/src/storage/kysely/document-indexer.ts` —
  `handleUpdateRelationship` in `commitOperations`; a single
  `UPDATE DocumentRelationship SET metadata = ?, updatedAt = ? WHERE
sourceId = ? AND targetId = ? AND relationshipType = ?`.

### 2. `REMOVE_RELATIONSHIP_SUBTREE` system action

Deleting a folder needs to remove the folder's edge from its parent and
every descendant edge reachable via the same relationship type, in one
atomic step. Doing this client-side requires reading the indexer, racing
against concurrent writers, and issuing N actions — exactly the
properties we're trying to avoid.

Wire shape:

```ts
type RemoveRelationshipSubtreeActionInput = {
  sourceId: string; // parent that owns the edge to root
  rootId: string; // node whose subtree (inclusive) is removed
  relationshipType: string;
};
```

Behaviour: at execute time the executor (with the indexer's help)
collects every edge `(a, b, relationshipType)` where `b` is `rootId`
or transitively reachable from `rootId` via outgoing
`relationshipType` edges, and writes N `REMOVE_RELATIONSHIP`
operations into the operation log in one transaction. Self-contained
operations make replay, sync, and reasoning straightforward; the cost
is a longer operation log for a folder delete, which is acceptable.

Touch points: same files as above, plus
`packages/reactor/src/storage/kysely/document-indexer.ts` for the CTE
that walks the subtree.

Note that this action does not delete the underlying `PHDocument`s for
files in the subtree. That stays the client's job via `DELETE_DOCUMENT`,
consistent with how `ADD_RELATIONSHIP` does not implicitly
`CREATE_DOCUMENT`.

### 3. Indexer support for drive-specific projection

The `DocumentRelationship` table stays generic. The drive's collision
resolution, kind discriminator, and per-folder paged listing live in
`DriveNode` (this package's projection). No schema change to
`DocumentRelationship` itself.

Two non-changes worth being explicit about:

- We do **not** add a `name` column to `DocumentRelationship`. File
  names live on the child document's header; folder names live in
  relationship metadata; the processor materialises both into
  `DriveNode.name`.
- We do **not** add a `kind` column. Kind lives in relationship
  metadata.

### 4. `IDriveClient.listNodes` becomes paged

The current `IDriveClient.listNodes` returns an unbounded `Node[]`.
The whole point of `reactor-drive` is to support drives with 10k+
children without loading them into memory, so the unbounded contract
has to change.

Signature change in `packages/reactor/src/client/types.ts`:

```ts
listNodes(
  driveIdentifier: string,
  parentFolder: string | null,
  paging?: PagingOptions,
  signal?: AbortSignal,
): Promise<PagedResults<Node>>;
```

Touch points:

- `packages/reactor/src/client/types.ts` — update the interface
  signature.
- `packages/reactor/src/client/drive-client.ts` — the legacy
  `DriveClient` implementation slices its in-memory
  `state.global.nodes` array against the cursor. Cheap.
- Every caller of `listNodes` across the repo — updated to consume
  the paged shape. This is straightforward (the existing callers
  almost all already paginate downstream of the result), but it is
  a coordinated change.

Locking this here so it isn't lost between the relationship-system
changes and the drive package itself.

## Processor design

`NodeProcessor` extends `BaseReadModel` (no per-drive namespacing in v1
— single shared schema with a `driveId` column on `DriveNode`).

The processor consumes two distinct streams of operations:

- **Structure stream.** Relationship actions of type `"drive/child"`
  (`ADD_RELATIONSHIP`, `REMOVE_RELATIONSHIP`, `UPDATE_RELATIONSHIP`,
  `REMOVE_RELATIONSHIP_SUBTREE`) — these create / move / delete rows
  and update folder names from metadata.
- **Name stream.** `CREATE_DOCUMENT`, `UPGRADE_DOCUMENT`, `SET_NAME` on
  any document. The processor keeps a small `DocumentName` table —
  `(docId, name, updatedAt)` — that mirrors `header.name` for every
  document the reactor has ever seen, whether or not that document is
  currently linked into a drive. Without this, a document created and
  renamed before its first `ADD_RELATIONSHIP` would land in the drive
  with the wrong name (we'd have skipped the earlier name ops because
  no `DriveNode` row existed). With it, the structure branch can read
  the current name on first link.

  This duplicates the indexer's `Document.name` column intentionally —
  it keeps `NodeProcessor` self-contained (single transaction, no
  cross-processor cursor dependency, no foreign-key coupling to the
  generic indexer's schema). The cost is one short row per document
  ever created; the value is straightforward replay and isolation.

Filter: `{ }`. The processor inspects every operation and routes by
action type. We could narrow with `{ scope: ["document"] }` for the
structure stream, but the name stream targets the child document's
own scope, so a single broad filter is simpler than two and
correctness comes from the type checks inside `onOperations`.

`onOperations` flow per operation:

1. Branch on action type. If not in
   `{ ADD_RELATIONSHIP, REMOVE_RELATIONSHIP, UPDATE_RELATIONSHIP,
REMOVE_RELATIONSHIP_SUBTREE, CREATE_DOCUMENT, UPGRADE_DOCUMENT,
SET_NAME }`, skip.
2. **Structure branch** (relationship actions). Skip if
   `relationshipType !== "drive/child"`.
3. Resolve which drive the operation belongs to. The drive id is the
   root of the `"drive/child"` graph the relationship participates
   in. Two strategies:
   - The action runs against the drive document (its `documentId` is
     the drive id) — true for direct children. For nested edges
     (`folder -> child`), the operation is also executed against the
     drive document (clients always target the drive when modifying
     its tree). This is a hard convention, documented in the client
     APIs.
   - Fallback: walk up via `DriveNode.parentFolder` until we find a
     row with `parentFolder = null`. Used only for legacy / migrated
     data.
4. Apply the projection in a transaction. For `ADD_RELATIONSHIP`:
   - If `kind === "folder"`: compute the resolved name via the same
     collision rule as today (`name`, `name (2)`, `name (3)`, ...) by
     reading existing sibling names from `DriveNode` within the
     transaction. Insert a row with
     `(driveId, id=targetId, kind="folder",
parentFolder=sourceIdOrNull, name=resolved, documentType=null)`.
   - If `kind === "file"`: look up the file's name in `DocumentName`
     (always populated by the name branch on prior `CREATE_DOCUMENT` /
     `UPGRADE_DOCUMENT` / `SET_NAME` ops). If absent, fall back to an
     empty string and rely on a later name op to fix it; in practice
     `CREATE_DOCUMENT` always precedes `ADD_RELATIONSHIP` in the
     composed sequence. Run collision resolution against the sibling
     set and insert `(driveId, id=targetId, kind="file",
parentFolder=..., name=resolved, documentType=<from indexer>)`.
5. For `UPDATE_RELATIONSHIP`: only meaningful for folders. Recompute
   resolved name if `metadata.name` changed; update the row.
6. For `REMOVE_RELATIONSHIP`: delete the row.
7. For `REMOVE_RELATIONSHIP_SUBTREE`: walk descendants via a recursive
   CTE on `DriveNode` and delete the matching rows.
8. **Name branch** (`CREATE_DOCUMENT` / `UPGRADE_DOCUMENT` / `SET_NAME`).
   a. Upsert into `DocumentName`:
   `(docId=operation.documentId, name=<from action payload or
header>, updatedAt=now)`. This runs unconditionally for every
   document — the table is the processor's source of truth for "what
   name does this document have right now."
   b. Look up `DriveNode` rows where `id = operation.documentId AND
kind = "file"`. There can be more than one if the same document is
   linked into multiple drives or folders — update each. For each row,
   re-run collision resolution against the sibling set in that row's
   `(driveId, parentFolder)`, and update `DriveNode.name` and
   `requestedName`. If no row exists, only step (a) runs.
9. Update the processor cursor (handled by `BaseReadModel`).

Collision resolution is **per-drive** (more precisely, per
`(driveId, parentFolder)`). A single file document can be linked into
multiple drives or into multiple folders within the same drive. Its
`header.name` is the unsuffixed source of truth — it never carries
`(2)` / `(3)` suffixes. Each `DriveNode` row computes its own
resolved name against its own sibling set, so the same file can show
up as `"foo"` in drive A and as `"foo (2)"` in drive B (or in
folder X vs folder Y of the same drive) without contradiction. When
the file is renamed via `SET_NAME`, the name branch recomputes
resolution independently for every `DriveNode` row referencing the
document.

Collision resolution is deterministic across replay because operations
arrive in scope order and the transaction sees the post-state of all
prior operations. A rename can cascade: renaming `foo` to `bar` when
`bar (2)` already exists doesn't itself collide, but a later sibling
can. This matches the legacy module's behaviour.

`onDisconnect`: noop — tables persist across processor reconnects.

## Schema (Kysely)

```ts
export interface DriveNodeTable {
  driveId: string; // owning drive document id
  id: string; // node id (== target of the "drive/child" edge)
  kind: "file" | "folder";
  name: string; // resolved (post-collision) display name
  // Source-of-truth name before collision resolution. For files this
  // mirrors the child document's header.name at the time of last
  // projection; for folders it mirrors the relationship metadata's
  // `name`. Kept on the row so collision rule can be re-evaluated
  // without joining or re-reading metadata.
  requestedName: string;
  parentFolder: string | null; // null for direct children of the drive
  documentType: string | null; // null for folders
  createdAt: Date;
  updatedAt: Date;
}

// Source-of-truth mirror of header.name for every document the
// processor has observed. Lets ADD_RELATIONSHIP look up the right name
// for a document that was created (and possibly renamed) long before
// it was linked into any drive.
export interface DocumentNameTable {
  docId: string; // PK
  name: string;
  updatedAt: Date;
}
```

Indexes:

- `DocumentName (docId)` primary key.
- `DriveNode (driveId, id)` primary key.
- `DriveNode (driveId, parentFolder, name)` covering for listing &
  collision lookups.
- `DriveNode (driveId, parentFolder, kind, id)` for paged listing per
  folder.

## Subgraph design

`subgraph/schema.graphql` defines a paged read API:

```graphql
type Drive {
  id: ID!
  name: String!
  icon: String
  sharingType: String
  availableOffline: Boolean!
  rootNodes(paging: PagingInput, kind: NodeKind): NodePage!
}

enum NodeKind {
  FILE
  FOLDER
}

union DriveNode = FileNode | FolderNode

type FileNode {
  id: ID!
  name: String!
  parentFolder: ID
  documentType: String!
}

type FolderNode {
  id: ID!
  name: String!
  parentFolder: ID
  children(paging: PagingInput, kind: NodeKind): NodePage!
}

type NodePage {
  results: [DriveNode!]!
  nextCursor: String
  hasMore: Boolean!
}

type Query {
  drive(id: ID!): Drive
  driveNode(driveId: ID!, id: ID!): DriveNode
  driveDescendants(driveId: ID!, root: ID!, paging: PagingInput): NodePage!
  drives(paging: PagingInput): [Drive!]!
}
```

No mutation resolvers in v1; clients keep dispatching actions through
`reactor.execute()`. Resolvers read from the same Kysely connection the
processor writes to, and accept a `consistencyToken` through context for
read-after-write.

## Client (`ReactorDriveClient implements IDriveClient`)

Callers don't talk to relationship actions directly. The package
ships `ReactorDriveClient`, a concrete implementation of the existing
`IDriveClient` interface from `@powerhousedao/reactor`
(`packages/reactor/src/client/types.ts`). No new client interface —
consumers swap in a `ReactorDriveClient` wherever the legacy
`DriveClient` was wired and keep calling `addFile`, `addFolder`,
`removeNode`, `renameNode`, `moveNode`, `copyNode`, `getNode`,
`listNodes`, `setPreferredEditorOnNode`, `create` exactly as before.

```ts
// packages/reactor-drive/src/client/reactor-drive-client.ts
import type { IDriveClient } from "@powerhousedao/reactor";
import type { IReactorClient } from "@powerhousedao/reactor";
import type { IDriveReadModel } from "../read-model/interfaces.js";

export class ReactorDriveClient implements IDriveClient {
  constructor(args: { reactor: IReactorClient; readModel: IDriveReadModel }) {
    // ...
  }
  // implements every IDriveClient method, see mapping table below
}
```

### How each `IDriveClient` method is satisfied

The interface and its return types stay exactly as in
`packages/reactor/src/client/types.ts`. The legacy types it exposes
(`Node`, `FolderNode` from `@powerhousedao/shared/document-drive`,
`DocumentDriveDocument`, `DriveInput`) are produced by shaping
`DriveNode` rows from the read model into the legacy node shape on
return — id, name, parentFolder, documentType, kind discriminator.
The header of the synthesised `DocumentDriveDocument` is the drive's
own header; its `state.global.nodes` is **not** populated (the new
module never materialises that array). Callers that read
`drive.state.global.nodes` directly are an explicit non-goal — they
have to be migrated to `listNodes` / `getNode`, which is what they
should have been calling anyway.

**`create(input)`** — `reactor.create({ documentType: "powerhouse/reactor-drive", header, state: { global: { name, icon }, local: { sharingType, availableOffline } } })`. Returns the resulting `DocumentDriveDocument`.

**`addFile(driveId, doc, parentFolder?)`** — `loadBatch`: `CREATE_DOCUMENT(doc)` → `UPGRADE_DOCUMENT(doc)` → `ADD_RELATIONSHIP(driveId, doc.id, "drive/child", { kind: "file" })`. The file's name comes from `doc.header.name`.

**`addFolder(driveId, name, parentFolder?)`** — Single `ADD_RELATIONSHIP` on `parentFolder ?? driveId` with target `newFolderId` and metadata `{ kind: "folder", name }`. Generates `newFolderId` if absent. Returns the shaped legacy `FolderNode`.

**`removeNode(driveId, nodeId)`** — Look up `kind` via read model. If folder: `getDescendants` to collect file ids; batch `REMOVE_RELATIONSHIP_SUBTREE` + `DELETE_DOCUMENT(fileId, CASCADE)` per file. If file: `REMOVE_RELATIONSHIP` + `DELETE_DOCUMENT`.

**`renameNode(driveId, nodeId, name)`** — Look up `kind` via read model. If file: `reactor.rename(nodeId, name)` (single `SET_NAME` on the file doc — no drive write). If folder: `UPDATE_RELATIONSHIP(parent, folderId, "drive/child", { kind: "folder", name })`.

**`setPreferredEditorOnNode(nodeId, editor)`** — Delegate to `reactor.setPreferredEditor(nodeId, editor)`. Nothing drive-specific.

**`moveNode(driveId, nodeId, targetParentFolderId)`** — Batch `REMOVE_RELATIONSHIP(oldParent, nodeId, ...)` + `ADD_RELATIONSHIP(newParent, nodeId, "drive/child", oldMetadata)`. For folders the metadata `name` carries over; for files no metadata.

**`copyNode(driveId, nodeId, targetParentFolderId)`** — Walk subtree via read model. For each folder generate a new id; for each file build `CREATE_DOCUMENT(clone)` + `UPGRADE_DOCUMENT(clone)` + `ADD_RELATIONSHIP`. Batch as a single dependent `loadBatch`.

**`getNode(driveId, nodeId)`** — Read `DriveNode` row, shape to legacy `Node`.

**`listNodes(driveId, parentFolder, paging?)`** — Read `DriveNode` rows by `(driveId, parentFolder)` ordered by `createdAt, id`, sliced by `paging.cursor` and `paging.limit`. Returns `PagedResults<Node>` (signature updated upstream; see "Required changes / 4").

`renameNode` is the single most visible behavioural improvement:
under the legacy module it required two co-ordinated actions on two
documents; under the new module it is a single `SET_NAME` on the
file's own document, and the processor's name stream picks it up
and updates `DriveNode.name`. Callers see no change because they
were already calling `renameNode` on the client — the wire just
gets simpler.

### Read-after-write

`ReactorDriveClient` threads `ConsistencyToken` through every method
internally: write methods capture the token from the resulting job
and pass it to the follow-up read against `IDriveReadModel`. This
matches the legacy client's contract that "after `renameNode` returns,
the next `getNode` reflects the new name."

## Package layout

```
packages/reactor-drive/
  package.json
  tsconfig.json
  tsdown.config.ts
  vitest.config.ts
  index.ts                       # public exports
  plan.md                        # this file
  src/
    module.ts                    # DocumentModelModule (header-only state)
    types.ts                     # drive PH state types, metadata schema
    reducer/
      drive.ts                   # SET_DRIVE_* / SET_SHARING_TYPE / SET_AVAILABLE_OFFLINE
    client/
      reactor-drive-client.ts    # ReactorDriveClient implements IDriveClient
    schema/
      tables.ts                  # Kysely table defs (DriveNode, DocumentName)
      migrations/
        0001_drive_node.ts
        0002_document_name.ts
    processors/
      node-processor.ts          # consumes ADD/REMOVE/UPDATE/REMOVE_SUBTREE
      factory.ts                 # ProcessorFactoryBuilder export
      utils/
        collisions.ts            # name collision rule (deterministic)
        validation.ts            # name validation
    read-model/
      interfaces.ts              # IDriveReadModel
      drive-node-view.ts         # paged children, ancestors, descendants
    subgraph/
      index.ts
      schema.graphql
      resolvers.ts
    register.ts                  # registers module + processor + subgraph
  test/
    reactor-drive-client.test.ts # end-to-end client method coverage
    node-processor.test.ts       # projection assertions
    rename-collision.test.ts     # deterministic collision resolution
    cascade-delete.test.ts       # REMOVE_RELATIONSHIP_SUBTREE projection
    bench/
      add-file-10k.bench.ts      # scaling vs. legacy document-drive
```

`index.ts` re-exports the drive `DocumentModelModule`,
`ReactorDriveClient` (which implements the existing
`IDriveClient` from `@powerhousedao/reactor`), the read-model
interface, the processor factory, and the subgraph.

## Migration from legacy `document-drive`

The legacy `ADD_FILE` / `ADD_FOLDER` / `DELETE_NODE` / `UPDATE_FILE` /
`UPDATE_NODE` / `COPY_NODE` / `MOVE_NODE` actions are not accepted by
the new module. Operations of those types in existing drives' operation
logs need to be translated.

Two paths:

- **Translation processor (offline).** A one-shot migration that reads
  every drive's operation log, emits the equivalent sequence of
  `CREATE_DOCUMENT` / `ADD_RELATIONSHIP` / etc. operations into a fresh
  log, and swaps the drive's documentType pointer. Idempotent, gated
  behind a CLI command shipped with this package.
- **Backfill from state (online).** For drives where we don't care
  about preserving the operation log (e.g. drives that have been
  pruned), read `state.global.nodes`, emit one `ADD_RELATIONSHIP` per
  node into the new drive, and call it done. Loses history but is
  fast.

Callers keep using `IDriveClient` unchanged. The wiring swaps the
concrete implementation: where `client.drives` previously resolved
to the legacy `DriveClient`, in environments running the new module
it resolves to `ReactorDriveClient`. Method shapes are identical;
the only thing call sites need to verify is that they don't reach
into `drive.state.global.nodes` directly (which was a public-but-
discouraged path under the legacy module and is not populated under
the new one).

The GraphQL `DocumentDriveState.nodes` field is unsupported under the
new module — the new subgraph provides the paged replacement. We keep
the field in the legacy schema for one release with a `@deprecated`
directive pointing at `Drive.rootNodes` / `FolderNode.children`.

## Testing

- `reactor-drive-client.test.ts`: end-to-end coverage of every
  `IDriveClient` method against a `ReactorBuilder`-backed reactor
  with `ReactorDriveClient` wired and `NodeProcessor` registered.
  Each method's pre/post conditions on `DriveNode` are asserted;
  `removeNode(folder)` and `copyNode(folder)` cover the
  multi-document batched paths.
- `node-processor.test.ts`: dispatch raw action sequences (bypassing
  the client) through the reactor; assert against `DriveNode` rows
  for files, folders, rename (file via `SET_NAME` on child doc;
  folder via `UPDATE_RELATIONSHIP`), move, cascade delete, copy.
- `file-rename-propagation.test.ts`: `SET_NAME` on a file document
  with a `DriveNode` row updates `DriveNode.name` (and applies
  collision resolution) without any drive-side action.
- `late-link.test.ts`: `CREATE_DOCUMENT(name="foo")` then
  `SET_NAME(name="bar")` then `ADD_RELATIONSHIP` — the resulting
  `DriveNode.name` is `"bar"` (or `"bar (2)"` if siblings collide),
  proving the `DocumentName` table is consulted at link time rather
  than relying on prior `DriveNode` writes.
- `rename-collision.test.ts`: deterministic suffix rule across replay,
  across out-of-order arrival in operations, for both file renames
  (source: doc header) and folder renames (source: relationship
  metadata).
- `cascade-delete.test.ts`: `REMOVE_RELATIONSHIP_SUBTREE` removes every
  descendant edge in one transaction and is observable atomically by
  `IDriveNodeView`.
- `bench/add-file-10k.bench.ts`: 10k `IDriveClient.addFile`
  invocations measured end-to-end against `ReactorDriveClient` (new
  module) and the legacy `DriveClient` (old module). Same interface
  on both sides — the bench measures backend, not API ergonomics.
  Expectation: legacy degrades roughly quadratically, the new module
  stays roughly linear.

## Milestones

- **M0 — scaffolding.** Package created, builds with `tsdown`, lints,
  empty `index.ts`. Tests run.
- **M1 — drive module skeleton.** `DocumentModelModule` with only the
  drive's own `SET_*` actions; metadata-only state; end-to-end drive
  creation works under `ReactorBuilder`.
- **M2 — `UPDATE_RELATIONSHIP` system action.** Implemented in the
  reactor (`packages/reactor`, `packages/shared`); indexer handles
  metadata updates; round-trip tested in the reactor package.
- **M3 — `REMOVE_RELATIONSHIP_SUBTREE` system action.** Implemented in
  the reactor with execute-time fan-out (N `REMOVE_RELATIONSHIP`
  operations written in one transaction); cascade delete tested
  against the generic `DocumentRelationship` table.
- **M3.5 — paged `IDriveClient.listNodes`.** Upstream signature
  change in `@powerhousedao/reactor`: `listNodes` accepts
  `PagingOptions` and returns `PagedResults<Node>`. Legacy
  `DriveClient` updated to slice its in-memory array; all callers in
  the repo updated to the paged shape.
- **M4 — node processor.** `DriveNode` + `DocumentName` tables and
  migrations. `NodeProcessor` consumes both streams: relationship
  actions of type `"drive/child"`, and `CREATE_DOCUMENT` /
  `UPGRADE_DOCUMENT` / `SET_NAME` on any document (writes to
  `DocumentName`; updates `DriveNode` rows when the doc is currently
  linked). Test that linking a document with a pre-existing name
  picks up the latest name from `DocumentName`. Collision resolution
  covers both file (header-sourced) and folder (metadata-sourced)
  names. Read-model interface (`getNode`, `listChildren(paged)`,
  `getDescendants`).
- **M5 — `ReactorDriveClient`.** Concrete implementation of the
  existing `IDriveClient` (`@powerhousedao/reactor`) in
  `src/client/reactor-drive-client.ts`. Every interface method
  implemented against the new module: `create`, `addFile`,
  `addFolder`, `removeNode`, `renameNode`,
  `setPreferredEditorOnNode`, `moveNode`, `copyNode`, `getNode`,
  `listNodes`. Returns legacy node shapes (`Node`, `FolderNode`)
  produced by shaping `DriveNode` rows. The client wraps
  `IReactorClient` + `IDriveReadModel`, threads consistency tokens
  internally, and uses `loadBatch` for the multi-document
  choreography in `removeNode(folder)` and `copyNode(folder)`.
  End-to-end tests in `reactor-drive-client.test.ts`.
- **M6 — subgraph.** Schema, resolvers, hookup into `reactor-api`'s
  `GraphQLManager`. Consistency-token plumbing through context.
- **M7 — migration CLI.** `reactor-drive migrate --drive <id>` reads
  legacy state and emits relationship operations into a fresh new-type
  drive, idempotent.
- **M8 — bench & deprecation notice.** 10k benchmark; `@deprecated`
  directive on `DocumentDriveState.nodes` in the legacy schema.

## Non-goals (v1)

- Mutation resolvers in the subgraph. Clients keep using
  `reactor.execute`.
- Reusing the legacy documentType — the new module ships under a new
  documentType so both can coexist during migration.
- Cross-drive node references.
- Multi-tenant schema isolation (per-drive namespaces).
- Preserving the operation log shape of legacy drives — the migration
  CLI emits a fresh log in relationship-action form.

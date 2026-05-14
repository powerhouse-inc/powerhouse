# Code Review: `feat/reactor-drive`

Scope: all modified + untracked files on the current branch (commits `d6b7c4f8c..6ec7fe1c3`, ~4.9k LOC across 45 files). Findings are ordered by severity, highest first. Numbering is reversed: the largest number is the most critical.

## Branch summary

A new `@powerhousedao/reactor-drive` package replaces the legacy `powerhouse/document-drive` model. Folder structure has moved out of the drive's `state.global.nodes` and into the event log as first-class `ADD_FOLDER` / `UPDATE_FOLDER` / `REMOVE_FOLDER` actions; files remain `ADD_RELATIONSHIP("drive/child", …)` edges from the drive to a child PHDocument. A new `NodeProcessor` (BaseReadModel) projects these into `DriveNode` + `DocumentName` tables; `DriveNodeView` reads them; `ReactorDriveClient` implements `IDriveClient`; a GraphQL subgraph fronts the projection. Supporting changes in `@powerhousedao/reactor` add `UPDATE_RELATIONSHIP`, refactor the relationship handlers into a single `withRelationshipAction` template, add `parsePagingOptions`, paginate the legacy `DriveClient.listNodes`, and deprecate `DocumentDriveState.nodes`.

The shape and test coverage are good. The bulk of the surface is exercised by unit + integration tests and a small benchmark. The findings below are concentrated around correctness/consistency edges — projection cleanup on document delete, consistency-token threading, documentType preservation, cursor stability — that are off in ways the current tests don't catch.

---

## Findings (highest severity = highest number)

### 14. NodeProcessor doesn't clean up on `DELETE_DOCUMENT`

`NodeProcessor.commitOperations` (`packages/reactor-drive/src/processors/node-processor.ts:64-79`) only reacts to the action sets `NAME_ACTION_TYPES` and `STRUCTURE_ACTION_TYPES`. `DELETE_DOCUMENT` is in neither — so deleting a file document directly via `reactor.deleteDocument` leaves both the `DriveNode` row and the `DocumentName` row orphaned.

`ReactorDriveClient.removeNode` (`reactor-drive-client.ts:153-216`) orchestrates this correctly today by issuing `REMOVE_RELATIONSHIP` first, but anything that bypasses the drive client (cascading deletes from other modules, sync, raw API clients, the cascade emitted inside `removeNode` itself for descendant files at line 193-199) won't.

Recommendation: handle `DELETE_DOCUMENT` in NodeProcessor — at minimum, delete any `DriveNode` rows where `id = input.documentId`, and the matching `DocumentName` row.

### 13. `ReactorDriveClient.addFile` is non-transactional

`packages/reactor-drive/src/client/reactor-drive-client.ts:95-124` does:
1. `await this.reactor.create(document, …)` — creates the child PHDocument.
2. `await this.reactor.execute(driveIdentifier, "main", [addRelationshipAction(…)], …)` — links it.

If step 2 fails (drive document missing/branch typo/network blip/abort), step 1 is already committed: an orphaned PHDocument with no drive linkage. The legacy `DriveClient.addFile` (not shown here) had the same shape, so this isn't a regression — but the new flow is the right place to fix it.

Recommendation: either compose both into a single `executeBatch` with a dependency edge (the pattern `removeFileNode` uses at `packages/reactor/src/client/drive-client.ts:488-510`), or document the caller-side compensation contract. At minimum, on failure of step 2, attempt `reactor.deleteDocument(document.header.id)` to roll back.

### 12. `copyNode` is O(n) `reactor.execute` round-trips

`packages/reactor-drive/src/client/reactor-drive-client.ts:362-406` iterates the entire subtree and issues a separate `reactor.execute` per folder and a separate `reactor.create + execute` per file. A folder with 100 descendants becomes ~200 sequential awaits. The queue serializes per-document, so this is fine for correctness, but it's slow and produces N log entries' worth of intermediate states that other observers see.

Recommendation: build the full `Action[]` for all folders, fire them in one `execute`, then fan out the file copies (which inherently need per-document `create` calls but can still batch their `ADD_RELATIONSHIP` actions into a single drive-side `execute`).

### 11. `DriveNodeView.getDescendants` walks the tree in JS — N queries per traversal

`packages/reactor-drive/src/read-model/drive-node-view.ts:80-119` does a level-by-level BFS, issuing one `SELECT … WHERE parentFolder IN (…)` per depth level. For a deep tree this is N round-trips. The bench file targets `listChildren`, not `getDescendants`, so the cost is hidden.

`getDescendants` is hot: `ReactorDriveClient.removeNode` and `copyNode` both call it on every operation. For correctness it's fine; for performance, a single recursive CTE is dramatically faster on Postgres and well-supported by PGlite.

Recommendation: rewrite as `WITH RECURSIVE … SELECT * FROM DriveNode WHERE driveId = ? AND id IN (cte) …`. Keep the JS fallback if you must support a backend that doesn't support recursive CTEs.

### 10. `migrateLegacyDriveState` "safe to re-run" claim is true only after the projection catches up

`packages/reactor-drive/src/migration/migrate-legacy-state.ts:30-39` says re-running is safe because existing rows are skipped. The skip predicate (`readModel.getNode`, line 51) reads the `DriveNode` projection — which is only populated by NodeProcessor after operations are applied. If a caller invokes `migrateLegacyDriveState` twice before NodeProcessor commits the first batch, the second run sees an empty projection and re-emits every `ADD_FOLDER` / `ADD_RELATIONSHIP` action. The projection's own idempotency in `handleAddFolder` / `handleAddFileRelationship` (`node-processor.ts:266-302`) absorbs the duplicate as an upsert, but the operation log now has duplicate entries — and `KyselyDocumentIndexer.handleAddRelationship` skips dup edges via its own pre-check (`document-indexer.ts:585-606`) so the indexer is fine, but the log is permanently bloated.

Recommendation: document the consistency requirement (caller must `waitForConsistency` before re-running), or compute the existing set from the operation log instead of the projection, or both.

### 9. Offset-based cursor in `listChildren` is shift-sensitive under concurrent writes

`DriveNodeView.listChildren` (`drive-node-view.ts:34-67`) parses the cursor as a numeric offset and applies it as `.offset(offset).limit(limit + 1)`. Standard offset pagination has the well-known "row inserted at offset N during page traversal causes the next page to repeat row N" failure mode. For a drive that's actively being mutated by other clients while a UI pages through it, this means duplicates and skips.

Recommendation: at least add a stable secondary sort and switch to a keyset cursor (`(createdAt, id) > (prevCreatedAt, prevId)`). The schema already has the right index (`idx_drive_node_parent_kind_id`, `0001_drive_node.ts:30-33`). The current `orderBy("createdAt", "asc").orderBy("id", "asc")` is half the work.

### 8. `KyselyDocumentIndexer.handleUpdateRelationship` silently no-ops on a missing row; `UPDATE_RELATIONSHIP` has no self-edge guard

`packages/reactor/src/storage/kysely/document-indexer.ts:627-648` runs an unconditional `UPDATE` on `(sourceId, targetId, relationshipType)`. If no row exists, zero rows are updated and no error is raised. The handler in `document-action-handler.ts:625-646` (`executeUpdateRelationship`) doesn't pre-validate either, and it also doesn't carry over the `sourceId !== targetId` check that `executeAddRelationship` uses (`document-action-handler.ts:580-586`).

Two small consequences:
1. A bug that submits `UPDATE_RELATIONSHIP` for a non-existent edge succeeds silently; the operation is logged but nothing changes.
2. Self-edges can be created indirectly: `ADD_RELATIONSHIP(a, b, t)` then `UPDATE_RELATIONSHIP(a, a, t)` — wait, no, the update keys on `(sourceId, targetId, relationshipType)` so the prior row wouldn't match. But a sourceId === targetId edge could still be created by some other code path; UPDATE_RELATIONSHIP should symmetrically reject it.

Recommendation: in `executeUpdateRelationship`, optionally validate row existence before logging the operation (`writeCache`/indexer pre-check), and pass a `preValidate` rejecting `sourceId === targetId` for symmetry with ADD.

### 6. `addRelationshipAction`'s `relationshipType: "child"` default is misleading

`packages/reactor/src/actions/index.ts:75` keeps the old default of `"child"`. With reactor-drive now declaring `DRIVE_CHILD_RELATIONSHIP_TYPE = "drive/child"` (`packages/reactor-drive/src/constants.ts:3`), the default is no longer meaningful for the most common caller. Callers who omit the type will create edges that NodeProcessor explicitly skips (`node-processor.ts:146`).

Recommendation: remove the default and require an explicit relationship type. The compiler will catch every site.

### 5. `document-action-handler.ts` declares types between import groups

`packages/reactor/src/executor/document-action-handler.ts:12-36` defines `RelationshipActionShape`, `RelationshipJobResult`, and `RelationshipPostWriteArgs` between the first `import` block (lines 1-10) and the second (`import type { ILogger }` at line 37 onward). This compiles, but it's confusing for readers and tools that group imports. Move the type declarations below the imports.

### 4. `DocumentName` and `DriveNode` rows are never deleted by document deletion

This is a corollary of finding 14 but applies to `DocumentName` as well. When a document is deleted (any path), its `DocumentName` row remains. Names are global per `docId`, not per drive, so this is mostly harmless storage growth — but it also means a deleted document's stale name could be inherited by a freshly created document that re-uses the same id (extremely unlikely with UUIDs but still).

Recommendation: handle `DELETE_DOCUMENT` in NodeProcessor (#14) and include a `DELETE FROM DocumentName WHERE docId = ?`.

### 3. `NodeProcessor.applyNameOperation` does two queries where one PG UPSERT would suffice

`node-processor.ts:393-412` selects then inserts-or-updates. Postgres / PGlite support `INSERT … ON CONFLICT (docId) DO UPDATE`. Same shape applies to `handleAddFileRelationship` and `handleAddFolder` (lines 214-249, 266-302) where existing-row checks precede the insert/update. A single upsert per call halves the round-trips and removes a race window inside the transaction (the SELECT is in the same transaction so the race is minimal, but the simpler shape is still preferable).

### 2. `copyNode` uses `""` as a sentinel for "no parent" in `idMap.get(node.parentFolder ?? "")`

`reactor-drive-client.ts:368`. Empty string is in the namespace of valid node ids; if any code path ever produced one, this would silently misroute. Use a separate `Map` lookup with a typed `string | null` key, or branch on `parentFolder == null` first.

### 1. Test coverage gaps

- `getDescendants` against deep trees: integration tests cover up to depth 2.
- `migrateLegacyDriveState`: no test reads back the projected nodes to verify `documentType` (#16) and parent linkages after migration through the reactor.
- `UPDATE_RELATIONSHIP`: unit-tested in `packages/reactor/test/executor/document-action-handler/unit.test.ts:422-524`, but there is no integration test exercising it end-to-end through `KyselyDocumentIndexer.handleUpdateRelationship` and the resulting `DocumentRelationship.metadata` mutation.
- Subgraph resolvers and `consistencyToken`: no test asserts the token is honored (it isn't, see #15).
- `NodeProcessor` reaction to `DELETE_DOCUMENT`: not tested (it doesn't react, see #14).

---

## Smaller observations / things I liked

- `resolveCollision` (`packages/reactor-drive/src/processors/utils/collisions.ts`) is small, pure, well-tested, and matches the legacy semantics. Good split.
- `orderLegacyNodes` (`migrate-legacy-state.ts:93-120`) defensively handles cycles and missing parents; the cycle guard added in commit `6ec7fe1` is well-placed.
- `withRelationshipAction` (`document-action-handler.ts:648-784`) is a clean refactor that removes ~150 lines of duplication between ADD/REMOVE and makes UPDATE almost free.
- `parsePagingOptions` (`packages/reactor/src/shared/utils.ts:43-64`) is thoroughly tested and centralizes the validation; finding #18 is about how it's *called*, not the function itself.
- The `@deprecated` on `DocumentDriveState.nodes` in `schema.graphql` and `document-drive.json` is the right call.
- The bench file (`projection-scale.bench.ts`) provides forward-looking signal on the projection's scaling profile.

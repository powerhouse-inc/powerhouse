# Code Review: `feat/reactor-drive`

Scope: all modified + untracked files on the current branch (commits `d6b7c4f8c..6ec7fe1c3`, ~4.9k LOC across 45 files). Findings are ordered by severity, highest first. Numbering is reversed: the largest number is the most critical.

## Branch summary

A new `@powerhousedao/reactor-drive` package replaces the legacy `powerhouse/document-drive` model. Folder structure has moved out of the drive's `state.global.nodes` and into the event log as first-class `ADD_FOLDER` / `UPDATE_FOLDER` / `REMOVE_FOLDER` actions; files remain `ADD_RELATIONSHIP("drive/child", …)` edges from the drive to a child PHDocument. A new `NodeProcessor` (BaseReadModel) projects these into `DriveNode` + `DocumentName` tables; `DriveNodeView` reads them; `ReactorDriveClient` implements `IDriveClient`; a GraphQL subgraph fronts the projection. Supporting changes in `@powerhousedao/reactor` add `UPDATE_RELATIONSHIP`, refactor the relationship handlers into a single `withRelationshipAction` template, add `parsePagingOptions`, paginate the legacy `DriveClient.listNodes`, and deprecate `DocumentDriveState.nodes`.

The shape and test coverage are good. The bulk of the surface is exercised by unit + integration tests and a small benchmark. The findings below are concentrated around correctness/consistency edges — projection cleanup on document delete, consistency-token threading, documentType preservation, cursor stability — that are off in ways the current tests don't catch.

---

## Findings (highest severity = highest number)

### 5. `document-action-handler.ts` declares types between import groups

`packages/reactor/src/executor/document-action-handler.ts:12-36` defines `RelationshipActionShape`, `RelationshipJobResult`, and `RelationshipPostWriteArgs` between the first `import` block (lines 1-10) and the second (`import type { ILogger }` at line 37 onward). This compiles, but it's confusing for readers and tools that group imports. Move the type declarations below the imports.

### 3. `NodeProcessor.applyNameOperation` does two queries where one PG UPSERT would suffice

`node-processor.ts:393-412` selects then inserts-or-updates. Postgres / PGlite support `INSERT … ON CONFLICT (docId) DO UPDATE`. Same shape applies to `handleAddFileRelationship` and `handleAddFolder` (lines 214-249, 266-302) where existing-row checks precede the insert/update. A single upsert per call halves the round-trips and removes a race window inside the transaction (the SELECT is in the same transaction so the race is minimal, but the simpler shape is still preferable).

### 2. `copyNode` uses `""` as a sentinel for "no parent" in `idMap.get(node.parentFolder ?? "")`

`reactor-drive-client.ts:368`. Empty string is in the namespace of valid node ids; if any code path ever produced one, this would silently misroute. Use a separate `Map` lookup with a typed `string | null` key, or branch on `parentFolder == null` first.

### 1. Test coverage gaps

- `getDescendants` against deep trees: integration tests cover up to depth 2.
- `migrateLegacyDriveState`: no test reads back the projected nodes to verify `documentType` (#16) and parent linkages after migration through the reactor.
- `UPDATE_RELATIONSHIP`: unit-tested in `packages/reactor/test/executor/document-action-handler/unit.test.ts:422-524`, but there is no integration test exercising it end-to-end through `KyselyDocumentIndexer.handleUpdateRelationship` and the resulting `DocumentRelationship.metadata` mutation.

---

## Smaller observations / things I liked

- `resolveCollision` (`packages/reactor-drive/src/processors/utils/collisions.ts`) is small, pure, well-tested, and matches the legacy semantics. Good split.
- `orderLegacyNodes` (`migrate-legacy-state.ts:93-120`) defensively handles cycles and missing parents; the cycle guard added in commit `6ec7fe1` is well-placed.
- `withRelationshipAction` (`document-action-handler.ts:648-784`) is a clean refactor that removes ~150 lines of duplication between ADD/REMOVE and makes UPDATE almost free.
- `parsePagingOptions` (`packages/reactor/src/shared/utils.ts:43-64`) is thoroughly tested and centralizes the validation; finding #18 is about how it's *called*, not the function itself.
- The `@deprecated` on `DocumentDriveState.nodes` in `schema.graphql` and `document-drive.json` is the right call.
- The bench file (`projection-scale.bench.ts`) provides forward-looking signal on the projection's scaling profile.

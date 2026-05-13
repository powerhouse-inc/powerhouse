# Code Review: `feat/reactor-drive` Unstaged Diff

Scope: all modified + untracked files on the current branch. Findings are ordered by severity, highest first. Numbering is reversed: the largest number is the most critical.

---

## CRITICAL

### 18. `listNodes` paging is fragile

`packages/reactor/src/client/drive-client.ts` (legacy `DriveClient.listNodes`) and the new reactor-drive `DriveNodeView.listChildren` both parse cursors via:

```ts
const cursor = effective.cursor ? Number(effective.cursor) || 0 : 0;
```

- Invalid cursors (`"abc"`, `"-1"`, `"NaN"`) silently become `0` instead of erroring → caller cannot detect drift.
- `Number("-5")` is truthy → passes through as a negative offset, which `Array.slice`/SQL `OFFSET` handle inconsistently.
- `limit: 0` plus `cursor: "0"` produces a degenerate state where `nextCursor === "0"` and `hasMore === true` → infinite loop in a naive paging consumer.

**Fix direction:** validate cursor as a non-negative integer and reject otherwise; require `limit >= 1`.

---

## HIGH

### 17. Behavioral regression in `listNodes(undefined)`

`packages/reactor/src/client/types.ts` JSDoc says: "Pass `null` to list root-level nodes only." It is silent on `undefined`.

- Legacy `DriveClient.listNodes(driveId)` (undefined parent) lists **all** nodes in the drive.
- New `ReactorDriveClient.listNodes(driveId)` (undefined parent) maps `undefined → null` (root only).

That is a silent semantic break for anyone passing `undefined`. The interface contract is not normative either way, so the two implementations disagree without anything flagging it.

**Fix direction:** make `parentFolder` required (per CLAUDE.md "Prefer required fields and parameters") or explicitly document what `undefined` means and align both implementations.

### 16. New action handlers do not maintain `collectionMembershipCache`

`packages/reactor/src/executor/document-action-handler.ts`:

- `executeAddRelationship` / `executeRemoveRelationship` update `stores.collectionMembershipCache` when the source is a `powerhouse/document-drive`.
- `executeUpdateRelationship` and `executeRemoveRelationshipSubtree` (the new handlers) do not.

For reactor-drive these handlers never run against `powerhouse/document-drive`, so today this is latent. But if a caller ever uses these actions against the legacy drive type (which is the entire point of the generic relationship system), the cache will silently drift from the truth. At minimum this should be a `// TODO` with an issue link; preferably the cache update is added to mirror the other handlers.

### 15. Update / RemoveSubtree handlers silently no-op on missing edges

In `KyselyDocumentIndexer.handleUpdateRelationship`, if no row matches the WHERE clause the `update` simply affects zero rows and the operation is recorded as successful. Same for `handleRemoveRelationshipSubtree` when `rootId` has no incoming `sourceId → rootId` edge.

This conflicts with the operation-store invariant that an operation reflects a real state change. The executor should either: (a) verify existence before producing the operation and throw a typed reducer error, or (b) make the projection layer flag a drift event. Right now a buggy caller produces phantom operations.

### 14. Stale `addRelationshipAction` documentation

`packages/reactor/src/actions/index.ts` `addRelationshipAction`'s docstring still says "Creates an ADD_RELATIONSHIP action to establish a parent-child relationship." With the new generic relationship semantics (arbitrary `relationshipType`, optional `metadata`) that wording locks in the legacy mental model and conflicts with how reactor-drive uses it (`relationshipType: "drive/child"`, metadata-bearing). Update the docstring to describe the generic edge contract.

### 13. `removeRelationshipSubtreeAction` doc is ambiguous

The action description does not state whether cross-edges leaving the subtree are deleted or preserved. Given finding 19, this needs to be decided and documented before merging.

---

## MEDIUM

### 12. Subgraph hygiene

`packages/reactor-drive/src/subgraph/schema.ts`:
- Declares `scalar JSON` and never uses it. Strict graphql-tools setups will warn or fail.
- The `Query.reactorDrive` resolver in `resolvers.ts` accepts a `consistencyToken` via context but never forwards it to `reactorClient.get`. Either remove the field from the context type or actually thread it through (`reactorClient.get(driveId, consistencyToken)`). Right now it is a documented-but-unhonored contract.

### 11. CLAUDE.md inline-comment violation

`packages/reactor/src/storage/kysely/document-indexer.ts` `handleRemoveRelationshipSubtree` contains an inline narrative comment ("Walk the subtree iteratively…") — the package CLAUDE.md says: "Avoid adding new inline comments. Prefer comments on function and class declarations when they add clarity." Either delete the inline blob or hoist a short JSDoc onto the method.

### 10. Missing tests for new executor handlers

`packages/reactor/src/executor/document-action-handler.ts` gained two ~120-line handlers (`executeUpdateRelationship`, `executeRemoveRelationshipSubtree`) and the existing test in `packages/reactor/test/executor/document-action-handler.unit.test.ts` (if present, per the `unit.test.ts` convention) doesn't exercise either path. Without a direct executor test we have no coverage for: source-must-be-document validation, write-cache slicing (`UPDATE_RELATIONSHIP` is not in `STRICT_ORDER_ACTION_TYPES`-related cache-invalidation list — verify whether it should be), and JOB_FAILED behavior on a missing source.

### 9. Missing test for `setPreferredEditorOnNode`

`ReactorDriveClient.setPreferredEditorOnNode` is implemented but not covered by `packages/reactor-drive/test/reactor-drive-client.test.ts`.

### 8. No end-to-end reactor-drive client test

Every reactor-drive test mocks `IReactorClient`. The whole class of bugs in finding 21 (action handler rejecting non-document sources) is unreachable from this suite. A single integration test that wires `ReactorDriveClient` to a real `Reactor` with an in-memory operation store would have caught it.

### 7. `removeNode` (folder) orphan risk

`reactor-drive-client.ts` removes the subtree relationship first, then iterates and calls `reactor.deleteDocument(file.id, "cascade", signal)` per file. If any of the per-file deletes fails (network, transient executor error, abort signal), the file documents remain in storage with no parent relationship → orphan PHDocuments. Either: (a) sequence the deletes before the subtree removal, (b) gather successful deletes for compensating logic, or (c) batch the delete jobs and surface a partial-failure result. At minimum document the failure mode.

### 6. `copyNode` has no cycle guard

If `targetParentFolderId` is `srcNodeId` or any descendant of it, the new tree is pathological (a folder copied into itself) — there is no precondition check. Easy to add: walk `getDescendants(srcNodeId)`, reject if target is in that set or equal to source.

---

## LOW / MINOR

### 5. `orderLegacyNodes` recursion

`packages/reactor-drive/src/migration/migrate-legacy-state.ts` orders nodes via recursive DFS. For pathological legacy drives (long parent chains) this can blow the JS stack. Convert to an explicit stack.

### 4. Migration query fan-out

`migrateLegacyDriveState` awaits `readModel.getNode` once per legacy node before deciding whether to emit. For N nodes that is N sequential round-trips. Prefer a single `listChildren(... all parents)` or `getNodes(ids)` call up front, then filter.

### 3. Duplicated boilerplate across relationship handlers

`document-action-handler.ts` now has four near-identical ~100-line blocks (Add / Remove / Update / RemoveSubtree). The shared steps (validate source is document, load state via write cache, build context with `documentId: input.sourceId`, scope `"document"`, `branch: job.branch`, append operation) cry out for a `withRelationshipAction(...)` helper. Cleanup, not a blocker.

### 2. Double-stringify in `reactor-drive` module wiring

`packages/reactor-drive/src/module.ts` uses `JSON.stringify(JSON.stringify(initialGlobalState))`. This mirrors the legacy document-model pattern but is worth a one-line comment confirming intent — readers will reach for the same "extra `JSON.stringify` is a bug" reflex I did.

### 1. Bench script in `package.json` with no runner

`packages/reactor-drive/package.json` adds `"bench": "..."` (or similar) — verify it's wired to a real entry point and not just scaffolding.

---

## Documentation summary (one-stop)

- `addRelationshipAction` JSDoc — refresh for generic edge semantics.
- `removeRelationshipSubtreeAction` JSDoc — specify behavior for cross-edges leaving the subtree.
- `IDriveClient.listNodes` JSDoc — define what `undefined` means (root vs all) and align with implementation.
- `ReactorDriveResolverContext.consistencyToken` — either remove or honor.
- Drop the inline narrative comment in `handleRemoveRelationshipSubtree`.
- `DocumentDriveState.nodes` `@deprecated` reason: good — it points readers to the reactor-drive subgraph. Consider also linking the migration helper in the message.

---

## Suggested fix order

1. Sweep findings 18, 17, 14, 12, 11 — small, mostly mechanical.
2. Address the rest as polish before the PR.

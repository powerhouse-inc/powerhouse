# Gap Report: API References — Reactor Client

**Date:** 2026-05-05
**Reviewed:** `apps/academy/docs/academy/04-APIReferences/02-ReactorClient.md`
**Against:** `packages/reactor-browser`, `packages/reactor`
**Focus:** IReactorClient interface methods, parameter and return types

---

## Findings

| #   | Urgency  | Type      | Doc location                                                    | Source location                                | Finding                                                                                                                                                                                                                                                                                         |
| --- | -------- | --------- | --------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `medium` | `stale`   | `Subscriptions > subscribe` — `DocumentChangeType` values table | `packages/reactor/src/client/types.ts:28-36`   | Table's `Value` column lists enum member names (`Created`, `Updated`, etc.) instead of the actual runtime string literals (`"created"`, `"updated"`, `"parent_added"`, etc.). The example code using `DocumentChangeType.Updated` is correct TypeScript, but the reference table is misleading. |
| 2   | `medium` | `stale`   | `Common parameter types > JobInfo` inline type block            | `packages/reactor/src/shared/types.ts:76-98`   | `JobInfo` in source has two additional fields not in the doc: `errorHistory?: ErrorInfo[]` and `result?: any`. The documented type block is incomplete.                                                                                                                                         |
| 3   | `medium` | `missing` | Not documented anywhere                                         | `packages/reactor/src/client/types.ts:478-481` | `loadBatch(request: BatchLoadRequest, signal?: AbortSignal): Promise<BatchLoadResult>` is a full method on `IReactorClient` with no mention in the doc.                                                                                                                                         |
| 4   | `high`   | `missing` | Not documented anywhere                                         | `packages/reactor/src/client/types.ts:177-178` | The `readonly drives: IDriveClient` property on `IReactorClient` is not mentioned. The doc covers `createDocumentInDrive` but not the `client.drives` surface that replaces it.                                                                                                                 |
| 5   | `high`   | `stale`   | `Write methods > createDocumentInDrive` — no deprecation notice | `packages/reactor/src/client/types.ts:320-333` | `createDocumentInDrive` carries `@deprecated` in source: "Use `IDriveClient.addFile` via `client.drives.addFile` instead. This method will be removed in a future release." The doc presents it as a normal current method.                                                                     |

---

## Verified clean

- `get` — parameter names, types, return type: exact match
- `find` — all four parameters and return type: exact match
- `getOutgoingRelationships` — all five parameters and return type: exact match
- `getIncomingRelationships` — all five parameters and return type: exact match
- `getOperations` — all five parameters and return type: exact match
- `getDocumentModelModules` / `getDocumentModelModule` — parameters and return types: exact match
- `create` — parameters and return type: exact match
- `createEmpty` — parameters (`documentModelType`, `options?`, `signal?`) and return type: exact match
- `execute` — parameters and return type: exact match
- `executeAsync` — parameters and return type: exact match
- `rename`, `addRelationship`, `removeRelationship`, `moveRelationship` — all exact match
- `deleteDocument`, `deleteDocuments` — exact match
- `subscribe` — parameters and unsubscribe return type: exact match
- `getJobStatus`, `waitForJob` — exact match
- `ViewFilter`, `SearchFilter`, `PagingOptions`, `PagedResults<T>` — all type shapes exact match
- `PropagationMode` enum values (`none`, `cascade`): exact match
- `CreateDocumentOptions`, `OperationFilter`, `DocumentChangeEvent` — exact match
- `IReactorClient` re-exported correctly from both `@powerhousedao/reactor` and `@powerhousedao/reactor-browser`
- Pagination, AbortSignal, and `waitForJob` examples — argument shapes and method names all valid

---

## Could not verify

- Whether `waitForJob` treats `WRITE_READY` as non-terminal — requires runtime inspection of `JobAwaiter`
- `DocumentChangeType` import in subscribe example — not shown in the example but the type is exported from both packages, so it would work if imported

---

## Summary

**5 findings (3 stale, 2 missing).** Method signatures are overwhelmingly accurate — the drift is concentrated in the reference tables and peripheral types: `DocumentChangeType` string values are misrepresented, `JobInfo` is missing two fields, `loadBatch` and the `drives` property are entirely absent, and `createDocumentInDrive` is presented without its `@deprecated` status.

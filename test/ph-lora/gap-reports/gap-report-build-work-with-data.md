## Gap Report: Build — Work With Data

Reviewed: docs/academy/03-Build/04-WorkWithData (01-ConfiguringDrives, 03-UsingSubgraphs, 04-BuildingAProcessor, 05-ProcessorBestPractices, 06-RelationalDbProcessor; `_`-prefixed draft/archive folders ignored)
Against: packages/reactor, packages/reactor-api, packages/analytics-engine, packages/shared (processor/operation types resolve to `@powerhousedao/shared`; re-exported via `@powerhousedao/reactor` → `@powerhousedao/reactor-browser`)
Focus: Drive configuration, processor interface, subgraph API, relational DB processor, analytics engine query syntax, GraphQL schema shape

### Findings

| # | Urgency | Type | Doc location | Source location | Finding |
|---|---------|------|-------------|-----------------|---------|
| 1 | high | wrong | `06-RelationalDbProcessor.md` "Breaking down this command" (lines 30-31) | `clis/ph-cli/src/commands/generate-processor.ts:43,49` | Bullets describe the command as `--processor todo-indexer` and `--processor-type relationalDb`, but the actual flags are `--name` (`-n`, line 43) and `--type` (line 49). The doc's own command line 25 correctly uses `--name todo-indexer --type relationalDb`; the explanatory bullets contradict it and reference non-existent flags. |
| 2 | medium | stale | `06-RelationalDbProcessor.md` line 45 ("define your database schema in the `processors/todo-indexer/migration.ts` file") | `packages/codegen/src/templates/processors/relational-db/migrations.ts` | Generated migration file is `migrations.ts` (plural), as the same doc states at lines 39, 92, and 207. Line 45 refers to `migration.ts` (singular), which does not get generated. |
| 3 | medium | stale | `06-RelationalDbProcessor.md` "Example of generated types" (lines 108-116, `export interface Database`) | `packages/codegen/src/templates/processors/relational-db/schema.ts:10` | The generated root schema interface is named `DB`, not `Database`. The doc's own processor example imports `import type { DB } from "./schema.js"` (line 205), so the `Database` name in the generated-types example is inconsistent with both the template and the rest of the doc. |

### Verified clean

- `IProcessor` interface — `onOperations(operations: OperationWithContext[]): Promise<void>` and `onDisconnect(): Promise<void>` match `packages/shared/processors/types.ts:47-59` (04-BuildingAProcessor lines 9-14, 78-104; 05 lines 88-115).
- `ProcessorFilter` type — optional arrays `documentType?`, `scope?`, `branch?`, `documentId?` match `packages/shared/processors/types.ts:37-42` (04 lines 61-68).
- `ProcessorRecord` type — `{ processor, filter, startFrom? }` with `startFrom: "beginning" | "current"` matches `packages/shared/processors/types.ts:64-68` (04 lines 136-172, "current" usage line 168).
- `ProcessorFactory` shape — `(driveHeader: PHDocumentHeader, processorApp?: ProcessorApp) => Promise<ProcessorRecord[]>` matches `packages/shared/processors/types.ts:74-77` (04 lines 124-142; 06 lines 140-145 include the optional `processorApp?: ProcessorApp` second arg).
- `IProcessorHostModule` reference table (05 lines 262-284) — `analyticsStore: IAnalyticsStore`, `relationalDb: IRelationalDb`, `processorApp: ProcessorApp`, `dispatch: IProcessorDispatch`, `getReadModel<T>(name: string): T`, `config?: Map<string, unknown>` match `packages/shared/processors/types.ts:23-30` field-for-field.
- `IProcessorDispatch.execute` signature (05 lines 29-37) — `execute(docId, branch, actions, signal?, meta?): Promise<ProcessorDispatchResult>` matches `packages/shared/processors/types.ts:13-21`.
- `ProcessorDispatchResult` type (05 lines 39-42) — `{ id: string; status: string }` matches `packages/shared/processors/types.ts:8-11`.
- `OperationContext` fields (04 lines 39-46) — `documentId`, `documentType`, `scope`, `branch`, `ordinal: number`, `resultingState?: string` match `packages/shared/document-model/operations.ts:296-305`.
- `OperationWithContext` shape (04 lines 33-56) — `{ operation, context }` matches `packages/shared/document-model/operations.ts:307-310`.
- `Operation` fields documented (04 lines 48-56: `action`, `index`, `timestampUtcMs`, `hash`) match `packages/shared/document-model/operations.ts:249-284` (additional `id`, `skip`, `error`, `resultingState` exist but omitting them is incompleteness, not drift).
- `RelationalDbProcessor` class — abstract base with `initAndUpgrade()`, `onOperations()`, `onDisconnect()`, static `getNamespace(driveId)`, static `query(driveId, db)` matches `packages/shared/processors/relational/types.ts:60-123` (06 lines 210-257, 321-323; lifecycle list lines 188-194).
- `IRelationalDb` type — exported and carries `createNamespace`/`queryNamespace`; matches `packages/shared/processors/relational/types.ts:27-34` (06 lines 61, 74 `IRelationalDb<any>`).
- Re-export claim — `IProcessor`, `IProcessorHostModule`, `IRelationalDb`, `ProcessorFactory`, `ProcessorFilter`, `ProcessorRecord` (types) and `RelationalDbProcessor` (value) are all re-exported from `@powerhousedao/reactor-browser` via `packages/reactor-browser/src/re-exports.ts:1-43`.
- `OperationWithContext` / `PHDocumentHeader` import from `document-model` — `packages/document-model/index.ts` re-exports `@powerhousedao/shared/document-model` (which exports both via `operations.js` and `documents.js`).
- `PHDocumentHeader` fields used (`id`, `name`, `documentType`) — match `packages/shared/document-model/documents.ts:37-75` (04 line 148; 06 line 148).
- `ProcessorApp` from `@powerhousedao/common` — re-exported at `packages/common/types.ts:1` from `@powerhousedao/shared/processors` (06 line 137).
- `BaseSubgraph` import from `@powerhousedao/reactor-api` with `reactorClient` and `relationalDb` members — match `packages/reactor-api/src/graphql/base-subgraph.ts:23,36,38`, exported via `packages/reactor-api/src/graphql/index.ts` (03 lines 108-111; 06 lines 305-312).
- `reactorClient.getOutgoingRelationships(sourceIdentifier, relationshipType, ...)` returning `.results` — signature `packages/reactor/src/client/types.ts:279-285` returns `PagedResults<PHDocument>`, and `PagedResults.results` is `T[]` at `packages/reactor/src/shared/types.ts:152-153` (03 lines 120-125).
- `doc.header.documentType` / `doc.header.id` access on relationship results (03 lines 126, 134) — `PHDocument` header carries `documentType` and `id` per `packages/shared/document-model/documents.ts:43,58`.
- `getReadModel` default read-model names (05 lines 173-178) — `"document-view"` (`document-view.ts:46`), `"document-indexer"` (`document-indexer.ts:51`), `"processor-manager"` (`processor-manager.ts:63`), `"subscription-notification"` (`subscription-notification-read-model.ts:15`); read model `name` equals `readModelId` per `base-read-model.ts:35`.
- `ph generate subgraph --name <n>` (03 line 43; 06 lines 267) — `generate-subgraph` subcommand registered at `clis/ph-cli/src/commands/generate.ts:19`.
- `ph generate migration-file --path <p>` (06 line 92) — flag `long: "path"` confirmed at `clis/ph-cli/src/commands/generate-migration-file.ts:11`; subcommand registered at `generate.ts:20`.
- `/graphql/analytics` subgraph existence referenced in reactor startup log (03 line 72) — `AnalyticsSubgraph` defined at `packages/reactor-api/src/graphql/analytics-subgraph.ts:12`.

### Could not verify

- GraphQL playground responses, drive-creation mutations (`DocumentDrive { createDocument }`, `addDrive`, `TodoList_createDocument`, `TodoList_addTodoItem`), and the `ToDoList`/`TodoList` query/mutation field names (01 lines 88-141; 03 lines 198-382; 06 lines 389-563) — these are generated by the document-model subgraph at runtime and depend on the user's generated todo-list model, not on a static export in the scoped source. Note the response block at 06 lines 525-563 mixes a `todos` array result into a query that only selects `TodoList.getDocument`, and uses both `getDocument` (line 498) and `getDocuments`/`ToDoList.getDocuments` prose (line 569) — runtime/example-construction issues that cannot be statically anchored to a source field name.
- Analytics engine query syntax — no non-archive doc file in this section documents analytics-engine query syntax (the only analytics query material lives under the ignored `_06-Analytics Engine/` archive folder), so there is nothing in-scope to check against `packages/analytics-engine/core` or `graphql`.
- `dispatch.execute()` "calls `reactorClient.executeAsync()`" claim (05 line 45) and "`reactorClient.execute()` waits for READ_READY" claim (05 line 137) — these are runtime-behavior assertions about the host-module dispatch implementation, not statically anchorable to the type definitions read in this review.

### Summary

3 findings (0 stale on exports / 2 stale on file-path & generated-type-name, 0 missing, 1 wrong). Net: the processor interface, host-module, relational-DB processor, and subgraph type surfaces are accurately documented and match `@powerhousedao/shared`; all defects are confined to the relational-DB processor tutorial's CLI-flag breakdown and two file/type-name inconsistencies that contradict the same document elsewhere.

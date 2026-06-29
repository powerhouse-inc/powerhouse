## Gap Report: Reference — GraphQL & Data

Reviewed: docs/academy/04-Reference/03-GraphQLData (04-RelationalDatabase.md, 07-SubgraphMigrationGuide.md)
Against: packages/reactor-browser (src/relational), packages/reactor-api (src/graphql)
Focus: Relational database helper API, query types and hook signatures, subgraph migration guide (removed or renamed exports, before/after samples)

### Findings

| # | Urgency | Type | Doc location | Source location | Finding |
|---|---------|------|-------------|-----------------|---------|
| 1 | low | stale | `createProcessorQuery` signature `): TypedQueryHook<Schema>` (04-RelationalDatabase.md:161) | `relational/utils/createProcessorQuery.ts:27-106` | Documented return type `TypedQueryHook<Schema>` does not exist anywhere in source. `createProcessorQuery` returns an inline `useQuery` function (anonymous type); there is no exported/named `TypedQueryHook`. The name is illustrative-only, but a reader cannot import or reference it. |
| 2 | low | stale | `useRelationalDb<Schema>(): IRelationalDbState<Schema>` (04-RelationalDatabase.md:235) | `relational/hooks/useRelationalDb.ts:15` | `IRelationalDbState` is declared as a bare `interface` (not `export interface`), so it is not re-exported through `relational/index.ts`. The documented return-type name cannot be imported. The hook itself and the shape (`db`/`isLoading`/`error`) are correct. |
| 3 | low | stale | `useRelationalQuery` signature block shows `error: Error | undefined` (04-RelationalDatabase.md:318) while its own Return Value block shows `error: Error | null` (04-RelationalDatabase.md:365) | `relational/hooks/useRelationalQuery.ts:52,125-126` | Internal inconsistency: source declares local state `error: Error | undefined` (line 52) but returns `error: error || relationalDb.error` where `relationalDb.error` is `Error | null`, so the effective return is `Error | null`. The first signature block (`Error | undefined`) is the less accurate of the two. |

### Verified clean

- `createProcessorQuery` — exported from `relational/utils/createProcessorQuery.ts:27` via `utils/index.ts` and `relational/index.ts`; generic param (`TSchema`), returned-hook params (`driveId`, `queryCallback`, `parameters`, optional `options`) match source.
- `useRelationalDb` — exported (`relational/hooks/useRelationalDb.ts:38`); return shape `{ db: RelationalDbWithLive<Schema> | null; isLoading; error }` matches doc.
- `useRelationalQuery` — exported (`relational/hooks/useRelationalQuery.ts:40`); param list (`ProcessorClass`, `driveId`, `queryCallback`, `parameters?`, `options?`) and return keys (`isLoading`, `error`, `result`) match doc.
- `useRelationalQueryOptions` — type `{ hashNamespace?: boolean }` matches source exactly (`useRelationalQuery.ts:14-17`).
- `QueryCallbackReturnType` — `{ sql: string; parameters?: readonly unknown[] }`; doc's raw-SQL example (`{ sql, parameters }`) matches (`useRelationalQuery.ts:9-12`).
- `RelationalDbWithLive<Schema>` — exported type (`useRelationalDb.ts:11`); doc references it as `db` type, correct.
- `RelationalDbProcessorClass` / `IRelationalQueryBuilder` — exist in `@powerhousedao/shared/processors` (`packages/shared/processors/relational/types.ts:12,41`); static `query(driveId, db)` confirmed at line 79, consistent with `useRelationalQuery.ts:104`.
- Import path `@powerhousedao/reactor-browser/relational` — confirmed against `src/relational/index.ts` barrel.
- Migration guide reactor subgraph path `/graphql/r` — subgraph `name = "r"` (`graphql/reactor/subgraph.ts:40`).
- Reactor operations `document(identifier, view)`, `documentOutgoingRelationships(sourceIdentifier, relationshipType, ...)`, `documentIncomingRelationships(targetIdentifier, ...)`, `findDocuments(search, view, paging)`, `createDocument(document, parentIdentifier)`, `mutateDocument(documentIdentifier, actions, view)`, `pollSyncEnvelopes(channelId, outboxAck, outboxLatest)`, `touchChannel(input)`, `pushSyncEnvelopes(envelopes)` — all present in `graphql/reactor/schema.graphql:343-459` with argument names matching the guide.
- `documentChanges(search, view)` subscription — present (`schema.graphql:464`).
- `TouchChannelResult { success, ackOrdinal }` and `PollSyncEnvelopesResult { envelopes, ackOrdinal }` — match guide's selected fields (`schema.graphql:330-332,121-123`).
- v6 custom-subgraph pattern (`getResolvers(subgraph: BaseSubgraph)`, `subgraph.reactorClient`, `schema.ts` with `gql` tagged `DocumentNode`, `index.ts` extending `BaseSubgraph`) — matches codegen templates `templates/subgraphs/custom-resolvers.ts:9-24`, `custom-schema.ts:11-27`, `index-file.ts:12-20`.
- `BaseSubgraph` exported from `@powerhousedao/reactor-api` with `reactorClient: IReactorClient` and `relationalDb: IRelationalDb` fields (`graphql/base-subgraph.ts:23,36,38`); guide's "Key differences" table (`subgraph.reactorClient`, `subgraph.relationalDb`) confirmed.
- `reactorClient.getOutgoingRelationships(...)` used in guide's v6 resolver example — exists (`packages/reactor/src/client/reactor-client.ts:290`, `types.ts:279`).
- Guide's claim that legacy strand-based sync (`registerPullResponderListener`, `system.sync.strands`) was removed — current `system` subgraph (`graphql/system/subgraph.ts`) no longer contains those operations; consistent.
- `ph generate --subgraph <name>` scaffolding command — codegen subgraph file-builders exist (`packages/codegen/src/file-builders/subgraphs.ts`).

### Could not verify

- Legacy `/graphql/document-drive` and `/graphql/system` endpoint shapes (`drive { nodes }`, `addDrive`, `system { sync { strands } }`) — the legacy hardcoded subgraphs have been removed from source, so the "Legacy" before-samples cannot be diffed against current code (expected for a migration guide describing removed APIs).
- `db.live.query(...)` runtime behaviour and live-update semantics of `LiveQueryResults` (PGlite live extension) — requires runtime, type defined in external `@electric-sql/pglite/live`.
- Auto-generated document-model subgraph operations (`<ModelName> { document, documents, createDocument, addTodoItem, ... }`) — these are generated per registered model at runtime, not statically present in the reviewed source; argument shapes could not be statically anchored.

### Summary

3 findings (3 stale, 0 missing, 0 wrong), all low urgency. The relational hook API and the subgraph migration guide are in strong agreement with source — every hook name, GraphQL operation, argument shape, and the v6 custom-subgraph pattern verified clean. The only drift is two cosmetic return-type names used in signature illustrations (`TypedQueryHook`, unexported `IRelationalDbState`) and one internal `Error | undefined` vs `Error | null` inconsistency; none would block a developer following the doc.

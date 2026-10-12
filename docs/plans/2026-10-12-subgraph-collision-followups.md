# Subgraph collision follow-ups

Follow-ups to PR #3210 (`fix/subgraph-name-collisions`, head 7510a51b20), which refuses subgraph
name and type collisions instead of silently shadowing them. Findings were confirmed by probe tests
against that head. Line references are to it.

## Decisions

| # | Question | Decision |
|---|----------|----------|
| D1 | Where core protection lands | Stage 1 goes into #3210; stages 2–4 in a PR stacked on it |
| D2 | Drive page promise with withheld rows | Fill up to a scan cap |
| D3 | `reactorDrive` on missing / denied / outage | `null` for all three |
| D4 | Where a colliding model is refused | GraphQL schema only; the model stays usable in the reactor |
| D5 | Host subgraph colliding with core | Refused, not parked |
| D6 | Host or package subgraph colliding with a model's types | Subgraph refused (#3210 rule) |

## PR sequence

| PR | Base | Content |
|----|------|---------|
| P1 | #3210 branch | Precedence stage 1 (core protection). Blocks #3210 merge |
| P2 | stacked on #3210 | Precedence stages 2–4 |
| P3 | main | Unhandled rejections + `updateRouter(true)` hang |
| P4 | main | `reactorDrive` null for missing/denied/outage |
| P5 | main | Drive listing: cursor anchor, `kind` in SQL, fill to scan cap |

P3–P5 are independent of #3210. P4 and P5 touch `packages/reactor-drive/src/subgraph/resolvers.ts`,
which #3210 renames `ReactorDrive` → `ReactorDriveInfo` in; expect a trivial conflict.

## Precedence (P1, P2)

### Problem

Load order does not make core win.

- Boot models reach the reactor before `GraphQLManager.init` (server.ts:1603-1613) and are cached
  before core registers (graphql-manager.ts:418-421, 533). `#admit` type-checks core (:797).
- A boot model named like a core type refuses the whole core subgraph: no route, no in-process
  handler, no supergraph entry, never restored. This holds with `enableDocumentModelSubgraphs=false`.
  On main the same collision dropped one type and `r` kept serving, so this is a #3210 regression.
- A hot-loaded colliding model drops core from the supergraph only; routes stay; restored on removal.
- Reachable core names (any `T` with `pascalCase(T) === T`): 64 of 66 `r` types (`Revision`,
  `Action`, `ActionContext`, `JobInfo`, `SyncEnvelope`, `ReactorOperation`, `OperationContext`, …),
  `SystemInfo`, all 11 analytics types (incl. `Value`, `Dimension`), all 6 auth, all 21 inspection.
- A model named `Query`/`Mutation`/`Subscription` refuses every subgraph declaring that root.
- A model named `Signer`, `Operation`, `IDocument`, `SignerUser`, `SignerApp`, `PHOperationContext`,
  `GqlDocument` or `DriveDocument` has its own document type silently dropped by generated keep-first
  dedupe.
- Every switchboard host registration (server.mts:1091, 1215, 1247; privacy.mts:165) runs after
  `initializeAndStartAPI`, so boot models and packages always beat hosts; hot-loaded ones lose.
- Core name reservation holds in practice (only server.ts:550 builds the manager, core first) but
  not by construction:
  - late `core=true` registration is not checked against non-core (:775-779) and never mounted (:1400);
  - a non-core subgraph registered before `init` splits route/handler (core) from supergraph (host),
    because `#getAllSubgraphs` lets non-core override core by path (:1644-1660);
  - a type-refused core subgraph frees its name (a model "R" takes `r`);
  - the `''` bucket is checked only against itself (:689-693), and `executeSubgraphQuery` resolves
    to whichever handler was set first (:1516-1530); `renown-read-model` registers there.
- The AsyncLocalStorage re-entrancy escape leaks into work a hook detaches (e.g. a timer), which
  later runs inline mid-change. Only third-party hooks can reach it today.

### Stage 1 (P1, into #3210)

- `create-schema.ts`: `reservedTypeNames(coreTypeDefs)` = root types + fixed generated types +
  registered core subgraph types. Export it.
- `GraphQLManager.init`: register core without the model type check; filter models whose generated
  names hit a reserved name out of the single model list feeding both `#generated()` and
  `#setupDocumentModelSubgraphs`; error-log each refused model. Apply the same filter on regeneration.
- Tests: models named `Revision`, `Query`, `Signer`, `SystemInfo` at boot and hot-loaded; core keeps
  route, handler and supergraph entry; model refused with an error log; model remains in the reactor.
- No change to #3210's name-ownership semantics or tests.

### Stages 2–4 (P2, stacked)

2. Rank-based names: `#rank(origin)` with core > host > document-model > package replaces the
   model-reclaims-from-package special case (:784-786). Higher rank evicts through the existing path
   (:836) with an error log; lower rank is refused. Run `#restorePackageSubgraphs` after
   `#teardownPackage` and host removal, not only after regeneration (:570). Flip tests ~2156 and
   ~2282; add host-evicts-boot-model and evicted-package-heals tests.
3. Core-vs-any name check across both maps; mount late core registrations; stop non-core overriding
   core in `#getAllSubgraphs`; check `''` against `graphql`. Tests for pre-init and late-core cases.
4. `#serialize`: store a per-change `{ active }` token in AsyncLocalStorage, cleared in `finally`, so
   detached work enqueues normally. Add the timer-leak test.

## Unhandled rejections (P3)

- `packages/reactor-api/src/server.ts:649` `void graphqlManager.regenerateDocumentModelSubgraphs()`
  has no `.catch` (on main since 3611b08df02). Add `.catch` logging via `defaultLogger`, as at :653.
  Keep the manager's rethrow.
- `server.ts:662` `onProcessorsChange` detached async IIFE has no try/catch; wrap each await.
- Impact on Node 24 defaults: with `fatalErrorShutdown` the host exits 1; with `SENTRY_DSN` Sentry's
  warn-only listener keeps it alive; `dev.ts` and embedded hosts crash.
- `packages/reactor-api/src/packages/util.ts:179` debounce never settles a superseded call's promise.
  `apps/switchboard/src/server.mts:1124` awaits `updateRouter()` in `onComposed`; another refresh
  within 1s means `composed.start()` never runs. Change to `updateRouter(true)` (as :1260). Leave the
  helper: `vite-loader.mts:185` shares it with per-package arguments.
- Tests: rejecting `getDocumentModelModules` through the listener; throwing processor factory
  builder; debounce semantics pinned.

## reactorDrive null (P4)

`resolvers.ts:124` calls `reactorClient.get` before `serves` (:130). Missing throws
`DocumentNotFoundError`; denied returns null because `get` strips scopes. Call `serves` first, then
`get`, and return null on any failure including a reactor outage. Tests: identical null for missing,
denied, host-refused, missing + host-refused.

## Drive listing (P5)

- `DriveNodeView.listChildren` builds `nextCursor` from the last scanned row
  (`drive-node-view.ts:137`). The cursor is base64 JSON and a file node id is its document id, so a
  withheld document's id leaks. Anchor on the last served row.
- `kind` is filtered after paging (`resolvers.ts:189`, `:204`). Add `kind?` to
  `IDriveReadModel.listChildren` (`interfaces.ts:27`); `idx_drive_node_parent_kind_id` covers it.
  Update `EmptyDriveReadModel` (`reactor-api/scripts/convert-hub-dump.ts:185`) and the test mock.
- Fill to a scan cap: the resolver keeps fetching until the page is full, the stream ends, or a cap of
  a few times `limit` rows is scanned; then returns anchored on the last served row. `hasMore` means
  rows exist after the anchor; the last page may be empty.
- Gate through the reactor's one read gate, batched as in `gateEdges`
  (`reactor-client.ts:2016-2031`). Never in SQL.
- Tests: decoded `nextCursor` never names a withheld id; an all-withheld window advances; `FILE`
  `limit: 1` non-empty when a file exists; `FOLDER` page makes no gate calls; scan-cap hit returns a
  valid anchor; `listChildren` with `kind` plus keyset cursor.

## Out of scope, not yet planned

- One model with an unparseable state schema breaks the schema build for every subgraph.
- Collisions between non-generated subgraph types (a package `type Revision` vs `r`'s) are unchecked;
  outcome depends on the gateway adapter.
- `packages/reactor-api/src/packages/package-manager.ts:630` `void this.loadPackages(...)`.
- `vite-loader.mts` async watcher listeners (~:293, :320) have no catch.

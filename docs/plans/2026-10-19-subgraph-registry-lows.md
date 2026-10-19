# Subgraph registry lows

Four fixes in the GraphQL subgraph registry of reactor-api. Each section gives the root cause, the fix and the tests.

## 1. Removing a package mid-load re-adds it

Root cause:
- `PackageManager.getDebouncedUpdateCallback` checks `subscribedPackages.has(pkg)` only before the update runs. The four `update*ForPackage` functions await the loaders and then write the package back into the maps and emit, so `removePackage` (or a reload that drops the package) during the await is undone.
- `loadPackages` has the same shape: it loads every package, then writes all maps and sets `subscribedPackages = new Set(packages)`, so a `removePackage` during the load is undone. Two overlapping `loadPackages` calls (a config reload during `init`, or two config edits close together) also race: the one that finishes last wins, even if it started first, and re-adds packages the newer one dropped.
- `VitePackageLoader.#watcherListener`: the unsubscribe only removes the watcher listener. A reload already scheduled by the debounce still fires afterwards, loads, and calls the unsubscribed handler; a reload in flight at unsubscribe calls it too.

Fix:
- Each `update*ForPackage` re-checks `subscribedPackages.has(pkg)` after its awaits and before any map write or emit. The pre-check stays, to skip the load.
- `loadPackages` runs serialized through a promise chain that tolerates a failed run, so overlapping reloads apply in call order. `removePackage` records the package in `removedDuringLoad`, a set cleared when each serialized load starts; the load filters those packages out of the loaded maps, the subscription list and its result.
- `VitePackageLoader` gets one `#watch(label, matches, load, handler, options)` helper that owns the three watcher events and returns the unsubscribe. A `subscribed` flag, cleared by unsubscribe, is checked before the load and again before calling the handler, so a pending reload fires into a no-op and an in-flight one drops its result.
- `debounce` is unchanged. A `cancel` would have to leave superseded callers' promises unsettled (or reject them into `void` callers as unhandled rejections), a new semantic for a shared helper that `graphql-manager.ts` also awaits; the flag gives the same observable result.

Tests:
- `test/package-manager-removal-race.test.ts`, with a loader whose loads can be held: an in-flight subgraphs update and an in-flight document-models update do not re-add a removed package; a reload in flight does not re-add a removed package (maps and `subscribedPackages`); an earlier reload finishing last does not overwrite a newer one.
- `test/vite-loader-unsubscribe.test.ts`, for all four `on*Change` methods: unsubscribing before the debounce fires means no load and no handler call; unsubscribing while the load is in flight means no handler call.

## 2. Type ownership at init

**Root cause**
- `GraphQLManager.init` builds only the core subgraphs' handlers (`#setupCoreSubgraphs`), registers the boot document-model subgraphs, then calls `#createSupergraphGateway`. The stitching and mercurius adapters build the first supergraph from the definitions right there.
- `#getSupergraphSubgraphs` resolves claim ownership over built subgraphs only (those in the handler cache). Boot model subgraphs and subgraphs registered before `init` are not built yet, so they claim nothing, can never lose a claim, and join the first supergraph beside the subgraph that owns their types or root fields.
- A router update (`_updateRouter`, used after regeneration, hot load and package changes) builds core and non-core subgraphs before `updateSupergraph`, so it excludes the loser. The first supergraph therefore differed from every later one until the debounced update replaced it.

**Fix**
- In `init`, run `#setupSubgraphs(this.subgraphs)` after the model subgraphs register and before `#createSupergraphGateway`, unconditionally (pre-init host subgraphs exist with model subgraphs off). Init now matches `_updateRouter`'s order; the trailing `updateRouter()` finds every handler cached.
- `#getSupergraphSubgraphs` is unchanged: a subgraph whose schema fails to build still claims nothing and is excluded where its module is built.

**Tests** (`test/graphql-manager-boot-ownership.test.ts`, gateway mock that builds on handler creation like stitching/mercurius)
- A host subgraph registered before init redefining `PagingInput` is absent from the first supergraph, logged as losing to `r`, and every later supergraph equals the first.
- A host subgraph registered before init claiming `TodoListQueries`/`Query.todoList` excludes the boot `TodoList` model subgraph from the first supergraph, matching later updates.

## 3. Supergraph stream: linked federation names, lone entity extensions, subscription-only sets

Root cause
- (a) The stream schema strips federation directives by a fixed name list plus the `federation__` prefix. Names a `@link` to the federation spec brings in under another name are kept: an import alias (`{ name: "@shareable", as: "@share" }`) and the namespace prefix of a link with `as: "fed"` (`@fed__shareable`). The isolation build then rejects the subgraph (`Unknown directive "@share"`), so it drops out of `/graphql/stream`. The `@link` schema extension itself and default-namespace names (`@federation__key`) were already stripped.
- (b) `extend type X @key(...)` merges correctly when another subgraph in the set defines X. When none does, the isolation build fails with `Cannot extend type "X" because it is not defined` and the subgraph is excluded. Root types already get an empty definition for this case. Other types do not.
- (c) `mergeStreamSubgraphs` returns `undefined` when no subgraph defines or extends `Query`, so a set with only Subscription roots mounts no stream. A fieldless `type Query` is not a fix on its own: graphql 16 `validateSchema` rejects it ("must define one or more fields"), and graphql-sse validates on every request.

Fix
- (a) `stripFederationDirectives` reads every `@link` on a schema definition or extension whose `url` is under `specs.apollo.dev/federation/`. Each link adds its import aliases (`as ?? name`, without `@`, directive imports only) and its namespace prefix (`<as ?? "federation">__`) to the names it strips. The default list, the `federation__` prefix and the guard for directives the subgraph declares itself are unchanged. Directives of other linked specs stay out of scope.
- (b) `withoutFederationDirectives` turns an object type extension into a definition when no subgraph in the set defines that type and it is not a root. Roots keep the empty definition `mergeStreamSubgraphs` adds. Two subgraphs that extend the same missing type each get a definition, and the merge combines them like any other shared type.
- (c) When nothing defines or extends `Query`, `mergeStreamSubgraphs` adds `type Query { _stub: Boolean }`. This is the same placeholder shape `filterBuildableSubgraphs` uses. It returns `undefined` only for an empty set, because `mergeSubgraphSchemas` throws on zero subgraphs. The `graphql-manager.ts` comment at the `undefined` branch ("Nothing left contributes a Query root") becomes stale; it now means "no subscription subgraph is left".

Tests
- New `test/sse-stream-schema.test.ts` runs the manager's pipeline (`withoutFederationDirectives` → `filterBuildableSubgraphs` → `mergeStreamSubgraphs`) and executes queries over the SSE handler. It covers an import alias, an `as` namespace, the default namespace, a self-declared directive that is kept, a lone entity extension, an extension merged into its base, a subscription-only set, and the empty set.
- `test/graphql-manager.test.ts` "mounts no stream when no subgraph contributes a Query root" is rewritten to check that the stream mounts and serves the subscription.

## 4. The codegen subgraph lint is narrower than the runtime

Root cause
- The lint (`findPackageSubgraphConflicts`) re-implements the GraphQLManager's admission rules instead of calling them, and has drifted:

| Runtime rule | Lint before | Status |
| --- | --- | --- |
| Core subgraph names refused (`#admit`) | `nameHeldBy: "core"` | covered |
| Model subgraph name held, rank core > host > model > package | `nameHeldBy: "document model"` | covered |
| Subgraph-vs-subgraph claims, root fields single-owner (`resolveClaimOwnership`) | same function, same order | covered |
| Always-loaded models = `baseDocumentModels` (switchboard `switchboardBaseDocumentModels`) | base models prepended | covered |
| Model refused for reserved type names (`#admitModels`) | model kept: holds its subgraph name and types, no warning | gap |
| Model refused when its generated types do not build (`checkBuilds`) | model kept, no warning | gap |
| Model subgraph refused, generated types kept (`subgraphError`) | whole model dropped: its types unchecked, or its unbuildable subgraph holds the name | gap |
| Model subgraph named like a core subgraph rejected (`#admit`) | model subgraph owns claims | gap |
| Same-name subgraphs of one package: the last replaces the others | both checked, self-conflict reported | gap |
| Switchboard host subgraphs (`packages`, `reactor-drive-nodes`, `privacy`, `workflow-runtime`) | not checked | limit: each is conditional on host config; `workflow-runtime` lives in apps/switchboard |
| Other packages' subgraphs (first registered wins) | not checked | limit: one package at a time |
| `enableDocumentModelSubgraphs`, optional inspection/auth core subgraphs | assumed on | limit: conservative |
| Claims only from subgraphs whose schema built | all claim | limit: a broken subgraph fails anyway |

- `./subgraph-types` imports base-document-models, create-schema and every core schema at module top, so importing `@powerhousedao/vetra/codegen` for any `ph generate` loads ~440 modules (~180 ms) even when no check runs.

Fix
- New pure module `graphql/subgraph-admission.ts`, called by both the manager and the lint: origins and `rank`, `admitDocumentModels` (reserved names, unusable schema, subgraph-only refusal), `documentModelSubgraphSources` (latest version, has a subgraph), `decideAdmission` (core name, rank, type collisions, same-origin replace), `supergraphClaimLosers` (rank then registration order, then `resolveClaimOwnership`).
- Schema helpers take `{ documentModel: { global } }` instead of a full module, so the lint passes global states without a cast.
- The lint replays registration (core, model subgraphs, package subgraphs) through those functions. Report: `refusedModels: { name, reason, subgraphOnly }[]` for package models replaces `skippedModels`; `nameHeldBy` gains `"package"` (a later same-name subgraph replaces it).
- Vetra warns on refused models even when the package has no subgraphs.
- `./subgraph-types` keeps only types, `DOCUMENT_MODEL_SCHEMA_OWNER` and an async `findPackageSubgraphConflicts` that dynamic-imports the check. `coreSubgraphTypeDefs` and the `reservedTypeNames` re-export leave the entry (no consumer). `lintSubgraphTypes` and both `warnSubgraphTypeConflicts` become async.

Tests
- reactor-api `subgraph-types.test.ts` "runtime parity": reserved-name model, unbuildable generated types, subgraph-only failure (unparseable and unbuildable op schema), model subgraph named `system`, duplicate package subgraph name.
- vetra `subgraph-type-lint.test.ts`: a refused model warns with no subgraphs.
- Existing GraphQLManager suites guard the extracted runtime rules.

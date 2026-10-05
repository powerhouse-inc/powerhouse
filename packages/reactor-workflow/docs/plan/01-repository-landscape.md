# Repository Landscape & Architecture Reference

**Purpose.** Ground truth for the agent that will implement standardized Workflow Automation
in the Powerhouse framework. Everything here was read from the checkouts in `D:\projects\ph-win`
on 2026-08-28. Paths are repo-relative; each repo root is a sibling of this folder.

Companion documents:
- [`02-feature-spec.md`](./02-feature-spec.md) — the feature specification
- [`03-implementation-plan.md`](./03-implementation-plan.md) — the phased build plan
- [`04-open-questions.md`](./04-open-questions.md) — decisions that need a human

---

## 0. The checkouts at a glance

| Folder | What it is | Relevance to workflows |
|---|---|---|
| `powerhouse/` | The framework monorepo: Reactor, package loaders, host apps (Connect, Switchboard), CLIs, codegen, Vetra | **Primary.** Almost all new code lands here |
| `recipes/` | 28 standalone example projects for Reactor patterns | Reference implementations for triggers, connectors, sagas |
| `ph-clint/` | AI agent framework (Mastra + Reactor) with its own trigger/routine loop | Prior art for triggers; two-way integration target |
| `vetra-cli/` | A ph-clint implementation: the Vetra agent + Vetra Studio host | Consumer; agent-driven workflow authoring |
| `pfnur-toll-collect-portal/` | Client platform monorepo with a production IDP pipeline and BullMQ worker | Reference for the worker pattern and the IDP block set |
| `ph-win-desktop/` | Tauri 2 desktop shell supervising a Node sidecar (Switchboard + Connect) | The "if-this-then-that for end users" delivery target |
| `win-test/` | Old document-model boilerplate README only (`LICENSE` + `README.md`) | Superseded by `ph-win-desktop`; **not** the desktop prototype the briefing describes |
| `docs-archive/` | Prior design briefs (Tauri packaging, Windows findings, Vetra follow-ups) | Background |

> **Two corrections to the briefing.** (1) The briefing attributes the Tauri desktop prototype to
> `win-test`. In this checkout `win-test/` contains only a stale document-model boilerplate README;
> the actual Tauri prototype is `ph-win-desktop/`. (2) The registry is not a separate checkout — it
> lives at `powerhouse/packages/registry`, with the client helpers in
> `powerhouse/packages/shared/registry/`.

---

## 1. `powerhouse/` — the framework monorepo

### 1.1 Layout

```
powerhouse/
  packages/
    reactor/                 core engine (storage, queue, executor, processors, sync, decision)
    reactor-api/             Node host: package loading, GraphQL/HTTP gateway, server wiring
    reactor-browser/         Browser host: reactor-in-worker + RPC proxies, React hooks
    reactor-attachments/     Attachment service (reserve/upload/get), S3/MinIO backends
    reactor-mcp/             MCP server exposing reactor tools over HTTP + stdio
    reactor-drive/           drive container document model
    reactor-group/           group roster document model (auth principals)
    reactor-hypercore/       p2p transport
    shared/                  cross-cutting types: manifest, processors, config, registry, analytics
    document-model/          document model runtime (controller, state, module, logger)
    analytics-engine/        time-series analytics store (core/pg/browser/knex/graphql)
    codegen/                 templates + ts-morph generators for every module type
    builder-tools/           Connect build utils, vite plugins, service worker
    config/                  powerhouse.config.json loading
    registry/                package registry (publish/CDN)
    renown/                  identity + credential signing
    vetra/                   Vetra reactor package: spec document models, editors, codegen processor
    powerhouse-vetra-packages/, design-system/, common/, pglite-fs/, switchboard-gui/,
    opentelemetry-instrumentation-reactor/
  apps/
    connect/                 React SPA host application
    switchboard/             Node host application (GraphQL + MCP webservice)
    switchboard-lb/          load-balanced variant
    academy/                 docs site
  clis/
    ph-cli/                  project-scoped CLI (generate, connect, build, service, vetra, install…)
    ph-cmd/                  global CLI shim
  docs/adr, docs/specs, docs/plans
```

### 1.2 The Reactor core (`packages/reactor/src`)

Subsystems: `actions/ admin/ attachments/ cache/ client/ core/ decision/ events/ executor/
job-tracker/ processors/ projection/ queue/ read-models/ registry/ shared/ signer/ storage/
subs/ sync/ utils/`.

**`IReactor`** (`packages/reactor/src/core/types.ts:127`) is the write/read contract:

```
get / getBySlug / getByIdOrSlug / find / getOperations
getOutgoingRelationships / getIncomingRelationships
create(document, signer?, signal?, meta?)          -> JobInfo
deleteDocument(id, signer?, signal?, meta?)        -> JobInfo
execute(docId, branch, actions, signal?, meta?)    -> JobInfo
load(docId, branch, operations, signal?, meta?)    -> JobInfo
executeBatch(request, signal?, meta?)              -> BatchExecutionResult
loadBatch / addRelationship / removeRelationship
getJobStatus(jobId, signal?)                       -> JobInfo
```

Two properties matter for workflows:

1. **`meta?: Record<string, unknown>` flows through the whole job lifecycle.** It is the natural
   carrier for a workflow run id / step id, so every operation a workflow writes is traceable back
   to the run that produced it — and so a workflow step can recognise its own writes and avoid
   re-entrancy (the `saga` recipe solves the same problem today with an in-memory flag).
2. **`executeBatch` supports declared dependencies between jobs**, which is a ready-made primitive
   for a workflow step that must write several documents in a defined order.

**Event bus** (`packages/reactor/src/events/types.ts`). Numeric event ids:

```
JOB_PENDING 10001 · JOB_RUNNING 10002 · JOB_WRITE_READY 10003 · JOB_READ_READY 10004
JOB_FAILED 10005 · READMODEL_BATCH_COMPLETED 10006 · READMODEL_INDEXED 10007 · MODEL_LOADED 10008
```

`JobReadReadyEvent`'s own docstring names **"event-driven workflows"** as a use case: it fires after
every read model has indexed the operations, so a workflow that reads back what it wrote is safe
from that point on. `JobWriteReadyEvent` carries the operations inline plus `collectionMemberships`.

**Job executor and the worker pool** (`packages/reactor/src/executor/`). Two managers exist:
`simple-job-executor-manager.ts` (in-process) and `worker-pool-job-executor-manager.ts`
(`worker/` subtree + `worker-pool-router.ts`). The wire protocol
(`packages/reactor/src/executor/worker/protocol.ts`, 455 lines) is the most reusable asset for the
new feature:

- Hard contract: **every message must be structured-cloneable**. `sanitize.ts` enforces it;
  `error-info.ts` marshals `Error` into `{name, message, stack, cause}` and back.
- `ModuleRef = {packageName, exportName} | {filePath, exportName}` plus
  `FactorySpec = {module: ModuleRef, initArgs?: SanitizedArg}` — this is *already* the mechanism for
  telling a worker "import this package subpath and call this export". A connector worker needs
  exactly this.
- `WorkerPoolConfig = {enabled, numWorkers, workerType: "thread"|"process", heartbeatMs?, workerPgPoolSize?}`.
- Parent→worker: `init` · `execute` · `abort` · `shutdown` · `load-model`.
  Worker→parent: `ready` · `result` · `model-loaded` · `model-load-failed` · `log` · `heartbeat` ·
  `metrics` · `pool-acquire-samples`.
- `forwarding-logger.ts` pipes worker logs to the host logger; `worker-handle.ts` (675 lines) owns
  spawn / health / abort / restart; `transport.ts` abstracts thread vs. process.

**Processors** (`packages/reactor/src/processors/processor-manager.ts`, 529 lines). This is the
closest existing analogue to what workflows need, and the briefing explicitly says to improve it for
synergy. Behaviour:

- `ProcessorManager extends BaseReadModel` — processors receive operations from
  `ReadModelCoordinator`, so they are part of the projection chain, not a side channel.
- Lifecycle is **drive-scoped**: `detectAndRegisterNewDrives` on `CREATE_DOCUMENT` of a
  drive-container type; `discoverExistingDrives` at init; `cleanupDriveProcessors` on deletion.
- `registerFactory(identifier, factory)` / `unregisterFactory(identifier)`; re-registering replaces.
- Processor id is `{factoryId}:{driveId}:{slot}`; slots come from `resolveProcessorSlots` (record
  `id`, namespace, or class name — or array position under `legacyProcessorIds: true`, which is
  still the default).
- **Cursors are persisted** in a `ProcessorCursor` table: `{processorId, factoryId, driveId,
  processorIndex, lastOrdinal, status: "active"|"errored", lastError, lastErrorTimestamp}`.
- `startFrom: "beginning" | "current"` on each `ProcessorRecord`; `backfillProcessor` pages through
  `operationIndex.getSinceOrdinal`; a throw parks the processor in `errored` and `retry()` resumes
  from the stored ordinal.
- Routing is `Promise.all` over all tracked processors with `matchesFilter`; orphan cursors are
  deleted when a factory stops producing a record for a drive.

**Limitations to be aware of when reusing this for workflows** — these are the "improvements for
maximum synergies" the briefing anticipates:

- A processor failure parks it permanently until someone calls `retry()`. There is no backoff, no
  dead-letter queue, no per-item retry — a workflow needs all three.
- Processors are strictly **drive-scoped**. A workflow triggered by a timer or a webhook has no
  drive to hang off until one is chosen.
- `onOperations` is fire-and-forget from the manager's perspective: no durable per-item queue, so a
  crash between `onOperations` returning and the cursor write re-delivers the whole batch. That is
  acceptable for idempotent projections and *not* acceptable for "send the email".
- Everything runs in the host process. There is no isolation between a badly-behaved third-party
  processor and the reactor.
- The whole mechanism is *pull from the operation stream*. Nothing in it models an external event
  arriving from outside the reactor.

**Processor contracts** live in `packages/shared/processors/types.ts` (shared so both the Node and
browser hosts use the same types):

```ts
IProcessor              { onOperations(ops: OperationWithContext[]): Promise<void>; onDisconnect(): Promise<void> }
ProcessorFilter         { documentType?: string[]; scope?: string[]; branch?: string[]; documentId?: string[] }
ProcessorRecord         { processor; filter; startFrom?: "beginning"|"current"; id? }
ProcessorFactory        (driveHeader: PHDocumentHeader, processorApp?: ProcessorApp) => ProcessorRecord[]
ProcessorFactoryBuilder (module: IProcessorHostModule) => ProcessorFactory
IProcessorHostModule    { analyticsStore; relationalDb; processorApp; dispatch: IProcessorDispatch;
                          getReadModel<T>(name): T; config?: Map<string, unknown> }
IProcessorDispatch      { execute(docId, branch, actions, signal?, meta?): Promise<{id, status}> }
ProcessorApp            "connect" | "switchboard"      (packages/shared/processors/constants.ts)
```

`IProcessorHostModule` is the **host capability bundle**. A workflow runtime needs the same shape
plus attachments, resolved secrets, an HTTP egress policy and an agent handle — see §2 of the spec.

`RelationalDbProcessor` (`packages/shared/processors/relational/types.ts`) supplies namespaced Kysely
schemas with migrations (`initAndUpgrade()`), and `IRelationalDb.createNamespace/queryNamespace`.
This is the persistence layer a workflow run store should reuse rather than invent.

### 1.3 Package loading — how a module type becomes loadable

This is the single most important integration seam: `connectors` must become a first-class module
kind everywhere the existing four (document models, editors, processors, subgraphs) appear.

**Node side** — `packages/reactor-api/src/packages/`:

```
types.ts          IPackageLoader { loadDocumentModels, loadUpgradeManifests?, loadSubgraphs, loadProcessors }
                  ISubscribablePackageLoader { onDocumentModelsChange?, onSubgraphsChange?, onProcessorsChange? }
                  PackageManagerResult { documentModels, upgradeManifests, subgraphs, processors }
import-loader.ts  ImportPackageLoader — `await import(`${pkg}/${subpath}`)`, duck-types the exports
http-loader.ts    HttpPackageLoader  — `${registry}-/cdn/${spec}/node/${subpath}/index.mjs`
vite-loader.mts   ViteLoader for dev/studio (Vite cannot follow the computed import)
import-resolver.ts fallback resolution for linked/workspace packages
package-manager.ts PackageManager — tries each loader in order, first success wins
```

`util.ts` defines the **subpath convention**: `loadDocumentModels` → `${pkg}/document-models`,
`loadSubgraphs` → `${pkg}/subgraphs`, `loadProcessors` → `${pkg}/processors`. A local package is an
absolute path converted with `pathToFileURL` (the ESM loader would otherwise read a Windows drive
letter as a URL scheme). `isExpectedLoaderMiss()` distinguishes "not my package" from "your bundle
is broken" — new loaders must play by the same rule or they produce spurious warnings.

The processors loader looks for exactly one named export: `processorFactory`.

**Hot reload**: `PackageManager` watches `powerhouse.config.json` (`watchFile`, 100 ms interval) and
subscribes per-loader change callbacks with a 1 s debounce, emitting `documentModelsChange` /
`subgraphsChange` / `processorsChange`.

**Wiring into the host** — `packages/reactor-api/src/server.ts:399 setupEventListeners()`:

```ts
pkgManager.onProcessorsChange((processors) => {
  for (const [packageName, fns] of processors) {
    await reactorProcessorManager.unregisterFactory(packageName);
    const factories = fns.map(fn => fn(module));            // ProcessorFactoryBuilder(hostModule)
    await reactorProcessorManager.registerFactory(packageName, async (driveHeader) => /* … */);
  }
});
```

`onDocumentModelsChange` re-registers whole version families and swaps upgrade manifests;
`onSubgraphsChange` re-registers subgraphs and calls `graphqlManager.updateRouter()`.
**An `onConnectorsChange` handler slots straight into this function.**

**Manifest** — `packages/shared/document-model/schemas.ts:908`:

```ts
ManifestSchema = z.object({
  name, description?, category?, image?, publisher?,
  documentModels?, apps?, editors?, processors?, subgraphs?,   // all PowerhouseModulesSchema
  config?: ConfigEntry[],   // { name, type: "var"|"secret", description?, required?, default? }
  pwa?: PwaConfigSchema,
})
PowerhouseModuleSchema = { id: string; name: string; documentTypes?: string[] }
```

Three places must learn about a new module key or it will be silently dropped:

1. `ManifestSchema` itself.
2. `packages/shared/registry/manifest-slim.ts` — `MODULE_KEYS` is a **whitelist**; anything not
   listed is stripped from `/packages` listings. (It exists because an 8 MB agent manifest once blew
   Connect's localStorage quota.)
3. `packages/shared/connect/schema-fragments.ts` — the hand-kept JSON-schema mirror.

Note `config: ConfigEntry[]` with `type: "var" | "secret"` **already exists** on the manifest. This
is the declared-secrets mechanism connectors need; no new concept is required.

**Generated package exports** — `packages/shared/clis/constants.ts:139 packageJsonExports` maps
`.`, `./reactor`, `./document-models`, `./document-models/*`, `./editors`, `./editors/*`,
`./subgraphs`, `./processors`, `./manifest`, `./style.css` to `dist/{types,browser,node}`. A
`./connectors` + `./connectors/*` pair belongs here.

**Project config** — `PowerhouseConfig` (`packages/shared/clis/types.ts`) has
`documentModelsDir / editorsDir / processorsDir / subgraphsDir / importScriptsDir` plus optional
`reactor / auth / switchboard / studio / packages / vetra / packageRegistryUrl / connect`.
Add `connectorsDir` and a `workflows` block here.

### 1.4 Host application: Switchboard (`apps/switchboard`, `packages/reactor-api`)

`apps/switchboard/src/` — `server.mts`, `worker-pool.mts`, `install-packages.mts`,
`pglite-dialect.ts`, `observability.mts`, `renown.ts`, `attachments/`, `migrate.mts`,
`feature-flags.ts`. It is a thin composition over `reactor-api`'s `startServer`
(`packages/reactor-api/src/server.ts`, 1231 lines).

**HTTP surface** — `packages/reactor-api/src/graphql/gateway/types.ts` `IHttpAdapter`:

```ts
setupMiddleware({corsOptions?, bodyLimit?})
mount(path, fetchHandler, {exact?})                     // Fetch API Request -> Response
getRoute(path, handler)                                 // GET convenience
mountNodeRoute(method, path, (req, res, body?) => …)    // raw http.IncomingMessage/ServerResponse
mountRawMiddleware(middleware)                          // Connect/Express-compatible
setupSentryErrorHandler(sentry)
listen(port, tls?)
handle                                                  // the raw framework app
```

Express and Fastify adapters both implement it. `packages/reactor-mcp/src/mcp-routes.ts` is the
existing precedent — it mounts three node routes for the streamable-HTTP MCP transport.

> **Superseded by [`10-http-routes-spec.md`](./10-http-routes-spec.md).** This section said
> `mountNodeRoute` "is what a webhook trigger must use", on the reasoning that HMAC verification
> needs the exact bytes. The reasoning holds; the conclusion did not. `mountNodeRoute` did **not**
> deliver byte-exact bodies, and failed differently on each adapter: Express's body-parser only reads
> matching content types, so an unmatched type arrived untouched but a matched one arrived
> re-encoded, while Fastify rejected an unknown type with 415 before the handler ran. Raw bodies are
> now an explicit opt-in guarantee of both adapters, and a package no longer touches `IHttpAdapter`
> at all — it receives a namespaced `IHttpScope`. The signatures listed above have also changed:
> registrations return disposable handles. Doc 10 §2 is authoritative.

Existing routes: `/health`, `/ready`, `/explorer/:endpoint?`, per-drive GraphQL, per-subgraph
GraphQL, the composed supergraph, and an SSE channel (`graphql-manager.ts:858`).

**GraphQL subgraphs** — `packages/reactor-api/src/graphql/base-subgraph.ts`. A subgraph is a class
with `name`, `typeDefs`, `resolvers`, `onSetup()`, constructed with `SubgraphArgs`:
`{reactorClient, relationalDb, analyticsStore, graphqlManager, syncManager,
documentPermissionService, authorizationService, syncServingGate, path}`. `BaseSubgraph` also
supplies canonical-id resolution and `assertCan*` permission helpers with a per-request memo keyed
on the request context object.

**MCP** — `packages/reactor-mcp` exposes reactor tools (`tools/reactor.ts`) plus an instructions
resource. `setupMcpServer` is called from `server.ts:992`, and `createMcpRequestAuthorizer`
(`services/mcp-request-authorizer.ts`) gates it.

**Attachments** — `packages/reactor-attachments`: `IAttachmentService.reserve/stat/get`, hash-first
dedup, pending/available states, and — critically — **downloads are authorized against the document
that declared the ref** (`hasReference(documentId, ref)`), with no admin bypass. A workflow that
moves a file between systems must carry the owning document id, exactly as PFNÜR's worker does.

**Auth** — `services/auth.service.ts`, `authorization.service.ts`,
`document-permission.service.ts`, `renown-credential-verifier.ts`. Reactor-side feature flags
`documentDecisions / authEnforcement / authGroups / authConditions` (`PHConnectReactorFeatureFlags`)
gate the auth scope; each implies its predecessors and must match across a syncing fleet.

### 1.5 Host application: Connect (`apps/connect`, `packages/reactor-browser`)

Connect runs the reactor **in a browser worker** and talks to it over a purpose-built RPC layer:
`packages/reactor-browser/src/rpc/` — `message-router.ts`, `protocol.ts`, `transport.ts`,
`rpc-correlator.ts`, `client-proxy.ts` (proxies `IReactorClient`), `relational-db-proxy.ts`,
`event-bus-proxy.ts`, `sync-manager-proxy.ts`, `live-query-proxy.ts`, `admin-client.ts`,
`worker-package-loader.ts`, `reactor-host.ts` / `host-server.ts`, `op-channel.ts`, `subscription.ts`.

The same `IProcessorHostModule` contract applies with `processorApp: "connect"`, so processors — and
therefore connectors — can be authored to run in either host. `packages/reactor-browser/src/hooks/`
holds ~50 React hooks (`useDrives`, `useSelectedDocument`, `useEditorModules`,
`usePackageDiscoveryService`, `useAttachments`, `useCanExecute`, `useDocumentOperations`, …) — this
is where a "Run workflow" button and a run-status panel would hang.

`EditorModule` (`packages/shared/document-model/types.ts:1543`) is
`{Component: FC<EditorProps & TProps>; documentTypes: string[]; config: {id, name}}` — a Workflow
document editor is an ordinary editor module, no new concept needed.

`DocumentModelLib` (`:1703`) is the shape a package's root export carries:
`{manifest, documentModels, editors, subgraphs?, upgradeManifests?, processorFactory?}` — add
`connectorFactory?` here.

### 1.6 CLI and codegen

`clis/ph-cli/src/commands/`: `generate`, `generate-all`, `generate-app`, `generate-document-model`,
`generate-editor`, `generate-processor`, `generate-subgraph`, `generate-migration-file`, `init`,
`install`/`uninstall`, `build`, `connect`, `switchboard`, `service`, `vetra`, `publish`/`unpublish`,
`registry-login`, `login`/`logout`, `inspect`, `list`, `migrate`, `access-token`.

`generate-processor.ts` is the template to copy for `generate-connector`. Its flags:
`--name`, `--type analytics|relationalDb`, `--document-types`, `--apps connect,switchboard`,
`--document <spec .phd|.json>`, `--dir`, `--all`, `--extract`. Note `--document` (codegen driven by
a Vetra spec document) and `--extract` (write a spec document back out from existing code) — that
round-trip is exactly what workflow authoring needs.

`packages/codegen/src/`: `codegen/ create-lib/ file-builders/ name-builders/ templates/
ts-morph-generator/ utils/`. Templates for processors:

```
templates/processors/index.ts             re-exports processorFactory
templates/processors/factory.ts           dispatches on module.processorApp -> ./connect.js | ./switchboard.js
templates/processors/factory-builders.ts  `export const processorFactoryBuilders: ProcessorFactoryBuilder[] = []`
templates/processors/analytics/{factory,index,processor}.ts
templates/processors/relational-db/{factory,index,migrations,processor,schema}.ts
```

The `connect.ts` / `switchboard.ts` split with a per-app `processorFactoryBuilders` array is the
pattern to mirror for connectors (a connector that can only run server-side is simply absent from
`connect.ts`).

### 1.7 Vetra — spec documents drive codegen

`packages/vetra/` is itself a reactor package. Its manifest declares five document models —
`powerhouse/package`, `powerhouse/document-editor`, `powerhouse/subgraph`, `powerhouse/processor`,
`powerhouse/app` — five editors, one drive app, and two processors (`codegen`, `vetra-read-model`).

`powerhouse/processor`'s state (`packages/vetra/document-models/processor-module/v1/schema.graphql`):

```graphql
type ProcessorModuleState {
  name: String!
  type: String!                       # 'read-model' | 'relational-db' — decides the scaffold
  documentTypes: [DocumentTypeItem!]! # each with a stable OID so it can be removed individually
  status: StatusType!                 # DRAFT | CONFIRMED
  processorApps: [String!]!
}
enum StatusType { DRAFT CONFIRMED }
```

`packages/vetra/processors/codegen/processor.ts` is a plain `IProcessor` that, on each operation,
looks up a generator by `context.documentType`, calls `generator.shouldProcess(input)` — which
requires `status === "CONFIRMED"` and all required fields present — then `routeAndGenerate(input)`.
Generators live in `processors/codegen/document-handlers/generators/` (one per module type) and call
into `@powerhousedao/codegen`.

**This is the exact mechanism a `powerhouse/connector` and a `powerhouse/workflow` spec document plug
into.** Adding a module type is: doc model + editor + generator + one line in the generator index +
a manifest entry.

### 1.8 Registry and distribution

`packages/registry` serves npm-compatible publish plus a CDN at `<registry>/-/cdn/<name[@tag]>/…`
(`packages/shared/registry/urls.ts toCdnUrl`). `PackageInfo` / `PackageListItem` / `PackagePage`
shapes are in `packages/shared/registry/types.ts`; `resolveRegistryUrl` priority is
flag > `PH_REGISTRY_URL` > `packageRegistryUrl` in config > default.

`ph install <pkg>` → the package name lands in `powerhouse.config.json` `packages[]` → the config
watcher fires → `PackageManager` reloads → the host registers the new modules. **Connectors inherit
this whole path for free**, provided the loader method and the manifest key exist.

---

## 2. `pfnur-toll-collect-portal/` — the production worker + IDP reference

Nx + pnpm monorepo. `apps/{board,connect,eval,portal,worker}`,
`packages/{document-processing,emails,queue}`.

- `apps/connect` is a **reactor package**, not the Connect SPA: `document-models/`
  (`rto-company`, `toll-statement`, `user-profile`, each versioned with `upgrades/`),
  `editors/`, `processors/` (`company-aggregates`, `company-list`, `drive-membership`,
  `statement-duplicates`, `statement-list`, `user-directory`), `subgraphs/`
  (`admin`, `client`, `companies`, `profiles`, `statements`), `reactor/`, `specs/`.
- `apps/portal` is a Next.js front end; `apps/board` is Bull Board; `apps/eval` is an extraction
  evaluation harness with a cost estimator.

### 2.1 The worker pattern (the thing to generalize)

`apps/worker/src/index.ts` — a BullMQ `Worker` on `TOLL_STATEMENT_QUEUE_NAME`, concurrency 5:

- **Ports/adapters.** `apps/worker/src/ports.ts` declares four seams — `StatementStore`
  (hydrate / commit / mark-error), `AttachmentStore` (`fetchBytes({documentId, ref, fileName})`),
  `DocumentProcessor` (`process(raw, signal)`), `CompanyLinker` (`link(documentId, run, signal)`).
  Production adapters go over Switchboard GraphQL and the Powerhouse attachment service; tests
  inject in-memory fakes. `run.ts` touches nothing else, so the run reads top-to-bottom and executes
  without Redis, HTTP or GraphQL. **Note the deliberate split**: linking is *not* a fourth
  `StatementStore` method because it reads every company document, may create one, is optional per
  job, and its failure is non-fatal — different properties, so a separate seam.
- **Delivery authority.** `StatementJobRun = {jobId, lockToken}` is passed into every server
  mutation, because BullMQ can re-deliver a job after its lock expires. The server refuses writes
  from a delivery that no longer owns the lock (`run-guard.ts`, `StaleDeliveryError`).
- **Cancellation.** Redis pub/sub (`subscribeToRunCancellations`) → `runCancellations.cancel(docId)`
  → an `AbortSignal` threaded into the pipeline. The requester moves the document out of
  `PROCESSING` **first**, so a missed cancellation cannot corrupt state — the signal is an
  optimization, not a correctness mechanism.
- **Time budget.** `resolveJobTimeoutSeconds()` per job, read once at startup so a bad value stops
  the worker rather than failing its first job; a separate OCR no-progress budget derived from it.
- **Tracing.** `trace/worker-trace.ts` + `trace/job-log-sink.ts` write a human-readable run log into
  the BullMQ job, wrapping the ports (`trace/traced-ports.ts`) so every port call is timed. Bound
  **per job**, never stored on the shared processor — five concurrent runs share one processor
  instance, so a tracer living on it would interleave unrelated runs.
- **Failure taxonomy.** A retry is not an incident; only the attempt that parks the document reports
  to Sentry. `unhandledRejection` / `uncaughtException` exit the process so the supervisor restarts
  clean — "a job abandoned by a dead worker is re-queued when its lock expires; a job processed by a
  corrupted one is a wrong extraction that looks like a right one."
- **Graceful shutdown** with a 15 s ceiling, closing each resource independently so one failure
  cannot leak the others.

### 2.2 Enqueue path

`apps/connect/subgraphs/statements/resolvers.ts` lazily `import(/* @vite-ignore */ "@pfnur/queue")`
— the queue package is Node-only (BullMQ/ioredis) and must stay out of Connect's browser bundle. The
import promise is memoized **on success only**, so one transient failure doesn't break enqueueing
permanently. Resolver deps (`queue`, `queueMonitor`, `queueControl`, `runGuard`) are injectable
ports.

`packages/queue/src/`: `types.ts` (queue/job names, `StatementJobData`, `StatementJobRun`,
`CompanyLinkOutcome`, result union `PROCESSED|STALE_DELIVERY|CANCELLED`, `DocumentProcessingQueue`
port), `producer.ts`, `queue.ts`, `monitor.ts` (live QUEUED/ACTIVE phase per document),
`control.ts`, `cancellation.ts`, `run-guard.ts`, `job-index.ts`, `progress.ts`.

Per-job feature switches are **optional and default on**; absence means "behave normally", and the
default is resolved next to the behaviour, not in the type. Flags live flat on the job data so Bull
Board shows them inline.

### 2.3 The IDP pipeline (`packages/document-processing`)

Five layers with a **test-enforced** dependency direction (`src/__tests__/architecture.test.ts`
walks the built import graph):

```
composition/  ->  features/ <-> issuers/  ->  pipeline/  ->  domain/      (domain depends on nothing)
```

| Layer | Owns |
|---|---|
| `domain/` | the vocabulary — document, issuer, statement, result; geometry; validation; the confidence cascade |
| `derive/` | arithmetic a statement leaves implicit |
| `pipeline/` | control flow (eligibility → route → attempt → record), strategy/classifier contracts, typed failures, the tracing tap, the disposal protocol |
| `issuers/` | everything provider-specific: anchors, parsers, reconciler, prompt hints |
| `features/` | one capability each (`text-layer`, `ocr`, `llm`, `pdf` as a dependency-free leaf) with their third-party adapters |
| `composition/` | which capabilities a pipeline has, and who disposes them |

Data flow:

```
RawDocument -> loader.load() -> documentFeatures() -> eligibility (strategy.requires vs features)
  -> classification (only if some eligible strategy asks for the issuer; cheapest-first;
     first confident verdict wins; all abstain -> UNKNOWN)
  -> routing policy(features, classification, eligible) -> ordered strategy ids
  -> for each id until one succeeds:
       TEXT_LAYER / OCR -> issuer geometry parser -> confidence cascade -> reconciler
       LLM              -> render -> prompt -> merge -> convert -> conventions -> reconciler
     (both end at the SAME issuer reconciler, which is what makes `extractionValidated`
      mean one thing regardless of which strategy answered)
  -> ProcessingResult { issuer, classification, method, attempts[], extraction, fieldConfidence }
```

Extension points, all by wiring (no edit to `pipeline/` or `domain/`):

- **Add a strategy**: `{id, issuer: "required"|"hint"|"none", requires: DocumentFact[], extract()}`.
  `id` is an open string; the default policy **appends** unknown ids as a fallback rather than
  dropping them. A strategy's other prerequisites (an OCR engine, an LLM client) are constructor
  arguments, so they are satisfied by construction rather than checked at runtime.
- **Trace a run**: `PipelineObserver` is a **tap, not a hook** — never awaited, throws swallowed by
  `safeNotify`, returns nothing the pipeline reads. Stages: `loaded`, `eligibility`, `classified`,
  `routed`, `attempt-started`, `attempt-note`, `attempt-finished`, `succeeded`. Passed per call,
  never stored. The stated test: delete every `safeNotify(...)` line and the file is what it was
  before the observer existed.
- **Swap / omit a feature**: register a different implementation under the same id (a duplicate id
  is a construction error, not silent shadowing); `createDefaultPipeline({ocr: false})` etc.
- **Contain non-cancellable work**: `createSupervisedPaddleOcrEngine` runs PaddleOCR / ONNX / OpenCV
  / canvas / pdf.js page rendering in a **child process** behind the same
  `LayoutOcrEngine & PageOrientationDetector & DocumentRenderer` port. Invariants: exactly one active
  top-level op per child; queued ops live in the parent and survive child replacement; aborting an
  active op **kills the child** because native work can't be trusted to stop; the no-progress timer
  starts at dispatch and resets only at real checkpoints; a stall quarantines that document identity
  for the rest of the attempt; if an exit after `SIGKILL` can't be confirmed the adapter emits a
  fatal diagnostic and the host exits so the supervisor replaces the process.
- Heavy dependencies (`pdfjs-dist`, `@napi-rs/canvas`, `ppu-ocv`, `ppu-paddle-ocr`) load via
  `await import()` at **first scan**, not at import — an architecture test asserts none is statically
  reachable from the feature entry point.

Everything in this subsection is directly reusable as the shape of the workflow **block contract**:
declared requirements, capabilities injected by construction, observer-as-tap, an id-keyed registry
with append-unknown routing, and process containment for untrusted or non-cancellable work.

---

## 3. `ph-clint/` — the agent framework

Packages: `ph-clint` (framework), `clint-common` (shared reactor package, `powerhouse/chat-session`),
`ph-clint-dev` (build tools), `ph-clint-cli` (scaffolder).

### 3.1 Triggers and the routine loop — direct prior art

`packages/ph-clint/src/core/trigger.ts` + `types.ts`:

```ts
TriggerOptions<TState, TConfig, R> {
  id: string
  type: 'condition'
  state?:    () => TState                                   // once per instance
  setup?:    (ctx) => Promise<void>
  teardown?: (ctx) => Promise<void>
  poll:      (ctx) => Promise<WorkItem | null>
}
TriggerContext { context: CoreContext; commandContext: CommandContext; state: TState;
                 reactor(): Promise<ReactorContext|undefined>; agent(): Promise<AgentProvider|undefined> }
WorkItem { type: 'command' | 'function'; params; callbacks?: {onSuccess, onFailure} }
```

`packages/ph-clint/src/core/routine.ts` — `createRoutine({triggers, commands, tickInterval = 2000,
idleInterval = 500, …})`. State machine `init → ready → running ↔ stopping`. Each tick: poll every
trigger (a throwing `poll` is logged and swallowed to keep the loop alive), push work items onto a
queue, drain the queue. `executeWorkItem` handles `function` (call it) and `command` (look up by id,
`inputSchema.parse(args)`, execute with an extended context carrying the routine, the process
manager and `emit`). Each loop body is wrapped by registered lifecycle hooks
(`wraps.routineIteration`, identity by default). The routine starts only after services and the
reactor are ready, and `createRoutineServiceAdapter` lets it be managed as a service.

**Gaps vs. what workflow automation needs**: `type` is fixed to `'condition'` (no push triggers);
polling is a fixed global tick rather than per-trigger schedules; there is no persistence of the
queue or of trigger state across restarts; a work item is a single command, not a graph; and it is
all in-process with no isolation.

### 3.2 Other reusable pieces

- **Services** with readiness regexes + captures, endpoint classification
  (`api-mcp`/`api-rest`/`api-graphql`/`website`), preflight checks (`checkWorkdir` / `checkCommand` /
  `checkPort`, first failure aborts), restart policy, auto-generated `{id}-start|-stop|-ps|-logs|-ls`
  commands, deterministic port defaults. `createCompositeServiceManager` multiplexes process-based
  and routine-based services.
- **Event bus**: `powerhouse:ready` (payload `driveId`), `powerhouse:document:changed|created|deleted`,
  `service:ready|stopped`, plus arbitrary string keys falling through to `unknown`.
- **Commands** (`defineCommand`) with Zod input/output schemas that serve simultaneously as a CLI
  subcommand, an **agent tool**, and an MCP operation. `commandsToMastraTools()` does the conversion;
  `discoverMcpTools()` queries running services for `api-mcp` endpoints and namespaces tools as
  `{serviceId}-mcp__{toolName}`. **This is the two-way agent bridge the briefing asks for**: a
  workflow block that calls an agent, and an agent that can call a workflow, are the same mechanism
  pointed in opposite directions.
- **Mastra integration**: `createMastraHelpers()` → `getTools`, `getAgentInstructions`,
  `createWorkspace`, `createMemory`, `wrapAgent`; `mapMastraStream()` → framework `StreamChunk`
  (`text-delta`, `tool-call`, `tool-result`, `tool-output`, `error`); LibSQL-backed memory;
  markdown conversation logging; lazy agent construction (built only when first called).
- **Powerhouse integration** (`src/integrations/powerhouse/`): `buildDefaultReactor`, `ensureDrive` /
  `ensureRemoteDrive`, `createFolderOperations` (`addDocument`/`removeDocument`/`listFolder`/
  `ensureFolder`/`findByType`), `bridgeSubscriptions` (reactor changes → event bus),
  `createDocumentChangeTrigger` (watch document types, coalesce events, reconcile on start),
  `startSwitchboard`, `defineRegistry` / `TypedReactorClient`, `attachment.ts` + attachment commands,
  `identity.ts`, `deterministicId()`.
- **Chat sessions**: `powerhouse/chat-session` document model + `writeAgentStreamToDocument()` +
  `chatSessionWatchTrigger` with re-entrancy protection — the pattern for "an agent writes its
  progress into a document that a UI renders live". A workflow **run document** wants the same shape.
- **Skills**: `SKILL.md` with YAML frontmatter, Handlebars rendering with 8 helpers, discovery across
  artifact directories with dedup by name, per-skill CLI commands returning a `SkillInvocation`
  routed to the agent, GitHub-based external skills.
- **Config**: 6-layer resolution (config-file flag → env → local `.ph/` → user `~/.ph/` →
  implementation defaults → schema defaults), env mapping `{CLINAME}_{FIELD_NAME}`, Zod schema
  introspection driving an auto-generated `config` command, separate secrets schema with censored
  output. A workflow's connector credentials should reuse this precedence model.

---

## 4. `vetra-cli/` — the app-builder agent

A ph-clint implementation. One user-launched process containing: the interactive REPL, the Mastra
agent, an embedded Reactor (PGlite storage under `<workdir>/.ph/vetra/`), an embedded Switchboard
(GraphQL + MCP), the ph-clint routine with registered triggers (`chatSessionWatchTrigger`, spec-sync
triggers), and a local HTTP+SSE API on `127.0.0.1:5180` (`resolve` / `start` / `events`).

Outside the process: **Connect** serving `vetra-app` (a reactor package) as Vetra Studio on port
27370, and **per-chat-session `reactor-project` previews** — `ph vetra` dev-mode Switchboard +
Connect with Vite HMR, spawned on demand by the agent and deep-linked into Studio via an iframe.

`vetra-app/` has the standard reactor-package layout (`document-models/ editors/ processors/
subgraphs/ specs/ powerhouse.manifest.json`). `packages/vetra-cloud-client` talks to a hosted
service. `pnpm-workspace.yaml` overrides point at local checkouts of `ph-clint` and the powerhouse
monorepo, so edits anywhere in the stack are picked up after a rebuild.

Relevance: this is the surface where "describe a workflow in natural language and get one" happens,
and the spawn-a-preview-session pattern already exists for testing a generated artefact live.

---

## 5. `ph-win-desktop/` — the desktop target

Tauri 2 shell supervising a **stock-Node sidecar** that serves the prebuilt Connect SPA and boots
Switchboard on PGlite in a per-user data dir.

```
src/main.ts           sidecar entry: serves Connect, boots Switchboard
scripts/              vendor-list.ts, vendor-deps.ts, build-assets.ts, clean-dist.ts, prune-dist.ts
src-tauri/src/launch.rs        `.phd` launch queue: argv in, bytes out
src-tauri/src/launch-queue.js  window.launchQueue polyfill injected into the webview
ui/index.html         loading page shown until the sidecar answers
dist/{main.js, connect/, node_modules/}
```

Three constraints that bind the workflow feature:

1. **Switchboard is vendored, not bundled**, precisely because `reactor-api` resolves modules with a
   runtime `import()` of a computed specifier (`packages/reactor-api/src/packages/util.ts`, carrying
   a `@vite-ignore`). Any connector loader must keep working under that vendoring model, and PGlite's
   WASM assets must exist as real files on disk.
2. There is **no Redis and no Postgres** on a desktop install. A workflow runtime that hard-depends
   on BullMQ cannot ship here — the queue must sit behind a port with a PGlite/SQLite-backed default.
   This is the single biggest divergence from the PFNÜR reference implementation.
3. The process model is one supervised sidecar. A workflow worker pool has to fit inside it (child
   processes or worker threads of the sidecar), not as separately-installed services.

`.phd` file association works because Connect already consumes the PWA File Handling API and the
shell supplies the `launchQueue` that the WebView2 embedding leaves inert. That is the precedent for
OS-level triggers ("a file appeared", "the user double-clicked something") reaching the reactor.

---

## 6. `recipes/` — pattern library

28 projects. The ones a workflow implementer should read first:

| Recipe | Pattern it establishes |
|---|---|
| `inbound-webhook-bridge` | **Raw-byte HMAC verification.** `JSON.parse` → `JSON.stringify` breaks the signature, so a dedicated `node:http` listener owns the bytes; Stripe-style `t=<unix>,v1=<hmac>` over `` `${t}.${rawBody}` ``; `timingSafeEqual`; replay window (default 5 min); **dedup against persisted `processedEventIds` in document state**; event type → typed action |
| `external-feed-ingest` | **The document is the checkpoint store.** Rebuild the dedup set and watermark from document state at startup. The watermark is a *fetch optimization only* — `externalId` is the authoritative dedup key, because real feeds redeliver the same id at a later cursor. Corrections are explicit `markSuperseded` ops plus a new entry, never mutations. Exponential backoff on poll errors |
| `discord-webhook-processor` | Outbound side: `IProcessor` → HTTP, batching to the provider's limit (10 embeds), HMAC on every request, filter-scoped registration |
| `saga` | Processor as coordinator: `onOperations` dispatches follow-up actions on *other* documents via `IReactor.execute()`; a `saga_id` in the processor's own `saga_log` table ties steps together; **a `processing` re-entrancy flag** stops it reacting to its own writes |
| `cross-document-reactor` | The same rule expressed as a `reactorClient.subscribe()` callback that writes, with a `reacting` guard and an event-type filter |
| `rate-limiter` | Processor + auth gate, sliding window keyed by signer address — the shape of a workflow concurrency/quota guard |
| `batch-progress` | Per-job progress tracked through Reactor EventBus job events |
| `relational-db-subgraph` | `RelationalDbProcessor` + Kysely migrations + typed schema + a GraphQL subgraph over it |
| `custom-read-model` | Custom `IReadModel` registered through `ReactorBuilder` |
| `document-snapshot-exporter` | Read-after-write using consistency tokens |
| `auth-preflight` | `evaluateActions` — ask the reactor what it *would* decide before submitting. A workflow's dry-run mode |
| `document-acl`, `group-principals`, `role-based-auth`, `scoped-reads`, `revocation-race` | The auth scope: platform-enforced ACLs, `{group}` grants, `action.context.signer`, read policy, convergent revocation |
| `audit-trail`, `analytics-processor`, `full-text-search`, `semantic-search` | Projection variants |
| `sync-health-monitor`, `subscription-cli` | EventBus / subscription consumers with a GraphQL surface |
| `signed-operations-verifier` | `RenownCryptoSigner` sign-then-verify over an operation history |

---

## 7. Consolidated touch-point index

### 7.1 Must be extended (a new module kind is invasive by nature)

| File | Change |
|---|---|
| `powerhouse/packages/shared/document-model/schemas.ts:908` | `ManifestSchema` += `connectors` (and, if separated, `workflowBlocks`) |
| `powerhouse/packages/shared/registry/manifest-slim.ts` | `MODULE_KEYS` += the new keys (whitelist — omission means silent drop) |
| `powerhouse/packages/shared/connect/schema-fragments.ts` | the hand-kept JSON-schema mirror |
| `powerhouse/packages/shared/clis/constants.ts:139` | `packageJsonExports` += `./connectors`, `./connectors/*` |
| `powerhouse/packages/shared/clis/types.ts` | `PowerhouseConfig` += `connectorsDir`, `workflows` block |
| `powerhouse/packages/reactor-api/src/packages/types.ts` | `IPackageLoader` += `loadConnectors`; `ISubscribablePackageLoader` += `onConnectorsChange`; `PackageManagerResult` += `connectors` |
| `powerhouse/packages/reactor-api/src/packages/util.ts` | `loadConnectors()` → `${pkg}/connectors` |
| `powerhouse/packages/reactor-api/src/packages/{import,http,vite}-loader.*` | implement the new method |
| `powerhouse/packages/reactor-api/src/packages/package-manager.ts` | `loadConnectors`, `connectorsMap`, `connectorsChange` emit |
| `powerhouse/packages/reactor-api/src/server.ts:399` `setupEventListeners` | `onConnectorsChange` → register with the workflow runtime |
| `powerhouse/packages/shared/document-model/types.ts:1703` `DocumentModelLib` | += `connectorFactory?` |
| `powerhouse/packages/codegen/src/templates/index.mts` + new `templates/connectors/*` | scaffolds |
| `powerhouse/clis/ph-cli/src/commands/index.ts` | register `generate-connector`, `generate-workflow` |
| `powerhouse/packages/vetra/` manifest + `document-models/` + `editors/` + `processors/codegen/document-handlers/generators/index.ts` | `powerhouse/connector` and `powerhouse/workflow` spec models, editors, generators |

### 7.2 Must be reused (do not reinvent)

| Asset | Location |
|---|---|
| Worker wire protocol, sanitizer, error marshalling, worker handle | `powerhouse/packages/reactor/src/executor/worker/` |
| `ModuleRef` / `FactorySpec` — "import this subpath, call this export, in a worker" | `…/executor/worker/protocol.ts` |
| Cursor persistence + backfill + errored/retry lifecycle | `powerhouse/packages/reactor/src/processors/processor-manager.ts` |
| Filter matching | `powerhouse/packages/reactor/src/processors/utils.ts` |
| Namespaced relational storage + migrations | `powerhouse/packages/shared/processors/relational/types.ts` |
| Raw-body HTTP routes | `IHttpScope` (`body: "raw"`) — **not** `IHttpAdapter.mountNodeRoute`, which was never byte-exact; see doc 10 §2.1 |
| GraphQL surface + per-request permission memo | `powerhouse/packages/reactor-api/src/graphql/base-subgraph.ts` |
| Attachment fetch with document authorization | `powerhouse/packages/reactor-attachments` |
| Declared config/secrets | `ConfigEntrySchema` on the manifest |
| Job `meta` as a correlation carrier | `IReactor.execute(..., meta)` |
| Ports/adapters + traced ports + delivery authority + cancellation | `pfnur/apps/worker/src/{ports,run,job-handler,run-cancellation,trace}` |
| Observer-as-tap, declared `requires`, id-keyed registry, process containment | `pfnur/packages/document-processing` |
| Trigger/routine loop, WorkItem, per-trigger state | `ph-clint/packages/ph-clint/src/core/{trigger,routine}.ts` |
| Command ⇄ agent-tool ⇄ MCP-operation equivalence | `ph-clint/packages/ph-clint/src/integrations/mastra/tools.ts` |
| Raw-byte webhook verification + document-state dedup | `recipes/inbound-webhook-bridge` |
| Poll + document-as-checkpoint + `externalId` dedup | `recipes/external-feed-ingest` |
| Cross-document dispatch + re-entrancy guard | `recipes/saga` |

### 7.3 Constraints that shape the design

1. **Structured-clone only** across every worker boundary; `Error` needs explicit marshalling.
2. **Raw request bytes** are mandatory for signed webhooks — no Fetch/GraphQL path can serve them.
3. **Attachment downloads are document-authorized**; a workflow must carry the owning document id.
4. **No Redis and no Postgres on desktop** — the queue must be a port with an embedded default.
5. **`import()` of computed specifiers cannot be bundled**; the desktop build vendors `node_modules`
   whole, so connector resolution must survive that.
6. **Manifest module keys are whitelisted twice** (`ManifestSchema`, `MODULE_KEYS`) plus a hand-kept
   JSON-schema mirror. Missing one produces a silent, confusing failure.
7. **`legacyProcessorIds: true` is still the default**, so processor cursor keys are array positions.
   A new registry should default to stable ids from day one.
8. **Connect runs the reactor in a worker**; everything crosses the RPC layer. A browser-eligible
   connector must be authored to that constraint — `processorApp` already expresses the split.
9. **Package loaders are fallbacks for each other**; a new loader method must throw a shape that
   `isExpectedLoaderMiss()` recognises as "not mine", or every package load logs a warning.
10. **Package code is third-party code.** Today a processor runs unsandboxed in the host. Connectors
    make that materially worse (they hold credentials and reach the network), which is the core
    argument for the worker boundary rather than a convenience.

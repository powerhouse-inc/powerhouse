# Workflow Automation — Implementation Plan

**Reads with:** [`01-repository-landscape.md`](./01-repository-landscape.md) (every path below is
verified there), [`02-feature-spec.md`](./02-feature-spec.md),
[`04-open-questions.md`](./04-open-questions.md).

This plan is written for an implementing agent. Each phase states its **goal**, the **files it
touches**, the **exit criteria**, and what it must **not** do yet. Phases 0–4 are strictly
sequential; 5–9 can overlap once 4 lands.

---

## 0. Ground rules for the whole build

1. **Land in `powerhouse/` on a feature branch per phase.** Each phase must leave `main` green:
   `pnpm build && pnpm test && pnpm lint` at the repo root.
2. **Nothing is enabled by default until Phase 8.** The runtime is behind
   `PowerhouseConfig.workflows.enabled` (default `false`) and behind a reactor feature flag, so a
   half-built runtime cannot regress Switchboard or Connect.
3. **Types first, in `packages/shared/workflow/`.** Both hosts and the codegen templates import from
   there. The pattern to copy verbatim is `packages/shared/processors/` (types.ts + constants.ts +
   relational/ + index.ts, re-exported from `packages/shared/types/index.ts`).
4. **Every new package gets an architecture test.** Copy the idea from
   `pfnur/packages/document-processing/src/__tests__/architecture.test.ts`: walk the built import
   graph and fail the build on an illegal dependency direction. This is what keeps `shared/workflow`
   browser-safe and keeps the engine free of connector-specific code.
5. **Do not touch `ProcessorManager`'s existing behaviour in phases 0–4.** Improvements to it are
   Phase 7, deliberately after the workflow engine exists, so the requirements are known rather than
   guessed.
6. **Write the migration with the table.** Every relational table lands with its Kysely migration in
   the same commit; `initAndUpgrade()` is the contract (`packages/shared/processors/relational/types.ts`).
7. **Structured-clone discipline.** Anything crossing a worker boundary must be validated by the
   existing `sanitize.ts` helpers, and `Error` must go through `error-info.ts`. Add a test that
   round-trips every message type.

---

## Phase 0 — Spike and de-risk (2–3 days)

**Goal.** Prove the three mechanisms nobody has combined before, in throwaway code, before any
schema is committed.

| Spike | Question | Success looks like |
|---|---|---|
| **S1 — new module kind** | Can a fifth module subpath be loaded, hot-reloaded and listed end-to-end? | A local package exports `connectors/index.ts`; `PackageManager` loads it; editing the file re-emits `connectorsChange`; `GET /packages` shows the connectors key |
| **S2 — worker + host bridge** | Can a worker import a connector by `ModuleRef` and call back into the host for a reactor write? | A worker thread imports `pkg/connectors`, runs an action, calls `hostBridge.reactor.execute(...)` over the message channel, and the operation lands |
| **S3 — raw webhook route** ✅ **answered** | Does `mountNodeRoute` give byte-exact bodies under both Express and Fastify adapters? | **No — and in opposite ways per adapter.** Express's body-parser only reads matching content types, so `application/octet-stream` arrived untouched with `req.body === {}`, while Fastify 415s an unknown type outright. Raw bodies are now an opt-in *guarantee* of both adapters: see [`10-http-routes-spec.md`](./10-http-routes-spec.md) §2.1 |
| **S4 — embedded queue on PGlite** | Can a lease/visibility-timeout queue work without `SKIP LOCKED`? | 4 concurrent reservers over 1000 jobs on PGlite: no double delivery, no lost job, acceptable throughput (target ≥ 200 jobs/s) |

**Exit.** A short `workflow-automation/spike-notes.md` recording what worked, what the real
throughput numbers are, and any correction to the spec. **If S4 fails, escalate** — the desktop
story depends on it and the fallback (SQLite via a different driver, or a single-reserver design)
changes Phase 3.

**Do not**: write document models, editors, or codegen in this phase.

---

## Phase 1 — Contracts and the connector module kind (1 week)

**Goal.** `connectors` is a real, loadable, distributable module kind. No runtime yet.

### 1.1 Shared types

New: `powerhouse/packages/shared/workflow/`

```
types.ts        ConnectorDefinition, TriggerDefinition, ActionDefinition, TransformDefinition,
                TriggerEnvelope, ActionResult, ConnectorContext/TriggerContext/ActionContext,
                IWorkflowHostModule, ConnectorBuilder, BlockKind, WorkflowRuntime,
                StepJob, RunStatus, StepStatus, RetryPolicy, FailureClass, EgressPolicy
constants.ts    WORKFLOW_RUNTIMES, CORE_BLOCK_TYPES, DEFAULT_RETRY, FAILURE_CLASSES
schemas.ts      zod schemas for everything a document or manifest carries
index.ts        barrel
relational/     (Phase 3) table types
```

Re-export from `packages/shared/types/index.ts`. Add `"./workflow"` to the `shared` package's
`exports` map (see how `"./processors"` is declared).

### 1.2 Manifest

- `packages/shared/document-model/schemas.ts` — add `ConnectorModuleSchema` and
  `connectors: z.array(ConnectorModuleSchema).optional()` to `ManifestSchema` (around line 908).
- `packages/shared/registry/manifest-slim.ts` — add `"connectors"` to `MODULE_KEYS` **and** teach
  `slimModules` about the extra summary fields (`runtimes`, trigger/action counts). Extend
  `manifest-slim.test.ts`.
- `packages/shared/connect/schema-fragments.ts` — mirror the JSON schema.
- `packages/shared/document-model/types.ts:1703` — `DocumentModelLib` += `connectorFactory?`.

### 1.3 Package loading

- `packages/reactor-api/src/packages/types.ts` — `IPackageLoader.loadConnectors`,
  `ISubscribablePackageLoader.onConnectorsChange`, `PackageManagerResult.connectors`.
- `packages/reactor-api/src/packages/util.ts` — `loadConnectors(pkg)` → `loadDependency(pkg, "connectors")`.
- `import-loader.ts`, `http-loader.ts` (CDN path `…/node/connectors/index.mjs` and
  `…/browser/connectors/index.mjs`), `vite-loader.mts` — implement.
- `package-manager.ts` — `loadConnectors`, `connectorsMap`, `updateConnectorsMap`,
  `onConnectorsChange`, and inclusion in `loadPackages`/`init`. Make sure a miss produces an error
  shape `isExpectedLoaderMiss()` recognises.

### 1.4 Project scaffolding surface

- `packages/shared/clis/types.ts` — `PowerhouseConfig.connectorsDir` (default `"connectors"`) and a
  `workflows?: { enabled?: boolean; queue?: {...}; workers?: {...}; egress?: {...}; secrets?: {...} }` block.
- `packages/shared/clis/constants.ts:139` — `packageJsonExports` += `./connectors`, `./connectors/*`.
- `packages/config/src/powerhouse.ts` — re-export the new types.
- `packages/builder-tools` — include `connectors/` in the build inputs for browser + node bundles.

### 1.5 Tests

- Loader unit tests mirroring the existing processor-loader tests.
- A fixture package under `packages/reactor-api/test/fixtures/` exporting a trivial connector.
- Manifest round-trip: author → validate → slim → JSON-schema-validate.

**Exit criteria.** A fixture package's connector is discovered by `PackageManager`, appears in
`PackageManagerResult.connectors`, survives a file edit (hot reload emits), and shows up in the
`/packages` listing. `pnpm build && pnpm test` green across the monorepo.

**Do not**: register anything with a runtime; there isn't one yet.

---

## Phase 2 — Document models and read models (1 week)

**Goal.** Workflows, connections and runs exist as documents; a read model knows the desired trigger
set.

### 2.1 The models

New reactor package inside the monorepo: `packages/workflow-models/` (or fold into
`packages/vetra`; see [`04-open-questions.md#q1`](./04-open-questions.md)). Generated with the normal
codegen from `.graphql` schemas:

- `powerhouse/workflow` — §4.1 of the spec
- `powerhouse/connection` — §4.2
- `powerhouse/workflow-run` — §4.3

Each with `v1/`, `upgrades/`, reducers, tests — the standard shape (see
`packages/vetra/document-models/processor-module/` for the canonical layout).

**Reducer rules to enforce:**
- `version` increments on every structural mutation; a config-only edit does not.
- `ADD_EDGE` rejects an edge that would create a cycle (pure check inside the reducer, so an invalid
  workflow cannot exist in state).
- `SET_WORKFLOW_STATUS → ENABLED` rejects when the graph has no trigger, has an unreachable step, or
  references an unknown `blockType`/`connectionId`. Validation is a pure function in
  `shared/workflow/validate.ts` so the editor, the CLI and the reducer all use the same one.
- `powerhouse/workflow-run` accepts `RECORD_*` actions only from the workflow identity (enforced via
  `action.context.signer`, following `recipes/role-based-auth`), plus `REQUEST_CANCEL`/`RETRY_STEP`
  from a human.

### 2.2 Read model

`packages/reactor-workflow/src/read-model/workflow-definition-read-model.ts` — a
`RelationalDbProcessor` over `powerhouse/workflow` + `powerhouse/connection`, namespace `workflow`,
maintaining:

- `workflow_definition(workflowId, driveId, version, status, triggerJson, policyJson, hash)`
- `workflow_connection(connectionId, connectorId, status, configHash)`
- an emitted `desiredTriggers` view

This is the one place the supervisor reads from, so the supervisor never parses documents itself.

### 2.3 Validation library

`packages/shared/workflow/validate.ts` — graph validation (cycles, reachability, port existence,
schema conformance of each step's `config` against its block type), returning structured diagnostics
`{severity, stepId, code, message}` the editor can render inline.

**Exit criteria.** Documents can be created and edited through the reactor; the read model
materialises the desired trigger set; invalid graphs cannot be enabled; unit tests cover every
reducer and the validator.

---

## Phase 3 — The engine core (2 weeks)

**Goal.** Runs execute in-process, durably, with retries and cancellation. No connectors, no
workers, no triggers yet — only built-in blocks driven by a manual start.

New package: `powerhouse/packages/reactor-workflow/`.

```
src/
  index.ts
  runtime.ts                  createWorkflowRuntime(options) — the composition root
  registry/
    block-registry.ts         id -> BlockType; duplicate id is a construction error
    core-blocks/              branch, switch, filter, foreach, merge, delay, map, template, json,
                              document-read, document-write, attachment, stop
  engine/
    run-coordinator.ts        graph walk, readiness, journal writes, resume
    step-runner.ts            one step: idempotency check, execute, classify errors, retry decision
    expressions.ts            the expression evaluator (sandboxed)
    errors.ts                 FailureClass taxonomy + classification helpers
    context.ts                run context assembly
  queue/
    types.ts                  IWorkflowQueue, StepJob, ReservedJob
    embedded-queue.ts         relational-store driver (default)
    memory-queue.ts           tests
  store/
    migrations/               Kysely migrations for every workflow table
    run-store.ts              run + step_execution + idempotency
    timer-store.ts            durable delays/resumes
  journal/
    journal-writer.ts         relational rows + optional powerhouse/workflow-run document projection
    redaction.ts              secret + declared-field redaction, size caps, overflow -> attachment
  observability/
    analytics.ts  otel.ts  logger.ts
```

### 3.1 Order of work

1. `IWorkflowQueue` + `memory-queue` + `embedded-queue` with the migration, plus the concurrency
   test from spike S4 promoted into the suite.
2. `run-store` + `journal-writer` (relational only; the document projection comes in 3.5).
3. `block-registry` + the pure core blocks (`branch`, `switch`, `filter`, `map`, `template`, `json`,
   `stop`) — no I/O, easy to test.
4. `run-coordinator` graph walk + readiness + `merge` + `foreach`.
5. `step-runner`: idempotency table, error classification, retry with backoff, per-step timeout.
6. `timer-store` + `delay` + suspend/resume.
7. Reactor-touching blocks (`document-read`, `document-write`, `attachment`) via `IProcessorDispatch`
   and `IAttachmentService`, with `meta.workflowRunId/stepId` merged on every write.
8. The `powerhouse/workflow-run` document projection behind `journalAsDocument`.
9. Crash-recovery: rebuild in-flight runs at startup, re-enqueue expired leases, re-arm timers.

### 3.2 Tests that define "done"

- **Golden graphs**: ~20 small workflows (linear, branch, merge, foreach, nested foreach, delay,
  error port, timeout, retry-then-succeed, retry-exhausted) each with an expected journal.
- **Chaos**: kill the coordinator between every pair of journal writes and assert recovery
  invariants (no lost run, no duplicated non-idempotent step beyond one, no stuck `RUNNING`).
- **Idempotency**: re-execute a step with the same key and assert the stored result is returned and
  the side effect is not repeated.
- **Determinism**: the same trigger payload with a fixed `now()` produces byte-identical journals.

**Exit criteria.** `startWorkflow()` on a definition document runs to completion with a correct
journal; a killed process resumes; a step that always fails parks the run per policy.

**Do not**: add workers or connectors. The engine must be testable in a single process.

---

## Phase 4 — Workers and the host bridge (1.5 weeks)

**Goal.** Steps execute in isolated workers; connectors become executable.

### 4.1 Reuse, do not fork

Read `packages/reactor/src/executor/worker/` first. Extract, into
`packages/reactor/src/executor/worker/` (or a new `packages/worker-kit/` if the reactor team prefers
— see [`04-open-questions.md#q5`](./04-open-questions.md)), the parts that are not job-specific:

- `transport.ts` (thread/process abstraction)
- `sanitize.ts`, `error-info.ts`, `errors.ts`
- `forwarding-logger.ts`
- the spawn/health/abort/replace half of `worker-handle.ts`

Leave `protocol.ts`'s reactor-job messages where they are; the workflow worker defines its own
message union in `packages/reactor-workflow/src/worker/protocol.ts`.

### 4.2 New code

```
src/worker/
  protocol.ts        wf-init | wf-execute | wf-abort | wf-load-connector | shutdown
                     ready | wf-result | wf-note | wf-host-call | log | heartbeat | metrics
  pool.ts            N workers, routing, backpressure, replace-on-stall
  entry.ts           worker entrypoint
  run-step.ts        in-worker: resolve block, build context, execute, marshal result
  host-bridge/
    client.ts        worker side: reactor / attachments / secrets / agent / http proxies
    server.ts        host side: authorises and services each wf-host-call
    egress.ts        EgressPolicy enforcement for the worker's HttpClient
```

**Host-bridge authorisation is not optional.** Every `wf-host-call` is checked against the step it
claims to come from: the correlation id must be an in-flight step, the queue token must still own
the job, and the requested capability must be one the block declared. A worker cannot ask for a
secret belonging to a different connection.

### 4.3 Containment

Port the invariants from `pfnur/packages/document-processing`'s supervised engine:

1. One in-flight `wf-execute` per worker slot; queued jobs stay in the parent.
2. Aborting a queued job removes only that job; aborting an active job that does not confirm within
   the grace window **kills and replaces the worker**.
3. The no-progress timer starts at dispatch and resets on each `wf-note`.
4. A worker that cannot be confirmed dead after `SIGKILL` escalates to a fatal host diagnostic.

### 4.4 Connector loading in the worker

`wf-load-connector` carries a `ModuleRef`; the worker `import()`s it, calls `connectorFactory`, and
caches the `ConnectorDefinition[]` per package version. A connector whose `runtimes` exclude the
current runtime is refused at load, not at execute.

**Exit criteria.** A trivial connector action executes in a process worker, writes to the reactor
through the bridge, and its progress notes appear in the journal. A connector that spins forever is
killed within its deadline and the step retries. Secrets are fetched over the bridge and never
appear in any journal row (asserted by a redaction test).

---

## Phase 5 — Triggers (1.5 weeks)

**Goal.** Workflows start by themselves.

```
src/triggers/
  supervisor.ts          reconcile desired vs actual; lease acquisition/renewal; backoff; parking
  lease-store.ts
  dedup-store.ts         (triggerInstanceId, dedupKey) with TTL
  cursor-store.ts
  instances/
    manual.ts            no supervision; start path only
    schedule.ts          cron + interval + timezone, on top of timer-store
    document-event.ts    ONE IProcessor registered with the existing ProcessorManager,
                         filter = union of all document-event triggers; fans out internally
    webhook.ts           endpoint registry + raw-body handler + verification + rate limit
    poll.ts              generic poller driving a connector's TriggerDefinition.poll
    push.ts              generic subscription driving TriggerDefinition.subscribe
```

### 5.1 Rules to implement literally

- **Dedup key is authoritative; the cursor is a fetch optimisation** (`recipes/external-feed-ingest`).
  Rebuild both from the store at startup; never trust memory.
- **Raw bytes before parsing** (`recipes/inbound-webhook-bridge`). Constant-time compare, replay
  window, opaque per-instance endpoint token, constant-time rejection with no body.
- **Poll floors and jitter.** `minIntervalSeconds` from the trigger definition is a hard floor;
  jitter prevents thundering herds after a restart.
- **Backoff and parking.** Consecutive poll failures back off exponentially and, past a threshold,
  park the trigger with a visible error — the processor `errored` state plus backoff.

### 5.2 HTTP wiring

**Superseded by [`10-http-routes-spec.md`](./10-http-routes-spec.md).** The
workflow package mounts nothing itself: core owns `/webhooks/:token` and hands
the package a namespaced `IHttpScope`, so the path family is
`/webhooks/<token>` rather than `/workflows/hooks/:token`, and the token is
minted by the service rather than by the package. Everything below that a
package would still add — a health route, say — goes through
`subgraph.http`, never `httpAdapter.mountNodeRoute`. Still tested on **both**
adapters, via the layer-0 conformance suite (doc 10 §2.5).

**Exit criteria.** A schedule trigger fires on time across a restart; a poll trigger ingests a mock
feed with a redelivery and an out-of-order event without duplicating a run; a signed webhook starts a
run and a tampered one does not; a document-event trigger reacts to a reactor write; two hosts
sharing a database run each poll trigger exactly once.

---

## Phase 6 — Surfaces: GraphQL, MCP, CLI, Connect (2 weeks, parallelisable)

### 6.1 GraphQL subgraph — `packages/reactor-workflow/src/subgraph/`

A `BaseSubgraph` subclass (`packages/reactor-api/src/graphql/base-subgraph.ts`) implementing §8.1 of
the spec. Use the inherited `assertCan*` helpers so workflow/run visibility follows document ACLs;
never invent a second permission model. `runEvents` subscription rides the existing pubsub
(`packages/reactor-api/src/graphql/reactor/pubsub.ts`).

### 6.2 MCP tools — `packages/reactor-mcp/src/tools/workflow.ts`

`listWorkflows`, `getWorkflow`, `startWorkflow`, `getRun`, `cancelRun`, `retryStep`,
`listBlockTypes`, `listConnectors`, `createWorkflow`, `updateWorkflow`. Registered next to the
reactor tools in `createServer`. These are what makes the Vetra agent able to author workflows.

### 6.3 CLI — `powerhouse/clis/ph-cli/src/commands/`

`generate-connector.ts` (copy `generate-processor.ts`, keep `--document` and `--extract`),
`workflow.ts` (`list|show|enable|disable|run|runs|run-log|import|export`),
`connection.ts` (`list|add|check`). Register in `commands/index.ts` and
`packages/shared/clis/args/`.

### 6.4 Codegen — `powerhouse/packages/codegen/src/templates/connectors/`

```
index.ts  factory.ts  factory-builders.ts  connect.ts  switchboard.ts
connector/{index,connection,trigger-poll,trigger-push,trigger-webhook,action}.ts
__tests__/connector.test.ts
```

Plus the generator in `packages/codegen/src/codegen/` and the export line in `templates/index.mts`.
Mirror `generateProcessor` for the "re-generate an existing directory" and "generate for all"
behaviours.

### 6.5 Connect — `powerhouse/apps/connect` + `packages/reactor-browser`

- `EditorModule`s for `powerhouse/workflow`, `powerhouse/connection`, `powerhouse/workflow-run`.
  Config forms are rendered from each block type's JSON Schema — one schema-form component, not one
  form per block.
- `useWorkflowActions(documentId | driveId)` hook + a button surface for `core#manual` triggers.
- `useWorkflowRuns(workflowId)` / `useWorkflowRun(runId)` with live updates via the run-events
  subscription.
- The browser-side runtime: register connect-eligible connectors through the reactor-worker RPC
  layer; grey out server-only blocks with an explanation.

**Exit criteria.** An operator can do the whole loop in Connect: create a connection, build a
workflow, enable it, press a manual trigger button, watch the run, retry a failed step. The Vetra
agent can do the same through MCP.

---

## Phase 7 — Processor convergence (1 week)

**Goal.** Pay back the "improve the processor implementation for maximum synergies" debt, now that
the requirements are known rather than guessed.

Touching `packages/reactor/src/processors/processor-manager.ts` and `packages/shared/processors/`:

1. **Retry with backoff + dead-letter.** Today `status: "errored"` is terminal until a manual
   `retry()`. Add `ProcessorRecord.retry?: RetryPolicy` and a dead-letter hook; keep the current
   behaviour as the default so nothing changes for existing processors.
2. **Stable processor ids by default in new projects.** `legacyProcessorIds` defaults to `true`
   today. Newly generated packages get `false`; add a migration note and a `ph migrate` step.
3. **Extract shared filter/cursor code** into `packages/shared/processors/` so the trigger
   supervisor's document-event bridge uses the same matcher rather than a copy.
4. **Non-drive-scoped registration (optional).** A `scope: "drive" | "global"` on
   `ProcessorRecord`, so a processor that genuinely does not care about drives (the workflow
   document-event bridge is exactly this) registers once instead of per drive. Behind a flag.
5. **A processor host module that is a superset**: `IProcessorHostModule` gains optional
   `attachments`, `secrets`, `http` — the same fields `IWorkflowHostModule` has — so a processor can
   be upgraded to a connector action without rewriting its dependencies.

**Exit criteria.** All existing processor tests pass unchanged; the new options are opt-in; the
document-event trigger uses the shared matcher.

---

## Phase 8 — Agent integration, both directions (1 week)

### 8.1 Workflows call agents

`packages/reactor-workflow/src/agent/`:

- `IAgentGateway` — `ask({prompt, schema, context, signal}) → {output, notes[]}`.
- `mcp-gateway.ts` — talks to any `api-mcp` endpoint; reuses the discovery shape of
  `ph-clint/packages/ph-clint/src/integrations/mastra/mcp.ts`.
- `core#agent` block: config `{agentId, prompt template, outputSchema, maxTokens, temperature}`;
  streams the agent's chunks into the journal as notes; validates the output against the declared
  schema and fails with `VALIDATION` if it does not conform.

In `ph-clint` (separate repo, separate PR):
`packages/ph-clint/src/integrations/powerhouse/workflow-gateway.ts` — adapts an `AgentProvider` to
`IAgentGateway`, so a ph-clint host wires its own agent into the runtime it composes.

### 8.2 Agents call workflows

In `ph-clint`: `createWorkflowCommands(runtime)` enumerates workflows with a `core#manual` trigger
and emits one `defineCommand` each — input schema derived from the workflow's `variables`, output
the run summary. Because a ph-clint command is simultaneously a CLI subcommand, a Mastra tool and an
MCP operation, this single function delivers all three.

Also: `createWorkflowTriggerAdapter(trigger: Trigger)` wrapping an existing ph-clint
`defineTrigger` as a workflow push trigger, so ph-clint implementations migrate incrementally.

### 8.3 Vetra

- `powerhouse/connector` spec document model + editor + a `ConnectorGenerator` in
  `packages/vetra/processors/codegen/document-handlers/generators/`, registered in that directory's
  `index.ts`, mirroring `ProcessorGenerator` (including the `status === "CONFIRMED"` gate).
- Agent skills/prompts for "author a workflow", "author a connector", "diagnose a failed run".

**Exit criteria.** A workflow step asks an agent to classify a payload and branches on the answer; an
agent invoked from the REPL starts a workflow and reports its result; `ph vetra` scaffolds a
connector from a spec document.

---

## Phase 9 — IDP suite and the PFNÜR parity proof (2–3 weeks)

### 9.1 Split the pipeline (in `pfnur-toll-collect-portal`, upstreamable)

`packages/document-processing` → two packages:

- `@powerhousedao/idp-core` — `domain/` (minus toll-statement specifics), `pipeline/`, `features/`,
  `composition/`, the observer, the typed failures, the supervised OCR engine, and the architecture
  test that enforces the layering.
- `@pfnur/idp-issuers` — `issuers/{toll-collect,toll4europe,svg,telepass}` plus the toll-statement
  domain types.

The public surface of `idp-core` stays as small as it is today: the export-surface test moves with it.

### 9.2 The connector

`@powerhousedao/connector-idp` exposing the blocks in §11 of the spec. Strategies and issuer packs
are registered by wiring, so a customer can add an issuer pack without touching the connector.

### 9.3 The parity workflow

Express the PFNÜR flow as a `powerhouse/workflow` document (§11) and run the existing extraction eval
(`pfnur/apps/eval`) against it. **Bar**: same accuracy, within the same per-document time budget,
same parking behaviour on terminal failure.

Migration is two independently shippable steps: (a) pipeline split with the existing BullMQ worker
unchanged; (b) worker replaced by the workflow document, with the BullMQ queue driver so the
deployment topology does not change on the same day as the logic.

**Exit criteria.** The eval passes; the run journal contains everything the old BullMQ job log did;
the old worker can be deleted.

---

## Phase 10 — Desktop and end-user experience (1.5 weeks)

- Compose the runtime in `ph-win-desktop/src/main.ts` with `queue.driver = "embedded"`,
  `workerType: "process"`, `workers.count = 2`.
- Secrets provider backed by the OS keychain through a Tauri command, with an encrypted-file
  fallback; wire it as `ISecretProvider`.
- Webhook triggers disabled by default with an explanatory state in the editor; poll, schedule and
  document-event triggers fully functional offline.
- A first-run "Automations" surface in Connect listing installed connectors, existing workflows and
  a "describe what you want" entry point into the agent.
- Package the IDP connector's runtime assets (ONNX/WASM/model files) in the vendoring step —
  `scripts/vendor-list.ts` — and extend the existing `verifyRuntimeAssets()`-style boot check.

**Exit criteria.** A clean Windows install runs a schedule-triggered and a document-event-triggered
workflow end to end, with no Redis and no Postgres.

---

## Cross-cutting workstreams

### Testing strategy

| Level | What | Where |
|---|---|---|
| Unit | reducers, validator, expression evaluator, retry/backoff, redaction, dedup | alongside each module |
| Contract | every `IWorkflowQueue` driver against one shared suite; every `IPackageLoader` against one shared suite | `packages/reactor-workflow/test/contract/` |
| Golden | ~20 workflow graphs → expected journals | `test/golden/` |
| Chaos | kill between journal writes; expire leases mid-step; replace workers mid-step | `test/chaos/` |
| Integration | real Switchboard + a fixture connector package + a real webhook POST | `packages/reactor-api/test/` |
| Security | redaction over a workflow that echoes its config; forged webhook; a worker asking for another connection's secret | `test/security/` |
| E2E | Connect: create connection → build → enable → run → inspect | `test/e2e/` (Playwright, existing setup) |
| Perf | queue throughput on PGlite and Postgres; 1000 concurrent runs; 500 trigger instances | `test/perf/` |

### Documentation

- `apps/academy` — "Workflows" section: concepts, authoring, connector development, security model.
- A new `recipes/` entry per pattern once the API is stable: `workflow-connector`,
  `workflow-webhook-trigger`, `workflow-agent-decision`. Recipes are how this framework teaches, so
  budget for them explicitly.
- `docs/adr/` — record the decisions in [`04-open-questions.md`](./04-open-questions.md) as ADRs
  once resolved (the repo already has `docs/adr/0001`, `0002`).
- A migration note for processor authors (Phase 7 changes).

### Sequencing summary

```
P0 spike ──▶ P1 module kind ──▶ P2 documents ──▶ P3 engine ──▶ P4 workers ──▶ P5 triggers
                                                                                   │
                                              ┌────────────────────────────────────┤
                                              ▼                ▼                   ▼
                                        P6 surfaces      P7 processors      P8 agents
                                              │                                    │
                                              └──────────────┬─────────────────────┘
                                                             ▼
                                                   P9 IDP + parity ──▶ P10 desktop
```

Rough total: **12–15 weeks for one engineer**, ~8 with two working P6/P7/P8 in parallel after P5.

---

## Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| The embedded PGlite queue is too slow or races | Desktop story collapses | Spike S4 **before** any schema work; fallback designs identified in Phase 0 |
| Third-party connector code destabilises the reactor | Loss of trust in the whole framework | Worker isolation from Phase 4; connectors never run in-process on the server |
| Secrets leak into the journal | Security incident | Redaction at the journal writer, a security test in CI, and a rule that secrets never enter a `StepJob` |
| Run-document volume overwhelms sync | Reactor performance regression | Relational journal is authoritative; documents are opt-in per workflow plus always for failures; retention policy from day one |
| The schema churns after users have workflows | Painful migrations | Document models are versioned with `upgrades/` from v1; ship the upgrade manifest in Phase 2, not later |
| Scope creep into a visual canvas | Delivery slips | Explicitly deferred (§13 of the spec); the document model already carries `position` so the canvas can land later without a migration |
| PFNÜR parity turns out to need a bespoke escape hatch | The generalisation claim fails | Treat any bespoke need as a **missing block type** and add it to the core set; record it |
| Two hosts double-fire a trigger | Duplicate side effects | Leases for poll/push; dedup keys for everything; a fleet test in Phase 5's exit criteria |
| Expression language turns into a programming language | Sandbox escape, unmaintainable | Fixed context, no host access, no user functions in v1; the code block is deferred deliberately |

---

## Definition of done for the feature

All ten acceptance criteria in [`02-feature-spec.md#14`](./02-feature-spec.md) pass, plus:

- `pnpm build && pnpm test && pnpm lint` green in `powerhouse/`, and in `pfnur` for the phase-9 split.
- Academy documentation published for the three audiences (connector developer, workflow author,
  operator).
- At least three recipes merged.
- The workflow runtime disabled by default adds < 5 ms to reactor startup and zero new tables until
  enabled.
- A written migration note for processor authors, and ADRs for every resolved open question.

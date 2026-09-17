# Powerhouse Workflow Automation — Specification (Activepieces-compatible)

**Status:** Draft for implementation. **Supersedes [`02-feature-spec.md`](./02-feature-spec.md)**,
which remains readable as the pre-compatibility design.
**Reads with:** [`07-domain-providers-spec.md`](./07-domain-providers-spec.md) (the configuration
layer), [`06-ap-red-compatible-architecture.md`](./06-ap-red-compatible-architecture.md) (the
measurements behind every compatibility claim), [`05-sota-research.md`](./05-sota-research.md) §5.0
(the cross-check that produced the engine improvements), [`01-repository-landscape.md`](./01-repository-landscape.md)
(ground truth for file paths).

---

## 1. Summary

Workflow Automation adds a runtime-configurable automation layer to Powerhouse: triggers that fire,
graphs that execute durably in isolated workers, and a `powerhouse/workflow` document as the source
of truth.

**The reframe from `02`:** rather than inventing a connector contract, **the Powerhouse workflow
runtime is an Activepieces runtime environment.** We adopt their piece contract as our base
connector interface — their TypeScript types, vendored, implemented rather than adapted — and layer
our own semantics behind it. The result is that a large majority of the 728 open-source Activepieces
pieces run on Powerhouse unmodified, and a connector authored for Powerhouse is a valid Activepieces
piece.

Four things exist after this ships:

1. **A connector module type** whose interface *is* the Activepieces piece interface, extended.
2. **A workflow runtime** — trigger supervisor, run coordinator, worker pool, durable journal.
3. **`powerhouse/workflow` as a document model** — automations configured by users at runtime.
4. **An attester identity** that vouches for domain checks and signs automated writes (§11).

### 1.1 Compatibility policy

**Goal: the vast majority of Activepieces pieces run unmodified. Not 100% compatibility.**

Stated internally as "Powerhouse is an Activepieces-compatible runtime"; stated externally as "many
Activepieces pieces run unmodified". The difference matters because their bundle format is an
explicitly private contract that will move ([`05 §5.1`](./05-sota-research.md)).

| We guarantee | We do not guarantee |
|---|---|
| The documented piece-authoring surface: `createPiece/createAction/createTrigger`, `Property.*`, `PieceAuth.*`, `httpClient`, `Store`, `FilesService` | Their internal engine behaviour, undocumented context members, or bundle-format stability |
| A piece authored for Powerhouse is publishable to Activepieces unchanged | That every Activepieces feature has a Powerhouse equivalent |
| Conformance measured continuously against the 728-piece corpus (§13) | A named piece working on a named date |

Where their design is weaker than ours we **extend rather than conform** — their types define the
connector-facing surface; our engine keeps its own semantics behind it
([`05 §5.0` B1–B5](./05-sota-research.md)).

### 1.2 Design stance

- **Their contract is the base; ours is a structural superset.** Our `ActionContext` does not convert
  to theirs — it *is* theirs, widened. Compile-time structural typing enforces the superset property.
- **Extend, don't parallel.** The package loader, manifest, worker protocol, codegen pipeline and
  relational processor storage are all reused.
- **The document is the source of truth.** Definition, connection, run journal and audit trail are
  documents or projections of documents.
- **The worker boundary is a security boundary.** Connectors are third-party code holding credentials.
- **At-least-once with explicit idempotency.** Exactly-once is not offered.
- **Degrade to the desktop.** Anything needing Redis or Postgres sits behind a port whose default
  driver runs on PGlite.
- **Reducers stay pure.** Every impure check is a separate, attested pass ([`07 §6`](./07-domain-providers-spec.md)).

### 1.3 Non-goals (v1)

- No visual canvas editor (the document model carries `position` so it can land later).
- No workflow marketplace or billing.
- No exactly-once delivery, no distributed transactions.
- No user-authored code blocks — deliberately deferred (§14); note Activepieces' `CODE` action has no
  Powerhouse equivalent in v1, and a piece is unaffected by that.
- No replacement of `IProcessor`. Processors stay; workflows sit above them.
- No Node-RED node hosting ([`06 §3`](./06-ap-red-compatible-architecture.md) closes that at L3).

---

## 2. Vocabulary

Aligned to Activepieces' terms wherever one exists, because shared vocabulary is most of what makes a
compatibility claim usable.

| Term | Activepieces | Meaning here |
|---|---|---|
| **Connector** | Piece | A package module integrating one external service. `@scope/pkg#connectorId` |
| **Connection** | App connection | A configured, credential-bearing instance. A `powerhouse/connection` document |
| **Block** | Action / Trigger | A node type usable in a graph |
| **Step** | Step | An instance of a block in a definition, with bound config and edges |
| **Workflow** | Flow | A `powerhouse/workflow` document: steps + edges + trigger + policy |
| **Run** | Flow run | One execution |
| **Journal** | Flow run logs | The durable, append-only record — resume log and audit trail |
| **Envelope** | Trigger payload item | `{dedupKey, occurredAt, payload, attachments[]}` |
| **Waitpoint** | Waitpoint | A resumable suspension point a block can mint |
| **Attester** | — | The identity that signs domain checks and automated writes (§11) |
| **Domain provider** | `Property.Dropdown.options` | Live legal values for a field ([`07`](./07-domain-providers-spec.md)) |

---

## 3. Personas and surfaces

| Persona | Surface | What they do |
|---|---|---|
| **Connector developer** | `ph generate connector`, Vetra Studio | Writes connectors against the piece contract; publishes to the Powerhouse registry *and*, if they wish, to Activepieces |
| **Platform builder** | Vetra Studio, Connect, `ph` | Assembles workflows into a product |
| **Operator** | Connect workflow editor, run inspector | Creates connections, builds workflows, watches runs, retries failures |
| **End user** | Desktop app, Connect buttons, chat | Says what they want; presses a button; gets notified |
| **Agent** | MCP tools, ph-clint commands | Authors, edits, enables and runs workflows; is also called by them |

---

## 4. The connector contract

### 4.1 It is the piece contract

`packages/workflow-compat/` vendors four MIT packages (~7,900 LOC, provenance-headed, EE-contamination
checked in CI) and exposes them under their original specifiers:

| Vendored | Purpose |
|---|---|
| `@activepieces/pieces-framework` | The property / auth / trigger / action type system |
| `@activepieces/pieces-common` | `httpClient`, auth converters, validation, stream helpers |
| `@activepieces/core-utils` | Small utilities, incl. the SSRF IP classifier |
| `@activepieces/core-piece-types` | Connection value types, OAuth2 grants, webhook handshake strategies |

Powerhouse's own types alias theirs:

```ts
// packages/shared/workflow/types.ts
import type { Piece, Action, Trigger, ActionContext, TriggerHookContext } from "@activepieces/pieces-framework";

export type ConnectorDefinition = Piece;              // the base contract, verbatim
export type ActionDefinition    = Action;
export type TriggerDefinition   = Trigger;

/** Width subtyping: a piece typed against ActionContext accepts this; extras are invisible to it. */
export interface PowerhouseActionContext<A, P> extends ActionContext<A, P> {
  reactor: ReactorBridge;            // read + execute, meta.workflowRunId/stepId merged on every write
  attachments: AttachmentBridge;
  agent?: AgentBridge;
  domains: DomainBridge;             // resolve a domain provider from inside a step
  idempotencyKey: string | undefined;
  attempt: number;
  signal: AbortSignal;
  failure: FailureClassifier;        // let a connector classify its own error (§9.5)
}
```

**Both projects pin zod 4.3.6** (verified in `pnpm-workspace.yaml` and their framework manifest), so
the property schemas compose without a version shim.

### 4.2 What the runtime implements

Measured usage across 728 pieces ([`06 §2.2`](./06-ap-red-compatible-architecture.md)) drives the
priority:

| Context member | Pieces | Implementation |
|---|---|---|
| `propsValue`, `auth` | all | Resolved step input; `powerhouse/connection` |
| `store` | ≤255 | `KeyValueState` over the relational namespace, `PROJECT`\|`FLOW` scope |
| `files` | 74 | `IAttachmentService`; `write()` returns a ref |
| `run.stop / respond` | 2 | Terminal verdict; webhook response hook |
| `run.createWaitpoint / waitForWaitpoint` | 9 | §7.4 — a first-class engine primitive |
| `project`, `flows` | 7, 6 | Mapped to drive + workflow identity |
| `server` | 7 | Our internal API base; a piece reaching it gets a scoped token, never the host's |
| `app.createListeners` | 4 | Shared app-webhook registry (§8.3) |
| `tags`, `output.update` | 1, 0 | Run tags; live partial output into the journal |
| `agent.tools` | — | `IAgentGateway` |

**Runtime types are nominal.** `Piece`, `IAction` and `ITrigger` are classes, and a published bundle
carries its own inlined copy. Loading duck-types on `constructor.name === "Piece"`, exactly as their
own child process does. Nothing may be built on `instanceof`.

### 4.3 Powerhouse extensions

Every extension is additive and optional. A connector using none of them is a valid piece.

| Extension | Why |
|---|---|
| `ctx.reactor` | Read and write Powerhouse documents under the run's identity |
| `ctx.attachments` | Content-addressed bytes, refcounted, ACL-inherited |
| `ctx.domains` | Resolve a domain provider mid-run |
| `ctx.failure.classify(err)` | Feed our retry taxonomy instead of "any failure retries" |
| `idempotent?: boolean` on an action | Declares re-execution safety; drives the idempotency table |
| `redact?: string[]` on a trigger | Fields never journaled verbatim |
| `runtimes?: WorkflowRuntime[]` | Where the block may execute (`switchboard` \| `connect` \| `worker`) |
| `minIntervalSeconds` on a poll trigger | Poll floor, enforced by the supervisor |
| Pagination on domain providers | Their `DropdownState` has none ([`07 §4`](./07-domain-providers-spec.md)) |

### 4.4 Deliberate divergences

| Their behaviour | Ours | Rationale |
|---|---|---|
| Dedup by convention in `pollingHelper` (cursor comparison in the piece's own store) | `dedupKey` authoritative in a `trigger_dedup` TTL table; cursor is a fetch optimisation | Their `LAST_ITEM` re-emits a whole page when the anchor is deleted; `TIMEBASED` drops equal-timestamp items. Evidenced by their own jira-cloud fix ([`05 §5.0 B1`](./05-sota-research.md)). `pollingHelper` still ships for compatibility; its output feeds our dedup |
| Any failure retries; backoff is an in-process `setTimeout` holding the worker | Failure taxonomy drives retry; backoff by re-enqueue | Holding a worker slot through a backoff is a capacity bug |
| Flow is a linked list (`nextAction`) with nested router/loop | DAG with typed ports and an explicit `core#merge` | Parallel branches are inexpressible in a linked list |
| Fresh child process per call | Pooled workers with abort-and-replace | Process spawn per step is a real cost at our volumes |
| No delivery authority | Queue token must still own the job for a journal write to land | Makes worker replacement safe |

**Import direction:** an Activepieces flow (linked list) converts to our DAG mechanically. Export is
lossy for parallel branches, and we say so rather than pretending otherwise.

### 4.5 Built-in blocks (`core#…`)

Shipped by the runtime, not by a connector; a superset of Activepieces' `CODE` / `LOOP_ON_ITEMS` /
`ROUTER` / `PIECE`.

| Block | Kind | Purpose |
|---|---|---|
| `core#manual` | trigger | User button in Connect, or API/MCP |
| `core#schedule` | trigger | Cron / interval with timezone |
| `core#document-event` | trigger | Reactor operations matching a `ProcessorFilter` |
| `core#webhook` | trigger | Generic signed webhook |
| `core#branch` / `core#switch` / `core#filter` | logic | Boolean, labelled cases, silent stop |
| `core#foreach` / `core#merge` | logic | Fan-out with `maxParallel`; join `all`\|`any`\|`first` |
| `core#delay` | logic | Durable wait — the run is suspended, not held |
| `core#map` / `core#template` / `core#json` | transform | Expression reshaping, string templating, parse/stringify |
| `core#document-read` / `core#document-write` | action | Reactor access, `meta.workflowRunId/stepId` merged |
| `core#attachment` | action | Move bytes |
| `core#agent` | agent | Ask an agent, with a declared output schema |
| `core#approval` | human | One caller of the waitpoint primitive (§7.4) |
| `core#subflow` | subflow | Start another workflow; await or fire-and-forget |
| `core#stop` | terminal | End with an explicit status |
| `mcp#call-tool` | action | Any MCP server's tool ([`05 §7`](./05-sota-research.md)) |

`core#document-event` is the deliberate bridge: anything a processor can react to, a workflow can
react to.

### 4.6 Expressions

JSONata over a fixed context, evaluated in the worker. Context:
`{run, trigger, steps: {<stepKey>: {output, status}}, vars, secrets: <forbidden>}`. Referencing
`secrets` is a validation error, not a runtime one.

Activepieces pieces use their own `{{mustache}}` / formula tokens in *stored config*. The adapter
resolves those with our resolver before the piece sees `propsValue`, so a piece never learns which
expression language the host speaks.

Implementation note: adopt `@node-red/util`'s message-property and JSONata helpers (Apache-2.0,
2,149 LOC) rather than writing our own ([`06 §5`](./06-ap-red-compatible-architecture.md)).

---

## 5. Document models

Four models. Two runtime, two design-time. Unchanged from `02` except where noted.

### 5.1 `powerhouse/workflow`

```graphql
type WorkflowState {
  name: String!
  description: String
  status: WorkflowStatus!          # DRAFT ENABLED DISABLED ARCHIVED
  version: Int!                    # bumped on every structural edit; a run pins it
  trigger: TriggerBinding
  steps: [WorkflowStep!]!
  edges: [WorkflowEdge!]!
  variables: [WorkflowVariable!]!
  policy: WorkflowPolicy!
  lastRunAt: DateTime
  lastRunStatus: RunStatus
}

type WorkflowStep {
  id: OID!
  key: String!                     # author-visible, unique, used in expressions
  name: String!
  blockType: String!               # 'core#branch' | '@acme/connector-imap#imap.sendMail'
  connectionId: PHID @documentOfType(type: "powerhouse/connection")
  config: Unknown!                 # validated against the block's configSchema
  retry: RetryPolicy
  timeoutSeconds: Int
  idempotencyKeyExpression: String
  position: Point                  # layout only
}

type WorkflowEdge {
  id: OID!
  from: OID!
  to: OID!
  port: String!                    # 'next' | 'true' | 'false' | 'error' | a case label
  condition: String                # optional guard
}

type WorkflowPolicy {
  concurrency: ConcurrencyMode!    # SINGLETON | QUEUE | PARALLEL
  maxParallelRuns: Int
  runTimeoutSeconds: Int!
  maxSuspensionDays: Int!          # bounds a waitpoint; adopted from their paused-flow timeout
  defaultRetry: RetryPolicy!
  onFailure: FailureMode!          # PARK | NOTIFY | IGNORE
  retainRunsDays: Int!
  journalAsDocument: Boolean!
}
```

Note the `@documentOfType` binding on `connectionId` — the first use of
[`07`](./07-domain-providers-spec.md) inside this feature. It gives the editor its connection picker
for free, and it is `REACTOR` reach, so a workflow document exported out of its drive carries an
attested snapshot of which connection it referenced rather than a dangling `PHID`.

Actions: `SET_WORKFLOW_NAME`, `SET_WORKFLOW_STATUS`, `SET_TRIGGER`, `CLEAR_TRIGGER`, `ADD_STEP`,
`UPDATE_STEP`, `REMOVE_STEP`, `ADD_EDGE`, `REMOVE_EDGE`, `SET_STEP_CONFIG`, `SET_POLICY`,
`SET_VARIABLE`, `REMOVE_VARIABLE`. Every structural action bumps `version`.

### 5.2 `powerhouse/connection`

```graphql
type ConnectionState {
  name: String!
  connectorId: String!             # '@acme/connector-imap#imap'
  """Activepieces auth kind, so a piece's PieceAuth maps directly."""
  authType: ConnectionAuthType!    # SECRET_TEXT | BASIC_AUTH | CUSTOM_AUTH | OAUTH2 | OIDC | NONE
  config: Unknown!                 # non-secret, validated against configSchema
  secretRefs: [SecretRef!]!        # opaque handles; values never in state, operations or journal
  status: ConnectionStatus!        # UNCONFIGURED | OK | ERROR | REVOKED
  lastCheckedAt: DateTime
  lastError: String
  accountLabel: String             # display only
}
```

`authType` mirrors `AppConnectionType` deliberately: 552 pieces use `SecretText`, 228 `CustomAuth`,
117 `OAuth2`, 11 `BasicAuth`. Supporting the enum verbatim is what makes their auth model work.

One connection serves many workflows; revoking it disables all of them; the ACL on credentials is not
the ACL on automations.

### 5.3 `powerhouse/workflow-run`

As `02 §4.3`, plus two additions:

```graphql
type StepExecution {
  # … as before …
  """Attestation bundles produced by this step's writes. See §11."""
  attestations: [AttestationBundle!]!
  """Large outputs are sliced out; this is the ref. See §9.7."""
  outputRef: LogSliceRef
}
```

The relational journal stays authoritative; the document is written when `journalAsDocument` is on,
plus always for `FAILED`/`PARKED`.

### 5.4 `powerhouse/connector` (Vetra design-time spec)

Mirrors `powerhouse/processor`, with `status: CONFIRMED` triggering codegen. The generator's output
target is now the **piece template** — `createPiece`/`createAction`/`createTrigger` — so generated
code is valid in both ecosystems, and their `.agents/skills/piece-builder` conventions apply to our
agent codegen too.

### 5.5 `powerhouse/workflow-template`

Deferred to v1.1; the document type id is reserved now.

---

## 6. Manifest, packaging, distribution

### 6.1 Two provider kinds

```jsonc
{
  "name": "@acme/connector-imap",
  "connectors": [
    { "id": "imap", "name": "IMAP Mailbox", "runtimes": ["switchboard", "worker"],
      "triggers": [{ "id": "newMessage", "kind": "poll" }],
      "actions":  [{ "id": "sendMail" }],
      "capabilities": ["oauth2"] }
  ],
  "domainProviders": [{ "id": "folders", "kind": "extrinsic", "requiresConnection": true }],
  "config": [
    { "name": "IMAP_HOST", "type": "var", "required": true },
    { "name": "IMAP_PASSWORD", "type": "secret", "required": true }
  ]
}
```

A connector may be produced by a **provider**, not only by a `connectorFactory` export. Two ship in
v1: the native provider (`connectors/index.ts` → `connectorFactory`, mirroring `processorFactory`),
and the **Activepieces provider**, which loads a published piece bundle and yields a normal
`ConnectorDefinition`. The engine never learns Activepieces exists.

Remember all three registration points: `ManifestSchema`, `manifest-slim.ts MODULE_KEYS`,
`connect/schema-fragments.ts`.

### 6.2 Capability declaration

A connector declares what it needs (`oauth2`, `waitpoints`, `appWebhooks`, `dynamicProps`,
`nativeModules`). A host that cannot provide a capability **refuses the connector at load time with a
named reason**, exactly as `runtimes` already refuses a browser-ineligible connector. This is what
makes "optional superset" enforceable in both directions rather than aspirational.

### 6.3 Loading an Activepieces piece

```
piece bundle (npm tarball or cdn.activepieces.com)
   └─▶ import() ─▶ find export where constructor.name === "Piece"
        └─▶ piece.metadata() ─▶ ConnectorDefinition (pure translation)
             └─▶ per dynamic property ─▶ a synthesised domain provider
                                          id: activepieces:<piece>#<action>.<prop>
```

No build step and no dependency on `@activepieces/*` npm packages — which is exactly the dependency
they withdrew at v0.86.0. Bundles inline the framework, so egress control for adapted pieces rests on
the DNS guard (§10) rather than on `httpClient` substitution.

### 6.4 Project layout and hot reload

`connectors/` and `domain-providers/` join `document-models/`, `editors/`, `processors/`,
`subgraphs/`. Hot reload is unchanged from processors: watcher → `PackageManager.loadConnectors` →
`connectorsChange` → unregister, revalidate affected workflows, restart affected trigger instances,
and **let in-flight runs finish on the old definition** (a run records `workflowVersion` and the
connector version it used).

---

## 7. Runtime architecture

```
 Reactor ops ──▶ WorkflowDefinitionReadModel (IProcessor over workflow + connection docs)
                          │ desired trigger set
                          ▼
                 TriggerSupervisor ── leases · timers · pollers · push subs
                          │            webhook registry · app-webhook demux · dedup · cursors
                          │ TriggerEnvelope
                          ▼
                 RunCoordinator ── concurrency · journal · readiness · waitpoints · resume
                          │ StepJob (IWorkflowQueue → pg-boss)
                          ▼
                 WorkerPool ── import connector · run one step · host bridge RPC
                          ▲
 Editor ──▶ DomainResolver ─┘  (same pool, same isolation, no journal — see 07 §5)
```

### 7.1 Where it lives

New package `@powerhousedao/reactor-workflow` (Node), types in `@powerhousedao/shared/workflow`
(isomorphic), compat packages in `@powerhousedao/workflow-compat`. Composed in `reactor-api`'s
`startServer` next to `ProcessorManager` via an opt-in host import, so a Switchboard with the runtime
disabled carries none of its dependencies.

Connect gets manual triggers, document-event triggers, core logic/transform blocks and any connector
declaring `runtimes: ["connect"]`. Everything else is greyed out with "requires a server".

### 7.2 TriggerSupervisor

- **Input**: `(workflowId, version, trigger)` where `status === ENABLED`, from a read model.
  Reconciles on change and at startup.
- **Leases**: `trigger_lease(triggerInstanceId, holder, expiresAt)`, heartbeat-renewed. Exactly one
  host polls a given trigger.
- **Poll scheduling**: per-trigger interval with jitter, floored by `minIntervalSeconds`, exponential
  backoff on consecutive failure, parked after N. A trigger may adjust its own schedule at runtime via
  `setSchedule` (their mechanism — useful for honouring a rate-limit header).
- **Cursor + dedup**: `trigger_state` and `trigger_dedup` with TTL. The cursor is a fetch
  optimisation; `dedupKey` is authoritative. An adapted piece's `pollingHelper` output is mapped to a
  `dedupKey` by the adapter.
- **Webhooks**: `/webhooks/:token`, owned by core and reached through the package's
  `IHttpScope` — see [`10-http-routes-spec.md`](./10-http-routes-spec.md), which
  supersedes this bullet's transport half. The pipeline is unchanged in substance
  (verify raw → parse → dedup → enqueue) but core performs all of it before the
  handler runs: token lookup, the signature schemes with constant-time
  comparison, the replay window, dedupe, the challenge echo, header redaction,
  the body cap and the per-endpoint token bucket. Unverified requests get a
  constant-time 401, and an unknown token, a malformed token and a disarmed
  endpoint answer identically. What the workflow package contributes is which
  document a delivery belongs to and what running it means. Webhook **renewal**
  is supported (`onRenew` + a CRON renew strategy) for providers whose
  subscriptions expire.
- **App webhooks**: one shared endpoint per connector, demultiplexed to trigger instances by an
  identifier declared through `ctx.app.createListeners`. Required by providers that permit only one
  webhook per app; 4 pieces use it today.
- **Document events**: a *single* `IProcessor` whose filter is the union of all `core#document-event`
  filters, fanning matched operations out. One processor, not one per workflow.

### 7.3 RunCoordinator

- Applies `WorkflowPolicy.concurrency`; creates the run; writes the (redacted) trigger firing; walks
  the graph. A step is **ready** when every inbound edge is taken-and-satisfied or provably not-taken.
- Enqueues one `StepJob` per ready step. `core#foreach` enqueues per item with a shared parent
  execution and per-item children, addressed by a **step execution path** so nested loops journal
  unambiguously.
- On a result: append to the journal, evaluate outgoing edges, enqueue newly-ready steps.
- Run-level timeout cancels outstanding steps via `AbortSignal` and marks the run `FAILED`.
- Terminal failure: retry per policy, then the step's `error` port if wired, else `onFailure`.

### 7.4 Waitpoints

Promoted from a built-in block to an engine primitive available to any connector — the generalisation
of `core#approval`:

```ts
const wp = await ctx.run.createWaitpoint({ type: "WEBHOOK", resumeDateTime, responseToSend });
await sendForSignature(wp.buildResumeUrl({ queryParams: { … } }));
ctx.run.waitForWaitpoint();          // the run suspends; no worker, no connection held
```

Bounded by `policy.maxSuspensionDays`. Resumption re-enters the step with
`executionType: RESUME` and a `resumePayload`. **A suspended run holds no worker and no connection.**
This is what makes e-signature, external review and Slack-interactive connectors expressible; 9
pieces use it today and every human-in-the-loop integration needs it.

### 7.5 Step execution in a worker

Extends the reactor worker protocol (`packages/reactor/src/executor/worker/protocol.ts`):
structured-clone only, `ErrorInfo` marshalling, `sanitize.ts` on every outbound message.

```ts
type WorkflowInitMessage   = { type:"wf-init"; correlationId; workerId; hostBridgePort?: MessagePort;
                               egressPolicy: EgressPolicy; connectors: ConnectorLoadSpec[] }
type ExecuteStepMessage    = { type:"wf-execute"; correlationId; job: StepJob }
type ResolveDomainMessage  = { type:"wf-resolve-domain"; correlationId; binding; args; search; cursor }
type AbortStepMessage      = { type:"wf-abort"; correlationId; targetCorrelationId; reason? }
type LoadConnectorMessage  = { type:"wf-load-connector"; correlationId; spec: ConnectorLoadSpec }
```

`StepJob` carries `{runId, stepId, stepKey, attempt, blockType, config, input, connectionId,
idempotencyKey, deadline, traceparent}` and **no secrets**.

**Code is addressed by path, not by function reference.** The host holds a serialisable descriptor
plus a list of callable paths (`["actions", name, "run"]`); the worker resolves and invokes. This is
their design and it is the only shape that survives a worker boundary — our `02` contract carried
live functions that cannot cross one.

**Containment.** A step whose deadline elapses is aborted; if the worker does not confirm within a
grace window it is **killed and replaced**, because a connector may be inside a native call that
cannot unwind. Queued jobs live in the parent. The no-progress timer resets on each progress note.
Pending context taps are drained (`allSettled`) before teardown, so the last notes before a crash —
the interesting ones — survive.

### 7.6 The queue port

```ts
export interface IWorkflowQueue {
  enqueue(job: StepJob, opts?: { delayMs?: number; priority?: number }): Promise<{ jobId: string }>;
  reserve(count: number, leaseMs: number): Promise<ReservedJob[]>;
  ack(jobId: string, token: string): Promise<void>;
  fail(jobId: string, token: string, retryInMs: number | null): Promise<void>;
  cancel(selector: { runId?: string; jobId?: string }): Promise<number>;
  stats(): Promise<QueueStats>;
}
```

| Driver | Backing | Used by |
|---|---|---|
| `embedded` | **pg-boss v12** — `FOR UPDATE SKIP LOCKED` on Postgres, embedded PGlite on desktop | default everywhere |
| `bullmq` | Redis | multi-node deployments that already have it |
| `memory` | in-process | tests |

`ReservedJob.token` is the **delivery authority**: a journal write is refused if its token no longer
owns the job. This is what makes worker replacement safe.

### 7.7 Persistence

Relational namespace `workflow` via `IRelationalDb.createNamespace("workflow")`, Kysely migrations:
`trigger_instance`, `trigger_lease`, `trigger_state`, `trigger_dedup`, `run`, `step_execution`,
`workflow_job`, `timer`, `waitpoint`, `idempotency`, `connection_health`, `log_slice`.

### 7.8 Observability

Analytics dimensions per run and step; one OTel span per run and per step with `traceparent`
propagated into the worker; `ctx.note()` and `ctx.output.update()` as taps — never awaited by the
step, always drained before teardown; run **tags** for search. A run inspector in Connect: timeline,
redacted per-step input/output, cause chains, retry and cancel.

---

## 8. Configuration and the editor

Step configuration is where the compatibility work becomes visible to users, and it is
[`07-domain-providers-spec.md`](./07-domain-providers-spec.md) doing the work.

- A block's `configSchema` is rendered as a form. Fields with domain bindings render as pickers
  backed by `resolveDomain`.
- An adapted piece's `Property.Dropdown` becomes a synthesised extrinsic provider; its `refreshers`
  become `$field` argument references, which give invalidation and cache keys for free.
- `Property.DynamicProperties` is permitted here — connector config is opaque JSON, not document
  model state ([`07 §4.4`](./07-domain-providers-spec.md)).
- Enforcement for connector config defaults to `NONE`: a piece's config is not a reference the
  document model needs to guarantee. Attestation is for references that mean something —
  `connectionId`, document links.

**Without this channel, 432 of 728 pieces render every dropdown as a free-text box.** It is a
precondition for the compatibility claim, not an enhancement — and it is owed to our own connectors
regardless.

---

## 9. Execution semantics

1. **At-least-once.** A step may execute more than once. Actions declare `idempotent`; steps declare
   `idempotencyKeyExpression`; the `idempotency` table short-circuits a repeat with the stored result.
2. **Ordering.** Topological. Parallel branches have no relative ordering. `core#merge` is the only join.
3. **Isolation.** No shared mutable state between steps except the run context, written only by
   completed steps.
4. **Cancellation is cooperative; correctness is not.** Cancelling sets run status first, then
   signals; a step that finishes anyway has its result refused by the delivery-authority check.
5. **Failure classes.** `TRANSIENT`, `RATE_LIMIT`, `TIMEOUT`, `AUTH`, `VALIDATION`, `PERMANENT`, plus
   **`RESOURCE`** (OOM/heap — retry once on a fresh worker, then park) and **`DEFECT`** (our bug —
   never retry, always report). Only the first three retry by default. `AUTH` marks the connection
   `ERROR`, which surfaces on every workflow using it.
6. **Resumption.** A restarted host rebuilds in-flight runs from the journal, re-enqueues steps whose
   leases expired, re-arms timers and waitpoints. Cursors and dedup sets come from the store, never
   from memory. Completed steps are skipped on resume.
7. **Versioning.** A run pins `workflowVersion`; editing a running workflow never mutates a run in
   flight. The **context contract is versioned too** — a connector declares the context version it
   was built against and the host adapts, so a connector shipped today keeps working when the context
   grows. This cannot be retrofitted once third parties ship connectors.
8. **Determinism of expressions.** Expressions are pure; `now()` is injected from the run context.
9. **Log budget.** A step output over the slice threshold is written to the log store and replaced by
   a ref, rehydrated lazily through a byte-budgeted LRU. A running per-run byte total fails the run
   as `LOG_SIZE_EXCEEDED`. Per-step caps do not bound a 500-step run.

---

## 10. Security model

| Concern | Control |
|---|---|
| **Credential exposure** | Secrets live in `ISecretProvider`, referenced by name from `powerhouse/connection`. Never in document state, operations, journal, logs or a `StepJob`. Resolved per step, scoped to that step's lifetime |
| **Secrets in the journal** | **Dual resolution**: every input template is resolved twice — once live, once censored — and the censored pass is journaled. Redaction by construction, not by string-matching a value that may have been base64'd or sliced. Value-matching remains a backstop for outputs and errors |
| **Third-party code** | Connectors execute in workers (`process` isolation by default on the server), never in the reactor's thread |
| **Network egress** | Enforced at **DNS resolution** inside the worker: `dns.lookup` is guarded and the *resolved IP* is classified against the policy. This survives DNS rebinding and binds any HTTP client — necessary because 34 of 728 pieces call `fetch` directly. `httpClient` substitution covers the other 642 when loading from source |
| **Connection binding** | A connection is bound to its connector; a worker asking for another connector's connection is refused. **Default-on and not configurable** — we are greenfield and do not need their env-gated retrofit |
| **Webhook forgery** | Raw-byte verification before parsing, constant-time compare, replay window, opaque per-instance tokens, per-endpoint rate limit |
| **Domain resolution abuse** | Third-party code on a keystroke: per-identity rate limit, short-TTL cache, worker isolation, no journal writes ([`07 §6`](./07-domain-providers-spec.md)) |
| **Reactor writes** | Every write goes through the normal auth scope under the workflow attester identity (§11) |
| **Data exfiltration** | Journal is a document with normal ACLs. Redaction is declared. Snapshots are size-capped; overflow becomes a ref |
| **DoS** | Per-workflow concurrency caps, per-connection rate limits, queue depth limits, run timeouts, poll floors, step budgets |
| **Loops** | Static cycle detection at save; run-level step budget; `core#subflow` depth limit |
| **Supply chain** | Vendored compat code carries provenance headers; CI fails on any path resolving into an `ee/` directory ([`06 §5`](./06-ap-red-compatible-architecture.md)) |

---

## 11. Identity, attestation and signing

This resolves [Q4](./04-open-questions.md) — what identity a run writes as — by observing that the
answer is already required for something else.

**One authority, two jobs.** [`07 §8`](./07-domain-providers-spec.md) needs an identity that resolves
extrinsic domain checks and signs what it found. A workflow run needs an identity that signs the
operations it produces. These have identical requirements: a stable Renown identity, an authority
bounded by grants, a verifiable signature, an audit trail. They are the same thing.

**The workflow attester:**

- A per-workflow Renown identity, minted when the workflow is first enabled, owned by the workflow
  document.
- Its authority is **bounded at enable time** by the enabling user's own grants, checked via
  `evaluateActions` (cf. `recipes/auth-preflight`). Enabling cannot escalate.
- It signs every operation a run produces: `action.context.signer` is the attester, and the existing
  ACL machinery applies unchanged.
- It signs the attestations for extrinsic domain checks its steps performed.
- Revoking it stops every automation that used it, at once, verifiably.

**Provenance on every automated write.** Each operation produced by a run carries:

```ts
action.context = {
  signer: <workflow attester DID>,
  meta: { workflowId, workflowVersion, runId, stepId, stepKey, attempt, triggerDedupKey },
  attestations: <AttestationBundle>,       // one signature over all claims — see 07 §7.3
  onBehalfOf: <enabling identity DID>,     // the grant ceiling, recorded not exercised
}
```

So a reader of the document history can answer, from the document alone: *who wrote this, under whose
authority, which automation and which run produced it, what triggered it, and what external facts
were checked at the time* — each claim independently verifiable.

**Why not the alternatives.** Impersonating the enabling user means an automation keeps running with
the privileges of someone who may have left, and its writes are indistinguishable from theirs. A
single per-reactor service identity gives every workflow the union of all permissions and makes the
audit trail useless. Both were rejected in `02`; the attester framing additionally explains *why* a
per-workflow identity is the right granularity: it is the unit at which authority is granted, revoked
and audited.

**Open:** this needs the Renown owner's input on key minting and rotation
([Q26](./07-domain-providers-spec.md)). Note that [`07` rev 2](./07-domain-providers-spec.md) puts the
attester on the hot path of *ordinary* document editing, not only automated writes — so its
availability and signing cost are a shared concern, not a workflow-only one.

---

## 12. Host integration

**Switchboard / `reactor-api`.** Composed in `startServer` next to `ProcessorManager`, gated by a
`PHWorkflowConfig` block (`enabled`, `queue.driver`, `workers.count`, `egress`, `secrets.provider`,
`attester`). Registers its webhook endpoint family and the shared app-webhook
endpoint through `subgraph.http` rather than mounting anything itself (doc 10
§5.1), plus `GET /workflows/health`. A new `workflows` subgraph reusing `assertCan*` so visibility follows
document ACLs, with `resolveDomain` added to the main schema rather than the subgraph.

**Connect.** Editors for `powerhouse/workflow`, `powerhouse/connection` and `powerhouse/workflow-run`;
domain-backed pickers everywhere; `useWorkflowActions(documentId)` returning manual workflows
applicable to what the user is looking at, rendered as buttons; a reduced browser runtime for
connect-eligible connectors.

**ph-cli / ph-cmd.**

```
ph generate connector --name imap --triggers newMessage --actions sendMail
ph generate connector --document specs/connectors/imap.phd
ph connector import --activepieces @activepieces/piece-slack@0.17.9    # adapt a piece
ph workflow list | show | enable | disable | run | runs | run-log | import | export
ph connection list | add | check
```

**Vetra + ph-clint.** The `powerhouse/connector` spec document generates against the **piece
template**. Workflows call agents through `core#agent` (ph-clint `AgentProvider` and MCP adapters);
agents call workflows because every `core#manual` workflow is exposed as a ph-clint `defineCommand`,
which makes it a CLI subcommand, a Mastra tool and an MCP operation at once. A `defineTrigger` adapter
lets existing ph-clint triggers act as workflow triggers.

**Desktop.** Runtime in the existing sidecar; `queue.driver = "embedded"` on PGlite,
`workers.count = 2`, `workerType: "process"`. Secrets from the OS keychain via a Tauri command, with
an encrypted-file fallback. Webhook triggers disabled by default (no reachable URL) with the editor
saying so; poll and document-event triggers work fully offline.

---

## 13. Compatibility conformance

The 728-piece corpus is a test asset, not a liability.

- **Tier 1 — descriptor** (all 728, every CI run): load, `describe`, translate to a
  `ConnectorDefinition`, assert the descriptor is well-formed and every property maps to a binding.
- **Tier 2 — dry execution** (~50 representative pieces, nightly): execute one action per piece
  against a recorded HTTP fixture; assert output shape and that no secret reaches the journal.
- **Tier 3 — live** (a handful, manual/release): real credentials, real endpoints.

A compatibility report publishes per-piece status (`full`, `degraded — reason`, `unsupported —
capability`) so the claim in §1.1 is measured rather than asserted. Tier 1 over the whole corpus on
each upstream sync is a stronger regression test than anything we would write ourselves — this is the
main argument for keeping the source checkout current.

---

## 14. Deferrals

| Deferred | Why | Revisit |
|---|---|---|
| Visual canvas editor | The model carries `position`; the canvas is UI work that shouldn't gate the runtime | After v1 |
| User-authored code blocks (their `CODE` action) | Needs an isolate and a supply-chain story; their `v8-isolate-code-sandbox` is the precedent | Once the worker boundary is proven |
| Node-RED node hosting | Closed deliberately at L3 ([`06 §3`](./06-ap-red-compatible-architecture.md)); a `nodered#run-flow` sidecar action and a Powerhouse node in their palette instead | v1.1 |
| Workflow templates marketplace | Registry must model non-code artefacts | v1.1 |
| Cross-reactor workflows | Sync semantics for run state across reactors unsolved | After sync input |
| Exactly-once | Not achievable against arbitrary third-party APIs | Never — idempotency keys are the answer |
| Exporting our DAG to an Activepieces flow | Lossy for parallel branches | If a user asks |

---

## 15. Acceptance criteria

1. A developer runs `ph generate connector`, implements one poll trigger and one action, publishes,
   and an operator installs it into a running Switchboard **without a restart**.
2. **`ph connector import --activepieces @activepieces/piece-slack` adapts a published piece bundle,
   its dropdowns populate from a real connection, and one action executes successfully.**
3. **Tier-1 conformance passes for ≥ 90% of the 728-piece corpus, with every exclusion attributed to
   a named unsupported capability.**
4. An operator creates a connection, builds a three-step workflow in Connect, enables it, and sees
   runs in the inspector with per-step inputs, outputs and timings.
5. Killing the Switchboard mid-run and restarting resumes from the journal with no duplicated side
   effects for idempotent steps, and at most one duplicate for non-idempotent ones — visible in the
   journal.
6. A signed webhook with a tampered body is rejected in constant time, journals nothing, starts no run.
7. A connector that hangs in a native call is killed and replaced within its deadline; the step
   retries; the reactor never stalls.
8. Secrets appear nowhere in the journal, logs, GraphQL responses or the workflow document — verified
   by a redaction test over a workflow that deliberately echoes its config, **including a
   base64-transformed secret**, which the dual-resolution design catches and value-matching would not.
9. **A workflow write carries an attester signature and, for every extrinsic domain-bound field, a
   claim in a verifiable attestation bundle; replaying the operation a year later verifies without
   contacting the external system or holding the drive.**
10. The PFNÜR toll-statement flow, expressed as a workflow document, passes the existing extraction
    eval at the same accuracy and within the same per-document time budget.
11. On the desktop, with no Redis and no Postgres, a schedule-triggered and a document-event-triggered
    workflow both run to completion.
12. The Vetra agent, given "when a file lands in this drive, extract its data and notify me", produces
    a valid enabled workflow document without a human editing JSON.
13. Installing a package with connectors adds no measurable cost to reactor startup when the runtime
    is disabled.

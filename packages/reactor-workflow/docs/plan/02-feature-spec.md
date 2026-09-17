# Powerhouse Workflow Automation — Feature Specification

**Status:** Draft for implementation. Supersedes and expands `20260828-briefing.md`.
**Reads with:** [`01-repository-landscape.md`](./01-repository-landscape.md) (ground truth for every
file path referenced here), [`03-implementation-plan.md`](./03-implementation-plan.md),
[`04-open-questions.md`](./04-open-questions.md).

---

## 1. Summary

Workflow Automation adds a **first-class, runtime-configurable automation layer** to the Powerhouse
framework, alongside document models, editors, processors and subgraphs.

Three new things exist after this feature ships:

1. **A `connector` module type** — a distributable unit inside a Reactor package that integrates an
   external service. A connector contributes *connections* (auth + config), *triggers* (push and
   poll), *actions*, and optionally *transforms*. It is discovered, loaded, hot-reloaded and
   distributed exactly like a processor.
2. **A workflow runtime** — a supervisor that instantiates triggers declared by workflow documents,
   and an engine that executes the resulting run graph in isolated workers, durably, with retries,
   cancellation and a full step journal.
3. **`powerhouse/workflow` as a document model** — a workflow is *configured at runtime by a user*,
   in a document, in a drive. Changing the document changes the automation. Nothing is compiled in.

The end state the whole design points at: a user of the Powerhouse desktop app tells an agent
*"when I receive an e-mail, check if it's a new invoice, add it to my billing drive, and notify me on
Discord"*, and gets a working, inspectable, editable workflow document.

### 1.1 Design stance

- **Extend, don't parallel.** Every mechanism reuses an existing one: the package loader, the
  manifest, the processor factory shape, the worker wire protocol, the codegen templates, the Vetra
  spec-document → codegen pipeline, the relational processor storage.
- **The document is the source of truth.** Definition, configuration, run journal and audit trail
  are all documents or projections of documents. No hidden state in a config file.
- **The worker boundary is a security boundary, not a performance one.** Connectors are third-party
  code holding credentials and reaching the network. Isolation is the point; parallelism is a bonus.
- **At-least-once with explicit idempotency.** Exactly-once is not offered. Every side-effecting
  block declares an idempotency key; every trigger declares a dedup key.
- **Degrade to the desktop.** Anything that requires Redis, Postgres or a second process must sit
  behind a port whose default implementation runs inside a single Node sidecar on PGlite.

### 1.2 Non-goals (v1)

- No visual drag-and-drop canvas editor. v1 ships a structured form/list editor; the canvas is a
  follow-up that reads the same document model.
- No cross-organisation workflow marketplace or billing.
- No exactly-once delivery, no distributed transactions across external systems.
- No arbitrary user-authored code blocks (a scripting block is deliberately deferred — see §13).
- No replacement of the existing `IProcessor` mechanism. Processors stay; workflows sit above them.

---

## 2. Vocabulary

| Term | Meaning |
|---|---|
| **Connector** | A package module integrating one external service. Contributes connections, triggers, actions, transforms. Identified `@scope/pkg#connectorId`, e.g. `@powerhousedao/connector-imap#imap` |
| **Connection** | A configured, credential-bearing instance of a connector. Lives as a `powerhouse/connection` document; secrets are stored by reference, never inline |
| **Block** | A node type usable in a workflow graph. Kinds: `trigger`, `action`, `logic`, `transform`, `agent`, `subflow`, `human`, `terminal` |
| **Block type** | The registered definition of a block (its id, input/output schema, capability requirements). Contributed by a connector or built in |
| **Step** | An instance of a block inside a workflow definition, with bound configuration and edges |
| **Workflow definition** | A `powerhouse/workflow` document: a set of steps + edges + a trigger binding + policy |
| **Trigger instance** | A live, supervised subscription/poller/timer/endpoint created from an enabled workflow's trigger step |
| **Run** | One execution of a workflow, started by one trigger firing (or a manual/API start) |
| **Step execution** | One attempt-bearing record of one step inside a run |
| **Journal** | The durable, append-only record of a run's step executions — the resume log and the audit trail |
| **Envelope** | The immutable payload a trigger emits: `{triggerId, dedupKey, occurredAt, payload, attachments[]}` |
| **Workflow runtime** | The host-side supervisor + engine + worker pool |
| **Host bridge** | The capability surface a worker calls back into: reactor, attachments, secrets, agent, HTTP egress, logging |

---

## 3. Personas and surfaces

| Persona | Surface | What they do |
|---|---|---|
| **Package developer** | `ph generate connector`, `ph generate workflow-block`, Vetra Studio | Writes connectors; publishes them to the registry |
| **Platform builder** | Vetra Studio / Connect, `ph` CLI | Assembles workflows into a product; ships default workflow documents in a package |
| **Operator / power user** | Connect workflow editor, run inspector | Creates connections, builds and enables workflows, watches runs, retries failures |
| **End user** | Desktop app, Connect buttons, chat with the Vetra agent | Says what they want; presses a button; gets notified |
| **Agent** | MCP tools, ph-clint commands | Authors, edits, enables and runs workflows on the user's behalf; is also *called by* workflows |

---

## 4. Document models

Four new document models. Two are **runtime** (users edit them to change behaviour), two are
**design-time Vetra specs** (developers edit them to generate code).

### 4.1 `powerhouse/workflow` — the definition (runtime)

```graphql
type WorkflowState {
  name: String!
  description: String
  """DRAFT | ENABLED | DISABLED | ARCHIVED. Only ENABLED workflows get trigger instances."""
  status: WorkflowStatus!
  """Monotonic; bumped on every structural edit. A run records the version it executed."""
  version: Int!

  trigger: TriggerBinding
  steps: [WorkflowStep!]!
  edges: [WorkflowEdge!]!

  """Workflow-level inputs the trigger payload is mapped onto, and defaults."""
  variables: [WorkflowVariable!]!
  policy: WorkflowPolicy!

  """Denormalised for the run inspector; rebuilt by the workflow read model."""
  lastRunAt: DateTime
  lastRunStatus: RunStatus
}

enum WorkflowStatus { DRAFT ENABLED DISABLED ARCHIVED }

type TriggerBinding {
  id: OID!
  """Fully-qualified block type, e.g. 'core#schedule' or '@acme/connector-imap#imap.newMessage'."""
  blockType: String!
  """Connection document id, when the trigger's connector requires one."""
  connectionId: PHID
  """JSON, validated against the trigger's configSchema."""
  config: Unknown!
  """Optional server-side filter applied before a run is started."""
  filter: Unknown
}

type WorkflowStep {
  id: OID!
  """Author-visible label; unique within the workflow; used in expressions."""
  key: String!
  name: String!
  blockType: String!
  connectionId: PHID
  config: Unknown!
  """Per-step overrides of the workflow policy."""
  retry: RetryPolicy
  timeoutSeconds: Int
  """Expression yielding a stable key; two executions with the same key are one side effect."""
  idempotencyKeyExpression: String
  """Layout only. The runtime ignores it."""
  position: Point
}

type WorkflowEdge {
  id: OID!
  from: OID!
  to: OID!
  """Named output port of the source step: 'next', 'true', 'false', 'error', or a case label."""
  port: String!
  """Optional guard expression; the edge is taken only when it evaluates truthy."""
  condition: String
}

type WorkflowPolicy {
  """SINGLETON drops a firing while a run is active; QUEUE serialises; PARALLEL runs concurrently."""
  concurrency: ConcurrencyMode!
  maxParallelRuns: Int
  runTimeoutSeconds: Int!
  defaultRetry: RetryPolicy!
  """What happens to a run whose steps have all failed terminally."""
  onFailure: FailureMode!          # PARK | NOTIFY | IGNORE
  """Keep the journal this long. Attachments are refcounted separately."""
  retainRunsDays: Int!
}

type RetryPolicy {
  maxAttempts: Int!
  backoff: BackoffKind!            # FIXED | EXPONENTIAL
  initialDelaySeconds: Int!
  maxDelaySeconds: Int!
  """Error classes that are retryable at all. Everything else fails terminally on attempt 1."""
  retryOn: [String!]!              # e.g. ["TRANSIENT","RATE_LIMIT","TIMEOUT"]
}
```

Actions (abbreviated): `SET_WORKFLOW_NAME`, `SET_WORKFLOW_STATUS`, `SET_TRIGGER`,
`CLEAR_TRIGGER`, `ADD_STEP`, `UPDATE_STEP`, `REMOVE_STEP`, `ADD_EDGE`, `REMOVE_EDGE`,
`SET_STEP_CONFIG`, `SET_POLICY`, `SET_VARIABLE`, `REMOVE_VARIABLE`.

Every structural action bumps `version`. `SET_WORKFLOW_STATUS` is what the trigger supervisor
watches.

### 4.2 `powerhouse/connection` — a configured connector instance (runtime)

```graphql
type ConnectionState {
  name: String!
  """Fully-qualified connector id: '@acme/connector-imap#imap'."""
  connectorId: String!
  """Non-secret configuration, validated against the connector's configSchema."""
  config: Unknown!
  """Names of the secrets this connection needs, resolved by the host secret provider.
     Values NEVER appear in document state, operations, or the run journal."""
  secretRefs: [SecretRef!]!
  status: ConnectionStatus!        # UNCONFIGURED | OK | ERROR | REVOKED
  lastCheckedAt: DateTime
  lastError: String
  """Populated by the connector's own metadata call, e.g. the mailbox address. Display only."""
  accountLabel: String
}

type SecretRef {
  """Matches a ConfigEntry name in the connector's manifest fragment."""
  name: String!
  """Opaque handle into the host secret provider. Not the secret."""
  ref: String!
}
```

Actions: `SET_CONNECTION_NAME`, `SET_CONFIG`, `SET_SECRET_REF`, `REMOVE_SECRET_REF`,
`RECORD_CHECK_RESULT`.

> **Why a separate document.** One connection serves many workflows; revoking it must disable all of
> them at once; and the ACL on credentials is not the ACL on automations.

### 4.3 `powerhouse/workflow-run` — the run journal (runtime, machine-written)

A run is a document so that it syncs, is authorized by the existing document ACLs, renders in a
normal editor, and can be replayed. It is machine-written; the editor is read-only apart from
`REQUEST_CANCEL` and `RETRY_STEP`.

```graphql
type WorkflowRunState {
  workflowId: PHID!
  workflowVersion: Int!
  status: RunStatus!               # PENDING RUNNING WAITING SUCCEEDED FAILED CANCELLED PARKED
  startedAt: DateTime!
  finishedAt: DateTime
  trigger: TriggerFiring!
  """Append-only. One entry per (step, attempt)."""
  steps: [StepExecution!]!
  """Run-scoped variable snapshot after the last completed step."""
  context: Unknown
  error: RunError
}

type TriggerFiring {
  triggerId: OID!
  blockType: String!
  dedupKey: String!
  occurredAt: DateTime!
  """Redacted per the trigger's redaction rules before it is written."""
  payload: Unknown!
  attachments: [AttachmentRef!]!
}

type StepExecution {
  id: OID!
  stepId: OID!
  stepKey: String!
  attempt: Int!
  status: StepStatus!              # PENDING RUNNING SUCCEEDED FAILED SKIPPED WAITING CANCELLED
  startedAt: DateTime!
  finishedAt: DateTime
  """Redacted input/output snapshots, size-capped; large values become attachment refs."""
  input: Unknown
  output: Unknown
  outputPort: String
  idempotencyKey: String
  error: StepError
  """Free-form progress notes from the block — the trace, in PFNÜR's sense."""
  notes: [StepNote!]!
  """Which worker/host executed it, for support."""
  workerId: String
}
```

Actions: `START_RUN`, `RECORD_STEP_START`, `RECORD_STEP_NOTE`, `RECORD_STEP_RESULT`,
`RECORD_RUN_RESULT`, `REQUEST_CANCEL`, `RETRY_STEP`.

> **Volume.** One document per run is fine at human scale and wrong at machine scale. §7.6 defines
> the run-store split: the authoritative journal is a relational table; the *document* is written
> for runs whose workflow sets `journalAsDocument: true` (default on for user-facing workflows, off
> for high-frequency ones), plus always for PARKED/FAILED runs so a human has something to open.

### 4.4 `powerhouse/connector` — the Vetra design-time spec

Mirrors `powerhouse/processor` exactly (see `packages/vetra/document-models/processor-module`).

```graphql
type ConnectorModuleState {
  name: String!                    # folder name under connectors/
  connectorId: String!             # stable id within the package
  description: String
  """Which hosts the connector may run in."""
  runtimes: [String!]!             # "switchboard" | "connect" | "worker"
  configSchema: String             # JSON Schema or zod-source, authored in the editor
  secrets: [SecretDeclaration!]!
  triggers: [TriggerSpec!]!        # id, name, kind PUSH|POLL, configSchema, outputSchema
  actions: [ActionSpec!]!          # id, name, configSchema, inputSchema, outputSchema, idempotent: Bool
  status: StatusType!              # DRAFT | CONFIRMED  — CONFIRMED triggers codegen
}
```

### 4.5 `powerhouse/workflow-template` (design-time, optional in v1)

A packaged, parameterised workflow a package can ship so that installing it offers a ready-made
automation. Same shape as `powerhouse/workflow` plus a `parameters` block. Instantiating a template
creates a real `powerhouse/workflow` document. **Deferrable to v1.1.**

---

## 5. The connector module contract

### 5.1 Types (new: `packages/shared/workflow/types.ts`, browser-safe, mirrors `shared/processors`)

```ts
export type BlockKind = "trigger" | "action" | "logic" | "transform" | "agent" | "subflow" | "human";
export type WorkflowRuntime = "switchboard" | "connect" | "worker";

/** JSON Schema (draft 2020-12). Authored as zod in code; emitted as JSON for the editor + docs. */
export type SchemaRef = { $id?: string; [k: string]: unknown };

export interface ConnectorDefinition {
  id: string;                       // unique within the package
  name: string;
  description?: string;
  runtimes: WorkflowRuntime[];
  /** Non-secret connection config. */
  configSchema?: SchemaRef;
  /** Declared secrets; mirrored into the package manifest `config` entries as type:"secret". */
  secrets?: SecretDeclaration[];
  /** Optional liveness/credential check surfaced in the connection editor. */
  checkConnection?(ctx: ConnectorContext): Promise<ConnectionCheck>;
  triggers?: TriggerDefinition[];
  actions?: ActionDefinition[];
  transforms?: TransformDefinition[];
}

export interface TriggerDefinition {
  id: string;                       // '<connectorId>.<triggerId>' once qualified
  name: string;
  kind: "push" | "poll";
  configSchema?: SchemaRef;
  outputSchema?: SchemaRef;
  /** Fields of the emitted payload that must never be journaled verbatim. */
  redact?: string[];

  /** poll only. Called on the trigger's schedule; MUST be idempotent and cheap. */
  poll?(ctx: TriggerContext): Promise<TriggerEnvelope[]>;
  /** poll only. Default interval; the workflow may narrow it within [minIntervalSeconds, ∞). */
  defaultIntervalSeconds?: number;
  minIntervalSeconds?: number;

  /** push only. Called once when the trigger instance starts; returns a disposer. */
  subscribe?(ctx: TriggerContext, emit: (e: TriggerEnvelope) => void): Promise<TriggerSubscription>;
  /** push only. Declares that this trigger wants a public webhook endpoint. */
  webhook?: WebhookSpec;
}

export interface WebhookSpec {
  /** Verification of the RAW bytes. The runtime never parses before this returns ok. */
  verify(raw: Uint8Array, headers: Record<string, string>, ctx: TriggerContext): Promise<VerifyResult>;
  /** Map a verified request to zero or more envelopes. */
  toEnvelopes(raw: Uint8Array, headers: Record<string, string>, ctx: TriggerContext): Promise<TriggerEnvelope[]>;
  /** What to answer the provider. Defaults to 200 with an empty body. */
  respond?(result: "accepted" | "rejected", ctx: TriggerContext): WebhookResponse;
  /** Optional registration with the provider when the endpoint is created/destroyed. */
  register?(url: string, ctx: TriggerContext): Promise<{ externalId?: string }>;
  unregister?(externalId: string | undefined, ctx: TriggerContext): Promise<void>;
}

export interface TriggerEnvelope {
  /** Authoritative dedup key. NOT the cursor. See recipes/external-feed-ingest. */
  dedupKey: string;
  occurredAt: string;               // ISO-8601
  payload: unknown;                 // structured-clone-safe
  attachments?: PendingAttachment[];
  /** Optional monotonic cursor the runtime persists as a fetch optimisation only. */
  cursor?: string;
}

export interface ActionDefinition {
  id: string;
  name: string;
  configSchema?: SchemaRef;
  inputSchema?: SchemaRef;
  outputSchema?: SchemaRef;
  /** True when re-running with the same idempotency key is safe on the provider's side. */
  idempotent?: boolean;
  /** Hosts where this action may run. Narrower than the connector's own list if needed. */
  runtimes?: WorkflowRuntime[];
  execute(input: unknown, ctx: ActionContext): Promise<ActionResult>;
}

export interface ActionResult {
  output: unknown;
  /** Named port, default "next". Lets an action fan out (e.g. "found" | "notFound"). */
  port?: string;
  attachments?: PendingAttachment[];
}
```

### 5.2 Contexts — the host bridge

```ts
export interface ConnectorContext {
  connectorId: string;
  connectionId?: string;
  config: unknown;                                // validated against configSchema
  secrets: SecretAccessor;                        // get(name) -> Promise<string>; never enumerable
  http: HttpClient;                               // egress-policy enforced, retry+timeout aware
  logger: WorkflowLogger;
  state: KeyValueState;                           // per trigger instance / per connection, durable
  signal: AbortSignal;
  now(): Date;                                    // injectable for tests and determinism
}

export interface TriggerContext extends ConnectorContext {
  triggerInstanceId: string;
  workflowId: string;
  /** Cursor persisted by the runtime between polls. */
  cursor: string | undefined;
  /** Read-only reactor access, for triggers that watch documents. */
  reactor: ReactorReadBridge;
}

export interface ActionContext extends ConnectorContext {
  runId: string;
  stepId: string;
  stepKey: string;
  attempt: number;
  idempotencyKey: string | undefined;
  /** Full reactor bridge: read + execute. Every write carries meta.workflowRunId/stepId. */
  reactor: ReactorBridge;
  attachments: AttachmentBridge;                  // fetch(documentId, ref) / put(bytes) -> ref
  agent: AgentBridge | undefined;                 // present when the host wired one
  /** Progress notes -> the run journal. A tap: never awaited, throws swallowed. */
  note(message: string, data?: unknown): void;
}
```

`ReactorBridge.execute(docId, branch, actions, meta?)` is a thin wrapper over `IProcessorDispatch`
that **always merges `{workflowRunId, stepId, attempt}` into `meta`**. That is how a workflow's own
writes are recognisable — replacing the in-memory `processing` flag the `saga` recipe uses.

### 5.3 The package-facing entry point

Mirrors `processorFactory` exactly, so the loader is a copy:

```ts
// connectors/index.ts   (generated)
export { connectorFactory } from "./factory.js";

// connectors/factory.ts (generated)
export const connectorFactory = async (module: IWorkflowHostModule) => {
  const { connectorBuilders } =
    module.runtime === "connect" ? await import("./connect.js") : await import("./switchboard.js");
  return (await Promise.all(connectorBuilders.map(b => b(module)))).flat();
};

// connectors/switchboard.ts (generated; connect.ts is the browser-eligible subset)
export const connectorBuilders: ConnectorBuilder[] = [imapConnectorBuilder, discordConnectorBuilder];
```

```ts
export type ConnectorBuilder = (module: IWorkflowHostModule) => Promise<ConnectorDefinition[]> | ConnectorDefinition[];

export interface IWorkflowHostModule {
  runtime: WorkflowRuntime;
  relationalDb: IRelationalDb;
  analyticsStore: IAnalyticsStore;
  dispatch: IProcessorDispatch;          // reused verbatim from shared/processors
  attachments: IAttachmentService;
  secrets: ISecretProvider;
  http: HttpClientFactory;
  agent?: IAgentGateway;
  getReadModel<T>(name: string): T;
  config?: Map<string, unknown>;
}
```

### 5.4 Built-in block types (`core#…`)

Shipped by the runtime, not by a connector. Available in every host.

| Block type | Kind | Purpose |
|---|---|---|
| `core#manual` | trigger | Fired by a user pressing a button in Connect, or by API/MCP |
| `core#schedule` | trigger | Cron / interval timer, with timezone |
| `core#document-event` | trigger | Reactor operations matching a `ProcessorFilter` — the bridge from the processor world |
| `core#webhook` | trigger | Generic signed webhook with configurable HMAC scheme |
| `core#branch` | logic | Boolean condition → `true` / `false` ports |
| `core#switch` | logic | Expression → labelled case ports + `default` |
| `core#filter` | logic | Stop the run silently when the condition is false |
| `core#foreach` | logic | Iterate a collection; downstream steps run per item; `maxParallel` |
| `core#merge` | logic | Join branches; `all` / `any` / `first` |
| `core#delay` | logic | Wait a duration or until a timestamp (durable — the run is suspended, not held) |
| `core#map` | transform | Expression-based reshaping into a new object |
| `core#template` | transform | Render a string template over run context |
| `core#json` | transform | Parse / stringify / JSON-Pointer extract |
| `core#document-read` | action | Read a document / query a read model |
| `core#document-write` | action | Dispatch actions to a document (create, update, add to drive) |
| `core#attachment` | action | Move bytes: fetch a ref, store bytes, produce a ref |
| `core#agent` | agent | Ask an agent to decide/classify/generate, with a declared output schema |
| `core#approval` | human | Suspend the run, create an approval task, resume on decision |
| `core#subflow` | subflow | Start another workflow; `await` or fire-and-forget |
| `core#stop` | terminal | End the run with an explicit status and message |

`core#document-event` is the deliberate bridge: **anything a processor can react to, a workflow can
react to**, without the workflow author learning the processor API.

### 5.5 Expressions

One expression language across conditions, mappings, templates and idempotency keys. Requirements:
sandboxed (no host access), deterministic, serialisable, statically analysable enough to show the
author which variables exist.

Chosen: **JSONata**-style path+function expressions over a fixed context object, evaluated in the
worker.

```
$.trigger.payload.subject
$.steps.classify.output.category = "invoice"
$.run.id & ":" & $.trigger.dedupKey
```

Context shape: `{ run, trigger, steps: {<stepKey>: {output, status}}, vars, secrets: <forbidden> }`.
Referencing `secrets` is a validation error, not a runtime one. See
[`04-open-questions.md#q3`](./04-open-questions.md).

---

## 6. Manifest, packaging and distribution

### 6.1 Manifest extension

```jsonc
{
  "name": "@acme/connector-imap",
  "connectors": [
    {
      "id": "imap",
      "name": "IMAP Mailbox",
      "runtimes": ["switchboard", "worker"],
      "triggers": [{ "id": "newMessage", "name": "New message", "kind": "poll" }],
      "actions":  [{ "id": "sendMail",  "name": "Send mail" }]
    }
  ],
  "config": [
    { "name": "IMAP_HOST", "type": "var",    "required": true },
    { "name": "IMAP_PASSWORD", "type": "secret", "required": true }
  ]
}
```

`PowerhouseModuleSchema` gains an optional connector-specific extension; the safest route is a new
`ConnectorModuleSchema` (id, name, runtimes, trigger/action summaries) rather than overloading
`documentTypes`. **Remember all three registration points** (§1.3 of the landscape doc):
`ManifestSchema`, `manifest-slim.ts MODULE_KEYS`, `connect/schema-fragments.ts`.

### 6.2 Package subpath

`connectors/` joins `document-models/`, `editors/`, `processors/`, `subgraphs/`:

```
packageJsonExports["./connectors"]   = { types: …, browser: …, node: … }
packageJsonExports["./connectors/*"] = { types: …, browser: …, node: … }
```

Loader: `loadConnectors(pkg)` → `import(`${pkg}/connectors`)` → named export `connectorFactory`.
HTTP loader: `${registry}/-/cdn/${spec}/node/connectors/index.mjs` (and `/browser/` for Connect).

### 6.3 Project layout

```
my-package/
  document-models/
  editors/
  processors/
  subgraphs/
  connectors/                <- new; PowerhouseConfig.connectorsDir
    index.ts                 generated: re-export connectorFactory
    factory.ts               generated: runtime dispatch
    connect.ts               generated: browser-eligible builders
    switchboard.ts           generated: server builders
    imap/
      index.ts               the ConnectorDefinition
      connection.ts          configSchema + secrets + checkConnection
      triggers/new-message.ts
      actions/send-mail.ts
      __tests__/
  workflows/                 <- optional: packaged workflow templates (.phd)
```

### 6.4 Hot reload

Unchanged from processors: config-file watcher → `PackageManager.loadConnectors` →
`connectorsChange` → the workflow runtime unregisters the package's connectors, revalidates every
workflow that referenced them, restarts affected trigger instances, and **lets in-flight runs finish
on the old definition** (the run records `workflowVersion` and the connector version it used).

---

## 7. Runtime architecture

```
                    ┌───────────────────────────────────────────────────────────┐
   Reactor ops ────▶│ WorkflowDefinitionReadModel   (IProcessor over            │
   (workflow docs)  │   powerhouse/workflow + powerhouse/connection)            │
                    └───────────────┬───────────────────────────────────────────┘
                                    │ desired trigger set
                    ┌───────────────▼───────────────────────────────────────────┐
                    │ TriggerSupervisor                                          │
                    │  · leases (one active instance per trigger per fleet)      │
                    │  · timers (schedule)  · pollers  · push subscriptions      │
                    │  · webhook endpoint registry  · document-event bridge      │
                    │  · dedup + cursor persistence                              │
                    └───────────────┬───────────────────────────────────────────┘
                                    │ TriggerEnvelope
                    ┌───────────────▼───────────────────────────────────────────┐
                    │ RunCoordinator                                             │
                    │  · concurrency policy · run creation · journal writes      │
                    │  · scheduling of ready steps · resume after WAITING        │
                    └───────────────┬───────────────────────────────────────────┘
                                    │ StepJob  (IWorkflowQueue)
                    ┌───────────────▼───────────────────────────────────────────┐
                    │ WorkerPool  (reuses reactor/executor/worker mechanics)     │
                    │  ┌─────────────────────────────────────────────────────┐  │
                    │  │ worker: import connector subpath, run one step,      │  │
                    │  │ call back through HostBridge RPC for reactor/        │  │
                    │  │ attachments/secrets/agent/http                       │  │
                    │  └─────────────────────────────────────────────────────┘  │
                    └───────────────────────────────────────────────────────────┘
```

### 7.1 Where the runtime lives

New package **`@powerhousedao/reactor-workflow`** (Node) with types in
`@powerhousedao/shared/workflow` (isomorphic). Composition happens in
`packages/reactor-api/src/server.ts` next to `ProcessorManager`, so Switchboard, `ph reactor`,
ph-clint's embedded reactor and the desktop sidecar all get it from one wiring point.

A reduced runtime runs in Connect (`@powerhousedao/reactor-browser`): manual triggers,
document-event triggers, core logic/transform blocks, and any connector whose `runtimes` include
`"connect"`. Everything else is greyed out with "requires a server" in the editor.

### 7.2 TriggerSupervisor

- **Input**: the set of `(workflowId, version, trigger)` where `status === ENABLED`, from a read
  model over workflow documents. Reconciles on every change and on startup.
- **Leases**: `trigger_lease(triggerInstanceId, holder, expiresAt)` in the relational store, renewed
  on a heartbeat. Exactly one host in a fleet polls a given trigger. A lost lease stops the poller
  within one heartbeat. (Webhooks are stateless and need no lease; the endpoint is registered by all
  hosts and dedup does the rest.)
- **Poll scheduling**: per-trigger interval with jitter, bounded below by `minIntervalSeconds`.
  Exponential backoff on consecutive failures, capped; a trigger that fails N times in a row is
  parked and surfaced in the UI (this is the processor `errored` state, with backoff added).
- **Cursor + dedup**: `trigger_state(triggerInstanceId, cursor, updatedAt)` and
  `trigger_dedup(triggerInstanceId, dedupKey, seenAt)` with a TTL index. Following
  `recipes/external-feed-ingest`: the cursor is a fetch optimisation, `dedupKey` is authoritative.
- **Webhooks**: `POST /workflows/hooks/:endpointToken` mounted via
  `IHttpAdapter.mountNodeRoute("POST", …)` so the handler owns the **raw bytes**. The token is a
  128-bit opaque value stored on the trigger instance (never the workflow id). Flow:
  read raw bytes → look up endpoint → `webhook.verify(raw, headers, ctx)` → on ok, parse and
  `toEnvelopes` → dedup → enqueue → respond. Unverified requests get a constant-time 401 with no
  body. A per-endpoint token bucket protects against floods.
- **Document events**: a single `IProcessor` registered with the existing `ProcessorManager`, whose
  filter is the union of all `core#document-event` triggers' filters, fanning matched operations out
  to the right trigger instances. **One processor, not one per workflow** — that keeps
  `ProcessorManager`'s per-drive fan-out cost flat as workflow count grows.
- **Manual triggers**: no supervision; the GraphQL/MCP/Connect start path enqueues directly.

### 7.3 RunCoordinator

- Applies `WorkflowPolicy.concurrency`: `SINGLETON` (drop with a journal note), `QUEUE` (serialise
  per workflow), `PARALLEL` (bounded by `maxParallelRuns`).
- Creates the run record, writes the trigger firing (redacted), then walks the graph: a step is
  **ready** when every inbound edge is either taken-and-satisfied or provably not-taken.
- Enqueues one `StepJob` per ready step. Fan-out (`core#foreach`) enqueues one job per item with a
  shared parent step execution and a per-item child.
- On a step result: append to the journal, evaluate outgoing edges, enqueue newly-ready steps.
- `WAITING` (delay, approval, awaited subflow) suspends the run; a durable timer or an external
  event resumes it. **A suspended run holds no worker and no connection.**
- Run-level timeout cancels outstanding steps via `AbortSignal` and marks the run `FAILED`.
- Terminal step failure: retry per policy with backoff; on exhaustion, take the step's `error` port
  if one is wired, else fail the run per `onFailure`.

### 7.4 Step execution in a worker

Extends the reactor worker protocol pattern (`packages/reactor/src/executor/worker/protocol.ts`),
same rules: structured-clone-only, `ErrorInfo` marshalling, `sanitize.ts` on every outbound message.

Parent → worker:

```ts
type WorkflowInitMessage   = { type:"wf-init"; correlationId; workerId; hostBridgePort?: MessagePort;
                               egressPolicy: EgressPolicy; connectors: ConnectorLoadSpec[] }
type ExecuteStepMessage    = { type:"wf-execute"; correlationId; job: StepJob }
type AbortStepMessage      = { type:"wf-abort"; correlationId; targetCorrelationId; reason? }
type LoadConnectorMessage  = { type:"wf-load-connector"; correlationId; spec: ConnectorLoadSpec }
type ShutdownMessage       = { type:"shutdown"; correlationId; graceMs? }
```

`ConnectorLoadSpec` is a `ModuleRef` (`{packageName|filePath, exportName}`) — the existing type,
unchanged. `StepJob` carries `{runId, stepId, stepKey, attempt, blockType, config, input,
connectionId, idempotencyKey, deadline}` and **no secrets**.

Worker → parent: `ready` · `wf-result` · `wf-note` (streamed progress) · `wf-host-call` (the bridge
request channel) · `log` · `heartbeat` · `metrics`.

**Secrets never cross as values in the job.** The worker asks the host over the bridge
(`secrets.get(name)`) at the moment of use; the host resolves against `ISecretProvider`, and the
value is scoped to that step's lifetime. The host redacts any string equal to a resolved secret from
notes, outputs and errors before journaling.

**Containment**, adopted from PFNÜR's supervised OCR engine: a step whose deadline elapses gets an
`abort`; if the worker does not confirm within a grace window the worker is **killed and replaced**,
because a connector may be inside a native call that cannot unwind. Queued steps live in the parent
and survive worker replacement.

### 7.5 The queue port

```ts
export interface IWorkflowQueue {
  enqueue(job: StepJob, opts?: { delayMs?: number; priority?: number }): Promise<{ jobId: string }>;
  reserve(count: number, leaseMs: number): Promise<ReservedJob[]>;   // visibility-timeout semantics
  ack(jobId: string, token: string): Promise<void>;
  fail(jobId: string, token: string, retryInMs: number | null): Promise<void>;
  cancel(selector: { runId?: string; jobId?: string }): Promise<number>;
  stats(): Promise<QueueStats>;
}
```

Three drivers:

| Driver | Backing | Used by |
|---|---|---|
| `embedded` | the relational store (`workflow_job` with a lease column; `FOR UPDATE SKIP LOCKED` on Postgres, a compare-and-set loop on PGlite) | **default** — desktop, `ph reactor`, single-node Switchboard, ph-clint |
| `bullmq` | Redis | multi-node Switchboard deployments; the PFNÜR migration target |
| `memory` | in-process array | tests |

`ReservedJob` carries a `token`, which is the **delivery authority** — the direct analogue of
PFNÜR's `{jobId, lockToken}`. Every journal write from a step is refused if its token no longer owns
the job. This is the mechanism that makes worker replacement safe.

### 7.6 Persistence

A relational namespace `workflow` via `IRelationalDb.createNamespace("workflow")`, with Kysely
migrations, exactly like a `RelationalDbProcessor`:

| Table | Purpose |
|---|---|
| `trigger_instance` | desired vs. actual state, config hash, webhook token, status, lastError |
| `trigger_lease` | holder + expiry |
| `trigger_state` | cursor per instance |
| `trigger_dedup` | `(triggerInstanceId, dedupKey)` with TTL |
| `run` | authoritative run header: workflow, version, status, timings, trigger summary |
| `step_execution` | authoritative journal rows |
| `workflow_job` | the embedded queue |
| `timer` | durable delays and scheduled resumes |
| `idempotency` | `(stepId, idempotencyKey)` → prior result, for safe re-execution |
| `connection_health` | last check result per connection |

The `powerhouse/workflow-run` **document** is a projection written by the coordinator when
`journalAsDocument` is on for that workflow, plus unconditionally for `FAILED`/`PARKED` runs.
Rationale: a document per run gives sync, ACL and a normal editor for free; writing one per run for
a webhook firing 50×/second does not. Retention (`retainRunsDays`) prunes rows and archives or
deletes documents.

### 7.7 Observability

- **Analytics**: per-run and per-step dimensions (`workflow`, `blockType`, `connector`, `status`,
  `outcome`) into the existing analytics store, so the academy dashboards work unchanged.
- **OpenTelemetry**: one span per run, one per step, using
  `packages/opentelemetry-instrumentation-reactor` conventions. `traceparent` propagates into the
  worker in the `StepJob`.
- **Notes as a tap**: `ctx.note()` is fire-and-forget, never awaited, throws swallowed — the
  `PipelineObserver` rule from `pfnur/packages/document-processing`, for the same reason.
- **A run inspector** in Connect: timeline, per-step input/output (redacted), errors with the cause
  chain, retry and cancel buttons. Modelled on Bull Board + PFNÜR's job trace, but inside Connect.

---

## 8. Host integration

### 8.1 Switchboard / `reactor-api`

- Compose the runtime in `startServer` next to `ProcessorManager`; gate with a
  `PHWorkflowConfig` block (`enabled`, `queue.driver`, `workers.count`, `egress`, `secrets.provider`).
- `onConnectorsChange` in `setupEventListeners`.
- Mount `POST /workflows/hooks/:token` (raw) and `GET /workflows/health`.
- New GraphQL subgraph `workflows` (a `BaseSubgraph` subclass), reusing `assertCan*` so workflow and
  run visibility follows document ACLs:

```graphql
type Query {
  workflows(driveId: ID, status: WorkflowStatus): [WorkflowSummary!]!
  workflowRuns(workflowId: ID!, status: RunStatus, first: Int, after: String): RunConnection!
  workflowRun(runId: ID!): WorkflowRunDetail
  connectors: [ConnectorDescriptor!]!            # what this host can actually run
  blockTypes: [BlockTypeDescriptor!]!            # incl. JSON Schemas, for the editor
  connections(driveId: ID): [ConnectionSummary!]!
}
type Mutation {
  startWorkflow(workflowId: ID!, input: JSON): StartRunResult!
  cancelRun(runId: ID!, reason: String): CancelResult!
  retryStep(runId: ID!, stepId: ID!): RetryResult!
  resumeApproval(runId: ID!, stepId: ID!, decision: ApprovalDecision!, comment: String): ResumeResult!
  checkConnection(connectionId: ID!): ConnectionCheckResult!
  testTrigger(workflowId: ID!, samplePayload: JSON): TestResult!      # dry run, no side effects
}
type Subscription { runEvents(runId: ID!): RunEvent! }
```

### 8.2 Connect

- **Workflow editor** — an `EditorModule` for `powerhouse/workflow`: trigger picker, step list with
  per-block config forms rendered from the block's JSON Schema, edge editor, policy panel, enable
  toggle, "test with sample payload".
- **Connection editor** — an `EditorModule` for `powerhouse/connection`, with a "Check connection"
  button calling `checkConnection`.
- **Run inspector** — an `EditorModule` for `powerhouse/workflow-run`, plus a drive-level runs list.
- **Manual trigger buttons** — a `core#manual` trigger declares `surface: "document" | "drive" |
  "toolbar"` and a `documentTypes` filter. A new hook `useWorkflowActions(documentId)` returns the
  manual workflows applicable to what the user is looking at, and Connect renders them as buttons.
  This is the "user buttons in Connect" trigger from the briefing.
- **Browser-side runtime** for `runtimes: ["connect"]` connectors, behind the existing reactor-worker
  RPC. A workflow whose steps are all connect-eligible runs offline; otherwise the editor shows
  which step forces a server.

### 8.3 ph-cli / ph-cmd

```
ph generate connector --name imap --triggers newMessage --actions sendMail --runtimes switchboard,worker
ph generate connector --document specs/connectors/imap.phd     # from a Vetra spec doc
ph generate connector --extract                                # code -> spec docs
ph workflow list | show <id> | enable <id> | disable <id>
ph workflow run <id> [--input file.json] [--wait]
ph workflow runs <id> [--status failed] ; ph workflow run-log <runId>
ph workflow import <file.phd> ; ph workflow export <id>
ph connection list | add <connector> | check <id>
```

### 8.4 Vetra Studio + `ph-clint` + the Vetra agent

- `powerhouse/connector` spec documents get an editor and a codegen generator, mirroring
  `powerhouse/processor` exactly (`packages/vetra/processors/codegen/document-handlers/generators/`).
  `status: CONFIRMED` triggers the scaffold.
- The Vetra agent gains MCP tools for the workflow subgraph, so "build me a workflow that…" becomes
  a sequence of document writes it can already perform.
- **ph-clint, two ways** (the briefing's two-way integration):
  1. *Workflows call agents.* `core#agent` resolves an `IAgentGateway`. Two adapters: a **ph-clint
     adapter** (`AgentProvider` → a single prompt+schema call, streaming notes into the journal),
     and an **MCP adapter** (any agent exposing an `api-mcp` endpoint, discovered exactly as
     `discoverMcpTools()` does today).
  2. *Agents call workflows.* Every workflow with a `core#manual` trigger is exposed as a ph-clint
     `defineCommand` (id `workflow:<slug>`, input schema derived from the workflow's `variables`) —
     which makes it simultaneously a CLI subcommand, a Mastra tool and an MCP operation, for free.
     A ph-clint `defineTrigger` adapter also lets an existing ph-clint trigger act as a workflow
     trigger, so no ph-clint implementation has to be rewritten.

### 8.5 Desktop (`ph-win-desktop`)

- Runtime runs inside the existing sidecar; `queue.driver = "embedded"`, `workers.count = 2`,
  `workerType: "process"`.
- Secrets provider = OS keychain via a Tauri command (Windows Credential Manager / macOS Keychain),
  with an encrypted-file fallback.
- Webhook triggers require a reachable URL; on desktop they are disabled by default and the editor
  says so, unless a tunnel is configured. Poll and document-event triggers work fully offline.
- Connector packages install through the existing `ph install` path; the vendored-`node_modules`
  constraint means the connector loader must not rely on anything a bundler would have to follow.

---

## 9. Security model

| Concern | Control |
|---|---|
| **Credential exposure** | Secrets live in `ISecretProvider` (env / OS keychain / vault), referenced by name from `powerhouse/connection`. Never in document state, operations, journal, logs, or a `StepJob`. Resolved per step in the host, handed to the worker on request, and redacted from every outbound string |
| **Third-party code** | Connectors execute in workers (`process` isolation by default on the server), never in the reactor's own thread. A crashed or hung connector kills a replaceable worker |
| **Network egress** | `EgressPolicy` per connector: an allowlist of hosts derived from the connector's declared endpoints plus operator overrides. Enforced by the worker's `HttpClient`; direct `fetch`/`http` use inside a connector is discouraged and detectable |
| **Webhook forgery** | Raw-byte verification before parsing; constant-time compare; replay window; opaque per-instance endpoint tokens; per-endpoint rate limit; constant-time rejection |
| **Reactor writes** | Every workflow write goes through the normal auth scope. A run executes as a **workflow identity** — a Renown key bound to the workflow document's owner — so `action.context.signer` is meaningful and the existing ACL/`evaluateActions` machinery applies unchanged |
| **Privilege escalation via edit** | Editing a workflow is an ordinary document write, so it is ACL-gated. Enabling a workflow that writes to a drive the editor cannot write to fails at run time, visibly, rather than silently succeeding |
| **Data exfiltration** | The run journal is a document with normal ACLs. Redaction rules on triggers and steps are declared, not incidental. Payload snapshots are size-capped; overflow becomes an attachment with the same ACL |
| **Denial of service** | Per-workflow concurrency caps, per-connection rate limits (`recipes/rate-limiter` pattern), queue depth limits, run timeouts, poll interval floors |
| **Loops** | Static cycle detection at save time; a run-level step budget as a backstop; `core#subflow` depth limit |

---

## 10. Execution semantics — the contract

1. **At-least-once.** A step may execute more than once. Actions declare `idempotent` and steps
   declare an `idempotencyKeyExpression`; the `idempotency` table short-circuits a repeat with the
   stored result.
2. **Ordering.** Steps execute in topological order. Parallel branches have no ordering guarantee
   between them. `core#merge` is the only join.
3. **Isolation.** No shared mutable state between steps except the run context, which is written
   only by completed steps.
4. **Cancellation is cooperative, correctness is not.** Cancelling sets run status first, then
   signals; a step that finishes anyway has its result refused by the delivery-authority check.
   (PFNÜR's rule, generalised.)
5. **Failure classes.** `TRANSIENT`, `RATE_LIMIT`, `TIMEOUT`, `AUTH`, `VALIDATION`, `PERMANENT`.
   Only the first three retry by default. `AUTH` additionally marks the connection `ERROR`, which
   surfaces on every workflow using it.
6. **Resumption.** A restarted host rebuilds in-flight runs from the journal, re-enqueues steps
   whose job leases expired, and re-arms timers. Trigger cursors and dedup sets are rebuilt from the
   store — never from memory.
7. **Versioning.** A run pins `workflowVersion`. Editing a running workflow never mutates a run in
   flight. New firings use the new version.
8. **Determinism of expressions.** Expressions are pure; `now()` is injected from the run context so
   a replay is reproducible.

---

## 11. Intelligent Document Processing — the first connector suite

Ships as `@powerhousedao/connector-idp`, generalising `pfnur/packages/document-processing`, with the
**stated acceptance bar: the PFNÜR toll-statement flow expressible as a workflow document at feature
parity**.

Blocks:

| Block | Kind | Notes |
|---|---|---|
| `idp#loadDocument` | action | Attachment ref (or bytes) → `RawDocument` + `DocumentFeatures` (`hasTextLayer`, `pageCount`, `mimeType`) |
| `idp#classify` | action | Runs registered classifiers cheapest-first; ports = the classification labels + `unknown` |
| `idp#extract` | action | Runs the routing policy over eligible strategies; output = `ProcessingResult` incl. `attempts[]` and `fieldConfidence` |
| `idp#validate` | action | Runs the schema/arithmetic reconciler; ports `valid` / `invalid` |
| `idp#confidenceGate` | logic | Threshold on `fieldConfidence` → `high` / `low` ports (drives human review) |
| `idp#ocr` | action | Explicit OCR when a strategy isn't wanted; uses the supervised child-process engine |
| `idp#llmExtract` | action | Schema-guided LLM extraction; the `core#agent` gateway with a document-shaped prompt |

The pipeline package is refactored so its **strategy registry, routing policy and observer** are
importable without the toll-statement domain: `@powerhousedao/idp-core` (contracts, pipeline,
features) + `@powerhousedao/idp-issuers-*` (domain packs). PFNÜR's issuers become one such pack.
The layered dependency rule and its architecture test move with the core.

The PFNÜR flow as a workflow:

```
core#document-event (toll-statement created, sourcePdf set)
  → idp#loadDocument → idp#classify → idp#extract → idp#validate
      valid   → idp#confidenceGate  high → core#document-write (commit extraction, status SUBMITTED)
                                     low → core#approval (LAS review) → core#document-write
      invalid → core#document-write (status PROCESSING_ERROR) → core#stop(FAILED)
  → (branch) autolink enabled? → acme#linkCompany → core#document-write
```

Parity checklist against `apps/worker`: per-job time budget ✔ (`timeoutSeconds`), delivery authority
✔ (queue token), cancellation ✔ (`cancelRun` + `AbortSignal`), stale-delivery refusal ✔, per-run
trace ✔ (journal notes), retry taxonomy ✔ (failure classes), park-on-terminal-failure ✔
(`onFailure: PARK`), process containment for OCR ✔ (supervised engine kept as-is), Sentry only on
the parking attempt ✔ (error classes drive reporting).

---

## 12. Migration and compatibility

- **Nothing breaks.** Processors, subgraphs, editors and document models are untouched. A package
  without a `connectors/` directory loads exactly as before (the loader's miss is an *expected* miss).
- **Manifests without `connectors`** are valid; the key is optional everywhere.
- **`ProcessorManager` gains, but does not lose, behaviour**: stable processor ids by default in new
  projects (`legacyProcessorIds: false` for newly generated packages), plus optional retry-with-
  backoff and a dead-letter hook. Existing projects keep the legacy id mode until they opt in.
- **PFNÜR** migrates in two steps: first the pipeline split into `idp-core` + issuer pack with the
  existing worker unchanged; then the worker replaced by a workflow document. Both are independently
  shippable.
- **ph-clint** gains adapters, not replacements: `defineTrigger` keeps working; the workflow runtime
  is an additional service a ph-clint CLI may compose.

---

## 13. Deliberate deferrals

| Deferred | Why | Revisit when |
|---|---|---|
| Visual canvas editor | The document model already supports positions; the canvas is UI work that shouldn't gate the runtime | After v1 ships and the schema has settled |
| Arbitrary code blocks (JS/TS authored in the UI) | Needs a real sandbox (isolate/QuickJS) and a supply-chain story | Once the worker boundary is proven and an isolate is chosen |
| Workflow templates marketplace | Needs the registry to model non-code artefacts | v1.1 |
| Cross-reactor workflows (a step running on another reactor) | Sync semantics for run state across reactors are unsolved | After the sync team weighs in |
| Exactly-once semantics | Not achievable against arbitrary third-party APIs | Never; idempotency keys are the answer |
| Sub-second triggers | The poll floor and the queue's visibility timeout make ~1 s the practical bound | If a use case demands it |

---

## 14. Acceptance criteria

1. A package developer runs `ph generate connector`, implements one poll trigger and one action,
   `ph publish`es it, and an operator installs it into a running Switchboard **without a restart**.
2. An operator creates a `powerhouse/connection`, builds a three-step workflow in Connect, enables
   it, and sees runs appear in the inspector with per-step inputs, outputs and timings.
3. Killing the Switchboard process mid-run and restarting it resumes the run from the journal with
   no duplicated side effects for idempotent steps, and at most one duplicate for non-idempotent
   ones — visible in the journal.
4. A signed webhook with a tampered body is rejected in constant time, journals nothing, and does
   not start a run.
5. A connector that hangs in a native call is killed and replaced within its deadline; the step
   retries; the reactor never stalls.
6. Secrets appear nowhere in the run journal, logs, GraphQL responses, or the workflow document —
   verified by an automated redaction test over a workflow that deliberately echoes its config.
7. The PFNÜR toll-statement flow, expressed as a workflow document, passes the existing extraction
   eval at the same accuracy and within the same per-document time budget.
8. On the desktop app, with no Redis and no Postgres, a schedule-triggered workflow and a
   document-event-triggered workflow both run to completion.
9. The Vetra agent, given "when a file lands in this drive, extract its data and notify me", produces
   a valid enabled workflow document without a human editing JSON.
10. Installing a package with connectors adds no measurable cost to reactor startup when the
    workflow runtime is disabled.

# State of the Art — Should the workflow runtime be built on an existing open-source library?

**Status:** Research findings and a recommendation. Input to
[`04-open-questions.md`](./04-open-questions.md); adds four new questions (Q18–Q21).
**Researched:** 2026-08-31. Every version, star count, licence and file path below was checked
against the source (GitHub API, npm registry, raw source files) on that date unless marked
*(reported)*, which means it comes from secondary sources I did not verify directly.

---

## 0. The question, and why it is really three questions

The brief asks whether to adopt an existing library for **workflow execution**, for two reasons:
(1) save work and inherit a battle-tested implementation, and (2) tap into an existing open-source
ecosystem with a large install base, which is worth something in itself.

Those two reasons pull toward **different** artefacts, and conflating them is the main trap here.
Nobody adopts Temporal for its ecosystem, and nobody adopts n8n for its scheduler. The decision
splits cleanly into three:

| # | Decision | What "adopting" would buy | What it costs |
|---|---|---|---|
| **A** | **The engine** — run graph walking, journal, retries, cancellation, suspend/resume | Reason 1: correctness we would otherwise have to earn | The engine is the part most coupled to Powerhouse's own semantics (document-as-source-of-truth, reactor writes under a signer identity, PGlite on desktop, redaction) |
| **B** | **The connector ecosystem** — an existing catalogue of integrations | Reason 2: reach, immediately | Licence entanglement, a foreign extension contract, and third-party code in our process |
| **C** | **The substrate** — queue, expressions, cron, schema, tracing | Reason 1, cheaply and without coupling | Almost nothing |

The short answer: **no on A, a qualified yes on B (but not the library you would expect), and an
unqualified yes on C.** Detail follows.

---

## 1. Recommendation up front

1. **Build the engine.** No surveyed library can be embedded under the constraints in
   [`02-feature-spec.md §7`](./02-feature-spec.md) without either a licence problem or an
   architecture fight that costs more than the ~2 weeks Phase 3 budgets. The engine is small; the
   parts that make it hard are Powerhouse-specific and no library has them.
2. **Take `pg-boss` as the `embedded` queue driver** instead of hand-writing one. MIT, v12.29.0,
   `FOR UPDATE SKIP LOCKED` on Postgres *and* documented support for **embedded PGlite**. This
   retires the single largest infrastructure risk in the plan (spike S4 / Q12) for the price of one
   dependency with three transitive deps.
3. **Make MCP a first-class connector kind for *actions*.** ~9,652 servers in the official registry,
   vendor-neutral under the Linux Foundation, protocol-not-code (so no licence entanglement and
   process isolation for free), and Powerhouse already ships `reactor-mcp` on the server side.
   This is the ecosystem play, and it is the only large catalogue whose licence lets us near it.
   MCP has **no trigger story** — so the native connector contract stays, and owns triggers.
4. **Spike an Activepieces *piece* adapter; do not commit to it.** Its contract maps almost 1:1 onto
   `ConnectorDefinition`, and 728 MIT-licensed pieces sit in the open monorepo with OAuth2 solved.
   The caution is governance, not the licence text: the SDK has been withdrawn from npm, bundles now
   come from a vendor CDN, and the open/enterprise boundary has been contested for two years
   (§5.1). Two days to find out, not a plan assumption.
5. **Reframe reason 2: publish *into* the big catalogues rather than embedding them.** A Powerhouse
   node for n8n, a Powerhouse piece for Activepieces, an MCP server (which already exists) put
   Powerhouse in front of the largest install bases in this space with zero licence risk and about a
   week of work each — a better return on "ecosystem value" than any embedding.
6. **Do not adopt a workflow platform (n8n / Node-RED / Windmill / Trigger.dev) as the runtime.**
   Reasons per project in §3.

---

## 2. The hard gates

These come out of the spec and the plan, not from taste. A candidate that fails a gate is out
regardless of how good it is.

| # | Gate | Source |
|---|---|---|
| **G1** | **Licence permits redistribution inside an open-source framework that third parties self-host and that Powerhouse hosts commercially for clients** | Powerhouse ships a framework; Switchboard is hosted for clients. This kills fair-code, SSPL, BSL and source-available licences, and makes AGPL a board-level decision |
| **G2** | **Embeddable as a library in an existing Node process** — no mandatory separate server, cluster, broker or daemon | [`02 §1.1`](./02-feature-spec.md) "degrade to the desktop"; the desktop sidecar is one Node process |
| **G3** | **Runs with no Redis and no Postgres** — PGlite must be enough | [`02 §7.5`](./02-feature-spec.md), acceptance criterion 8 |
| **G4** | **Workflows are data, configured at runtime** — the definition is a document a user edits, not TypeScript a developer compiles | [`02 §1`](./02-feature-spec.md), the whole premise |
| **G5** | **Third-party step code runs in an isolated worker under our own delivery-authority and redaction rules** | [`02 §9`](./02-feature-spec.md), [`03 Phase 4.3`](./03-implementation-plan.md) |
| **G6** | **Writes go through the reactor's auth scope under a signer identity, and the journal is ours** | [`02 §9`](./02-feature-spec.md), Q4 |
| **G7** | **Adds ~nothing to startup when disabled** | Acceptance criterion 10 |

G4 is the quiet killer for the entire durable-execution category, and G1 for the entire
big-catalogue category.

---

## 3. Category A — automation platforms with connector catalogues

The ones with the ecosystems. Evaluated as "could we embed this as our runtime, or harvest its
connectors?"

### 3.1 n8n — the largest install base, and unusable

- 202.9k ★ / 60.5k forks. Description says 400+ integrations; the README claims 1500+.
- Licence: **Sustainable Use License** (fair-code) + n8n Enterprise License. Files with `.ee.` in the
  name or `.ee` in the path are excluded from the SUL entirely.
- The SUL permits use "for your own internal business purposes or for non-commercial or personal
  use" and permits distribution only "free of charge for non-commercial purposes". Embedding n8n in
  a product you distribute or host commercially requires a separately negotiated **Embed License**
  *(reported: commercial, individually negotiated)*.

**Verdict: fails G1, decisively.** Powerhouse distributes a framework and hosts Switchboard for
clients; both are exactly what the SUL withholds. This is not a grey area we should sit in, and it
applies to the *nodes* as much as the core — `n8n-nodes-base` lives under the same licence. Note
this also rules out the tempting shortcut of importing `n8n-workflow`/`n8n-core` for expression
evaluation.

### 3.2 Node-RED — genuinely embeddable, wrong shape

- 23.6k ★, **Apache-2.0**, OpenJS Foundation, v5.0.4 (2026-07-30). 5000+ community nodes *(reported)*.
- Officially embeddable: `RED.init(server, settings)` + `RED.start()`, editor mounted at
  `settings.httpAdminRoot`. Flows are JSON. In embedded mode `uiHost`/`uiPort`/auth/static settings
  are ignored and left to the host.

Passes G1, G2 and G3, and "flows are JSON" superficially passes G4. But:

- A Node-RED node is a **runtime-coupled JS class plus an HTML editor file** registered with
  `RED.nodes.registerType`. There is no typed input/output schema, no connection/credential model
  beyond Node-RED's own credentials store, no isolation, no per-node capability declaration and no
  dedup/idempotency concept. Adopting the node contract means adopting the Node-RED editor, its flow
  semantics and its credential store — three things the spec deliberately replaces with document
  models.
- The value is entirely in the palette, and the palette is only reachable through the runtime, so
  "harvest the nodes" is not separable from "adopt the runtime".
- `msg`-passing with mutation is at odds with [`02 §10.3`](./02-feature-spec.md) (no shared mutable
  state between steps).

**Verdict: rejected as the engine.** Keep it in mind as a *future connector*: a `nodered#run-flow`
action that talks to a Node-RED instance over its admin API is a perfectly good way to reach the
palette without swallowing the runtime — but that is a v1.1 connector, not an architecture.

### 3.3 Activepieces — the closest architectural match in existence, with a moving floor

This one deserves its own section (§5), because the fit is uncanny and the risk is subtle.

- 24.1k ★, latest release **0.88.4-hotfix.1** (2026-08-25).
- Licence: **MIT**, except `packages/ee/` and `packages/server/api/src/app/ee` which are commercial.
  The pieces framework (`packages/pieces/framework`) and all **728 pieces**
  (`packages/pieces/community/`) are on the MIT side, and actively developed.

### 3.4 Pipedream — explicitly forbidden

Component registry covering thousands of apps, but the licence moved from MIT to the **Pipedream
Source Available License**, which *(reported, and the wording is unusually specific)* forbids using
the components "in a SaaS integration platform or as part of the integration registry in your own
product". That is a verbatim description of what we would be doing.

**Verdict: fails G1.** Do not read the components for inspiration either; the provenance risk on a
connector suite that looks like theirs is not worth it.

### 3.5 Windmill / Kestra / Trigger.dev / the rest

| Project | Licence | Why not |
|---|---|---|
| **Windmill** | **AGPLv3** (clients Apache-2.0) | Building a product feature on top requires our product to be AGPLv3 or a commercial licence. Rust binary, not a Node library — fails G2 as well |
| **Kestra** | Apache-2.0 | Clean licence, but JVM. Fails G2/G3 outright |
| **Trigger.dev** | **Apache-2.0**, 16.2k ★ | Licence is fine — the only large platform here that is. But it is a *platform*: Postgres + Redis + supervisor + Docker. Fails G2/G3, and its tasks are TypeScript files deployed by a CLI, which fails G4 |
| **Automatisch / Huginn / others** | AGPL / mixed | Smaller catalogues, same licence or shape problems |

---

## 4. Category B — durable execution engines

The reliability story. All of them are good software. All of them fail G4 the same way.

| Project | Licence (verified) | ★ | Deployment | Verdict |
|---|---|---|---|---|
| **Temporal** (`sdk-typescript`) | MIT | 902 | Requires a Temporal cluster over gRPC. A single-binary dev server exists; a production cluster does not fit a desktop sidecar | Fails G2/G3 |
| **Restate** | **BSL 1.1** | 4.4k | Single binary, embedded RocksDB — technically the nicest fit of the group | **Fails G1** |
| **DBOS Transact (TS)** | **MIT** | 1.3k | A true library: `DBOS.registerWorkflow()`, Postgres connection string, no daemon. The best licence/shape combination in this category | Fails G3 (Postgres required, no PGlite path found) and G4 |
| **Inngest** | Server/CLI **SSPL 1.0** with a grant converting each version to Apache-2.0 after three years; SDKs Apache-2.0 | 5.8k | Self-hosting supported since 1.0 (Jan 2026) | Fails G1 for the server; the SDK alone is not an engine |
| **Hatchet** | *(not verified)* | — | Go server + TS SDK | Fails G2 |

**The structural problem, which applies to all five.** Durable execution libraries make *your code*
durable: you write a TypeScript function, they checkpoint it. Powerhouse needs the opposite — a
**document** describes the graph, and the engine interprets it at runtime. Layering an interpreter
over a durable-execution library means every workflow becomes one long-running host function whose
checkpoints are the library's, not ours — and then:

- the journal we must own for the run inspector, ACLs, retention and redaction ([`02 §7.6`](./02-feature-spec.md))
  becomes a second, derived record that can disagree with theirs;
- the delivery-authority token that makes worker replacement safe ([`02 §7.5`](./02-feature-spec.md))
  is their lease, not ours, so our journal-write refusal check has nothing to check;
- `workflowVersion` pinning ([`02 §10.7`](./02-feature-spec.md)) collides with their determinism
  rules, which assume the code changed, not the data.

We would keep about 30% of the engine's difficulty and inherit an operational dependency. **Do not
adopt one.** The one idea worth stealing outright is Temporal's discipline about determinism and
replay, which the spec already reflects in §10.8.

---

## 5. Deep dive — Activepieces, and why it is a spike rather than a plan

I read the framework source. The mapping onto our contract is close enough to be uncomfortable:

| Activepieces (`packages/pieces/framework/src/lib/`) | `02-feature-spec.md §5` |
|---|---|
| `createPiece({displayName, auth, actions, triggers, categories})` | `ConnectorDefinition` |
| `createAction({name, props, run(ctx)})` | `ActionDefinition.execute(input, ctx)` |
| `createTrigger({type: POLLING \| WEBHOOK \| APP_WEBHOOK, onEnable, onDisable, run, test, onStart})` | `TriggerDefinition` with `kind: "push" \| "poll"`, `subscribe`/`poll`, `WebhookSpec.register`/`unregister` |
| `DEDUPE_KEY_PROPERTY = '_dedupe_key'` | `TriggerEnvelope.dedupKey` — same idea, same authority |
| `WebhookRenewStrategy.CRON` + `onRenew`, `onHandshake` | Not in our spec — **a genuine gap they have solved** (provider subscriptions that expire) |
| `PieceAuth`: `SECRET_TEXT`, `BASIC_AUTH`, `CUSTOM_AUTH`, `OAUTH2`, `OIDC` | `SecretDeclaration` — and **OAuth2/OIDC is exactly the Q10 hole** |
| context: `{auth, propsValue, store, connections, files, server, project, step, flows}` | `ConnectorContext`: `{config, secrets, http, logger, state, signal, now}` — `store`≈`state`, `files`≈`AttachmentBridge` |
| `setSchedule()` on polling triggers | `defaultIntervalSeconds` / `minIntervalSeconds` |

Their engine (`packages/server/engine/src/lib/`) has independently arrived at the same containment
design the spec lifts from PFNÜR: `core/piece/piece-child.ts` (child-process execution),
`core/piece/piece-protocol.ts` (a worker wire protocol), `core/code/v8-isolate-code-sandbox.ts` (the
isolate we deliberately deferred in §13), `network/dns-lookup-guard.ts` (egress/SSRF control ≈ our
`EgressPolicy`), `handler/flow-executor.ts` + `loop-executor.ts` + `router-executor.ts` (graph walk,
foreach, switch), `helper/flow-run-progress-reporter.ts` (≈ `ctx.note()` as a tap).

That is strong external validation of the spec's architecture. Two risks temper it — neither is the
catalogue disappearing, which it is not.

**The catalogue is open and healthy.** `packages/pieces/community/` holds **728 piece packages**
under the repository's MIT grant, with commits landing the day this was written. An earlier draft of
this document said the pieces had left the repository; that was wrong, caused by a truncated
directory listing on my side, and is corrected here.

**Risk 1 — the SDK is no longer consumable from npm.** Their breaking-changes log records that from
**v0.86.0** each piece is built into a single self-contained bundle with the framework and its
dependencies inlined, and that as part of this `@activepieces/shared`,
`@activepieces/pieces-framework`, `@activepieces/pieces-common` and `@activepieces/core-*` are **no
longer published to npm**. npm agrees: `@activepieces/pieces-framework` stops at **0.32.0
(2026-06-17)**, with no `license` field. In **v0.87.0**, `AP_USE_CDN_FOR_BUNDLES` flipped to `true`,
so official bundles are fetched from `cdn.activepieces.com` with npm as automatic fallback (custom
pieces and private registries are unaffected). Published piece tarballs
(`@activepieces/piece-slack@0.17.9`, `piece-gmail@0.13.0`, `piece-discord@0.5.7`) carry no
`license` or `repository` field and no dependencies — they are build artefacts, not readable source.
Consequence for us: an adapter cannot `npm i` the SDK; it must build against the MIT source in the
monorepo, and it must track a bundle format that is now the vendor's private contract. That is a
maintenance tax, not a licence problem — **the source is still MIT**.

**Risk 2 — the open/enterprise boundary is a known, long-lived sore spot.** See §5.1. It bites
anyone forking the *platform*; it does not bite reading the pieces framework, which is what an
adapter would do.

**What to do.** Two days of spike (§10, S6): write a `piece → ConnectorDefinition` adapter against
the MIT framework source and run two real pieces under our worker. If it works, we get a *migration
path* for anyone with pieces and, more importantly, a validated design for our own contract. Ship
the adapter as an optional package, never as a runtime dependency of the engine. And **lift two
ideas regardless of the spike's outcome**: webhook renewal (`onRenew` + CRON) and the OAuth2/OIDC
auth property shape.

### 5.0 Using Activepieces as the default reference architecture

Adopted position: **Activepieces is the reference implementation we sanity-check against.** It is the
only project in the open that has solved this exact problem — third-party integration code, isolated,
credential-bearing, driven by a user-editable definition — and it has been in production for three
years. Every phase should ask "how does Activepieces do this, and why are we different?" and record
the answer. Divergence is fine; unexamined divergence is not.

What a cross-check found, reading `packages/server/engine/src/lib/` against
[`02-feature-spec.md`](./02-feature-spec.md):

#### Where our spec is weaker — adopt

| # | Their mechanism | Our spec today | Change | Phase |
|---|---|---|---|---|
| **A1** | **Dual resolution.** `propsResolver.resolve()` evaluates each input template twice — once live, once with `censoredInput: true` — and journals the censored copy. Credential tokens never materialise in the journaled value | Redact at the journal writer by matching strings equal to a resolved secret (§7.4) | Resolve inputs twice; journal the censored pass. Keep value-matching as a backstop for **outputs and errors** only — it cannot catch a secret that was transformed, sliced or base64'd | 3.5, 4 |
| **A2** | **Waitpoints.** `ctx.run.createWaitpoint({type, resumeDateTime, responseToSend})` returns a resume URL a step hands to an external system; `ctx.run.waitForWaitpoint()` suspends the run. Bounded by a max-pause setting | `core#approval` as a built-in block only. A connector cannot suspend a run | Promote suspension to a **connector-callable primitive**. Every human-in-the-loop integration (e-signature, Slack interactive, external review) needs it, and `core#approval` becomes one caller of it | 3.6 |
| **A3** | **Design-time property resolution.** `Property.Dropdown({refreshers, options})` and dynamic props are *executable code* the editor calls while the user is configuring a step, over a third context kind (`kind: 'props'`) with its own restricted context | `configSchema` is static JSON Schema (§5.1) | Add a `props` context kind and an editor→host→worker channel for resolving options. Without it no connector can offer "pick one of your Slack channels", and the workflow editor is unusable for real integrations | 1, 6 |
| **A4** | **App webhooks.** `TriggerStrategy.APP_WEBHOOK` + `ctx.app.createListeners({events, identifierKey, identifierValue})`: one webhook for the whole provider app, demultiplexed to trigger instances by an identifier in the payload, with `events.verify` on the piece | One opaque endpoint token per trigger instance (§7.2) | Add a shared-endpoint trigger kind. Providers that permit only one webhook per app (Slack, several others) cannot be supported by per-instance URLs at all | 5 |
| **A5** | **Output slicing + run log budget.** Outputs over `AP_FLOW_RUN_LOG_SLICE_THRESHOLD_KB` (32 KB) are written to a file and replaced by a `LogSliceRef`, rehydrated lazily through a byte-budgeted LRU; a running `logSizeBytes` total fails the run as `LOG_SIZE_EXCEEDED` | "Payload snapshots are size-capped; overflow becomes an attachment" (§9) — asserted, not designed | Adopt the whole shape: per-output threshold, ref + lazy rehydration, **accumulated run total**, distinct terminal status. Per-step caps do not bound a 500-step run | 3.4 |
| **A6** | **Context versioning.** `contextInfo.version` on the piece, `makeActionContextBackwardCompatible({contextVersion, context})`, plus `minimumSupportedRelease` / `maximumSupportedRelease` | `ConnectorDefinition` has no version negotiation | Version the context contract from v1 and ship the adapter seam empty. Retrofitting this after third-party connectors exist is not possible | 1.1 |
| **A7** | **Code addressed by path.** The host holds only `{metadata, functionPaths}`; calls are `{path: ['actions', name, 'run'], args}` and `hasPath()` tests for optional methods | `ConnectorDefinition` carries live functions (`poll`, `execute`, `verify`) that cannot cross a worker boundary | Split the contract explicitly into a serialisable **descriptor** (host-side) and path-addressed **callables** (worker-side). We need this anyway; better as a named concept than an accident | 1.1, 4 |
| **A8** | **Connection↔piece binding** enforced at resolution (`ConnectionPieceMismatchError`), env-gated because it was retrofitted | Host-bridge authorisation says a worker cannot request another connection's secret (§4.2) | Same rule — make it **default-on and untoggleable**, since we are greenfield | 4.2 |
| **A9** | **DNS-level SSRF guard.** `installDnsLookupGuard` patches `dns.lookup`/`dns.promises.lookup` and classifies the **resolved IP**, so the check survives DNS rebinding and applies to any HTTP client the piece uses | `EgressPolicy` enforced by the worker's `HttpClient`; direct `fetch` "discouraged and detectable" (§9) | Enforce at the resolver inside the worker process. A hostname allowlist checked in our own client is bypassed by any connector that calls `fetch` | 4.2 |
| **A10** | **Engine errors vs step errors.** `tryCatchAndThrowOnEngineError` separates a defect in the runtime from a failure in the integration; OOM is detected from exit code/signal/stderr and raised as `PieceMemoryLimitError` | Failure classes are `TRANSIENT`/`RATE_LIMIT`/`TIMEOUT`/`AUTH`/`VALIDATION`/`PERMANENT` (§10.5) | Add `DEFECT` (our bug — never retry, always report) and `RESOURCE` (OOM/heap — retry once on a fresh worker, then park) | 3.5 |
| **A11** | **Pending-work draining.** Context side effects are collected in a `pending: Promise[]` and `Promise.allSettled`-ed before the child reports its result | `ctx.note()` is fire-and-forget and never awaited (§7.7) | Keep it non-blocking for the step, but drain pending taps before the worker is torn down, or the last notes before a crash — the interesting ones — are always lost | 4.2 |
| **A12** | Smaller: `ctx.tags.add()` (run tagging for search), `ctx.output.update()` (live partial output, not just notes), `setSchedule()` (a trigger adjusting its own interval at runtime, e.g. on a rate-limit header) | none of the three | Cheap; all three earn their place in the run inspector and the poller | 3.7, 5 |

#### Where our spec is stronger — do not copy

| # | Our design | Theirs | Evidence |
|---|---|---|---|
| **B1** | **`dedupKey` is authoritative**, cursor is a fetch optimisation, backed by a `trigger_dedup` TTL table in the engine | Dedup is a *convention library* (`pollingHelper`, `DedupeStrategy.TIMEBASED \| LAST_ITEM`) implemented by each piece against its own KV store. `TIMEBASED` drops items sharing a timestamp boundary and any late arrival; `LAST_ITEM` re-emits **the entire page** when the anchor item is deleted or reordered (`lastItemIndex === -1`) | Their own commit log: *"fix(jira-cloud): remaining polling triggers no longer permanently miss issues, comments, assignments and attachments"* (2026-08-26) |
| **B2** | Retry decisions driven by a **failure taxonomy**, backoff by re-enqueue | `executionFailedWithRetryableError` returns true for *any* failure, and the backoff is an in-process `setTimeout` that holds the worker slot | `helper/error-handling.ts` |
| **B3** | **DAG with typed ports**, explicit edges, `core#merge` as the only join | A linked list (`action.nextAction`) with routers and loops nesting their children; parallel branches are not expressible | `handler/flow-executor.ts` |
| **B4** | **Delivery authority**: a queue token that must still own the job for a journal write to land | No equivalent; worker replacement safety rests on the child being killed | §7.5 vs `core/piece/piece-runner.ts` |
| **B5** | **Pooled workers** with abort/replace | A **fresh `node` child process per call** — `describe` and every `run` — killed on settle. Stronger isolation, but a process spawn per step | `core/piece/piece-runner.ts` |

**How to institutionalise it.** Each phase's exit criteria gain one line: *"the Activepieces cross-check
for this phase is recorded — matched, deliberately diverged (with reason), or gap found."* The
findings above are the Phase 0 instance of that check.

### 5.1 Licence and distribution history — the inflection points

Reconstructed from the commit record on `LICENSE`, the issue tracker and the community forum. Useful
because the *shape* of the drift tells you what to expect from a dependency on this project.

| Date | Event | Evidence |
|---|---|---|
| 2022-12-03 | Repository created (YC S22) | repo metadata |
| 2022-12-07 | **Pure MIT.** `Copyright (c) 2022 Activepieces Inc.` | `b03e2061` |
| **2023-02-17** | **First open-core split**, ~10 weeks in: `packages/ee/` carved out under an "Enterprise License" (production use requires a subscription; copying, distributing and selling forbidden). The same commit adds `license-helper.ts`, which POSTs the licence key to `secrets.activepieces.com/verify` | `4b2de771` |
| 2023-02-20 | EE terms softened from "correct number of user seats" to "corresponding to your usage" | `23b5c57a` |
| **2023-05-15** | **Reverted to pure MIT.** "feat: remove product-embed" deletes the EE packages and restores the plain MIT file | `6d9e77e7` |
| **2023-10-07** | **Open core reinstated and permanent.** "chore: merge ee repository" folds a separately-developed EE repo back in; carve-out now covers `packages/ee/` *and* `packages/backend/src/app/ee/` | `09209a59` |
| 2023-12-21 | Issue **#3473** opened: *"The code should still compile after removing ee folder"* — removing EE breaks the build | issue #3473 |
| 2024-02-15 | Path renamed to `packages/server/api/src/app/ee`. **The LICENSE file has not changed since.** | `3b271ddc` |
| 2025-03-09 | **OpenOps** created — an Apache-2.0 downstream that a participant in #3473 describes as their fork, created because "you essentially have to fork it once, fix the ee mess, and never look back" | issue #3473 comment, 2025-08-20 |
| 2026-02-20 | #3473 **auto-closed by a stale bot after 26 months**, unresolved | issue #3473 |
| **2026-06 → 07** | **Distribution change** (v0.86.0 / v0.87.0): self-contained piece bundles, shared libraries pulled from npm, CDN as the default source | breaking-changes.mdx |

**The pattern.** The licence *text* has been stable for two and a half years — the last change was
February 2024, and it still says MIT-except-`ee`. What moves is **the boundary and the plumbing**:
which features live behind `ee`, and how artefacts reach you. The EE server directory now spans ~26
feature areas including `app-connections`, `global-connections`, `oauth-apps`, `secret-managers`,
`audit-logs`, `projects`, `platform` and `pieces` (piece-set gating).

**The substance of the complaint**, which is worth understanding because it is subtler than
"they went closed-source":

- The MIT half **does not build without the EE half**. That is #3473, opened December 2023 and never
  fixed. The maintainer's answer (2023-12-24) is that the EE code is present but gated behind
  `AP_EDITION` plus a licence key, so a default install runs CE under MIT — legally coherent, and
  it does not address the buildability complaint at all.
- A contributor proposed the PostHog model (a `-foss` mirror with proprietary code stripped) in
  March 2024; the founder called it a good idea and said the codebase was not at that stage. It
  never happened.
- Through 2025 the reports move to the frontend: EE components referenced from the MIT UI package
  without `AP_EDITION` gating, EE-backed routes reachable in a Community install. One commenter:
  *"it seems like the components are mixed between ee to the MIT intentionally."* Another: *"until I
  read this disclaimer, I practically considered it a legal minefield."*
- The concrete outcome is a fork. A commenter on #3473 (2025-08-20): *"this mess prevents companies
  from contributing back to ActivePieces from their forks… we had no choice"*, pointing at
  OpenOps (Apache-2.0, created 2025-03, 1.1k ★). Note OpenOps carries no visible Activepieces
  attribution in its README, LICENSE or NOTICE — the fork relationship rests on that comment.
- Separately, and not a licence issue: sustained complaints from AppSumo lifetime-deal buyers about
  plan restructuring during the 2025–26 pivot to AI agents *(reported)*. Relevant only as evidence
  about how the company handles commitments to earlier adopters.

Some of this has improved: `packages/ee/` today contains only `embed-sdk` and its LICENSE, and the
current `packages/web` no longer carries `ee` directories.

**What it means for us.** The risk is not "the pieces will go closed". It is that this is a
**venture-backed open-core company that has already crossed the line once, reverted, crossed it
again, and lets the boundary blur under delivery pressure** — while the artefacts you consume have
just moved from a public registry to a vendor CDN. Depend on the *ideas* and the MIT source; do not
put them on the critical path of the Powerhouse connector story. That is what S6 is for, and why its
output is a decision rather than a component.

---

## 6. Category C — in-process orchestration libraries

Small, embeddable, no infrastructure. Relevant to *parts* of the engine, not to the whole.

### 6.1 Mastra — already in our dependency tree

- 27.6k ★. **Apache-2.0** with an `ee/` carve-out (`@mastra/core@1.63.2` ships `"license":
  "Apache-2.0"`). `ph-clint` already integrates it ([`01 §3.2`](./01-repository-landscape.md)).
- Workflows: `createStep({inputSchema, outputSchema, execute})` composed with
  `createWorkflow().then()/.branch()/.parallel()/...`, nested workflows as steps, suspend/resume
  with the snapshot persisted to storage, and restart of active runs on server start.

Fit: the licence is clean, it is in-process, and it is *already a dependency of the agent
framework*. But it is code-first (fails G4 — the docs do not cover constructing a workflow
dynamically at runtime, which is our entire premise), its persistence is a run snapshot rather than
an authoritative per-step journal (fails G6), and it has no worker isolation, delivery authority or
redaction (fails G5).

**Verdict: not the engine.** But it is the obvious implementation for the *inside* of the
`core#agent` block and for agent-authored sub-workflows in Phase 8 — where we are calling an agent
anyway and Mastra is already loaded. Using it there costs nothing new and keeps Phase 8 small.

### 6.2 XState — the one worth considering for the run coordinator's core

- 30.1k ★, MIT. Machine definitions are plain JSON-serialisable config (passes G4 in a way nothing
  else in this survey does), and v5 supports `actor.getPersistedSnapshot()` / restore from snapshot.

Tempting, and honestly defensible. Against it: our graph is a DAG with typed ports, fan-out and a
merge join — not a statechart. Expressing "a step is ready when every inbound edge is taken-and-
satisfied or provably not-taken" ([`02 §7.3`](./02-feature-spec.md)) in statechart terms is
possible but obfuscating, and `getPersistedSnapshot` is not a step journal — we would still write
`step_execution` ourselves. **Verdict: no**, but if the coordinator's readiness logic gets hairy in
Phase 3.4, revisit rather than invent a bespoke state machine.

### 6.3 BPMN engines — a standards ecosystem we do not want

`bpmn-engine` (MIT, 966 ★) plus `bpmn-server` for persistence; `bpmn-js` for the canvas. BPMN 2.0 is
a large, genuinely open standard with an enterprise install base, and "Powerhouse speaks BPMN" is a
real-sounding value proposition. Against: BPMN's semantics (token games, event subprocesses,
compensation) are far larger than §5.4's block set, the JS engines are single-maintainer projects,
and the modeller is the ecosystem's centre of gravity — which drags us straight into the canvas we
deliberately deferred. **Verdict: no.** Revisit only if a client asks for BPMN interchange, and then
as an import/export mapping, not a runtime.

### 6.4 CNCF Serverless Workflow — adopt the vocabulary, not the code

DSL 1.0 under CNCF, SDKs for seven languages including TypeScript (last updated 2026-05-15). But the
TS SDK is types/validation/normalisation only, and the runtimes (Synapse, Lemline) are .NET and JVM
— there is no production JS runtime. **Verdict:** ignore as a dependency; but when Phase 2 finalises
`WorkflowStep`/`WorkflowEdge`, borrowing their naming and control-flow vocabulary costs nothing and
buys a credible "standards-aligned" claim plus a cheap future export. See **Q19**.

### 6.5 The long tail

`workflow-es`, `@hazeljs/flow`, `@datarster/workflow-engine`, `openworkflow` and similar do roughly
what Phase 3 describes, in a few thousand lines. All are single-maintainer, low-adoption projects.
They fail reason 1 (not battle-tested) and reason 2 (no ecosystem) simultaneously. **Verdict: no** —
but they are worth reading before writing `run-coordinator.ts`.

---

## 7. Category D — the ecosystem play that actually works: MCP

This is the recommendation that changes the plan, so it gets its own section.

**The facts.** MCP was donated to the Agentic AI Foundation under the Linux Foundation in December
2025. The official registry counted **9,652 latest server records** (28,959 server/version records)
as of 2026-05-24, and the Python + TypeScript SDKs alone see roughly **97M monthly downloads**
*(reported)*. The 2026-07-28 revision adds a stateless core, a **Tasks extension** for long-running
work (`tasks/get`, `tasks/update`, `tasks/cancel` against a server-issued task handle), MCP Apps,
and OAuth 2.0 / OIDC authorization hardening.

**Why it beats every catalogue in §3 for our purposes:**

| | n8n | Activepieces | Pipedream | **MCP** |
|---|---|---|---|---|
| Catalogue size | 1500+ nodes | 728 pieces | thousands | **~9,650 servers** |
| Licence position | SUL — blocked | **MIT source**; SDK off npm, bundles off a vendor CDN | source-available — blocked | **protocol, vendor-neutral, LF-governed** |
| Third-party code in our process | yes | yes | yes | **no — separate process, by construction** |
| Auth story | theirs | theirs | theirs | **OAuth 2.0/OIDC in the spec** |
| Already in Powerhouse | no | no | no | **`reactor-mcp` exists** |
| Trajectory as an open ecosystem | flat | open, but drifting (§5.1) | shrinking | growing |

Because MCP is a wire protocol and not a library, "adopting" it introduces no licence entanglement,
and the process boundary the spec spends Phase 4 building is *already there* — an MCP server is a
separate process with its own credentials. It is also the cheapest possible answer to G5.

**The catch, and it is important: MCP has no triggers.** The 2026-07-28 spec constrains
server-to-client requests to occur only while the server is processing a client request — there are
no unsolicited server-initiated notifications, and the Tasks extension is for long-running work the
*client* started, not for events. So:

- **Actions**: an `mcp#call-tool` block plus an MCP-server-backed connection type covers thousands
  of integrations for a fraction of the cost of writing them.
- **Triggers**: unchanged. The native `ConnectorDefinition` contract in §5 stays exactly as
  specified and remains the only way to get a poll or a webhook. This is also, incidentally, the
  clearest statement of what Powerhouse adds that MCP does not: **MCP tells an agent what it can
  do; a Powerhouse workflow decides when it happens and records that it did.**

**Also worth noting** for [Q10 (OAuth2)](./04-open-questions.md): MCP's authorization spec carries
the OAuth flow, so an MCP-backed connection reaches OAuth-gated services *without* us building the
broker in v1. That does not close Q10 — native connectors still need it — but it materially reduces
what the v1 demo depends on. See **Q20**.

**Adjacent, and rejected:** **Nango** (auth for 900+ APIs) is **Elastic License 2.0** — it withholds
providing the software to third parties as a hosted or managed service, which is close enough to
what Switchboard is to fail G1. **Composio** (30.0k ★, MIT) is SDKs only; the catalogue lives behind
`COMPOSIO_API_KEY` on their cloud, so it is a SaaS dependency, not a library.

---

## 8. Category E — substrate libraries: take these

Small, boring, uncontroversial. This is where "save work" actually pays.

| Need | Take | Licence | Why |
|---|---|---|---|
| `IWorkflowQueue` `embedded` driver | **`pg-boss` v12.29.0** | MIT, 3.9k ★ | `FOR UPDATE SKIP LOCKED` on Postgres, documented **embedded PGlite** backend, visibility timeouts, delayed jobs, cron. Three deps (`pg`, `cron-parser`, `serialize-error`). **Retires the S4 spike risk and answers Q12's desktop half.** Keep `IWorkflowQueue` as the port so `bullmq` and `memory` still slot in |
| Expressions | **JSONata** | MIT | Already the spec's choice (Q3); nothing found to change that. Its AST is walkable for the editor's variable list and for rejecting `secrets` references |
| Cron / schedule triggers | `cron-parser` (arrives with pg-boss) or `croner` | MIT | Timezone-aware. Do not hand-roll |
| Schema validation | `zod` → JSON Schema, `ajv` at the boundary | MIT | Already the house pattern |
| Tracing | `@opentelemetry/*` | Apache-2.0 | Already in `packages/opentelemetry-instrumentation-reactor` |
| Isolate, **if and when** the deferred code block lands | `isolated-vm` | ISC | Activepieces uses the same approach (`v8-isolate-code-sandbox.ts`); useful precedent |

`graphile-worker` is the credible alternative to pg-boss (MIT, same SKIP LOCKED design) but I found
no PGlite support, which is the deciding factor.

---

## 9. Reframing reason 2 — be *in* the catalogues instead of embedding them

The brief's second reason is about value proposition: being part of a popular ecosystem with a large
install base. Embedding is only one way to get that, it is the way the licences block, and it points
the benefit backwards — we would gain their integrations, while their users would learn nothing
about Powerhouse.

The other direction is cheap, unblocked and points the benefit the right way:

| Artefact | Reaches | Cost | Licence risk |
|---|---|---|---|
| **A Powerhouse MCP server** (exists — `reactor-mcp`) | ~9.6k-server registry, every MCP-speaking agent host | already built; needs registry listing and docs | none |
| **An n8n community node** (`n8n-nodes-powerhouse`) | the largest install base in this space | ~1 week | none — publishing a community node is explicitly supported. Note: from 2026-05-01 verified nodes must be published via GitHub Actions with a provenance statement, following a January 2026 supply-chain incident with malicious community node packages *(reported)* |
| **An Activepieces piece** | ~24k-★ community | ~3 days | none |
| **A Node-RED node** | 5000+-node palette, OpenJS Foundation | ~3 days | none |

Each is a package that reads and writes Powerhouse documents from inside someone else's automation
tool. That is a distribution channel, and it is strictly additive to everything in
[`03-implementation-plan.md`](./03-implementation-plan.md). **Recommendation: schedule these as a
post-v1 workstream** (a "Phase 11 — outbound integrations"), not because they are unimportant but
because they are only compelling once the workflow document model is stable. See **Q21**.

---

## 10. What this changes in the plan

| Phase | Change |
|---|---|
| **Phase 0** | Spike **S4 narrows**: instead of "can we build a queue on PGlite", it becomes "does `pg-boss` v12 behave correctly on PGlite under our concurrency test, and does its schema coexist with `IRelationalDb.createNamespace('workflow')`?" Add **S5** and **S6** (below) |
| **Phase 1** | Add `onRenew`/`renewConfiguration` to `WebhookSpec` (borrowed from Activepieces — provider subscriptions that expire are real, and we had missed them). Consider adopting Serverless Workflow DSL vocabulary for `WorkflowStep`/`WorkflowEdge` naming (Q19) |
| **Phase 3.1** | `embedded-queue.ts` becomes a thin `IWorkflowQueue` adapter over pg-boss rather than a hand-written lease table. Keep `memory-queue.ts` |
| **Phase 4** | Unchanged. This is the part no library gives us, and §5 shows an independent team arriving at the same design |
| **Phase 6** | Add `mcp#call-tool` as a core action block and an MCP-server connection type. This is genuinely new scope — roughly a week — and it is the best-value week in the plan |
| **Phase 9/10** | **Q11 gets easier**: with `mcp#call-tool`, the "which connectors ship in v1" answer can shrink to IMAP/SMTP + generic HTTP/webhook + IDP, with MCP covering the long tail including several OAuth-gated services |
| **New Phase 11** (post-v1) | Outbound integration packages: n8n node, Activepieces piece, Node-RED node, MCP registry listing |

Two spikes to add to Phase 0:

- **S5 — MCP as an action block (1 day).** Call a tool on a real MCP server from a step; confirm the
  connection/credential model fits `powerhouse/connection` and that a long-running call maps onto the
  Tasks extension rather than blocking a worker slot.
- **S6 — Activepieces piece adapter (2 days).** Write `piece → ConnectorDefinition`; run one polling
  trigger and one action piece under our worker. Success criterion is a *decision*, not a
  deliverable: do we ship the adapter as an optional package, or take only the ideas?

---

## 11. New open questions (for [`04-open-questions.md`](./04-open-questions.md))

**Q18 — Is `pg-boss` acceptable as a runtime dependency of the engine?**
It brings `pg` into the desktop bundle and owns its own schema. **Recommendation: yes**, behind
`IWorkflowQueue`, conditional on S4 passing on PGlite. *Affects Phase 3.1.*

**Q19 — Do we align the workflow document's vocabulary with the CNCF Serverless Workflow DSL?**
Zero dependency, some naming constraint, a credible standards claim and a cheap export path later.
**Recommendation: align naming where it is free, do not contort the model.** *Affects Phase 2.*

**Q20 — Does MCP-as-connector change the v1 connector scope (Q11) and the OAuth deferral (Q10)?**
An MCP-backed action reaches OAuth-gated services without us building an OAuth broker.
**Recommendation: yes — add `mcp#call-tool` to Phase 6 and reduce the bespoke connector count.**
This one needs a product decision, because it reshapes the demo story. *Affects Phase 6, 9, 10.*

**Q21 — Do we commit to publishing outbound integration packages (n8n / Activepieces / Node-RED
nodes) as a post-v1 workstream?**
This is the honest answer to "tap into existing ecosystems", and it is a go-to-market decision more
than an engineering one. **Recommendation: yes, scheduled after the document model stabilises.**

---

## 12. Summary table

| Candidate | Licence | Embeddable | Runtime-configured | Verdict |
|---|---|---|---|---|
| n8n | Sustainable Use | yes | yes | **No — licence** |
| Pipedream components | Source Available | n/a | n/a | **No — licence** |
| Nango | Elastic v2 | yes | n/a | **No — licence** |
| Restate | BSL 1.1 | yes | no | **No — licence** |
| Inngest (server) | SSPL → Apache after 3y | no | no | **No — licence + shape** |
| Windmill | AGPLv3 | no | yes | **No — licence + shape** |
| Node-RED | Apache-2.0 | **yes** | yes | No — node contract and editor coupling. *Later: a connector* |
| Trigger.dev | Apache-2.0 | no | no | No — platform, needs Redis + Postgres |
| Temporal | MIT | no | no | No — needs a cluster |
| DBOS Transact | MIT | **yes** | no | No — Postgres-only, code-first |
| Kestra | Apache-2.0 | no | yes | No — JVM |
| Activepieces framework | **MIT** | **yes** | **yes** | **Spike (S6)** — closest match; 728 MIT pieces, but the SDK is off npm and the open/EE boundary is contested (§5.1) |
| Mastra workflows | Apache-2.0 | **yes** | no | **Yes, but only inside `core#agent`** (Phase 8) |
| XState | MIT | **yes** | **yes** | Hold — fallback if coordinator readiness logic gets hairy |
| bpmn-engine | MIT | yes | yes | No — wrong semantics, drags in the canvas |
| Serverless Workflow DSL | Apache-2.0 (CNCF) | n/a | yes | **Vocabulary only** |
| **MCP** | protocol, LF-governed | **n/a — separate process** | **yes** | **Adopt for actions (Phase 6)** |
| **pg-boss** | **MIT** | **yes** | n/a | **Adopt as the `embedded` queue driver** |
| JSONata / croner / ajv / OTel | MIT / Apache-2.0 | yes | n/a | **Adopt** |

---

## 13. Sources

Repositories and registries checked directly on 2026-08-31:
[activepieces/activepieces](https://github.com/activepieces/activepieces) ·
[activepieces LICENSE](https://github.com/activepieces/activepieces/blob/main/LICENSE) ·
[Activepieces breaking changes](https://www.activepieces.com/docs/install/reference/breaking-changes) ·
[n8n-io/n8n](https://github.com/n8n-io/n8n) ·
[n8n LICENSE.md](https://github.com/n8n-io/n8n/blob/master/LICENSE.md) ·
[n8n Sustainable Use License](https://docs.n8n.io/privacy-and-security/sustainable-use-license) ·
[n8n community nodes](https://docs.n8n.io/integrations/community-nodes/building-community-nodes) ·
[node-red/node-red](https://github.com/node-red/node-red) ·
[Node-RED embedding guide](https://nodered.org/docs/user-guide/runtime/embedding) ·
[restatedev/restate](https://github.com/restatedev/restate) ·
[dbos-inc/dbos-transact-ts](https://github.com/dbos-inc/dbos-transact-ts) ·
[inngest/inngest](https://github.com/inngest/inngest) ·
[Inngest self-hosting announcement](https://www.inngest.com/blog/inngest-1-0-announcing-self-hosting-support) ·
[triggerdotdev/trigger.dev](https://github.com/triggerdotdev/trigger.dev) ·
[temporalio/sdk-typescript](https://github.com/temporalio/sdk-typescript) ·
[windmill LICENSE](https://github.com/windmill-labs/windmill/blob/main/LICENSE) ·
[mastra-ai/mastra LICENSE.md](https://github.com/mastra-ai/mastra/blob/main/LICENSE.md) ·
[Mastra workflows docs](https://mastra.ai/docs/workflows/overview) ·
[statelyai/xstate](https://github.com/statelyai/xstate) ·
[XState persistence](https://stately.ai/docs/persistence) ·
[paed01/bpmn-engine](https://github.com/paed01/bpmn-engine) ·
[timgit/pg-boss](https://github.com/timgit/pg-boss) ·
[pg-boss database backends](https://pgboss.io/database-backends) ·
[graphile/worker](https://github.com/graphile/worker) ·
[ComposioHQ/composio](https://github.com/ComposioHQ/composio) ·
[NangoHQ/nango](https://github.com/NangoHQ/nango) ·
[Pipedream Source Available License](https://pipedream.com/blog/introducing-the-pipedream-source-available-license/) ·
[modelcontextprotocol/registry](https://github.com/modelcontextprotocol/registry) ·
[MCP 2026-07-28 release candidate](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/) ·
[serverlessworkflow/sdk-typescript](https://github.com/serverlessworkflow/sdk-typescript) ·
[Activepieces issue #3473 — "code should still compile after removing ee folder"](https://github.com/activepieces/activepieces/issues/3473) ·
[Activepieces issue #8849 — separation of core/community pieces](https://github.com/activepieces/activepieces/issues/8849) ·
[Activepieces forum — "Is activepieces still open source?"](https://community.activepieces.com/t/is-activepieces-still-open-source/2838) ·
[openops-cloud/openops](https://github.com/openops-cloud/openops) ·
[Serverless Workflow (CNCF)](https://www.cncf.io/projects/serverless-workflow/) ·
[awesome-workflow-engines](https://github.com/meirwah/awesome-workflow-engines)

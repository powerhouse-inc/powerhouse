# Compatibility Architecture — Running Activepieces Pieces and Node-RED Nodes

**Status:** Research findings and a proposed architecture. Follows
[`05-sota-research.md`](./05-sota-research.md) §5.0, which established Activepieces as our default
reference architecture.
**Question:** Can Powerhouse be feature-compatible — interface-compatible, with a wrapper — with
Activepieces and Node-RED, treating our own capabilities as an optional superset, so that we can run
their connectors? And can we reuse their MIT/Apache components while doing it?

**Researched:** 2026-08-31 against the local checkouts:

| Repo | Version | Commit | Date |
|---|---|---|---|
| `activepieces/` | 0.88.3 | `6cefe017` | 2026-08-31 |
| `node-red/` | 5.0.4 | `dcceaddf` | 2026-08-27 |

Every number below was measured against those trees; the commands are in the appendix so they can be
re-run when the upstreams move.

---

## 0. Verdict

**Activepieces: yes, and it is far more tractable than expected.** Interface compatibility is
achievable because the entire compatibility surface is **four module specifiers and one context
object**, and Activepieces itself ships a complete stub of that context in MIT code. 642 of 728
pieces route their network calls through a single injectable HTTP client. Two consumption paths
exist, and the better one — loading their *published bundles* — needs no build step and no
dependency on their npm packages at all.

The blocker is not the licence and not the runtime: it is **design-time property resolution**.
432 of 728 pieces (59%) declare `refreshers`, meaning their configuration UI is executable code. Our
spec has no channel for that. Without it, roughly 300 pieces work fully and 430 degrade to "type the
raw channel ID by hand". This is [`05 §5.0 A3`](./05-sota-research.md), and it moves from
"improvement" to "precondition".

**Node-RED: partially, and not worth doing as compatibility.** The runtime surface is genuinely
small — a node needs a `RED` object and a `_flow` object with exactly seven members. But two
mismatches are structural rather than incidental: nodes are **long-lived, push-based actors** with no
guaranteed completion signal, and their design-time UI is **arbitrary jQuery bound to the Node-RED
editor's DOM**. Wrapping the first is possible with a quiescence heuristic that we would be
apologising for forever; wrapping the second is not possible at all without embedding their editor.
The right relationship with Node-RED is **process-level, not code-level**: a `nodered#run-flow`
action against a sidecar, plus a Powerhouse node published into their palette.

**Components:** yes to roughly 7,900 lines of MIT TypeScript from Activepieces and to
`@node-red/util` (2,149 lines, Apache-2.0, and it already embeds JSONata — our chosen expression
language). Obligations are attribution-only. Details and carve-outs in §5.

---

## 1. What compatibility can mean

Four distinct claims get conflated. Separating them is most of the analysis.

| Level | Claim | Activepieces | Node-RED |
|---|---|---|---|
| **L1 Feature** | We can express what they express | Yes — their block set is a subset of ours plus three gaps (§2.6) | Yes, with a different topology |
| **L2 Source** | Their extension's *source* compiles against our modules | **Yes** — provide four module specifiers | No — the `.html` half has no analogue |
| **L3 Artifact** | Their *published, unmodified* extension runs on us | **Yes** — the piece object is data + closures; the context is a parameter | Partial — the `.js` half runs; the editor half does not |
| **L4 Host** | Their *platform* runs on us, or ours on theirs | No, and not desirable | No |

We should target **L3 for Activepieces**, **L1 for Node-RED**, and treat L4 as out of scope for both.

---

## 2. Activepieces

### 2.1 The compatibility surface is four module specifiers

Measured across all 728 pieces:

```
9,686  imports from '@activepieces/pieces-framework'
5,868  imports from '@activepieces/pieces-common'
    1  import  from '@activepieces/shared'      ← a single stray
```

Piece `package.json` files declare four workspace dependencies: `pieces-framework`,
`pieces-common`, `core-piece-types`, `core-utils`. Source imports go through the first two, because
the framework re-exports the foundation symbols — a boundary the project enforces deliberately
(comment in `packages/pieces/framework/src/index.ts`: *"Foundation symbols re-exported so pieces
depend only on framework/common — never on core-\*/shared directly (enforced by the community-piece
import boundary lint)"*).

That comment is the whole opportunity. **Activepieces has already done the work of ensuring pieces
depend on a small, stable, deliberately-narrow API.** They did it to protect their own refactors;
the side effect is that a third party can implement that API.

### 2.2 The runtime context is fully substitutable — and they ship the stub

`packages/pieces/framework/src/lib/test/index.ts` (MIT) contains `createMockActionContext`, a
complete minimal `ActionContext`:

```ts
{ executionType, auth, propsValue, store{put,get,delete}, connections{get}, tags{add},
  server{apiUrl,publicUrl,token}, files{write}, output{update}, agent{tools},
  run{id,stop,pause,respond}, project{id,externalId}, flows{list,current},
  step{name}, generateResumeUrl }
```

This is the entire surface a piece can touch at run time, enumerated by the vendor, in MIT code we
can read and copy. It is also proof of the key property: **a piece's `run(ctx)` takes its whole world
as a parameter.** Nothing is imported ambiently, nothing is a global, nothing phones home except
through `ctx.server` and `httpClient`.

How much of that surface is actually used, by piece count:

| Context member | Pieces | Powerhouse mapping | Effort |
|---|---|---|---|
| `propsValue`, `auth` | all | resolved step input; `powerhouse/connection` | core |
| `store` | ≤255¹ | `KeyValueState` (§5.2 of the spec) — `put/get/delete` with a `PROJECT \| FLOW` scope | trivial |
| `files` | 74 | `AttachmentBridge.put()` → returns a ref/URL | trivial |
| `run.stop / respond` | 2 | `core#stop`; webhook response hook | small |
| `run.createWaitpoint / waitForWaitpoint` | 9 | **gap** — [`05 §5.0 A2`](./05-sota-research.md) | medium |
| `project`, `flows` | 7, 6 | AP-specific; stub with our workflow identity or deny | trivial |
| `server` | 7 | their API base URL — **deny**, or point at a compatibility shim | trivial |
| `app.createListeners` | 4 | shared app-webhook registry — [`05 §5.0 A4`](./05-sota-research.md) | medium |
| `tags`, `output.update` | 1, 0 | run tags; live partial output ([`05 §5.0 A12`](./05-sota-research.md)) | trivial |

¹ loose regex; the true figure is lower. Even at 255 it is a three-method interface.

The long tail is genuinely long: the members that would be expensive to implement are used by
single-digit numbers of pieces.

### 2.3 Network egress is interceptable at one point

```
642 pieces  use httpClient (from @activepieces/pieces-common)
 34 pieces  use raw fetch()
  0 pieces  use axios
```

88% of pieces make every outbound call through **one injectable client**. If we supply
`@activepieces/pieces-common` with an `httpClient` implemented over our egress-policed HTTP client,
we get policy enforcement, retry, timeout and per-connection rate limiting for free on 642 pieces.
The other 34 are exactly why [`05 §5.0 A9`](./05-sota-research.md) — the DNS-resolution guard —
matters: it is the backstop that catches anything not going through the library.

### 2.4 Two consumption paths, and the better one is the lazier one

**Path A — build from source.** Clone the MIT monorepo, point the four `@activepieces/*` specifiers
at our implementations, compile the pieces we want. Full control: our `httpClient`, our types, our
patches. Costs a vendored build of someone else's tree and a merge burden on every upstream release.

**Path B — load their published bundle.** Since v0.86.0 each piece is published as a single
self-contained artifact with `@activepieces/*` and third-party deps **inlined** (their
`docs/build-pieces/misc/bundling-pieces.mdx`). At first glance that looks like it defeats module
substitution — and for `httpClient` it does. But it does not defeat the important thing, because
**the context is a parameter, not an import**. Loading is four lines, duck-typed exactly as their own
child process does it (`extractPieceFromModule`: find the export whose `constructor.name === 'Piece'`):

```ts
const mod = await import(bundlePath);
const piece = Object.values(mod).find(e => e?.constructor?.name === 'Piece');
const action = piece.getAction(actionName);
const output = await action.run(powerhouseContext);   // our context, their code
```

Path B needs **no build, no fork, and no dependency on their npm packages** — which is precisely the
dependency they withdrew. The price is that egress control must be enforced at the DNS/undici layer
rather than at `httpClient`, and that we inherit whatever their inlined framework does.

**Recommendation: Path B as the product, Path A as the test rig.** Path B is what an operator would
actually use ("install this piece"), and it is robust to the distribution changes in
[`05 §5.1`](./05-sota-research.md) precisely because it treats the bundle as an opaque artifact. Path
A gives us a reproducible corpus of 728 pieces to run conformance tests against.

### 2.5 The blocker: design-time property resolution

A piece's configuration form is not a schema. It is code:

```ts
Property.Dropdown({
  refreshers: ['auth', 'workspaceId'],       // re-run options() when these change
  refreshOnSearch: true,
  options: async ({ auth, workspaceId }, ctx: PropertyContext) => { … }   // runs server-side
})
Property.DynamicProperties({
  refreshers: ['auth'],
  props: async ({ auth }, ctx) => { … }       // returns a whole property map
})
```

Measured:

| | Pieces | % of 728 |
|---|---|---|
| declare `refreshers:` | **432** | **59%** |
| `Property.Dropdown` | 407 | 56% |
| `Property.DynamicProperties` | 138 | 19% |
| `Property.MultiSelectDropdown` | 94 | 13% |

Activepieces handles this with a **third context kind** alongside action and trigger — `kind: 'props'`
— carrying a restricted `PropertyContext` (connections and a search value, no store, no files, no
run). The editor calls the host, the host calls the piece in a child process, the piece returns
options.

Our spec has `configSchema: SchemaRef` and nothing else. Consequences:

- Without the props channel, ~300 pieces work fully and ~430 render every dropdown as a free-text
  field. That is not "degraded"; for a user asked to supply a Slack channel ID it is unusable.
- This is **not only an Activepieces concern**. Any serious first-party Powerhouse connector needs
  "list my drives", "list my Discord channels". We would have hit this in Phase 9 and bolted it on.

**So the compatibility exercise has paid for itself already, independently of whether we ship the
adapter**: it surfaced a missing architectural surface at Phase 1 rather than Phase 9.

Design note — the props channel has a security shape our other surfaces do not: it executes
third-party code **on a user's editor keystroke**, with live credentials, outside a run. It needs its
own rate limit, a short-TTL cache keyed on `(connectionId, propertyPath, refresherValues)`, the same
worker isolation as a step, and no journal write.

### 2.6 Feature compatibility: the gap list

Comparing their block model to ours ([`02-feature-spec.md §5`](./02-feature-spec.md)):

| Their feature | Ours | Status |
|---|---|---|
| `createAction().run(ctx)` | `ActionDefinition.execute(input, ctx)` | ✅ direct |
| `TriggerStrategy.POLLING` + `onEnable/onDisable/run` | `TriggerDefinition.kind:"poll"` + `poll()` | ✅ direct — but map onto our `dedupKey`, not their `pollingHelper` ([`05 §5.0 B1`](./05-sota-research.md)) |
| `TriggerStrategy.WEBHOOK` (231 pieces) | `WebhookSpec` | ✅ direct; add `onRenew` |
| `TriggerStrategy.APP_WEBHOOK` (4 pieces) | — | ⚠️ gap A4, but only 4 pieces — defer |
| `PieceAuth.SecretText` (552) / `BasicAuth` (11) / `CustomAuth` (228) | `SecretDeclaration` + `configSchema` | ✅ direct |
| `PieceAuth.OAuth2` (117) / `OIDC` | — | ❌ **gap** — this is [Q10](./04-open-questions.md). 117 pieces, including most of the interesting ones |
| `refreshers` / dynamic props (432) | — | ❌ **gap A3** — precondition |
| `createWaitpoint` (9) | `core#approval` only | ⚠️ gap A2 |
| `ctx.store` / `files` / `tags` / `output` | partial | ✅ small work |

Two hard gaps, one of which (OAuth2) we had already deferred and one of which (props) we had not seen
at all. Note they gate each other: OAuth2 pieces are disproportionately the ones with dropdowns.

### 2.7 Our extensions as an optional superset

The superset direction is clean, because every Powerhouse capability an Activepieces piece does not
know about is something the piece simply never calls:

| Powerhouse extension | How a piece sees it |
|---|---|
| `ctx.reactor` (document read/write under a signer identity) | absent from their context; native connectors get it, pieces do not |
| Delivery-authority token, queue lease | invisible — enforced by the host around the call |
| `dedupKey`-authoritative trigger dedup | we compute the key from their emitted item; the piece is unaware |
| Failure taxonomy, retry policy | we classify their thrown error; they only throw |
| Journal, redaction, run inspector | host-side |
| MCP action blocks, `core#agent`, IDP blocks | different block types entirely |

The rule that keeps this honest: **an adapted piece is a `ConnectorDefinition` like any other.** It
enters the same registry, is isolated by the same worker, is journaled by the same writer. There is
no "Activepieces mode" in the engine — only an adapter that produces a normal connector. That is what
makes the extended functionality optional rather than bifurcating.

### 2.8 What the adapter actually is

Three components, in ascending order of difficulty:

```
packages/connector-activepieces/
  loader.ts        Path B: import bundle → find the Piece export (duck-typed)
  descriptor.ts    piece.metadata() → ConnectorDefinition (pure function over JSON)
  context/
    action.ts      our ActionContext  → their ActionContext
    trigger.ts     our TriggerContext → their TriggerHookContext (+ dedupKey synthesis)
    props.ts       the design-time channel  ← the new architectural surface
  compat/          our implementations of the four @activepieces/* specifiers (Path A only)
```

`descriptor.ts` is mechanical. The context shims are a day each. `props.ts` is the real work, and it
is work we owe our own connectors regardless.

---

## 3. Node-RED

### 3.1 The runtime surface is small

What core nodes actually touch, by occurrence across the 41 core node files:

```
RED.nodes.registerType   50     RED.util.cloneMessage          56
RED.nodes.createNode     49     RED.util.set/getMessageProperty 54
RED.nodes.getNode        18     RED.util.evaluateNodeProperty   21
RED.settings.get/set     ~14    RED.util.evaluate/prepareJSONata 23
RED.auth.needsPermission  5     RED.util.generateId              9
RED.httpAdmin.get/post    6     RED.util.parseContextStore       3
```

And a node instance couples to its flow through exactly **seven members** (measured in
`runtime/lib/nodes/Node.js`, 688 lines):

```
_flow.send   _flow.handleError   _flow.handleStatus   _flow.handleComplete
_flow.log    _flow.path          _flow.TYPE
```

That is a genuinely small shim. `RED.nodes.getNode(config.server)` is their **config-node** lookup —
shared credential/config instances referenced by other nodes — which maps cleanly onto
`powerhouse/connection`. Loading is a documented convention (`package.json` →
`"node-red": { "nodes": { "name": "path.js" } }`), the `.html` sibling is **optional** at load time
(`if (fs.existsSync(htmlFile))`), and there is a `settings.disableEditor` path. Their ecosystem also
has the precedent: `node-red-node-test-helper` exists precisely to run nodes outside the runtime.

So the naive answer is "yes, wrap it". The answer is still no, for two reasons that no amount of shim
fixes.

### 3.2 Mismatch 1 — nodes are actors, steps are functions

A Powerhouse step is `execute(input, ctx) => Promise<ActionResult>`: one input, one result, a
completion the engine can journal.

A Node-RED node is a **long-lived object** constructed at deploy time and destroyed at undeploy. It
receives messages via `node.on('input', (msg, send, done) => …)` and calls `node.send(msg)` — zero,
one, or many times, on any of N output ports, at any time, possibly long after the input that
provoked it, possibly with no input at all (an `inject` or `mqtt in` node emits spontaneously).
`node.send` pushes into `_flow.send(events)`, routed by `wires` — an array of arrays of node ids
indexed by port.

To present that as a step we must decide when the node is "done". Node-RED added the `done` callback
in 1.0 for exactly this, but adoption is partial: of 31 core node files with an input handler, 14
clearly use the three-argument form and 27 call `done()` somewhere. Third-party nodes are worse.
Anything else forces a **quiescence heuristic** — "assume finished when it has been silent for N ms"
— which is precisely the class of behaviour our journal and delivery-authority design exists to
eliminate. We would be building a durable, at-least-once, idempotency-keyed engine and then feeding
it steps whose completion is a guess.

The nodes that fit best (a pure transform: one in, one out, synchronous) are the nodes we least need,
because they are `core#map` and `core#template`. The nodes worth having — MQTT, Modbus, serial,
hardware — are exactly the long-lived stateful ones that fit worst.

### 3.3 Mismatch 2 — the design-time half is a jQuery application

Each node ships a `.html` sibling containing `RED.nodes.registerType()` in *browser* context with
`defaults`, `inputs`, `outputs`, `label`, plus an HTML form template and `oneditprepare` code that
manipulates the Node-RED editor's DOM (`$('#node-input-x')`, `RED.editor.*`, typed-input widgets).

Activepieces' design-time problem was "run a function, get options" — solvable with a channel.
Node-RED's is "render this vendor's jQuery inside your React editor". There is no channel that fixes
that. The options are to embed the Node-RED editor in an iframe (which is adopting their editor, and
then their flow model, and then their runtime) or to render nothing and expose raw JSON config.

### 3.4 What to do with Node-RED instead

| Approach | Effort | Value | Verdict |
|---|---|---|---|
| Wrap nodes as blocks (L3) | High | Low — the wrappable nodes are the ones we don't need | **No** |
| `nodered#run-flow` action against a sidecar over the admin API | ~1 week | Reaches the whole 5,000-node palette at process granularity, with real isolation | **Yes, v1.1** |
| Publish a Powerhouse node into their palette | ~3 days | Distribution into the largest OpenJS automation community | **Yes** — [`05 §9`](./05-sota-research.md) |
| Reuse `@node-red/util` as a library | ~0 | JSONata helpers, message-property paths, deep clone — Apache-2.0 | **Yes** — §5 |

Feature compatibility (L1) is worth stating as a goal even so: our block set should be able to
*express* what a Node-RED flow expresses, so an importer could translate a `flows.json` into a
Powerhouse workflow document. Their model is a linked graph of typed nodes with port-indexed wires;
ours is a DAG with named ports. The translation is mechanical for the subset that matters. That is a
v1.1 importer, not a runtime.

---

## 4. The unified architecture

Everything above collapses into one idea: **a connector is produced by a provider, and the provider
is pluggable.** The engine never learns that Activepieces exists.

```
                    ┌──────────────────────────────────────────────┐
                    │ BlockRegistry (unchanged)                     │
                    │   id → BlockType                              │
                    └───────────────▲──────────────────────────────┘
                                    │ ConnectorDefinition[]
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
┌───────┴─────────┐    ┌────────────┴────────────┐   ┌──────────┴──────────┐
│ native provider │    │ activepieces provider   │   │ mcp provider        │
│ connectorFactory│    │ bundle → Piece → adapt  │   │ server → tools      │
│ (spec §5.3)     │    │ (optional package)      │   │ ([05 §7])           │
└─────────────────┘    └─────────────────────────┘   └─────────────────────┘
```

Three consequences worth designing for now, in Phase 1, even though the adapter is Phase 9+:

1. **`ConnectorDefinition` must be producible from data**, not only from a `connectorFactory` export.
   The adapter produces one from a bundle it did not write. Our contract already nearly allows this;
   [`05 §5.0 A7`](./05-sota-research.md) (split the descriptor from the path-addressed callables)
   makes it explicit and is the same change.
2. **The props channel is part of the connector contract**, not an Activepieces feature. Add
   `resolveOptions(propertyPath, propsValue, ctx)` to `ConnectorDefinition` in Phase 1.1 with native
   connectors as the first consumer.
3. **Capability declaration.** A connector declares what it needs (`waitpoints`, `appWebhooks`,
   `oauth2`, `dynamicProps`). A host that cannot provide a capability refuses the connector **at load
   time with a clear message**, exactly as `runtimes` already refuses a browser-ineligible connector
   ([`03 Phase 4.4`](./03-implementation-plan.md)). This is what makes "our extensions are an optional
   superset" enforceable in both directions.

---

## 5. Reusable components, and what we owe for them

### From Activepieces (MIT — root LICENSE covers everything outside `packages/ee/` and `packages/server/api/src/app/ee`; I verified no nested `ee` directory exists under `packages/pieces/` or `packages/core/utils|piece-types`, and no per-piece LICENSE files override the root grant)

| Component | LOC | What it buys | Take? |
|---|---|---|---|
| `pieces/framework` | 3,017 | The whole property/auth/trigger/action type system — the thing pieces compile against | **Yes** (Path A); read regardless |
| `pieces/common` | 1,318 | `httpClient` with auth converters, `pollingHelper`, validation, stream helpers | **Yes** for the HTTP layer; **no** for `pollingHelper` ([`05 §5.0 B1`](./05-sota-research.md)) |
| `core/utils` | 1,946 | `isNil`, `apId`, chunk/unique, SSRF IP classifier | **Yes** — the SSRF classifier especially |
| `core/piece-types` | 1,642 | Connection value types, OAuth2 grant types, webhook handshake strategies | **Yes** |
| `framework/src/lib/test` | ~120 | `createMockActionContext` — the context contract, enumerated | **Yes** — literally our shim's checklist |
| `server/engine/.../dns-lookup-guard.ts` | ~150 | DNS-resolution SSRF guard ([`05 §5.0 A9`](./05-sota-research.md)) | **Yes** — read and reimplement |
| `core/shared` | 8,068 | — | **No**: contains `src/lib/ee` — do not vendor wholesale |
| `core/formula`, `core/execution` | 2,447 / 5,561 | their expression engine and run model | **No** — we have JSONata and our own engine |

Vendorable total for full source compatibility: **~7,900 LOC of MIT TypeScript.**

### From Node-RED (Apache-2.0, OpenJS Foundation)

| Component | LOC | What it buys | Take? |
|---|---|---|---|
| `@node-red/util` | 2,149 | `evaluateNodeProperty`, `get/setMessageProperty`, `normalisePropertyExpression`, `cloneMessage`, and **JSONata prepare/evaluate helpers** | **Yes** — it is a mature implementation of the exact expression/mapping layer Phase 3.5 specifies, and JSONata is already our choice (Q3) |
| `runtime/lib/nodes/Node.js` | 688 | The node/flow contract | Read only |
| `registry/` | 3,992 | Node discovery and loading | Read only |
| everything else | — | — | No |

### Obligations

- **MIT (Activepieces):** retain the copyright notice and permission text in any substantial portion
  we copy. Practically: a `THIRD_PARTY_NOTICES.md` per package plus a header on vendored files
  recording origin, upstream commit and date.
- **Apache-2.0 (Node-RED):** the above, plus a `NOTICE` file, plus §4(b) — **state significant
  changes** in modified files. Note §6: the licence grants no trademark rights. We may say
  "compatible with Node-RED"; we may not brand anything *as* Node-RED, and the same caution applies
  to Activepieces' name.
- **Provenance discipline:** vendored files go in a clearly marked `vendor/` directory with a
  `SOURCE` header (`upstream repo @ commit, path, retrieved date, licence`), never edited in place
  without a recorded diff. This is what keeps a future licence audit cheap, and it is cheap only if
  we do it from the first file.
- **No EE contamination:** a CI check that fails if any vendored path resolves into `packages/ee/`,
  `packages/server/api/src/app/ee`, or `packages/core/shared/src/lib/ee`. Given the two-year history
  of EE/MIT entanglement in that repo ([`05 §5.1`](./05-sota-research.md)), this is not paranoia — it
  is the specific, documented failure mode.

---

## 6. Recommendation and sequencing

**Adopt an Activepieces-compatible connector contract as a design constraint now; ship the adapter
later.** The constraint is nearly free at Phase 1 and expensive to retrofit; the adapter is a Phase 9
package that can be cut without touching the engine.

| Phase | Change | Driver |
|---|---|---|
| **1.1** | Split `ConnectorDefinition` into a serialisable **descriptor** + path-addressed **callables** (A7). Add **`resolveOptions()`** to the contract (A3). Add **capability declaration** (§4.3). Version the context (A6) | All three are one-way doors |
| **1.2** | Manifest: a connector may be produced by a **provider**, not only a `connectorFactory` | Lets the adapter be a normal package |
| **3.5** | Adopt `@node-red/util`'s expression/message-property helpers rather than writing our own | Free, mature, Apache-2.0 |
| **4.2** | DNS-resolution SSRF guard (A9), modelled on theirs | Needed for the 34 raw-`fetch` pieces, and for our own connectors |
| **6** | Editor support for `resolveOptions` — the props channel, with cache and rate limit | Without it our own connectors are unusable too |
| **9+** | `@powerhousedao/connector-activepieces` — Path B loader, descriptor translation, context shims. Conformance suite over the 728-piece corpus via Path A | Optional package, zero engine coupling |
| **1.1 (v1.1)** | `nodered#run-flow` sidecar action; Node-RED flow importer; Powerhouse node published to their palette | Ecosystem reach without code coupling |

**Spikes to add to Phase 0** (replacing S6 from [`05 §10`](./05-sota-research.md), which this
research has largely already answered):

- **S6a — Path B loader (1 day).** Fetch one published piece bundle, `import()` it, duck-type the
  `Piece` export, call one action with a hand-written context. Success: a real Slack or HTTP action
  returns a result under our process. This is the whole compatibility thesis, testable in a day.
- **S6b — props channel (2 days).** Call `Property.Dropdown.options()` on a real piece with a real
  connection, out of band from any run. Success: a populated option list, and a written design for
  the cache/rate-limit/isolation story.
- **S7 — Node-RED reality check (1 day).** Instantiate one core node against a hand-written seven-member
  `_flow` shim and drive one message through it. Success criterion is a **decision**: confirm the
  completion-signal problem is as bad as §3.2 argues, then close the L3 option deliberately rather
  than by omission.

**What we are not doing:** forking either project, depending on `@activepieces/*` npm packages
(withdrawn — see [`05 §5.1`](./05-sota-research.md)), embedding the Node-RED runtime or editor, or
letting either project's model leak into the engine.

---

## 7. Open questions this raises

**Q22 — Do we commit to Activepieces artifact compatibility (L3) as a stated product goal?**
It changes how we describe the connector contract publicly and creates an expectation we must then
maintain across their releases. **Recommendation: yes, but stated as "many Activepieces pieces run
unmodified", never as a compatibility guarantee** — their bundle format is a private contract and
will move.

**Q23 — Does the props channel change the Connect editor's architecture?**
It introduces a synchronous-feeling, credential-bearing, third-party-code call path into the editor.
**Recommendation: design it in Phase 1, build it in Phase 6, and treat it as a first-class surface
with its own threat model.** *Affects Phase 1.1, 6.5.*

**Q24 — Does OAuth2 move into v1 (revisiting [Q10](./04-open-questions.md))?**
117 pieces need it, and they correlate with the interesting ones. Compatibility does not create this
requirement, but it raises the payoff of resolving it. **Recommendation: revisit Q10 with the piece
counts in hand.**

**Q25 — Where does the vendored code live, and who owns the upstream-drift watch?**
A `vendor/` tree with provenance headers plus a CI EE-contamination check needs an owner and a
cadence. **Recommendation: one named owner, checked at each upstream minor release.**

---

## Appendix — measurement commands

Run from the repo roots; re-run when the upstreams move.

```bash
# Activepieces — packages/pieces/community, 728 pieces
grep -rho --include=*.ts "from '@activepieces/[a-z-]*'" . | sort | uniq -c | sort -rn
for p in httpClient "fetch(" "from 'axios'"; do \
  echo "$p: $(grep -rl --include=*.ts "$p" . | cut -d/ -f2 | sort -u | wc -l)"; done
for p in "refreshers" "Property\.Dropdown" "Property\.DynamicProperties" \
         "PieceAuth\.OAuth2" "TriggerStrategy\.POLLING" "TriggerStrategy\.WEBHOOK" \
         "TriggerStrategy\.APP_WEBHOOK" "createWaitpoint"; do \
  echo "$p: $(grep -rl --include=*.ts -e "$p" . | cut -d/ -f2 | sort -u | wc -l)"; done

# Node-RED — packages/node_modules/@node-red
grep -rho --include=*.js "RED\.[a-zA-Z]*\.\?[a-zA-Z]*" nodes/core | sort | uniq -c | sort -rn
grep -o "_flow\.[a-zA-Z]*" runtime/lib/nodes/Node.js | sort | uniq -c
```

# Multi-Reactor Initiative — Plan

**Date:** 2026-10-03 · **Owner/PM:** Claude (Fable 5) · **Client:** Wouter · **Branch:** `feat/multi-reactor` (off `feat/reactor-worker-packaging`)

## Goal

Move the stack from "one app, one reactor" to systematized multi-reactor topologies:
mixed in-browser + remote reactors behind a router client (breaks the browser
local-first ceiling, needed for the automation center prototyped by distyra-test),
a stepping stone to multi-reactor Switchboard (and later cloud) scaling, and a
vehicle to systematize observability/robustness. Capability variance across
environments is a fact to model explicitly, not paper over.

## Strategy

Build the capability in a clean, observable lab bench (`reactor-monitor`) outside
Connect; prove each stage under load with the inspector watching; migrate back into
Connect/Switchboard at the end. Observability is the first deliverable and a standing
invariant. Sync is the expected bug nest and gets the deepest instrumentation.

**Work routing rule (agreed):**
- **Core track** (lands in `packages/reactor` & friends, consumers updated, judged
  case-by-case): interfaces, sync/channel abstraction, typed inspection surface,
  anything consistency-touching. Limits drift before the final reunion.
- **Monitor track** (stays in `reactor-monitor` until stage 4): hosting,
  provisioning, UI, load harnesses.

## Agreed decisions

1. **Stage-1 attachments: refs-only.** Assert refs sync/dedup/resolve against one
   configured attachment service; byte replication (transport wiring, browser store)
   is designed stage 1, built stage 3.
2. **Stage-1 peer discovery: monitor brokers MessagePorts.** The monitor provisions
   both workers, creates a `MessageChannel()`, transfers one port to each worker via
   a new "adopt sync peer" host op; the `LocalChannel` handshake then runs peer-to-peer
   over the port. No ambient discovery protocol in stage 1; the port-adoption op is
   the stable seam for later provisioners.
3. **Workflow execution is a singleton** pinned to one designated Node reactor;
   browser reactors must never register the workflow trigger read model.
4. **Router posture: advisory routing** (adopted from switchboard-lb) — backends
   validate ownership and return structured misroute errors; correctness never
   depends on the router. Placement keyed by drive/collection id via the existing
   `bucketFor` (FNV-1a) convention.
5. **Runtime ownership:** only the coordinator (not subagents) runs `ph vetra --watch`
   (exactly one instance) and drives playwright-cli sessions. Subagents run at most a
   few unconnected tests/builds in parallel (client requirement, resource limits).

6. **Reshuffle strategy (W0.9 follow-up) is OUT OF SCOPE for the entire roadmap**
   (Wouter, 2026-10-04): hardest problem, needs conceptual evaluation; tackle only
   after the roadmap completes. The no-op-redelivery fix stands; a genuine giant
   reorder still dead-letters at the bound — accepted for now (repair lever exists).
7. **No pushing** (Wouter, 2026-10-04): all work stays on the local feat/multi-reactor
   branch; no origin push, no PR, until further notice.
8. **Delivery**: Claude owns the roadmap end-to-end; progress is communicated via
   screenshots at milestones.

## Research ground truth (2026-10-03, file refs in agent reports)

- `IChannel`/`IChannelFactory` (`packages/reactor/src/sync/interfaces.ts:37,137`) are
  transport-agnostic; `SyncBuilder.withChannelFactory` + `ReactorBuilder.withSync` is
  the extension seam. New channel requires NO changes to SyncManager/executor/storage.
  Existing channels: `GqlRequestChannel` (poller, Connect), `GqlResponseChannel`
  (resolver-driven, Switchboard). A local channel is a third, symmetric shape; needs a
  handshake analog of `touchChannel`, cursor persistence, `{type:"local"}` config
  convention, and SHOULD implement peer-manifest exchange (version-skew holds).
- Inspector UI components already live in `packages/design-system/src/connect/components/`
  as prop-driven React (easy lift); 6/8 Connect wiring hooks port trivially;
  `reactor-browser/src/rpc` is already a Connect-free hosting library
  (ReactorHost, connectReactorClient, inspector/admin proxies, WorkerPackageLoader).
  11 inspector ops exist end-to-end but untyped; dispatch switch lives in
  `apps/connect/src/reactor.worker.ts:581-675`.
- Worker-mode `SyncManagerProxy` mailboxes are no-op stubs — mailbox/cursor/dead-letter
  state does not cross the RPC boundary today (observability gap to close).
- No multi-reactor router exists anywhere. Reuse: `client-proxy.ts` Proxy pattern +
  new target-selection layer. Reuse `opentelemetry-instrumentation-reactor`
  (production-wired, per-reactor). Ignore `reactor-group` (auth document model).
- Attachments: `IAttachmentTransport.push/announce` have zero live callers;
  Connect always HTTPs to one Switchboard; no browser-local store exists; per-reactor
  reference-index authorization lags sync.
- Workflow engine (vendored Activepieces): Node-only (forked child processes), wired
  as a single reactor-wide read model, no placement/lease concept (lease columns are
  dead code), policy knobs (retry/failure-mode/concurrency/timeout) are schema+UI only
  — never enforced. Documented bugs: EPIPE crash→boot-loop, 10s host-call timeout
  false-failures, unbounded step journal (743MB/3 days).
- Switchboard: one reactor per process; `options.reactor` injection seam exists;
  GraphQL gateway federates subgraphs of ONE reactor (wrong granularity for routing).

## Verified empirically (this session, fresh worker build)

- Worker-mode Connect↔Switchboard sync is bidirectionally healthy on current code
  (push <3s, pull <5s, vetra setup, playwright-driven).
- Wouter's blocker root causes: (a) stale SharedWorker immune to dev fingerprint
  reload (`appBuildId` static in dev; `apps/connect/src/utils/build-info.ts`) plus
  stale bundle cache (cache key doesn't hash builder-tools content); (b) processors
  silently skipped on worker path (`apps/connect/src/store/reactor.ts:590-602`) —
  distyra analytics/OSC views frozen regardless of sync.
- Open lead: 404 on `/__vendor__/shared-deps.js` at dev boot (worker still builds/runs).

## Stages & work packages

### Stage 0 — reactor-monitor (app wrapping a package)
- **W0.1 scaffold**: `apps/reactor-monitor` + `packages/reactor-monitor` per the
  boilerplate checklist (tsconfig references, root `references` entry, root
  `build`/`test:ci` filter lists — manual!, vite+vitest configs mirroring Connect).
- **W0.2 hosting library** (package): `provision(descriptor) → ManagedReactor` for
  worker | in-process kinds (remote added stage 3). Thin worker+client entries
  mirroring Connect's two files minus Renown (stub signer), minus PGlite-migration
  (fresh PGlite), minus vetra bundling. Scoped React context instead of `window.ph`.
- **W0.3 core: typed `IInspector`** in `packages/reactor` (11 existing ops, typed,
  + in-process impl constructed from a ReactorModule) + shared dispatch helper in
  `reactor-browser/rpc`; Connect worker becomes a thin adapter. `db.query` stays a
  separate capability. No behavior change; existing tests stay green.
- **W0.4 inspector UI port**: the 6 clean hooks + design-system components into the
  monitor app (deep-import or fork the dozen files); DB explorer on generic
  `queryReactorDb`; drop Connect's debug/reset panel.
- **W0.5 sync observability**: new `sync.*` inspector ops (mailbox depths, cursors,
  dead letters paged, connection snapshots, holds/agreement) crossing the RPC
  boundary; event-stream panel over forwarded bus events.
- **W0.7 storage self-heal** (core track, DONE 2026-10-03, commits d099df6c03,
  4ffad229c9, 010506700b, ce67caaf14): on PGliteSessionPoisonedError the reactor
  recreates its PGlite instance in-place against the same durable storage (stable
  proxy client swaps the inner instance; all holders rewire; single-flight), emits
  STORAGE_SESSION_RECREATED, falls back to host reload only if no replacement opens.
  In-process self-heal confirmed feasible. Needs live-browser pass: pg.close() on a
  real OOM-poisoned instance; soak showing self-heal recovers without operator restart;
  optional inspector UI for the event. Relational-store self-heal intentionally deferred.
- **W0.6 dev-fingerprint fix**: make `appBuildId` vary per dev build (content-hash
  the worker bundle); consider hashing builder-tools content into the bundle cache key.
- Exit demo: monitor app provisions one worker reactor, inspector shows queue/
  processors/sync/events live; library API consumed by a vitest integration test.

### Status note (2026-10-03, end of day-1 autonomous run)
Sync/storage hardening is CODE-COMPLETE and twice through the review gate:
original fix series + 6 blocking fixes + W0.7 self-heal + 5 self-heal review fixes
(HEAD 2e27679e28). Authoritative operation store is now DURABLE (relaxedDurability
off → committed=flushed), self-heal recreates in-place close-then-open, relational
store falls back to host-reload. Regression run 2 was a PARTIAL PASS (drive converges
to 375; silent death → loud refusal). PENDING GATE, held for a memory-headroom window
/ user presence: final Accounts soak on the fully-fixed+reviewed+durable stack to
confirm full pass and isolate whether the residual A-2 poison is logic or OOM-induced.
Live-browser-pass items: pg.close() on a real poisoned instance; relational reload
fallback; durability throughput under bulk catch-up. Run it with scratchpad/verdict.sh
(bounded FOREGROUND — never a background task; see [[vetra-runtime-resource-discipline]]).

### W0.8 — bulk-apply throughput + silent-hang deadline (DONE 2026-10-03, pending run 4)
Run 3 (hardened both ends, healthy RAM): NO poison, NO data loss, storage stayed
healthy — but (A) durable flush-per-op caps bulk catch-up at ~2 ops/sec (~2h for
Accounts' ~16.6k ops), saturating the single-threaded worker and freezing the tab;
and (B) a silently-hung PGlite statement (wasm died mid-call, no error) wedges the
entire worker: lease never released, bounded-acquire bounds only waiters, self-heal
needs an error. Work: (1) statement-level deadline in HardenedPGliteDialect routing a
hung statement into the poison/self-heal path; (2) batched flush / group commit for
bulk ingestion with the invariant that sync cursors only advance past FLUSHED data.
Also: run 3 empirically demonstrates the browser local-first ceiling (motivation 1).

CODE-COMPLETE. (1) Every dialect statement, transaction-control statement and
recovery exec is now bounded (120s default, 900s for data-sized DDL/maintenance,
per statement so a long transaction is unaffected); an expiry escalates once into
the poison/self-heal path, and a generation token discards the abandoned call's
late settlement. (2) Group commit: the store keeps relaxedDurability off, but
`SelfHealingPGliteClient.setDeferredFlush` takes PGlite's automatic
per-statement sync away and `IStorageFlusher.flush()` puts it back at the two
acknowledgment boundaries - a sync cursor write (`FlushGuardedSyncCursorStorage`,
the decorator every cursor write goes through) and a non-sync job's
`JOB_WRITE_READY` (`SimpleJobExecutor`; only cursor-protected sync loads are
exempt, their durability being the cursor's). Measured 9.6x wall-clock / 50x
fewer flushes on 500 synthetic ops. Full design, the exact boundary, and what run
4 must demonstrate: the W0.8 addendum in
docs/bugs/2026-10-03-pglite-aborted-transaction-bricks-worker-reactor.md.

**W0.8 redesign round (2026-10-03).** An adversarial review confirmed ten
correctness findings whose single cause was that the flush and quiescence state
was GLOBAL while the PGlite instance is REPLACEABLE, and that the durability
boundaries were enforced inside implementations rather than at seams. Restructured
rather than point-patched:
- **Epoch scoping.** One `PGliteEpoch` bundles the instance, its captured
  `syncToFs`, the statement sequence, the flush watermark, the statement
  accounting, the statement gate and the in-flight flush. A recreate swaps it in
  one assignment and retires the old one; every statement, flush and watermark
  read/write happens against a captured epoch, and a stale one rejects with the
  retriable `PGliteEpochSupersededError` instead of touching fresh state. That
  kills the leaked-statement wedge, the post-recreate over-claiming flush and the
  stuck flush gate structurally.
- **The filesystem sync is bounded** (`flushSyncTimeoutMs`, 120s) and an expiry
  escalates into the poison/self-heal path, so a hung `syncfs` is a recreate
  rather than a parked flush holding every statement behind it.
- **Sync state rewinds on recovery.** `SyncManager` subscribes to
  STORAGE_SESSION_RECREATED and resets every channel through the W0.5
  `resetChannel` machinery, so channels re-initialise from the persisted
  (flush-gated, therefore safe) cursors and re-pull the tail the fallback lost.
- **Seams, not implementations.** `FlushGuardedSyncCursorStorage` wraps ANY
  cursor storage (so the stage-1 `LocalChannel` inherits boundary 1) and also
  checks the storage epoch around the write; `ReactorBuilder` no longer clobbers
  a caller SyncBuilder's barrier and REFUSES `withWorkerPool`/`withExecutor`
  together with a deferring barrier, since boundary 2 cannot be enforced in an
  executor it does not construct.
- **A committed job is never reported FAILED** for a failing flush: the flush is
  retried with bounded backoff and the announcement withheld if it never
  succeeds; only a session replacement (the commit really was undone) fails it.
- **The load exemption keys on an explicit `cursorProtected` job-meta flag** set
  by sync's own call sites, because `load`/`loadBatch` are public APIs and a
  direct caller has no cursor protecting it.

### W0.9 — executor-layer: giant-history reshuffle + inbox head-of-line (run 4)
Run 4 on the epoch stack was a MAJOR PASS (18x throughput, kill-recover clean, gap
re-pulled, full 375 convergence, correct dead-letter classification). The final
remaining layer is the executor/apply: (a) EXCESSIVE_SHUFFLE limiter refuses a
legitimate 1612-op reorder on the distyra OSC doc (the recurring rev-340 wall);
(b) the inbox apply loop head-of-line blocks unrelated healthy documents behind a
dead-lettered doc's ops (run-4 renames never applied). See bug doc run-4 section.

**Root-caused and fixed** — see `docs/bugs/2026-10-04-excessive-shuffle-analysis.md`.
- (a) The reshuffle was costed before the load established it had anything to
  apply, so a gap re-pull of operations the store already held was charged the
  whole live tail (1612) and dead-lettered. The dedup early return now precedes
  the cost check. The bound itself stays at 1000: a reshuffle materialises two
  document snapshots and a state string per moved operation, so its peak memory
  is quadratic in document size and raising the bound on this document shape
  trades a dead letter for an out-of-memory worker. Deciding concurrency by
  provenance instead of timestamp, and bounding the reshuffle by bytes with a
  streamed re-append, are written up ranked and left for decision.
- (b) The inbox apply ran as one global chain and awaited each item's job in
  turn, compounded by the 30s deferred-job TTL per missing-ancestor operation.
  Replaced with per-document/per-plan-key lanes that settle at the enqueue,
  concurrent per-item resolution, a bounded in-flight slot count, and an
  unapplied floor on the inbox ack so the cursor cannot pass an operation that
  is neither applied nor dead-lettered.

### Stage 1 — two workers, one drive, synced + load-tested
- **W1.1 `LocalChannel`** (core track): symmetric MessagePort channel + handshake
  (touch analog + peer manifests) + `LocalChannelFactory` + cursor persistence.
- **W1.2 port brokering**: "adopt sync peer" host op; monitor wires A↔B for a chosen
  collection. The gql+local composite deferred here (it needs the reactor's
  internal job queue, which only `GqlRequestChannelFactory`'s constructor takes
  and only the builder owns) landed as **W3.0** below; a local-sync reactor is no
  longer forced to be local-only.
- **W1.3 load harness**: document/op generators in the monitor package; per-reactor
  OTel instrumentation; inspector views for lag/cursors/dead letters under load.
  Deliverable: dump N documents into A, watch them sync to B in the inspector.
- **W1.4 attachments (refs-only)**: assertion suite that refs travel/dedup/resolve.
- **W1.5 workflows assertion**: workflow documents sync as documents; no browser
  reactor fires triggers.

### W1.3 milestone achieved (2026-10-04, live, screenshots delivered)
Two browser SharedWorker reactors (alpha/beta, provisioned local-mode in the monitor
UI) synced a drive DIRECTLY over a brokered-MessagePort LocalChannel — no Switchboard,
no GraphQL, no polling. Linked via the UI panel; both Sync tabs showed the local
remote live. Measured (Stage P baselines, small-doc ops): alpha→beta first-op
propagation 105ms; beta→alpha 87ms; 50-op burst created on A in 4.9s (~10 ops/s
local durable write — flush cost, Stage P item) and fully arrived on B 625ms after
creation finished. The review-fix UX verified live: gql add-remote correctly
disabled on local-only reactors with explanation. Remaining W1.3 work: the load
harness proper (bigger N, memory/DB-size sampling, recorded baselines) + W1.4
attachments-refs assertions + W1.5 workflow assertions. Browser-pass items from
W1.1/W1.2 implicitly verified by the live link: transferred MessagePort delivery,
browser messagePortTransport branch, adopt-sync-peer end-to-end.

### Stage 2 — third reactor, in-process (no-worker fallback)
- Capability descriptor becomes explicit (hosting kind, processors?, workflows?,
  storage class, inspection transport). Monitor renders capability differences.

**DONE 2026-10-04** (lib+app suites green: 96 package tests, 39 app tests; tsc,
oxlint, oxfmt clean).

- **The capability contract** is `ReactorCapabilities` in
  `packages/reactor-monitor/src/capabilities.ts`, derived per descriptor by
  `reactorCapabilities()` at provision time, frozen onto every handle as
  `ManagedReactor.capabilities`, and static for the life of the instance (so a
  router may cache it). Fields: `hosting` (worker | in-process | remote),
  `storage: { kind: idb|memory|path|remote, durable }`, `processors` (can host
  processor FACTORIES - false for worker, because a factory is a function and
  does not survive postMessage: Connect's live limitation, backlog item 2),
  `workflows` (false for both browser kinds - the engine forks child processes,
  agreed decision 3), `inspection` (direct | rpc | none), `syncChannels`
  (the literal `ChannelConfig.type`s the BUILT channel factory routes - `gql` |
  `polling` | `local`; empty for a `channelScheme: null` island), `selfHeal`
  (durable store this process opened, i.e. the W0.7/W0.8 in-place recreate
  applies). Worker and in-process differ in
  EXACTLY three fields - `hosting`, `inspection`, `processors` - which is
  asserted, so a new divergence cannot be introduced silently.
  **This is the router's input**: placement, which reactor may host a processor
  or fire a workflow trigger, which pair may be linked, and what observability a
  caller may expect of a target are all reads of this table. The `remote` row is
  derived too, so the router could be designed against a complete table before
  stage 3 landed; since W3.2 a PROVISIONED remote reactor's row is read from
  what that reactor REPORTS (`remoteReactorCapabilities`), and `inspection` is
  `"rpc"` rather than the `"none"` this row carried through stage 2.
- **Capability-aware guard**: `linkLocalSync` now refuses on
  `supportsSyncChannel(capabilities, "local")` rather than on method presence,
  so the declared contract is the thing enforced, in one place; the method check
  remains behind it as a provisioning-invariant assertion.
- **Monitor Overview tab** renders the contract as a 7-cell capability grid with
  a one-line reason per field (plain CSS, `.rm-cap-*`), so worker vs in-process
  variance is visible at a glance instead of buried in prose.
- **RELAY VERDICT: transitive relay WORKS.** `test/three-reactor-topology.test.ts`
  links A<->B and B<->C on one drive (B the hub, two brokered local remotes on one
  reactor - a composition stage 1 never exercised) and asserts that an op created
  on A reaches C through B with no A<->C link, symmetrically C->B->A, with all
  three converging to identical operation counts that then stop moving (no echo
  storm) and all three still inspectable. Cutting one arm leaves the other alive.
  **The echo-suppression mechanism** (read-only; no `packages/reactor` changes):
  a sync load job stamps each written operation's `sourceRemote` with the NAME OF
  THE REMOTE it arrived on (`simple-job-executor.ts`, `effectiveSourceRemote`; a
  load that had to reshuffle clears it so the reorder goes back to everyone), and
  `SyncManager.deriveOutbox` queries the operation index with
  `excludeSourceRemote: remote.meta.name` (`sync-manager.ts:3449` ->
  `kysely-operation-index.ts:591` `WHERE oi."sourceRemote" != ?`), with
  `backfillDocument` and `delivery-tracking.ts` applying the same exclusion.
  Suppression is keyed on the remote NAME, not on "came from sync" - which is
  why A<->B terminates AND why a relay happens: B's remote-for-C has a different
  name, so the op is offered onward exactly once. Loop-freedom and relay are two
  readings of one rule. Consequence for the router: a chain of local links is a
  working transport, so the router must not assume every pair needs a direct link
  (nor that a relayed op's provenance names its originator).
- Live pass still owed: the same trio in the browser (two SharedWorkers + one
  in-process reactor), Overview capability grids side by side showing the
  worker/in-process difference, and A->C relay observed in the Sync tabs.

### Stage 2 LIVE-VERIFIED (2026-10-04, screenshots delivered)
Three-reactor mixed topology in the monitor UI: worker alpha <-> worker beta <->
in-process gamma, one drive, linked via the UI. Transitive relay live: alpha's op
reached gamma THROUGH beta in 258ms with no direct link (reverse 266ms). Capability
grids render the real worker/in-process variance; capabilities derive from the
BUILT worker config (post-review truthfulness fix) with descriptorMismatch flagged.
Stage 2 complete.

### Stage 3 — Switchboard reactor joins
- **W3.0 composite channel factory — DONE 2026-10-04** (the deferred core seam;
  prerequisite for every other stage-3 item, because mixed topologies need ONE
  reactor to hold gql remotes AND brokered local peers).
  - `CompositeChannelFactory` (`packages/reactor/src/sync/channels/composite-channel-factory.ts`)
    implements `IChannelFactory` over a (channel-config type -> factory) map and
    routes `instance()` strictly on `config.type`. An unclaimed type is refused
    by name, listing the types it does serve — the single-factory world answered
    a `{type:"local"}` config on a gql reactor by complaining about a missing
    `url`. Duplicate or empty registrations are refused at construction. It adds
    no behaviour: no queue, no logger, every argument passed through.
  - **Builder-seam shape**: `ReactorBuilder.withChannelScheme(scheme)` is
    unchanged; `withAdditionalChannelFactory(type, factory)` composes ONTO the
    scheme-selected factory. The builder still constructs the gql factory itself
    (the W1.2 note's reason: only it holds the reactor's internal job queue that
    `GqlRequestChannelFactory`'s poll timer needs) and wraps it plus every
    registration in a composite. Generic in the type rather than a
    `withLocalChannelFactory(factory)` shortcut: the composite already keys on
    the config type, so a type-specific method would only hide which key a
    factory sits under, and a third transport would need a third method. The
    scheme's own type is `gql` for CONNECT and `polling` for SWITCHBOARD (what
    reactor-api's `registerChannel` resolver actually writes); registering a
    factory for the scheme's own type is refused. With no registration the
    scheme's factory is used BARE, so an existing reactor's routing is unchanged
    — the composite is strict about `type` where the gql factories are not, and
    tightening that for every reactor is not this seam's business.
  - **Trap removed, BREAKING on purpose**: `withChannelScheme` + `withSync`
    used to build the scheme and silently drop the custom `SyncBuilder` (its
    factory, storages and limits). It now throws at build time naming both
    methods and the composition path. Only configurations that were already
    silently broken fail.
  - Verified by `test/sync/channels/composite-channel-factory/`: unit routing
    and refusals, plus an integration test with THREE real reactors — `mixed`
    (CONNECT + local), a brokered local sibling, and a second Connect reactor
    reachable only through a `FakeSwitchboard` double at the `fetch` boundary.
    One drive syncs over both arms at once, and an op crosses transports in both
    directions (gql in -> local out, and local in -> gql out).
- **W3.1 LIVE-VERIFIED (2026-10-04, screenshots delivered)**: worker "mixed"
  (connect-mode: gql+local composed) held a gql remote to the real vetra
  Switchboard AND a brokered local link to worker "sibling" simultaneously on one
  drive. The Switchboard's drive reached sibling (no server connection) through
  mixed in ms; a folder created on sibling propagated local->gql back into the
  Switchboard's own state. Heterogeneous bidirectional relay live — motivation 1
  demonstrated. Note: W0.10 cold-boot KnexTimeout reproduced again on first boot
  after dist rebuild (recovered on retry; now a reproducible pattern, not flaky).
- **W3.2 core: remote inspection — DONE 2026-10-04** (see the section below):
  `IInspector` + `ISyncInspector` served over GraphQL by reactor-api, a
  `RemoteInspectorClient` implementing both, and `provision({kind:"remote"})`
  made real. The capability contract's `remote` row now reads
  `inspection: "rpc"`.
- **W3.2 LIVE-VERIFIED (2026-10-04, screenshots delivered)**: the real vetra
  Switchboard provisioned as kind "remote" in the monitor; read tabs populated over
  HTTP (info/storage-health/queue/sync with the server's real polling remotes and
  cursors); default posture read-only with levers greyed + reasons; after a server
  restart with PH_INSPECTION_ADMIN=true, "Re-check server" flipped the tiers live
  under the same handle and a trigger-pull was exercised against a real channel.
  Minor follow-up: the server report said workflows:false despite vetra's runtime
  booting — **FIXED in W3.3**: the field was frozen at construction and nothing
  ever set it; it is now the composed-runtime fact, reported per call and set by
  switchboard once `composeWorkflowRuntime` has returned.
  W0.10 cold-boot KnexTimeout: third occurrence, strictly first-boot-after-rebuild;
  warm boots clean.
- **W3.3 workflow placement + hardening** — see the W3.3 section below.
- **W3.4 attachments byte movement - DONE 2026-10-04** (see the section below):
  lazy fetch-on-reference replication, a browser-capable IndexedDB store, a
  peer-to-peer byte transport over the brokered-port seam, and the
  reference-index race surfaced rather than papered over.

### W3.0 monitor adoption (2026-10-04)
The monitor's `connect` sync mode gained local capability, so a mixed topology can
actually be set up in the UI. `buildMonitorReactor` composes a
`LocalChannelFactory` onto the gql scheme, so every reactor with a sync module
holds a `LocalChannelPortRegistry` and adopts brokered peers; `sync.local` keeps
its narrower meaning (local-ONLY, no gql factory) and a `channelScheme: null`
island still has neither. The capability contract states it: a gql-scheme reactor
declares `syncChannels: ["gql", "local"]`, and BOTH the worker handle's
adopt/remove methods and `linkLocalSync`'s guard read that one field — the
worker's previous read of `builtConfig.localSync` would have reported false for a
reactor that does serve local peers. The two UI gates are now independent reads of
the contract: `SyncTab`'s gql add-remote form takes `gqlRemotes` (it was gated on
`local`, which now means the opposite of what it needs) and `LinkLocalSyncPanel`
reads its own end's `local` capability off the registry it already subscribes to
for the target list, offering only local-capable peers and diagnosing a no-local
reactor from its declared channels rather than letting the broker refuse it.
Live pass still owed: one browser
reactor syncing a Switchboard remote and a sibling worker at the same time.
Connect itself adopts the seam in stage 4.

### W3.0 review fixes (2026-10-04)
The review of the two commits above found the same defect in four places: the
capabilities were re-derived from CONFIGURATION branches instead of read from the
reactor that was built. The fix makes the routing a built fact and reads it
everywhere.

- **`BuiltReactor.syncChannelTypes`** (`build-reactor.ts`), exactly parallel to
  `canSelfHeal`: the `ChannelConfig.type`s the sync module's factory actually
  routes, taken off the live factory by `channelFactoryTypes()`
  (`packages/reactor/src/sync/channels/channel-factory-types.ts`) — a
  composite's `registeredTypes()`, the scheme factory's single type when there
  is no composite, `[]` for an island, and `[]` (conservatively) for a factory
  this package cannot classify. It rides the worker's built-config report
  (`BuiltWorkerConfig.syncChannelTypes`, which REPLACES the reported
  `channelScheme`/`localSync` so the tab has no branches left to re-run), and
  `reactorCapabilities(descriptor, built)` takes both built facts together. The
  descriptor-only derivation survives for exactly two rows: the `remote` kind
  and a pre-provision query.
- **Conservative fallback**: when a worker's built-config round-trip fails — a
  failed boot, or a worker on a build that does not report the field at all, in
  which case the payload is REFUSED rather than read as silence —
  `unverifiedReactorCapabilities()` claims the descriptor's capabilities minus
  `local`. The asymmetry is deliberate: a wrong `true` puts adopt/remove on the
  handle and is discovered only after a port has been opened and TRANSFERRED,
  where a wrong `false` costs a re-provision. Worker handles gate those methods
  on the REPORTED types, so version skew fails fast in both directions.
- **`gql` vs `polling` decided**: `syncChannels` carries the LITERAL composite
  types, with no translation layer. A SWITCHBOARD-scheme reactor therefore reads
  `["polling", "local"]`, and the monitor's add-remote form (which gates on
  `gql`, the type it writes) is hidden for it — correctly: a `polling` channel
  is resolver-driven, created when a PEER registers one against this reactor,
  so there is nothing for a holder to add from this side. Its local link panel
  stays live. Asserted at the contract (`local-sync.test.ts`), in the grid
  (`OverviewTab.test.tsx`) and end to end through the UI gates
  (`App.test.tsx`).
- **One spelling**: `GQL_CHANNEL_TYPE` / `POLLING_CHANNEL_TYPE` /
  `LOCAL_CHANNEL_TYPE` are the single source for every writer and reader —
  reactor-api's `touchChannel` resolver, the Sync tab's add-remote form, the
  capability rows, the link guard, and the tests that assert them. One
  per-scheme descriptor in `ReactorBuilder` (exhaustive, never-checked) now
  answers both "which type" and "which factory", so a new scheme cannot be
  registered under one scheme's type while serving another's.
- **One `sync.local` read**: `isLocalOnlySync()` is strict (only the boolean
  `true`) and validated at the descriptor boundary, shared by the builder that
  acts on it and the contract that describes it.

### W3.2 remote inspection (2026-10-04)
A Switchboard is now inspectable from the monitor over HTTP, through the SAME
typed surfaces the two local hosting kinds use -- so every inspector tab works
against a remote reactor unchanged, and there is no remote-specific inspection
view anywhere. The `remote` capability row's `inspection: "none"` (the thing
this work package existed to raise) is now `"rpc"`.

**Server: the `inspection` subgraph** (`packages/reactor-api/src/graphql/inspection/`),
registered as a core subgraph and mounted at `<basePath>/graphql/inspection`
(also stitched into the supergraph). Split the way reactor-api's own reactor
subgraph is: `schema.ts` holds the SDL, `resolvers.ts` the behaviour and all
access checks (pure over its source, so the whole surface is testable with no
HTTP server), `source.ts` the reactor wiring, `subgraph.ts` a shell that
supplies only the request's caller.
- Reads hang off ONE root field, `Query.inspection`: `info`, `queueState`,
  `processors`, `catchUpStatus`, `storageHealth`, `remotes`,
  `remote(remoteName)`, `deadLetters(remoteName, cursor, limit)`,
  `holds(remoteName, documentId)`. One root field means one supergraph name and
  one round trip for a tab that wants several reads.
- Mutations are flat and `inspection`-prefixed: `inspectionPauseQueue`,
  `...ResumeQueue`, `...RetryProcessor`, `...SweepCatchUp`,
  `...ValidateDocument`, `...RebuildKeyframes`, `...RebuildSnapshots`,
  `...TriggerPull`, `...RewindInboxCursor`, `...ResetChannel`,
  `...RequeueDeadLetter`, `...ClearDeadLetter`, `...QueryDb`.
- **The inspector is not re-assembled.** `createReactorInspector(module,
  storageHealth?)` moved into `packages/reactor` (`src/inspector/from-module.ts`)
  and is now the one definition of which live component answers which op;
  `reactor-monitor`'s `buildMonitorReactor` and reactor-api's source both call
  it. The two documented degradations live there: the queue is inspectable only
  when it is the in-memory one (`IInspectableQueue` is that implementation's
  debugging surface, not part of `IQueue`), and `storageHealth` is the host's to
  supply -- a Postgres-backed server reactor has no PGlite-session dimension and
  reports the healthy, never-recreated default, so one client reads every
  hosting kind the same way.
- Flat records are real GraphQL fields; the open-ended payloads (a `Job`, a
  `DeadLetterRecord`, a `CatchUpStatus`, an integrity result) ride the host's
  `JSONObject` scalar. Re-declaring the reactor's type graph in SDL would be a
  second definition that can only drift -- the same call the worker RPC
  boundary makes by structured-cloning them. The one `Date`
  (`InspectorProcessorInfo.lastErrorTimestamp`) travels as epoch ms.

**SECURITY POSTURE — three independent tiers**, documented in
`IReactorInspectionSource` and enforced in one place (`resolvers.ts`):
1. **Reads**: no host opt-in, but NOT public. Queue jobs and dead letters carry
   operation payloads, i.e. document content, so every read is gated on the
   host's own policy-wide reader check (`IAuthorizationService.isSupremeAdmin`,
   the same one `syncHolds` and the package-management ops gate on) --
   everyone under `OPEN`, which is what an unauthenticated dev Switchboard
   already is for every other read, and the ADMINS list under `ADMIN_ONLY` /
   `DOCUMENT_PERMISSIONS`. Deliberately not a second notion of "admin" that
   could disagree with the deployment's policy.
2. **Mutations**: the same check AND `PH_INSPECTION_ADMIN=true` (or
   `options.inspection.admin`). Default OFF; the refusal names the flag, so an
   operator can tell "not allowed here" from "not turned on".
3. **Raw SQL** (`inspectionQueryDb`): `PH_INSPECTION_SQL=true` ON TOP of the
   admin tier. Default OFF, and never implied by tier 2 -- it is the only field
   in the schema that is unconstrained read/write access to the store, and a
   host that wanted operator repair levers has not thereby agreed to expose its
   database. `sqlEnabled` is forced false without `adminEnabled`.
   Both flags are read once at construction, so a deployment's posture cannot
   change under a REQUEST -- it changes under a long-lived CLIENT, which is the
   documented operator flow (restart with the flag), and the client re-reads
   `info` rather than caching it forever. An env flag reads as an opt-in in any
   of `true`/`1`/`yes`/`on`, case-insensitively and trimmed, and refusals name
   those spellings: a posture that silently stays off because an operator wrote
   `TRUE` -- while the refusal tells them to set the flag -- is the worst
   outcome available. With no inspection source the subgraph is NOT registered
   at all, rather than present and refusing every field.

**One wire contract, one definition.** The records that cross this boundary --
the reported info, the processor and remote rows, the cursors, the queue and
storage-health shapes -- live in `@powerhousedao/reactor`
(`src/inspector/wire.ts`), imported by reactor-api's schema/resolvers AND
reactor-monitor's client, with `INSPECTION_WIRE_FIELDS` as the field table both
ends are held to (the client builds its selection sets from it; the subgraph
test asserts the SDL against it, field set by field set, not just root-field
names). Every ordinal is `Float`, never `Int`: ordinals are bigint-origin and
`Int` is 32-bit, so an `Int`-typed cursor turns a long-lived reactor's
inspection read into a serialization error the day its operation index passes
2^31. `INSPECTION_ORDINAL_FIELDS` names them and the test pins each one.

**Client: `RemoteInspectorClient`** (`packages/reactor-monitor/src/remote/`)
implements `IInspector`, `ISyncInspector` and `IReactorDbQuery` over
`fetch`, plus `listHolds`/`triggerPull`/`info`. A `headers` provider resolved
per request is the seam for a bearer (the monitor still has no identity
channel). It knows the far side's tiers from the reported `info` and refuses a
lever that host does not serve locally, by name, so an operator reads WHY
instead of watching a click fail. Those tiers are NOT fixed for the handle's
life -- the documented flow is a restart with the flag -- so `info` is cached
on a modest TTL and re-read at the two moments that matter: before refusing
locally (a stale "no" must never stand in for a host that now says yes) and
after the far side answers `FORBIDDEN` (a stale "yes" is corrected, and the
UI's gate closes with the real reason). `refreshInfo()` is the explicit form
behind the UI's "re-check server" button; the transport carries GraphQL
`extensions.code` on its errors so `FORBIDDEN` is recognised as a code rather
than matched as message text. Decoding restores the reactor's own types: a
`Date` rebuilt from epoch ms, a JSON `null` dropped back to the absent optional
the type declares. Storage health is cached for a few seconds -- the Sync tab
polls every 2s and that dimension changes only on an event.
`RemoteSyncManagerClient` is a full `InspectableSyncManager` whose
inspection half is real and whose RECONFIGURATION half (`add`, `remove`,
`bindRemote`, `setPeerManifest`, `agreement`) refuses by name: which peers a
Switchboard syncs with is that deployment's configuration, not a monitor's to
rewrite. `list()` is synchronous by contract, so it answers from a cache that
provisioning seeds and every `inspectRemotes()` refreshes -- the same
cache-backed-reads shape `SyncManagerProxy` uses across the worker boundary.

**`provision({kind:"remote", remote:{url}})` is real.** It builds nothing: the
inspection endpoint is derived as `<url>/inspection` (overridable), and the one
up-front request is the reactor's own `info`, load-bearing twice -- proof of
life (a URL that is not a reactor fails at provision time with the endpoint in
the message, not on a later tab render) and the SOURCE of the capability row.
- **What the remote row reports**, via the new `remoteReactorCapabilities(descriptor, reported)`:
  `hosting: "remote"`, `storage: {kind:"remote", durable:true}` (not ours to
  open, close or heal), `processors: true` (a server reactor registers its own
  factories in its own realm), `inspection: "rpc"` -- claimed HERE and only
  here, because reaching this function means the reactor answered its `info`
  query, which is the proof a URL is not; the descriptor-only row says
  `"none"` -- `selfHeal: false`, and the
  two fields READ FROM THE REPORT -- `workflows` (whether the engine is actually
  composed into that host; the descriptor-only row says `true` for every remote,
  which would have a router place a workflow drive on a Switchboard that never
  composed it) and `syncChannels` (a Switchboard-scheme reactor routes
  `polling`, not the `gql` a URL suggests). `ReportedCapabilityFacts` is required-together, like
  `BuiltCapabilityFacts`, and is its own type because wire-reported facts and
  built-and-read facts are categorically different. `descriptorMismatch` has no
  analog: nothing was built from this descriptor.
- **What is NOT wired, stated rather than faked** (`remote/unwired.ts`): the
  handle's `client` and `events` throw by name, saying what to use instead
  (a GraphQL reactor client for documents; the surface is request/response, so
  nothing streams the far side's bus). A silently inert stub would read green
  while nothing works -- the exact failure mode this initiative exists to stamp
  out. Document ops over a remote handle are deliberately out of scope for
  W3.2: inspection-first. They still answer `toString`/`toJSON`/`valueOf` with
  a description: refusing a document operation is the point, refusing to be
  PRINTED just breaks the log line or error report of whoever is diagnosing
  something else.

**Monitor UI**: kind `remote` + a GraphQL URL field in the provision form (the
sync-mode select is swapped out -- nothing is built here); the Overview tab
renders the capability grid beside a "Remote host" block with the endpoint, the
server's own store class, the two tier flags and a **"Re-check server"** button;
and `useServerTierGates` turns the reported tiers into per-tab gating --
pause/resume, processor retry, catch-up sweep, the integrity ops and every sync
repair lever are DISABLED with the reason when `adminEnabled` is false, the DB
tab is replaced by its reason when `sqlEnabled` is false, the brokered link
panel is absent (a remote reactor cannot be handed a MessagePort), the
add-remote form is absent for the same reason the link panel is -- a remote
reactor's remotes are that deployment's configuration, so every submit would be
refused, whatever channel types it reports routing -- and the Events tab says
why it is empty. The gates are RE-READ, not computed once: `serverInfo` is a
live read on the handle, `refreshServerInfo()` re-asks, and the hook polls the
handle so a refresh the client performed on its own refusal path reaches the
screen. Every locally hosted reactor defaults to allowed, so no local tab had
to learn about any of this.

**Honest degradation.** `ReactorInspector` refuses a lever its components
cannot serve instead of resolving: `pauseQueue`/`resumeQueue` on a reactor
whose queue is not the inspectable in-memory one, and `retryProcessor` for an
id nothing is tracking. A READ of a missing component is still empty (there is
no queue state, so there are no jobs); an ACTION refuses. Resolving turned into
`inspectionPauseQueue: true` over the wire, i.e. a monitor reporting a pause
that never happened -- the failure mode this surface exists to catch.

**Tests**: `packages/reactor-api/test/inspection-subgraph.test.ts` (36) runs the
real SDL and resolvers against a real in-process reactor module -- each read's
typed shape, every mutating op refusing without the flag and succeeding with it,
raw SQL refusing under the admin tier alone, reads refused under `ADMIN_ONLY`,
the booted API actually REGISTERING the subgraph (`initializeAndStartAPI` +
`executeSubgraphQuery`), the opt-in spellings, a lever refused on a degraded
inspector, an ordinal past 2^31 served intact, and the wire contract pinned
field-set by field-set (plus Float on every ordinal) against the shared table.
`packages/reactor-monitor/test/remote-inspection.test.ts` (37) covers the client
against a stand-in server: variables, decoding, the local tier refusals, both
directions of the restart-with-the-flag flow, header override, half-formed wire
metadata, the describable-but-refusing handles, and the whole provisioning path.
`apps/reactor-monitor/src/RemoteReactor.test.tsx` (8) drives the UI.
**Known seam**: no package dependency links the server's SDL to the client's
hand-written DOCUMENTS (reactor-monitor is a browser package; reactor-api is a
server one), exactly as `reactor-browser` already holds documents against
reactor-api's schema. What they do share is the wire contract in
`@powerhousedao/reactor`, which both import and the subgraph test pins the SDL
against, so the drift guard is now the record SHAPES rather than a list of root
field names; the live pass is the end-to-end proof.

**Live pass still owed**: the monitor attaching to the real vetra Switchboard --
read tabs green (queue/processors/catch-up/storage health, and the Sync tab
showing that Switchboard's own `polling` remotes with cursors and mailbox
depths), the Overview grid reporting `polling` + `workflows` as that host
actually has them, the levers disabled with their reason by default, and the
same levers live after a restart with `PH_INSPECTION_ADMIN=true` -- under the
SAME monitor handle, via "Re-check server" rather than a re-provision.

### W3.3 workflow placement + engine hardening (2026-10-04)

**1. Placement, made structural.** Agreed decision 3 (workflow execution is a
singleton pinned to one Node reactor) was documentation; it is now a durable
claim. `acquireWorkflowSingletonLease`
(`packages/reactor-workflow/src/reactor/singleton-lease.ts`) takes one row in a
`singleton_lease` table in the run journal's own database, and
`composeWorkflowRuntime` takes it BEFORE it builds the runtime. A second live
process is refused by name (`WorkflowSingletonConflictError`).
- **Why a real lease rather than a config assertion**: the two-replica hazard
  is not hypothetical and not gradual. `WorkflowRunStore.create` runs
  `recoverOrphanedRuns` + `recoverAbandonedRuns` when the journal opens, and
  both close out every RUNNING/PENDING run that is not in **this** process's
  `runsInFlight` set — so the second replica's boot marks the first replica's
  live runs FAILED, and then both arm and poll every trigger. An env assertion
  cannot catch that, because the misconfiguration is exactly "both slots have
  the same env". The store already owns a relational namespace and a migration
  path, so one table + three single-statement claims was cheap.
- **Lease / heartbeat / takeover**: 60s TTL, renewed every 20s from `start()`
  (not from compose — a host that threw in between leaves it to expire),
  released on `stop()` so the next boot does not wait out the TTL, and taken
  over once expired so a killed process does not lock workflows out. A
  heartbeat that finds the lease taken logs an ERROR naming the owner and stops
  renewing; it does not kill the process (a database hiccup must not be an
  outage) — what the operator needs is to be told they have a second writer.
- `PH_WORKFLOWS_SINGLETON_OWNER` is the operator's contract on top: a stable
  name per slot re-claims its own lease at once, which is the rolling-deploy
  overlap the dead `trigger_state.lease_owner`/`lease_expires_at` columns were
  written for. Those columns are **removed** (never written non-null, and per
  trigger — the wrong granularity for a per-process guard).

**2. Policy knobs: enforced, or marked unenforced. None left silently dead.**
Enforced in the runtime (`reactor/policy.ts` resolves the effective policy off
the runnable definition; a document with no `policy` enforces nothing, so
legacy and hand-built definitions keep today's behaviour):
- per-step `retry` / policy `defaultRetry` — `maxAttempts`, `backoff`
  FIXED|EXPONENTIAL, `initialDelaySeconds`, `maxDelaySeconds`, `retryOn`
  (empty = every error retryable; otherwise matched against the error's name
  and message). Attempts are journaled on the step row.
- `runTimeoutSeconds` — a run deadline checked between steps and bounding every
  retry wait; expiry ends the run CANCELLED.
- `concurrency` SINGLETON|QUEUE|PARALLEL + `maxParallelRuns` — a per-workflow
  gate in the service. SINGLETON skips a firing while a run is active (the
  skipped run is journaled CANCELLED, so it is visible rather than silent);
  QUEUE serialises; PARALLEL is today's behaviour, bounded by
  `maxParallelRuns` when set.
- `onFailure` PARK|NOTIFY|IGNORE — PARK sets the trigger row PARKED, which the
  due-trigger query (status = ENABLED) does not return, so the schedule stops
  refiring until the workflow is re-published/re-enabled; NOTIFY logs at error
  level (the only notification channel that exists); IGNORE is today's
  behaviour.
- **BREAKING, on purpose**: the document model's own defaults are
  `concurrency: QUEUE` and `onFailure: PARK`, so enforcing them changes
  behaviour for every workflow created by the factory — runs of one workflow
  now serialise, and a terminal failure parks the trigger.

Marked **not yet enforced** at the schema (SDL descriptions) rather than left
lying: `maxSuspensionDays` (nothing can suspend — waitpoints, `run.pause` and
`generateResumeUrl` all throw, so there is no suspended state to bound),
`retainRunsDays` (retention is a journal-wide sweep on the relational handle
with no reactor read; honouring a per-workflow window would mean fetching every
workflow document hourly, including deleted ones — `PH_WORKFLOWS_RUN_RETENTION_DAYS`
is the enforced control), `journalAsDocument` (the journal is relational; there
is no run document model), and a step's `idempotencyKeyExpression` (dedupe is
keyed on the trigger operation/`_dedupe_key`, not on a step expression).

**3. The run journal is bounded on both axes.** Row width was already capped
(256KB per payload); row COUNT now is too: `PH_WORKFLOWS_RUN_RETENTION_DAYS`
defaults to **30 days** instead of unbounded growth, and `0`/`off`/`never` is
the explicit opt-out. The 743MB/3-days observation is what made opt-in the
wrong default. The truncation marker's duck-typed predicate (backlog item 15)
is replaced by a RESERVED sentinel key whose value is a versioned magic string,
which a legitimate payload cannot produce; the old `{truncated:true,…}` shape
is still READ, for rows written before the sentinel, and never written.

**4. Rerun no longer re-runs a side effect it cannot see.** A SUCCEEDED step
whose journaled output was truncated used to be dropped from `completedSteps`,
i.e. re-executed — a second charge, a second email. It now REPLAYS as
completed, and its output is an explicitly unavailable value: a later step that
reads `steps.<key>.output…` fails the rerun by name instead of being handed a
marker or silently re-running the step that produced it.

**5. The crash-replay budget (EPIPE boot-loop).** A fire that kills the process
before its claim commits is re-delivered by the read model forever. The dedupe
row now carries an `attempts` counter committed BEFORE the risky work, so a
replay is countable: over the budget (3) the fire is abandoned with a FAILED
run naming the loop, rather than crashing the reactor on every boot. Log writes
on the piece-log and run-failure paths are truncated before the write.

**6. A host call that times out is INDETERMINATE, not FAILED.** The 10s cap is
configurable (`PH_WORKFLOWS_HOST_CALL_TIMEOUT_MS`) and never shorter than the
step's own `timeoutSeconds`. A host call that writes (a dispatch) and then
times out may well have committed, so the step records INDETERMINATE —
rendered distinctly in Studio — instead of claiming a failure that did not
happen. An INDETERMINATE step does not take the error port and does not replay
on rerun.

**Still owed from the W3.3 line item**: "which reactor ran this" on a run row.
The singleton owner name now exists (`PH_WORKFLOWS_SINGLETON_OWNER`, and the
lease row holds it), so it is a column plus a read; it was left out of this pass
to keep the change to hardening and placement. Also owed: the live pass — a
Switchboard restart showing the lease claimed and released, a second process
refused by name, and the monitor's capability grid reading `workflows: true`
against the real vetra host.

**7. The inspection `workflows` fact is the composed-runtime fact** (the W3.2
live finding). It was an option defaulting to false that nothing ever set, so a
vetra host whose runtime booted reported `workflows: false`. `startAPI` now
hands its inspection source back on the API, the source's reported info is read
per call rather than frozen, and switchboard flips it with
`setWorkflowsComposed(true)` once `composeWorkflowRuntime` has returned.

### W3.4 attachments byte movement (2026-10-04)

Byte movement was designed in stage 1 and built here (agreed decision 1). The
model is **lazy fetch-on-reference**: nothing is pushed and nothing is eagerly
replicated; a reactor pulls the bytes behind a ref when one of its own
committed operations names a hash its local store lacks.

Suites green: reactor-attachments 613 passed (the Postgres-gated `[Postgres]`
purge rows excepted), reactor-monitor 166 passed, the monitor app 62 passed;
tsc, oxlint and oxfmt clean across all three.

**1. The browser-capable store** is `LocalAttachmentStore` over a narrow
`ILocalAttachmentBackend` seam, with `IdbAttachmentBackend` (two IndexedDB
object stores written in one transaction, bytes as `ArrayBuffer`) and
`MemoryAttachmentBackend`. Every `IAttachmentStore` semantic lives once in the
store, so the two backends cannot drift; the backend contract suite runs
against both, the IndexedDB rows skipping where the realm has no `indexedDB`
(the repo has no `fake-indexeddb`). OPFS stays a later backend and changes
nothing above the seam. Three deliberate differences from
`KyselyAttachmentStore`: no reservation table (so `pending` is only ever a
TRANSPORT answer), `get()` snapshots the blob before handing back a stream (so
the contract's no-destroying-in-flight-reads clause holds by construction
rather than by a refcount), and `sizeBytes` is the measured length received
rather than the producer's claim.

**2. The replicator's seam is `JOB_READ_READY`** on the reactor's own event bus,
and the choice is load-bearing twice. It is AFTER the pre-ready read models, so
a reactor never chases a hash its own attachment reference index has not
recorded -- which is exactly the hash it would refuse to serve onward -- and it
is off the write path, so an unreachable peer cannot delay a commit. Refs come
from `IOperationAttachmentRefs`, whose production implementation reuses
`AttachmentReferenceReadModel`'s own `(registry, AttachmentSchemaCompiler)`
pair; it swallows extraction failures with a diagnostic, because
`IEventBus.emit` aggregates subscriber errors back to the emitter and an
attachment problem must not become a reactor-wide write failure.

**3. Resume is a re-scan, not a cursor.** `IAttachmentReferenceBacklog` pages
the reference index (keyset over `(document_id, attachment_ref)`, so a scan
racing a still-indexing read model cannot skip a row) and `store.has()` decides
per hash. Both are idempotent and together re-derive the exact outstanding work
set on every boot, including hashes whose fetch failed or was still pending
when the realm went away. A persisted cursor would be a second source of truth
that can only ever be wrong in the direction that loses bytes. Loop-safety is
structural: one entry per hash, and a terminal entry is never re-queued by a
further reference -- only `retry()` moves one back.

**4. The local transport** is `LocalAttachmentTransport` +
`LocalAttachmentServer` over the same `LocalChannelPort` abstraction W1.1
built, on a SECOND brokered channel (`attachments:<channelName>`) so a chunked
body cannot delay operation delivery on the sync wire. Protocol
`ph-attachment/v1`: `fetch(id, hash, documentId)` / `cancel(id)` answered by
`begin(metadata) -> chunk(seq, bytes)* -> end`, or `pending`, `not-found`,
`error`. Both halves run on one port and ignore each other's messages; request
ids carry a per-instance nonce, because two peers that both start counting at 1
would otherwise match each other's replies. The server reads its store WITHOUT
a document id, so a peer can never chain a miss back out through its own
transport and two linked peers cannot bounce a hash neither holds. `announce`
is a no-op and `push` refuses by name: pull-on-reference is the model, and a
push reporting success while moving nothing is worse than no push at all.

**5. The reference-index race is surfaced, not papered over.** A peer
authorizes a byte read through its OWN reference index, which trails its own
sync, so the first `not-found` for a freshly synced ref is more likely to mean
"not indexed yet" than "no such bytes". `not-found` is therefore absorbed as
lag for a bounded number of attempts (default 3, exponential) before being
recorded terminally, `pending` retries on the answer's `retryAfterMs`, and the
status counts keep `waiting` and `notFound` as separate numbers so an operator
sees which state a reactor is in. Unauthorized and absent are ONE wire answer
on purpose: distinguishing them would disclose which hashes exist, and the
requester's correct action is the same bounded retry either way. Adopting a new
peer re-chases every terminal hash, and the inspector's lever does too.

**6. Monitor wiring** is `descriptor.attachments: { store: "idb" | "memory" }`,
in-process only for now. `MonitorAttachmentTransport` derives its sources at
FETCH time -- brokered peers first (an in-realm hop with no network), then the
Switchboard origins its own gql remotes name -- because a reactor's remotes
change under it, so adding a remote in the Sync tab is all it takes to make
that Switchboard's attachments reachable. Answers are combined by what each
licenses: `data` wins, `pending` outranks `not-found`, `not-found` needs
unanimity, and "nobody could be reached" rethrows rather than being laundered
into `not-found`. `linkLocalSync` brokers the byte channel alongside the sync
one, and a failure there does NOT undo the sync link (operations syncing
without their bytes is the lazy model's own fallback).
`ManagedReactor.attachments` exposes the store, the counts, the per-hash
report, the served-to-peers stats, the live source list and the retry lever;
the app's Attachments tab renders them, and a reactor without a store says so
by name instead of rendering zeroes that look like a healthy empty state.

**7. Package boundary**: `@powerhousedao/reactor-attachments/replication` is a
new entry carrying the realm-neutral byte-movement surface (store, replicator,
local transport, schema-compiled ref extractor) with no filesystem, S3 or
Kysely backend, so a browser reactor does not pull an AWS SDK in to replicate
bytes. `./client` stays deliberately free of the schema compiler, which this
surface needs.

**Proved end to end** (`packages/reactor-monitor/test/local-attachment-sync.test.ts`):
two real in-process reactors linked over brokered MessagePorts, A holding the
bytes, the ref entering A as an operation, sync carrying the STRING to B, and
B's replicator turning that into bytes -- byte-identical, content-address
verified, with A's served counts and B's held counts both reporting it. W1.4
proved the ref string travels; this proves the bytes follow it.

**Owed, and stated rather than implied:**
- **Live-browser pass**: the IndexedDB backend has no Node coverage (no
  `fake-indexeddb` in the repo); its contract rows run automatically in any
  realm that has `indexedDB`. Needed: an in-process monitor reactor with
  `attachments: { store: "idb" }` holding bytes across a reload, plus the
  Attachments tab read live.
- **Worker reactors**: the store config would have to ride the worker construct
  and the status/peer-link ops cross the RPC boundary (a new host op beside
  adopt-sync-peer). The tab says so by name rather than rendering an empty
  panel.
- **A monitor reactor registers no attachment reference read model**, so it has
  no durable backlog (`backlogScanned: false`, reported in the tab) and serves
  peers with the default allow-any-held-hash authorizer. Registering that read
  model is what makes a monitor reactor resumable AND able to authorize what it
  serves; the seams for both (`backlog`, `referenceReader`) are already
  parameters of `buildAttachmentModule`.
- **`ReactorCapabilities` gained no attachment field.** Byte movement is not a
  routing input in this roadmap -- no placement decision depends on it -- and
  the handle's `attachments` presence is the live fact a UI reads. Adding a row
  is a contract change and should wait until a router needs it.

### Stage 3 COMPLETE (2026-10-04) — all builders review-clean, live-verified where demonstrable
W3.0 composite factory, W3.1 mixed topology (live: switchboard gql + local worker, both ways),
W3.2 remote inspection (live: real vetra Switchboard inspected over HTTP, admin tier flip),
W3.3 workflow placement + hardening (live: singleton lease claimed, workflows:true reported;
10 review findings incl. self-inflicted regressions all fixed), W3.4 attachment bytes (store +
lazy replicator + local transport over brokered port + switchboard transport; 10 review findings
incl. a bytes-verification security fix all fixed). Live-pass boundary recorded: end-to-end
attachment byte replication in the UI needs a document model declaring an AttachmentRef field —
the lab bench's base models declare none, and the Attachments tab says so; the byte mechanism
itself is unit-proven (4/4 content-verified A->B over a brokered MessagePort). W0.10 cold-boot
KnexTimeout: intermittent (clean this run after rebuild, crashed on the prior).

### Router client (iterative, stages 1→3)
- New package; `IReactorClient` facade via Proxy-forwarding + target selection by
  collection/drive; advisory routing + structured misroute; v1 constraints: batches
  never span reactors, cross-reactor relationships read-level only, subscriptions
  fan-in.
- **Input contract: `ReactorCapabilities`** (stage 2, shipped — see above). Target
  selection routes on that table; it is per-instance static and therefore
  cacheable. Capability variance is explicit by construction, so the router never
  has to probe a target to learn what it can do.

### ROUTER CLIENT COMPLETE + LIVE-VERIFIED (2026-10-05, screenshots delivered)
packages/reactor-router: RoutingReactorClient over N backends, capability-aware placement
(bucketFor), advisory routing with structured WrongBackendError + ownership guard, fan-in
reads, v1 constraints (no cross-backend batch/relationship-write). 83 pkg tests + review-clean
(5 findings fixed; review confirmed NO lost-write/corruption — the advisory core held under
adversarial tracing). Monitor Router panel + dev handle (66 app tests). LIVE: one client over
workers alpha+beta — routed creates, fan-in find (5 drives merged), capability gating (workflows
refused on browser backends, reason named), cross-backend batch → CrossBackendBatchError, and the
headline: a deliberately-wrong override (drive1→beta) still landed the write on alpha (true owner),
beta never got it, log said "the route was corrected. The override is stale." Wrong-table-never-
loses-a-write invariant demonstrated live. Note: DriveClient.create mints its own id, so
router-created drives land on the primary and are learned (documented).

### Stage 4 — migrate back
- Fold monitor components into Connect; Switchboard hosts/routes multiple reactors
  (`options.reactor` seam); switchboard-lb alignment.

### Stage P — Performance (major chapter, appended 2026-10-04 per Wouter)
Covers three axes, each with measurement harnesses in reactor-monitor first, then
fixes ranked by evidence:
- **Memory**: the ~18 GB footprint for the Accounts dataset (worker ~9 GB + switchboard
  ~9 GB for ~16.6k ops / ~1600 sources) — PGlite-wasm heap profiling, document/state
  snapshot duplication (write cache, keyframes, resultingState copies), reshuffle's
  O(moved x docSize) peak, tab render-storm memory. Target: an Accounts-scale drive
  must fit comfortably in a browser worker or be measurably ineligible (feeding the
  router's placement logic).
- **DB size**: PGlite 2 GB ceiling vs operation-log + keyframe + snapshot growth;
  workflow step-journal growth (known: 743 MB/3 days); vacuum/checkpoint cadence;
  idb persistence cost of the durable flush.
- **Speed**: bulk catch-up throughput (current ~36 ops/s observed; flush batching
  ratios), apply-path hot spots (per-op reducer + indexing cost), sync round-trip
  latency (local channel vs gql), UI responsiveness under load (worker saturation,
  render storms), switchboard cold-boot time (W0.10 KnexTimeout).
Positioning: runs AFTER stage 4 (migration back) unless live-test pain forces
specific items earlier; the stage-1 load harness (W1.3) should already record the
baseline numbers for all three axes so Stage P starts from data.

### Stage 4 scoping (2026-10-05) — assessment complete, awaiting user decisions
Headline: the hardening is ALREADY LIVE in the real apps via shared workspace:* deps.
Connect worker: self-heal + durable group-commit flush (reactor.worker.ts:489,262,549) +
typed inspector. Connect browser path: self-heal but NO group-commit (worker-only).
Switchboard: hardened ClosablePGliteDialect (server.mts:297), inspection subgraph ALREADY
MOUNTED + read-gated on isSupremeAdmin, mutations behind PH_INSPECTION_ADMIN (server.ts:1695,
1361), workflow singleton lease + boot-degradation. NO destructive data migration needed for
distyra-test; removed trigger_state.lease_owner columns are left in place (non-destructive);
singleton_lease + workflow-store migrations are additive/idempotent. One behavior change:
W3.3 QUEUE+PARK factory default (workflows only).
NOT inherited (the genuinely-new Stage-4 work): composite/LocalChannel wiring into the apps;
RoutingReactorClient into Connect (neither app deps reactor-router); multi-reactor Switchboard
hosting (API federates ONE reactor — gateway-granularity work). options.reactor seam exists.
WP split: A (switchboard inspection operator pass) / B (Connect composite factory, inert) /
C (Connect worker adopt-peer handlers) = safe-autonomous. D (Connect cross-tab broker surface) /
E (Connect RoutingReactorClient default) / F (Switchboard multi-reactor host) / G (confirm
QUEUE+PARK) = NEED USER DECISION (change production app default behavior / deployment contract).
Full assessment in task a271fb11d025708bc.

USER DECISIONS (2026-10-05): (1) Connect = ROUTER BEHIND A FLAG — wire inert seams B/C
AND integrate RoutingReactorClient (in-browser + remote switchboard) opt-in, default OFF,
no change for existing users. (2) Switchboard multi-reactor = DEFERRED to its own
design-led stage (gateway-granularity rework + placement config + switchboard-lb alignment)
— the 'later cloud scaling' stepping stone, not now. (3) QUEUE+PARK = KEEP the new default.
So Stage 4 scope NOW = WP-A (switchboard inspection operator pass) + WP-B/C (Connect inert
seams) + WP-E (Connect RoutingReactorClient behind a flag) + the cross-tab broker (WP-D) only
insofar as the flagged router path needs it. WP-F (Switchboard multi-reactor) becomes Stage 5.

## Standing bug backlog (fix as encountered, each with a test)

1. Dev fingerprint staleness (W0.6). 2. Worker-path processors unsupported/silent.
3. `/__vendor__/shared-deps.js` 404 in dev. 4. ~~Workflow policy knobs
unenforced~~ **FIXED (W3.3)**: enforced, or marked NOT YET ENFORCED in the SDL.
5. ~~Workflow EPIPE crash → boot-loop~~ **FIXED (W3.3)**: a crash-replay budget
on the dedupe row, plus truncated log writes.
6. ~~Host-call 10s timeout false-failure~~ **FIXED (W3.3)**: configurable, never
shorter than the step's timeout, and INDETERMINATE rather than FAILED.
7. ~~Unbounded workflow step journal~~ **FIXED (W3.3)**: retention defaults to 30
days. 8. Sync mailbox state invisible over RPC (W0.5). 9. **PGlite aborted transaction +
   active portal bricks worker reactor** — root cause of Accounts sync death; see
   docs/bugs/2026-10-03-pglite-aborted-transaction-bricks-worker-reactor.md.
10. externalDeps/queueHint unvalidated — dangling hint wedges a sub-queue silently
   (queue.ts areDependenciesMet vs completedJobs eviction; core/utils.ts
   validateBatchStructure skips externalDeps). Same silent-death shape as item 9.
11. Re-evaluation writes discarded (simple-job-executor.ts ~2536 returns
   outcome.error, drops operationsWithContext) — revocations may not reach reads.
12. replayDocument replays scopes by Object.keys order, no cross-scope rank
   (shared/document-model documents.ts ~588). Awareness; separate subsystem.
   (Unverified: projection races across scopes / saveState set-vs-max — re-check
   before acting. Historical note: upstream-bugs-6.2.2-dev.85 investigation and
   updateoutbox-scope-ordering primary defects are ALL fixed pre-branch.)
13. Review-confirmed, non-blocking (2026-10-03 adversarial review of the fix series):
   package-loader cluster — reloadSources evicts then silently fails to re-import
   (worker-package-loader.ts:155), replaceRegistryFamilies drops base-bundle
   versions of a touched type (connect reactor.worker.ts:197 + reactor-monitor
   build-worker-reactor.ts duplicate), monitor registerPackages silently no-ops
   without a boot-time loader (build-worker-reactor.ts:129), worker/server
   isUpgradeManifest predicates diverge (worker-package-loader.ts:55).
14. reactor-monitor polish: kill-during-provision race adopts killed reactor
   (registry.ts:58), QueueTab pause button bricks without try/finally, EventsTab
   duplicate keys, unbounded getQueueState cloned over RPC every 2s.
15. ~~reactor-workflow: rerun re-executes side-effectful steps whose journaled
   output was truncated by the 256KB cap; truncation marker is duck-typed~~
   **FIXED (W3.3)**: a truncated SUCCEEDED step replays as completed with an
   explicitly unavailable output, and the marker is keyed on a reserved
   sentinel (the legacy shape is still read, matched by its exact key set).
16. GqlResponseChannel (server side) still has the pre-fix cursor pattern:
   watermark raised before the write, no retry on rejection, concurrent upserts
   possible (gql-res-channel.ts:74, persistOutboxCursor) — same class as the
   fixed finding 4; align it with CursorWriter.
17. Finder-only candidates NOW VERIFIED (accidental review-resume completed the
   reactor-api/builder-tools verifier groups, 2026-10-03): http-loader version pin
   not invalidated on reinstall (http-loader.ts:508) CONFIRMED; both non-restoring
   directory swaps + worker-packages-build has no build lock (reactor-worker-build.ts:379,
   worker-packages-build.ts:223) CONFIRMED; es-module-lexer fill() abort on non-JS dep
   (registry-cache.ts:387) PLAUSIBLE; ensureLink stale-junction rename on Windows
   (registry-cache.ts:650) PLAUSIBLE; isSubgraphClass narrowing (graphql/utils.ts:34)
   PLAUSIBLE-low (deliberate fix of a previously-broken check). All non-blocking,
   builder-tools/package-loader cluster — fold into the item-13 package-loader hardening WP.

## Coordination

- PM/coordination: Fable (this session). Implementation: Opus for design-heavy
  packages (LocalChannel, router, attachment replication), Sonnet for well-specified
  work (scaffold, UI port, inspector ops, harnesses), sequentially or in small
  parallel groups in the single checkout (worktrees only when parallel file mutation
  is unavoidable). Review: adversarial code-review workflow before merging each work
  package into `feat/multi-reactor`.
- Subagents NEVER run `ph vetra` or playwright; the coordinator owns the live
  environment (vetra on distyra-test: studio 6452 / reactor 7452 / connect 2452) and
  does all browser verification.
- Client checkpoints: every stage exit demo + any design decision flagged above.

---

## Stage 4 — Connect integration (WP-B/C/E) — CODE COMPLETE 2026-10-05

Per the 2026-10-05 user decisions (router behind a flag). Built by Opus fleet, through the /code-review gate, all findings fixed.

**Shipped on feat/multi-reactor:**
- Flag `connect.instance.multiReactor` (default **false**) + `?multiReactor=true` / `localStorage` override, via a shared `runtime-flag.ts` helper (try/catch-guarded localStorage for private-mode browsers). `reactor-worker-flag.ts` refactored onto the same helper.
- **WP-B** inert local-channel factory, **gated behind the flag on BOTH the main-thread and worker paths** via a single shared `configureConnectChannelScheme()` so the two cannot drift. Flag-off builds the bare CONNECT gql scheme (factory types `[gql]`, no CompositeChannelFactory) — provably unchanged from pre-Stage-4. Flag reaches the worker through `WorkerConstruct.multiReactor` (threaded like `featureFlags`; not part of the version fingerprint, so flag-off worker build is byte-identical).
- **WP-C** adopt/remove-sync-peer handlers on the worker ReactorHost; `removeLocalPeer` frees the port in a `finally` (no leak on a failing remove). Inert until a port is brokered.
- **WP-E** flag-on builds a `RoutingReactorClient` over `[connect-local, switchboard-remote]`, each `withOwnershipGuard`; `window.ph.reactorClient` keeps its IReactorClient shape. Remote backend = `GraphQLReactorClient` at the prefix-preserving gateway URL (`getSwitchboardGatewayUrlFromDriveUrl`), adapted to full IReactorClient via a by-name-throwing Proxy (honest degradation; `then`/symbol guarded so it's never mistaken for a thenable).

**Tests:** connect 333 (+14, incl. flag-off=`[gql]`/flag-on=`[gql,local]` on both paths, worker flag-threading, remove-leak, thenable-guard, localStorage-throw, subpath URL), reactor-router 83. tsc/lint clean. apps/connect dist NOT rebuilt by agents.

**Review findings (all fixed):** #1 (critical) composite was unconditional → gated; #2 gateway URL dropped reverse-proxy prefix; #3 remove-peer port leak; #4 drives-proxy thenable trap; #5 copy-pasted error string; #6 flag-module clone + unguarded localStorage; #7 optional→required config field.

**Known follow-up (documented, not a regression):** the remote backend delegates only the 6 `IReactorBrowserClient` methods (get/subscribe/execute/getOperations/create/deleteDocument); drive choreography, find, relationships, jobs, batches throw by-name until a later pass. So the flag-on remote path exercises document reads/writes/subscriptions, not full drive CRUD.

Commits: f2b5fa2aad, 364808ab47, e6e77bb672, 3d988dafa8, 608487c9cc (initial); 0b8ed3d27f, 20aa537d17, 52c2bd9e23, 7f38a71c03 (review fixes).

**Next:** live pass (flag-off = normal Connect; flag-on = RoutingReactorClient over two backends) + screenshots, then Stage P (performance).

### Stage 4 live pass — round 1 (2026-10-05): boot-brick found & fixed

Live pass (monorepo `apps/connect` vite dev server, not vetra — Connect depends on reactor packages via workspace:*, so the dev server serves branch source directly; far lighter than vetra). Findings:
- **Flag OFF verified live**: `window.ph.reactorClient` is the ordinary `ReactorClient`, no router — identical to pre-Stage-4. The invariant holds in a real browser.
- **Flag ON with a remote drive bricked boot** (real defect, not caught by mocked unit tests): the router built correctly over [connect-local, switchboard-remote], but Connect's boot `find` (drive enumeration) and `isDocumentIdTaken` (default-drive create) fanned across both backends; the remote's 6-method v1 surface threw unsupported, the router escalated to `FanInPartialFailureError` → React ErrorBoundary → app never mounted.
- **Fixed in two review-gated rounds** (reactor-router 88→104 tests): (1) fan-in reads tolerate a capability-limited backend by excluding+logging it; (2) tightened after review found the first cut was too broad — the exclusion is now **per-read**: `find` tolerates (row union, all-excluded = hard error); `isDocumentIdTaken` is **routed** to the serving-else-primary backend (it's on the create path); `isServed` uses a true-wins/all-false-with-gap-fails-loud existence fan-in; relationship reads are **routed to the owner**; `isOperationNotSupported` tightened to instanceof/structured-code in-realm + full-message-shape across RPC (no bare prefix match, so a genuine error isn't swallowed); `FanInPartialFailureError` now carries excluded backends. Net: no fan-in read can return a confidently-wrong boolean/scalar, and no legitimate flag-on LOCAL operation breaks on the remote's incapacity.
- Commits: 099b4a0641, 75a9424dfc (round 1); 4b889fa6fe (round 2, per-read policy).
- **Known v1 limitation (documented):** remote drives are not enumerated by `find` until the remote GraphQL surface is completed (deferred follow-up); the exclusion is logged, not silent.

Next: live re-pass with a remote drive configured — expect flag-on Connect to BOOT, router over two backends, local drives served locally.

### Stage 4 live pass — round 2 (2026-10-05): PASS, screenshots delivered

Monorepo apps/connect vite dev server, a remote drive configured, the per-read fan-in fix (4b889fa6fe) in place. Verified in a real browser via `window.ph.reactorClient`:
- **Flag OFF (default):** client = `ReactorClient`, no router — identical to pre-Stage-4 Connect. (`?multiReactor=false` / unset.)
- **Flag ON (`?multiReactor=true`):** client = `RoutingReactorClient`; `describeRouting().backends = ["connect-local","switchboard-remote"]`; the app BOOTS cleanly (no ErrorBoundary). Console confirms the designed degradation: "Multi-reactor routing enabled; remote Switchboard backend at …/graphql" then repeated "find: backend switchboard-remote is not applicable to this read and was excluded from the fan-in (...)" — remote skipped + logged, never crashed, never silent.
Screenshots (OFF vs ON, live diagnostic overlay) delivered to the user. **Stage 4 CONNECT side (WP-B/C/E) is COMPLETE and live-verified.**

### Stage 4 — remaining loose ends (not blocking the Connect milestone)
- **WP-A** Switchboard inspection operator pass: the inspection subgraph is already mounted/read-gated live; remaining = verify operator-token (PH_INSPECTION_ADMIN/SQL) access against a running Switchboard. Needs a live Switchboard — do when actively watching resources (not fire-and-forget).
- **Remote-backend GraphQL surface completion (the documented v1 follow-up):** implement `find` (and relationship reads) over the Switchboard GraphQL so remote drives are actually enumerated instead of excluded. Package-only, unit-testable against the in-repo reactor-api schema without a live server. This is the natural next step to make flag-on fully useful.

### Roadmap state after this milestone
- Stages 0–3 + router client: DONE, live-verified.
- Stage 4 Connect (WP-B/C/E): DONE, live-verified. Loose ends above.
- Stage 5 (NEW, user-deferred): multi-reactor Switchboard host (gateway-granularity rework + switchboard-lb). Design-led, not started.
- Stage P (performance): memory (~18GB Accounts), DB size (PGlite 2GB ceiling, journal), speed. Baselines banked. Resource-heavy/soak-based — do when actively monitoring.

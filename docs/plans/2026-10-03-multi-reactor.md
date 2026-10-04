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
  collection.
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
  (gql | local, from the descriptor's sync mode; empty for a
  `channelScheme: null` island), `selfHeal` (durable store this process opened,
  i.e. the W0.7/W0.8 in-place recreate applies). Worker and in-process differ in
  EXACTLY three fields - `hosting`, `inspection`, `processors` - which is
  asserted, so a new divergence cannot be introduced silently.
  **This is the router's input**: placement, which reactor may host a processor
  or fire a workflow trigger, which pair may be linked, and what observability a
  caller may expect of a target are all reads of this table. The `remote` row is
  derived too (stating today's truth: `inspection: "none"` until W3.2), so the
  router can be designed against a complete table before stage 3 lands.
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
- **W3.1** attach remote via existing GQL channels.
- **W3.2 core: remote inspection** — `IInspector` served over HTTP/GraphQL by
  reactor-api (authed) so the monitor inspects server reactors.
- **W3.3 workflow placement + hardening**: designated-reactor pinning; enforce or
  remove dead policy knobs; bound the run journal; fix EPIPE boot-loop + 10s
  host-call timeout; "which reactor ran this" in run observability.
- **W3.4 attachments byte movement**: lazy fetch-on-reference wiring, browser-side
  store, reference-index race handling.

### Router client (iterative, stages 1→3)
- New package; `IReactorClient` facade via Proxy-forwarding + target selection by
  collection/drive; advisory routing + structured misroute; v1 constraints: batches
  never span reactors, cross-reactor relationships read-level only, subscriptions
  fan-in.
- **Input contract: `ReactorCapabilities`** (stage 2, shipped — see above). Target
  selection routes on that table; it is per-instance static and therefore
  cacheable. Capability variance is explicit by construction, so the router never
  has to probe a target to learn what it can do.

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

## Standing bug backlog (fix as encountered, each with a test)

1. Dev fingerprint staleness (W0.6). 2. Worker-path processors unsupported/silent.
3. `/__vendor__/shared-deps.js` 404 in dev. 4. Workflow policy knobs unenforced.
5. Workflow EPIPE crash → boot-loop. 6. Host-call 10s timeout false-failure.
7. Unbounded workflow step journal. 8. Sync mailbox state invisible over RPC (W0.5). 9. **PGlite aborted transaction +
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
15. reactor-workflow: rerun re-executes side-effectful steps whose journaled output
   was truncated by the 256KB cap; truncation marker is duck-typed (service.ts:3774,
   store.ts:842) — fold into W3.3 workflow hardening.
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

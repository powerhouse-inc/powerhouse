# Plan: Hybrid projection worker (one worker, host keeps subscriptions + processors)

Date: 2026-09-08 (revised the same day, after PR #2987 merged)
Branch: `main` — `feat/reactor-host-observability` is fully merged
(#2987, `630664faa`); nothing remains on the branch.

## Context

The reactor's host event loop, not Postgres and not the executor, is what caps
switchboard throughput. Two runs in
`packages/reactor/bench/test/integration/BASELINE.md` establish it:

1. **Run 10 (`BASELINE.md:502-540`) — the host loop is the binding constraint.**
   At VUS=128 / 8 executor workers, `eventloop.utilization` sits at **0.993**
   (64 drives) and **0.997** (256 drives); `cpu.util ≈ 3.3 cores` decomposes as
   ~1.0 saturated main loop plus ~0.3 per executor thread. The executor
   produces **1228+ jobs/s** while the queue completes **~120 jobs/s** — the
   read-model coordinator chains cannot drain what the executor emits.
   Corroborating: coordinator `pre_ready` p50 grew 17x (58 ms → 1006 ms)
   between 64 and 256 drives while the one non-yielding stage (`emit`) stayed
   flat at 2.5 ms. Everything that yields pays the loop-queue tax.

2. **Run 11 (`BASELINE.md:543-551`) — one projection worker captures the whole
   win; more shards are monotonically worse.**

   | drives | shards | jobs/sec | loop.util | cpu.util | chain.depth |
   | ------ | ------ | -------- | --------- | -------- | ----------- |
   | 64     | 1      | **1246.40** | 0.967 | 4.010 | 6.50 |
   | 64     | 2      | 1221.87  | 0.968 | 4.114 | 5.63 |
   | 64     | 4      | 1096.50  | 0.977 | 4.155 | 5.33 |
   | 64     | 8      | 1064.87  | 0.976 | 4.379 | 5.23 |

   1246 vs the Run 10 baseline of ~101-118 jobs/s is roughly 10x, and shard 1
   is the best cell. **This work therefore targets `shardCount: 1`. It is not
   sharding.**

**The measurement's scope, stated plainly.** Run 11's bench host configured
`preReadyKinds: ["document-view", "document-indexer"]` and `postReadyKinds: []`
(`packages/reactor/bench/host/src/main.ts:130-136`). Switchboard's own read
models were never in that measurement. `bench/host` registers no processor
manager, no subscription read model, no GraphQL, no subgraphs and no auth.
So:

- Capturing the *measured* win does **not** require porting switchboard's read
  models into a worker. Moving exactly the two built-in pre-ready models off
  the loop is what was measured.
- The 10x is **directional, not a switchboard forecast**. Switchboard's loop
  also carries HTTP, GraphQL, subgraph resolvers, auth, subscriptions and
  package processors, none of which the bench exercises. Do not quote 10x as a
  switchboard number.

**Why the current sharding path cannot be turned on for switchboard.**
`ProjectionShardManager` (`packages/reactor/src/projection/projection-shard-manager.ts:117`)
`implements IReadModelCoordinator` and *replaces* `ReadModelCoordinator`
wholesale. It receives only `preReadyKinds` / `postReadyKinds` plus the model
manifest — never switchboard's read models, never the processor manager, never
the subscription notification read model. Commit `aed202cb3` turned two of
those silent drops into boot-time errors
(`packages/reactor/src/core/reactor-builder.ts:414-445`), and its comment names
the one that is still silent: subscriptions and processors are built,
initialized, and never fed an operation.

**Intended outcome.** A *hybrid* coordinator: one projection worker runs the
two built-in pre-ready models; the host keeps everything else, in the same
order it runs today.

```
worker pre-ready   (document-view, document-indexer)   [worker thread]
  -> host pre-ready  (NodeProcessor, AttachmentReferenceReadModel)
  -> JOB_READ_READY on the host bus
  -> host post-ready (subscription notifications, processor manager)
```

### Scope boundary

**Monorepo only** (`packages/reactor`, `apps/switchboard`). The
`powerhouse-k8s-hosting` change that sets the new env var and raises
`limits.cpu` for the extra thread is tracked separately and is **not** in this
plan.

### Recently landed on this branch — build on these, do not re-plan them

- `e23f219ab` — event-loop instrumentation lives in
  `@powerhousedao/opentelemetry-instrumentation-reactor`, started by
  switchboard. Emits `reactor.host.eventloop.{delay.p50,p95,p99,max}`,
  `reactor.host.eventloop.utilization`, `reactor.host.cpu.utilization`. These
  are how the result gets measured after this work lands.
- `deb71b911` — `REACTOR_DB_POOL_SIZE_HOST` (default 16, rejects 0,
  `apps/switchboard/src/worker-pool.mts:33,104-116`); host pool wired through
  `withInstrumentedPool`, emitting
  `reactor.db.pool.{acquire.wait_duration,size,idle,waiting}` tagged
  `pool=reactor-host`.
- `aed202cb3` — `withProjectionShards` rejects `withReadModel` /
  `withReadModelFactory` registrations instead of dropping them. **Step 5 of
  this plan rewrites that KNOWN LIMITATION comment.**
- `c8343f2be` and the rest of PR #2987 — `ProjectionShardManager` gained the
  correctness fixes the first draft of this plan scheduled as Step 2b, 2c and
  Q2. **Already on `main`; do not re-implement:**
  - `ProjectionShardManagerConfig.consistencyTrackers`: the host's
    `document-view` / `document-indexer` trackers are advanced from every
    relayed `readmodel-indexed` message, gated on `success`. `buildModule`
    passes them as the third argument of `createProjectionShardManager`.
  - zero-operation `JOB_WRITE_READY` relays `JOB_READ_READY` and a zeroed
    `READMODEL_BATCH_COMPLETED` instead of returning early.
  - `onShardFatal` fires on transport `error`, on `exit` after ready (not
    during shutdown), and on every write-ready dropped for a not-ready shard.
  - `withProjectionShards` rejects kind lists that do not name each built-in
    exactly once (`BUILT_IN_READ_MODEL_KINDS`).
  - `packages/reactor/test/projection/` exists: `fake-projection-transport.ts`,
    `projection-shard-manager.test.ts`, `projection-shard-builder-wiring.test.ts`.

Line references below that predate #2987 can be off by up to ~90 lines in
`reactor-builder.ts` and `projection-shard-manager.ts`; symbol names are
authoritative.

---

## Findings — the five open questions, answered

### Q1. Is `relayReadReady` a safe interpose point? Yes, with a host-side per-queueKey chain.

**What the worker actually does.** In `build-projection-stack.ts:268-269` the
worker runs an ordinary `ReadModelCoordinator` over a worker-local `EventBus`.
`runChain` (`packages/reactor/src/read-models/coordinator.ts:142-205`) awaits
the local `JOB_READ_READY` emit, whose only subscriber
(`build-projection-stack.ts:243-250`) calls `events.onReadReady(event)`, which
is a `parentPort.postMessage` (`run-projection-worker.ts:114`) and returns
immediately. **The worker never waits for the host.** It proceeds to its
post-ready stage and then to the next queued job for the same document.

So a naive interpose — `await hostPreReady` inside
`ProjectionShardManager.relayReadReady` (`projection-shard-manager.ts:488-498`)
— would let job N+1's host pre-ready start before job N's finished for the same
`documentId:scope:branch`, breaking the serialization invariant that
`ReadModelCoordinator.handleWriteReady` (`coordinator.ts:99-116`) holds today.

**The fix is cheap and exact.** The host side keeps its own
`Map<queueKey, Promise<void>>` and chains relayed read-ready events on it,
byte-for-byte the shape of `coordinator.ts:99-116`. Relative order is
guaranteed because at `shardCount: 1` there is exactly one worker, one
`MessagePort`, and message delivery on a port is FIFO — the host receives
read-ready events in the worker's own chain order. Chaining per key then
preserves per-key order without serializing across keys.

**Verdict: the interpose is safe.** No alternative architecture is needed.

**Backpressure.** The new host map is unbounded. So is today's: the executor's
`await this.eventBus.emit(JOB_WRITE_READY, ...)`
(`packages/reactor/src/executor/worker-pool-job-executor-manager.ts:389`) does
not block on projection, because both `ReadModelCoordinator.handleWriteReady`
and `ProjectionShardManager.routeWriteReady`
(`projection-shard-manager.ts:327-348`) are synchronous void functions that
enqueue and return. **This plan ships at parity** — it does not add a new class
of unbounded queue, it adds a second instance of an existing one — and makes
the new depth observable by summing worker depth and host depth in
`getChainDepth()`. A bounded ingress (pausing `routeWriteReady` above a
watermark, with the queue absorbing the pressure) is scoped as a follow-up;
Run 11 measured `chain.depth ≈ 6.5` at 1 shard, so the backlog is small in
practice.

### Q2. Consistency tokens — the hang bug is fixed in #2987; the hybrid must not touch the trackers.

`Reactor` threads a `ConsistencyToken` into every read
(`packages/reactor/src/core/reactor.ts`, `get`/`find`/`getOperations` and
friends). Those land in `KyselyDocumentView.waitForConsistency(token,
undefined, signal)` and the same call in `KyselyDocumentIndexer`.
`BaseReadModel.waitForConsistency` delegates to
`ConsistencyTracker.waitFor(coords, timeoutMs, signal)` — and with
`timeoutMs === undefined` there is **no timer**
(`packages/reactor/src/shared/consistency-tracker.ts`, `waitFor`). The wait
is unbounded.

Before #2987 the host's `documentViewConsistencyTracker` and
`documentIndexerConsistencyTracker` were handed to host models that were never
fed an operation under `withProjectionShards`, so any read carrying a non-empty
token hung until aborted. `ProjectionShardManagerConfig.consistencyTrackers`
now fixes that: `routeWriteReady` records each job's coordinates in
`shard.pendingCoordinates`, and `advanceConsistencyTrackers` applies them to
the matching tracker on every relayed `readmodel-indexed` with
`success: true`, dropping them on `readmodel-batch-completed`. The worker
posts `readmodel-indexed` for its pre-ready models *before* its `read-ready`
(that is the local `runChain` order), and one `MessagePort` is FIFO, so by the
time the hybrid handles a `read-ready` both host trackers already sit at that
job's coordinates.

That is strictly stronger than what the first draft of this plan proposed
(advancing both trackers unconditionally from the relayed `read-ready`
operations): it is per read model, and it does not advance when the worker's
index failed. **The hybrid therefore does not touch the trackers.** There is
no `builtInTrackers` member on `HybridProjectionCoordinator`, and the
coordinator factory deps do not expose the two trackers; the builder's bound
`createProjectionShardManager` passes them to the manager exactly as the
`withProjectionShards` branch does today.

A useful consequence: host pre-ready models (e.g. `NodeProcessor`) that read
the built-in tables during `indexOperations` see them consistent to the job
they are indexing, because the host trackers advanced before the hybrid's
chain started. Test case 4 asserts this.

Other waiters are unaffected:
- `JobAwaiter` (`packages/reactor/src/shared/awaiter.ts:70-77`) and
  `InMemoryJobTracker` (`.../job-tracker/in-memory-job-tracker.ts:43-49,73-80`)
  both key off the host-bus `JOB_READ_READY`, which the hybrid still emits —
  now strictly *after* host pre-ready, i.e. a stronger guarantee than sharding
  gives today and identical to the in-process coordinator.
- `SyncManager` subscribes to `JOB_WRITE_READY` only
  (`packages/reactor/src/sync/sync-manager.ts:257`) — unchanged.
- `drain()` is addressed in Step 3.

### Q3. Failure semantics.

**Host read model throws.** Parity with today: `runChain` wraps each stage in
`try/catch`, logs, and continues (`coordinator.ts:150-162` for pre-ready,
`:181-194` for post-ready). A failing host pre-ready model must **not** block
`JOB_READ_READY`, or a single bad read model would hang every awaiter. The
hybrid replicates this exactly.

**Worker dies.** Landed in #2987. `handleTransportError`,
`handleTransportExit` (when the shard had been ready and the manager is not
shutting down) and `dropWriteReady` all call `config.onShardFatal`. There is
no respawn path, so a shard that stops being ready never projects again and
every later write-ready routed to it is dropped — loudly, and through the
hook. `JOB_FAILED` is deliberately not emitted: the operations were written
and are durable, and every other `JOB_FAILED` emitter means "not written".
Switchboard wires the hook to its signal-driven shutdown path (Step 7) so the
container exits and k8s restarts it. Respawn-and-replay remains a follow-up
gated on proving `indexOperations` is idempotent for both built-ins.

**Drain after a fatal (found while revising).** `handleTransportExit` sets
`ready = false` but leaves the shard in `shards[]`, so `drain()` still posts
`drain` to the dead transport and rejects only after `drainTimeoutMs` (30 s
default). The hybrid's shutdown hook awaits `drain()` before
`manager.shutdown()`, so a worker death followed by SIGTERM would stall
teardown for 30 s and then skip `manager.shutdown()` when the rejection
propagates. `reactor.kill()` only calls `coordinator.stop()`, so the shutdown
hook is the sole drain point. Step 2d makes `drain()` skip not-ready shards
(resolving immediately when none are ready), and the hybrid's `shutdown()`
catches a drain failure and continues to `manager.shutdown()`.

**Zero-operation jobs.** Landed in #2987: `routeWriteReady` relays
`JOB_READ_READY` and a zeroed `READMODEL_BATCH_COMPLETED` for an empty batch,
mirroring `ReadModelCoordinator.emitEmptyReadReady`. Under the hybrid the
relay goes through the `onReadReady` hook (Step 2a); `acceptReadReady` emits
immediately for an empty batch and creates no chain entry.

### Q4. Connection budget — recommend a projection pool of 8.

Client-side connections from one switchboard pod today:

| pool | size | source |
| --- | --- | --- |
| reactor host | 16 | `DEFAULT_DB_POOL_SIZE_HOST`, `apps/switchboard/src/worker-pool.mts:33` |
| executor workers | `REACTOR_WORKERS` x 2 | `DEFAULT_DB_POOL_SIZE_PER_WORKER`, `worker-pool.mts:25` |

At `REACTOR_WORKERS=8` that is 16 + 16 = **32**. This plan adds
`1 x REACTOR_DB_POOL_SIZE_PROJECTION`.

Against the staging deployment (CNPG pooler `poolMode: transaction`,
`defaultPoolSize: 25`, `maxClientConnections: 200`; pg `max_connections: 400`):
**`maxClientConnections: 200` is not the constraint — `defaultPoolSize: 25` is.**
In transaction pooling every client connection multiplexes onto 25 server-side
slots, so client pool sizes past that point buy queueing, not concurrency.

**Recommendation: default 8, override via `REACTOR_DB_POOL_SIZE_PROJECTION`** —
reuse the env name the bench already reads
(`packages/reactor/bench/host/src/main.ts:54-56`). Rationale: Run 11 ran
`pool_proj=16` against direct Postgres and observed `chain.depth ≈ 6.5` at
1 shard, i.e. rarely more than ~7 concurrent chains and therefore rarely more
than ~7 concurrent statements; 8 covers the observed working set with a slot in
hand, and behind a 25-slot transaction pooler a larger number is not spendable
anyway. New total: 16 + 16 + 8 = **40** client connections, 20 % of
`maxClientConnections`.

**Unknown, flagged:** this arithmetic counts only reactor pools. Switchboard's
non-reactor Kysely/read-model connections are not included; confirm the real
per-pod total against the pooler's `cnpg_pgbouncer_pools_cl_active` before
raising any of these defaults.

### Q5. Does the host still need its own `document-view` / `document-indexer`? Yes — as read-only facades, and the hybrid must not index them.

`buildModule` constructs `documentView` (`reactor-builder.ts:640-656`) and
`documentIndexer` (`:659-672`) unconditionally and hands both to
`new Reactor(...)` (`:721-733`), which uses them for every read
(`reactor.ts:210,226,253,267,286,991,1017,1036,1057`). They must keep existing.

Both are also pushed into `readModelInstances` (`:656`, `:672`) — but that
array is only consumed by the `new ReadModelCoordinator(...)` branch
(`:716-719`). Under `withProjectionShards` the array is handed to nothing, so
**there is no double-indexing today**: the host copies never index an
operation after boot. (Not quite "read-only": both are `BaseReadModel`
subclasses, and `buildModule` awaits their `init()`, which catches up from
`ViewState.lastOrdinal` — a write. It runs before the worker's `startup()`,
so the two never race; but it means a projection-worker deployment still
replays any backlog on the host at boot.)

The hybrid can easily reintroduce double-indexing. **The factory must receive
caller-registered and factory-registered read models only, never the two
built-ins.** Step 1 restructures the builder so the two lists are distinct.

One consequence to preserve deliberately: `IReadModelCoordinator.readModels` is
a *lookup surface*, not the indexing list. `createReactorHostModuleBase`
resolves `getReadModel(name)` out of it
(`packages/reactor/src/processors/host-module.ts:57-64`), fed from
`readModelCoordinator.readModels` (`packages/reactor-api/src/server.ts:1204,1222`).
So the hybrid's `readModels` **must still include `documentView` and
`documentIndexer`** (so a processor asking for them by name keeps working)
while its `preReady` indexing list must not.

---

## Implementation

Ordered. Each step names its files.

### Step 1 — Separate "caller read models" from "built-in read models" in the builder

**File:** `packages/reactor/src/core/reactor-builder.ts`
**Status: landed** on `feat/hybrid-projection-worker` (`6341d8a63`).

`buildModule()` now accumulates two distinct lists:

```ts
    // withReadModel + withReadModelFactory models only. Excludes
    // documentView/documentIndexer so a caller-supplied coordinator cannot
    // double-index them alongside a projection worker.
    const callerReadModels: IReadModel[] = Array.from(
      new Set([...this.readModels]),
    );
    // ... documentView / documentIndexer constructed and init()ed as before,
    //     but no longer pushed anywhere here ...
    for (const factory of this.readModelFactories) {
      const readModel = await factory({ ... });
      callerReadModels.push(readModel);
    }

    const readModelInstances: IReadModel[] = [
      ...callerReadModels,
      documentView,
      documentIndexer,
    ];
```

`readModelInstances` still feeds the default `new ReadModelCoordinator(...)`
branch unchanged; the built-ins moved from the middle of the pre-ready list to
the end, which is behaviour-identical because `runChain` uses `Promise.all`.
`callerReadModels` is what Step 4 hands to a coordinator factory as
`deps.readModels`.

### Step 2 — Extend `ProjectionShardManager` with the relay hook and a dead-shard-safe drain

**File:** `packages/reactor/src/projection/projection-shard-manager.ts`
**Status: landed** on `feat/hybrid-projection-worker` (`af41b2cc1`). Both hooks
live in the exported `ProjectionShardHooks` type, which
`ProjectionShardManagerConfig` composes (the Step 4 shape; the first draft's
"add `onReadReady` next to `onShardFatal` on the config" wording is
superseded).

Steps 2b (zero-op relay) and 2c (`onShardFatal`) from the first draft are
already on `main` (#2987). Two additive changes remain; both are no-ops when
the new config field is absent and no shard has died, so the pure-shard path
is unchanged.

**2a. A relay hook.** In `ProjectionShardHooks` (composed into
`ProjectionShardManagerConfig`), next to `onShardFatal`:

```ts
  /**
   * When set, replaces the host-bus JOB_READ_READY emit in `relayReadReady`.
   * The hybrid coordinator uses it to run host-side pre-ready read models on
   * a per-queueKey chain before the event becomes visible on the host bus.
   * The hook takes ownership of emitting; call `emitReadReady` to do so.
   * Also receives the zero-operation relay from `routeWriteReady`.
   */
  onReadReady?: (event: JobReadReadyEvent) => void;
```

Split `relayReadReady` so the emit is reusable:

```ts
  private relayReadReady(event: JobReadReadyEvent): void {
    const hook = this.config.onReadReady;
    if (hook) {
      hook(event);
      return;
    }
    void this.emitReadReady(event).catch((err: unknown) =>
      this.logger.error(
        "host JOB_READ_READY emit failed for job @jobId: @error",
        event.jobId,
        err,
      ),
    );
  }

  /** Emits JOB_READ_READY on the host bus. Public, and returns the promise,
   *  so an `onReadReady` hook can await it before its own post-ready stage. */
  emitReadReady(event: JobReadReadyEvent): Promise<void> {
    return this.hostBus.emit(ReactorEventTypes.JOB_READ_READY, event);
  }
```

`relayReadModelIndexed` and `relayBatchCompleted` are untouched: the worker's
`READMODEL_INDEXED` and `READMODEL_BATCH_COMPLETED` keep flowing straight to
the host bus (see Step 3, "Do not emit a second `READMODEL_BATCH_COMPLETED`").

**2d. `drain()` never waits on a dead shard.** Two halves:

- At drain start, build `remaining` from `this.shards.filter((s) => s.ready)`,
  post `drain` only to those, and resolve immediately when the set is empty.
  A not-ready shard is dead — nothing respawns it — and `handleTransportExit`
  has already abandoned its in-flight jobs, so waiting on it can only time
  out.
- In `handleTransportExit`, delete `shard.shardId` from every entry in
  `pendingDrains` and resolve (clear timer, delete) any whose `remaining`
  empties. Filtering at start alone leaves the exact race this is for
  unfixed: a worker that dies *while* a drain is pending — SIGTERM arrives,
  the hook calls `drain()`, then the worker exits — still pins the drain to
  the 30 s timer.

Without both, the hybrid's shutdown hook stalls for `drainTimeoutMs` after a
worker death (Q3).

### Step 3 — New `HybridProjectionCoordinator`

**New file:** `packages/reactor/src/projection/hybrid-projection-coordinator.ts`
**Status: landed** (`b69928976`), 14 unit cases in
`test/projection/hybrid-projection-coordinator.test.ts`. Uses the passed
`logger` (not a child logger) so tests can isolate coordinator errors from
the manager's.

Implements `ILiveReadModelCoordinator`
(`packages/reactor/src/read-models/interfaces.ts`) by composing a
`ProjectionShardManager` and holding the host stages itself. It reproduces the
chain algorithm from `ReadModelCoordinator.handleWriteReady` / `runChain`
rather than reusing the class, because the host chain is driven by relayed
read-ready messages, not by a `JOB_WRITE_READY` subscription. The ~60 lines of
duplication are accepted deliberately: the worker's projection stack also runs
`ReadModelCoordinator`, and refactoring it to share a chain runner would put
both paths at risk for one caller. Extract if a third caller appears.

```ts
export type HybridProjectionCoordinatorOptions = {
  eventBus: IEventBus;
  logger: ILogger;
  manager: ProjectionShardManager;
  /** Caller + factory registered models. NEVER documentView/documentIndexer. */
  preReady: IReadModel[];
  /** subscriptionNotificationReadModel, processorManager. */
  postReady: IReadModel[];
  /** Included in `readModels` for getReadModel() lookup; never indexed here. */
  lookupOnly: IReadModel[];
};

export class HybridProjectionCoordinator implements ILiveReadModelCoordinator {
  /**
   * ONE array, mutated in place by `addReadModel`. reactor-api captures
   * `readModelCoordinator.readModels` by reference exactly once
   * (`packages/reactor-api/src/server.ts`, the `createReactorHostModuleBase`
   * call) and resolves `getReadModel(name)` from that capture, so a getter
   * returning a fresh spread would hide every late registration. Same shape
   * as `ReadModelCoordinator.readModels`.
   */
  readonly readModels: IReadModel[];

  private readonly chains = new Map<string, Promise<void>>();
  private readonly preReady: IReadModel[];
  private readonly postReady: IReadModel[];

  constructor(options: HybridProjectionCoordinatorOptions) {
    this.preReady = options.preReady;
    this.postReady = options.postReady;
    this.readModels = [
      ...options.preReady,
      ...options.postReady,
      ...options.lookupOnly,
    ];
  }

  start(): void { this.manager.start(); }
  stop(): void { this.manager.stop(); }

  /**
   * Entry point wired as ProjectionShardManager.onReadReady. The worker has
   * already committed document-view / document-indexer rows for this batch,
   * and the manager has already advanced the host trackers from the
   * worker's readmodel-indexed messages (FIFO on the port, see Q2).
   */
  acceptReadReady(event: JobReadReadyEvent): void {
    if (event.operations.length === 0) {
      void this.manager.emitReadReady(event).catch(/* log */);
      return;
    }
    const key = this.queueKeyFor(event);   // documentId:scope:branch
    const previous = this.chains.get(key) ?? Promise.resolve();
    const current = previous.then(() => this.runHostChain(event));
    this.chains.set(key, current);
    void current.finally(() => {
      if (this.chains.get(key) === current) this.chains.delete(key);
    });
  }

  private async runHostChain(event: JobReadReadyEvent): Promise<void> {
    // 1. Host pre-ready. Failures log and continue — parity with
    //    ReadModelCoordinator.runChain; a bad read model must not withhold
    //    JOB_READ_READY from every awaiter.
    try {
      await Promise.all(
        this.preReady.map((rm) => this.indexWithTiming(rm, "pre_ready", event)),
      );
    } catch (error) {
      this.logger.error("Host pre-ready read model indexing failed for job @jobId: @Error",
        { jobId: event.jobId }, error);
    }

    // 2. Now the host bus sees it: job tracker, awaiters, otel, sync.
    //    AWAITED, not fire-and-forget: EventBus.emit runs subscribers
    //    sequentially and awaits each, and SubscriptionNotificationReadModel
    //    is documented as needing to run "AFTER READ_READY is emitted".
    try {
      await this.manager.emitReadReady(event);
    } catch (error) {
      this.logger.error("JOB_READ_READY emit failed for job @jobId: @Error",
        { jobId: event.jobId }, error);
    }

    // 3. Host post-ready: subscriptions, then package processors.
    try {
      await Promise.all(
        this.postReady.map((rm) => this.indexWithTiming(rm, "post_ready", event)),
      );
    } catch (error) {
      this.logger.error("Host post-ready read model indexing failed for job @jobId: @Error",
        { jobId: event.jobId }, error);
    }
  }

  addReadModel(readModel: IReadModel, stage: ReadModelRegistrationStage): void {
    if (this.readModels.some(({ name }) => name === readModel.name)) {
      throw new Error(`Read model "${readModel.name}" is already registered`);
    }
    (stage === "pre_ready" ? this.preReady : this.postReady).push(readModel);
    this.readModels.push(readModel);
  }

  getChainDepth(): number {
    return this.manager.getChainDepth() + this.chains.size;
  }

  async drain(): Promise<void> {
    await this.manager.drain();      // worker chains flush first (skips dead shards, 2d)
    while (this.chains.size > 0) {   // then whatever they handed us
      await Promise.allSettled(Array.from(this.chains.values()));
    }
  }

  /** Not part of IReadModelCoordinator — the factory registers it as the
   *  builder shutdown hook (Step 6). Must reach manager.shutdown() even when
   *  drain fails, or a dead worker's transport is never terminated. */
  async shutdown(): Promise<void> {
    try {
      await this.drain();
    } catch (error) {
      this.logger.warn("hybrid coordinator drain failed during shutdown: @error", error);
    }
    await this.manager.shutdown();
  }
}
```

Five details that are load-bearing:

- **`readModels` is a single mutable array.** See the field comment: reactor-api
  captures it once, by reference. A getter that spreads on every access passes
  every unit test and silently breaks `getReadModel()` for anything registered
  through `addReadModel` after boot.
- **`addReadModel` must exist.** `registerAttachmentReferenceReadModelOnModule`
  (`apps/switchboard/src/attachment-reference-read-model.mts`) checks
  `supportsLiveReadModelRegistration` and then calls
  `coordinator.addReadModel(readModel, "pre_ready")`; switchboard reaches that
  path for caller-provided reactors. `ProjectionShardManager` does not
  implement it, so under sharding that registration silently reports
  `live-read-model-registration-unsupported`. The hybrid implements it.
- **`drain()` ordering is sound.** `manager.drain()` resolves on the worker's
  `drained` reply. The worker posts `drained` only after `stack.drain()`
  (`run-projection-worker.ts`, `handleDrain`), and each drained chain had
  already posted its `read-ready` (the local emit is awaited inside
  `runChain`). One `MessagePort`, FIFO: by the time the host handles
  `drained`, every corresponding `read-ready` is already in `this.chains`.
  Flushing the host map afterwards is therefore complete.
- **Do not emit a second `READMODEL_BATCH_COMPLETED`.** The worker already
  forwards one per job (`relayBatchCompleted`), and
  `opentelemetry-instrumentation-reactor/src/instrumentation.ts` records
  `chainWaitDuration`, `batchSize` and three stage durations off it — a
  second event per job would double-count batch size and pollute the stage
  histogram. **Metrics:** emit only per-model `READMODEL_INDEXED` for host
  models (the instrumentation tags those by `read_model.name` and `stage`, so
  they cannot collide with the worker's), and let host chain depth surface
  through `getChainDepth()`, which the coordinator-chain-depth gauge already
  observes.
- **`jobMeta` is not needed.** `ProjectionReadReadyMessage`
  (`packages/reactor/src/projection/protocol.ts`) carries
  `{ type, shardId, jobId, operations }` and `IReadModel.indexOperations`
  takes operations only. No protocol change.

### Step 4 — The coordinator **factory** on the builder

**File:** `packages/reactor/src/core/reactor-builder.ts`
**Status: landed** together with Step 5 (`4ce813dad`). Two implementation
notes worth keeping: a coordinator returned by the factory MUST forward
`start()`/`stop()` to its manager — `Reactor` calls `start()` on whatever the
factory returned, and without it the manager never subscribes to
`JOB_WRITE_READY`, so `pendingCoordinates` stays empty and consistency-token
waits hang; and the `withProjectionShards requires ...` error strings are kept
verbatim (academy docs quote them), so a factory-path caller with a bad kind
list sees a message naming `withProjectionShards`.

`subscriptionNotificationReadModel` and `processorManager` are constructed
*inside* `buildModule()`, so the existing `withReadModelCoordinator(instance)`
can never receive them. Mirror the established deferred-construction pattern —
`ReadModelFactoryDeps` / `ReadModelFactory` / `withReadModelFactory`.

```ts
/**
 * Dependencies handed to a coordinator factory registered via
 * `withReadModelCoordinatorFactory`. Everything here is constructed inside
 * `buildModule()`, which is why deferred construction is required.
 */
export interface ReadModelCoordinatorFactoryDeps {
  /** Host bus. The coordinator subscribes to JOB_WRITE_READY and emits JOB_READ_READY. */
  eventBus: IEventBus;
  /** The builder's resolved logger. */
  logger: ILogger;
  /**
   * Caller-registered (`withReadModel`) plus factory-built
   * (`withReadModelFactory`) read models, in registration order. Excludes
   * documentView/documentIndexer so a hybrid cannot double-index them (Q5).
   */
  readModels: IReadModel[];
  /** Post-ready #1. Must run after JOB_READ_READY so callbacks see fresh reads. */
  subscriptionNotificationReadModel: IReadModel;
  /** Post-ready #2: every package-installed processor. */
  processorManager: IReadModel;
  /** Host's read-serving document view. Lookup surface only — never indexed
   *  host-side when a worker owns "document-view" (Q5). */
  documentView: IReadModel;
  /** Same, for "document-indexer". */
  documentIndexer: IReadModel;
  /**
   * Builds and starts (`startup()` awaited) a projection shard manager bound
   * to this event bus, with the host's document-view / document-indexer
   * consistency trackers already wired (Q2) — the factory never sees the
   * trackers. Exposed as a bound creator so the factory can own the worker
   * without the builder exposing `instrumentedPools`,
   * `resolvedModelManifest` or `shutdownHooks` as mutable state.
   *
   * Unlike the `withProjectionShards` path, this creator does NOT register a
   * shutdown hook: the factory owns the manager's lifecycle and registers one
   * via `registerShutdownHook` below.
   */
  createProjectionShardManager: (
    config: ProjectionShardBuilderConfig & ProjectionShardHooks,
  ) => Promise<ProjectionShardManager>;

  /** Same list `withShutdownHook` appends to; hooks run in registration
   *  order. The factory registers exactly one, so host-chain drain happens
   *  before the worker is terminated. */
  registerShutdownHook: (hook: () => Promise<void>) => void;
}

export type ReadModelCoordinatorFactory = (
  deps: ReadModelCoordinatorFactoryDeps,
) => IReadModelCoordinator | Promise<IReadModelCoordinator>;
```

`ProjectionShardHooks` is a named type in `projection-shard-manager.ts` —
`{ onReadReady?: ...; onShardFatal?: ... }` — and `ProjectionShardManagerConfig`
composes it (`type ProjectionShardManagerConfig = ProjectionShardHooks & { ... }`)
so the two cannot drift. The reactor package's conventions prefer named types
over `Pick`/`Omit`.

Each member justified: `eventBus` and `logger` are what any coordinator needs;
`readModels` / `subscriptionNotificationReadModel` / `processorManager` are the
three lists the default `new ReadModelCoordinator(...)` branch composes;
`documentView` / `documentIndexer` keep `getReadModel(name)` resolvable
(`processors/host-module.ts`); and `createProjectionShardManager` and
`registerShutdownHook` are the only way to own a worker and its teardown
without exposing `instrumentedPools`, `resolvedModelManifest` and
`shutdownHooks` publicly. The two consistency trackers are deliberately
absent (Q2): the bound creator passes them to the manager itself.

Builder changes:

```ts
  private readModelCoordinatorFactory?: ReadModelCoordinatorFactory;

  /**
   * Register a factory that builds the read-model coordinator after the
   * reactor's internal read models, subscription read model and processor
   * manager exist. Use this (not `withReadModelCoordinator`) for coordinators
   * that must compose those internals — e.g. a hybrid projection coordinator.
   */
  withReadModelCoordinatorFactory(factory: ReadModelCoordinatorFactory): this {
    this.readModelCoordinatorFactory = factory;
    return this;
  }
```

Refactor `createProjectionShardManager` (today: `(config, eventBus,
consistencyTrackers) => Promise<IReadModelCoordinator>`, called only from the
`withProjectionShards` branch):

- return `ProjectionShardManager` rather than `IReadModelCoordinator`, and
  accept `onReadReady` / `onShardFatal` on the config, forwarding both to the
  manager;
- add a `registerShutdownHook: boolean` parameter. The `withProjectionShards`
  branch keeps today's `this.shutdownHooks.push(() => manager.shutdown())`;
  the bound creator handed to a coordinator factory passes `false`, because
  the factory registers a hook that drains host chains *first* (hooks run in
  registration order);
- **honour `config.db`.** Today the method ignores its argument's `db`
  entirely: it calls `resolveReactorDbConfig()`, which reads
  `this.workerPool?.db ?? this.projectionShardConfig?.db`, and only takes
  `config.poolSize` from the argument. Under the hybrid
  `projectionShardConfig` is never set, so a caller-supplied `db` would be
  dead code and enabling the projection worker without the executor pool
  would throw "withProjectionShards requires a db". Change it to
  `config.db ?? this.resolveReactorDbConfig()` and run the existing
  `sameDatabaseTarget` check against `this.workerPool?.db` when both exist,
  so a projection worker still cannot address a different database than the
  parent;
- **validate kinds-exactly-once here too, without moving the early guard.**
  Today the check runs at the top of `buildModule()` keyed on
  `this.projectionShardConfig` — before Postgres, migrations,
  `writeCache.startup()` and `executorManager.start()` — so a config typo
  fails fast with nothing leaked. Keep that. A coordinator factory calling
  the bound creator with a bad kind list bypasses it, though, and the creator
  is the only place that path can be checked. Extract one
  `validateBuiltInKindCoverage(preReadyKinds, postReadyKinds)` helper and
  call it from both the early guard and `createProjectionShardManager`;
- keep the forwarding pool instrumentations and the `consistencyTrackers`
  argument as they are.

Selection becomes:

```ts
    const hostTrackers = {
      "document-view": documentViewConsistencyTracker,
      "document-indexer": documentIndexerConsistencyTracker,
    };
    const readModelCoordinator = this.readModelCoordinator
      ? this.readModelCoordinator
      : this.readModelCoordinatorFactory
        ? await this.readModelCoordinatorFactory({
            eventBus,
            logger: this.logger!,
            readModels: callerReadModels,
            subscriptionNotificationReadModel,
            processorManager,
            documentView,
            documentIndexer,
            createProjectionShardManager: (config) =>
              this.createProjectionShardManager(
                config, eventBus, hostTrackers, /* registerShutdownHook */ false,
              ),
            registerShutdownHook: (hook) => this.shutdownHooks.push(hook),
          })
        : this.projectionShardConfig
          ? await this.createProjectionShardManager(
              this.projectionShardConfig, eventBus, hostTrackers, true,
            )
          : new ReadModelCoordinator(eventBus, readModelInstances, [
              subscriptionNotificationReadModel,
              processorManager,
            ]);
```

Add an early guard in `buildModule()`: setting both
`withReadModelCoordinator` and `withReadModelCoordinatorFactory` throws
(ambiguous precedence).

### Step 5 — Guard the two coordinator-ownership options against each other; rewrite the KNOWN LIMITATION comment

**Status: landed** with Step 4 (`4ce813dad`).

**File:** `packages/reactor/src/core/reactor-builder.ts`, the guards at the
top of `buildModule()`

No relaxation is needed: the two `withReadModel` / `withReadModelFactory`
guards key on `this.projectionShardConfig !== undefined`, and the hybrid path
never sets `projectionShardConfig` — it goes through
`withReadModelCoordinatorFactory`. So switchboard's `withReadModelFactory`
calls (`apps/switchboard/src/server.mts` for `NodeProcessor`, and
`attachment-reference-read-model.mts`) pass untouched.

Two edits here. First, add a guard: `withProjectionShards` together with
`withReadModelCoordinatorFactory` **throws** (mirroring the instance+factory
guard in Step 4). They are two different ways to own the coordinator, and
combining them is a wiring mistake, not a configuration. (The first draft's
test list said this combination "no longer throws"; that was the
contradiction, and throwing is the behaviour.)

Second, replace the KNOWN LIMITATION comment with the current truth:

```ts
    // `withProjectionShards` replaces the coordinator wholesale, so it also
    // orphans subscriptionNotificationReadModel and processorManager — both
    // built unconditionally below, with no caller registration to guard on.
    // Under bare sharding they are built, initialized, and never fed an
    // operation, which silently disables GraphQL subscriptions and every
    // package-installed processor. (Consistency-token reads are fine: the
    // manager advances the host trackers from the shards' readmodel-indexed
    // reports.) Hosts that need subscriptions, processors or host read
    // models must use `withReadModelCoordinatorFactory` with the hybrid
    // coordinator (`createHybridProjectionCoordinatorFactory`) instead.
```

### Step 6 — Ship the default factory from `@powerhousedao/reactor`

**New file:** `packages/reactor/src/projection/create-hybrid-projection-coordinator.ts`
**Export from:** `packages/reactor/src/projection/index.ts` and `packages/reactor/index.ts`
**Status: landed** (`61a2ed26f`). Deviations from the sketch below: the root
`index.ts` re-exports from the leaf modules, not the projection barrel (the
barrel pulls `node:worker_threads` in through `transport.ts`); the
`let coordinator` + `!` shape is a small `CoordinatorRef` object because
`prefer-const` rejects assign-once `let`; `HybridProjectionOptions` also passes
through `initTimeoutMs` / `shutdownGraceMs` / `drainTimeoutMs` /
`chainDepthReportIntervalMs`; and `createProjectionShardManager` now honours
`config.db.applicationName` (it hardcoded `reactor-projection-shard`).

Follow-up landed with it (`5c9da1a45`): the "registered only as live modules"
boot failure was gated on `this.workerPool`, but the projection worker builds
its registry from the manifest too, so with `REACTOR_PROJECTION_WORKER=1` and
`REACTOR_WORKERS=0` a live-module-only model would silently be missing from
the worker. `createProjectionShardManager` now runs the same check.

So switchboard's wiring is one call rather than an architecture:

```ts
export type HybridProjectionOptions = {
  /** Fixed at 1 by default: Run 11 shows one worker captures the whole win. */
  shardCount?: number;
  poolSize?: number;
  db?: DbConfig;
  onFatal?: (shardId: string, reason: Error) => void;
};

export function createHybridProjectionCoordinatorFactory(
  options: HybridProjectionOptions = {},
): ReadModelCoordinatorFactory {
  return async (deps) => {
    let coordinator: HybridProjectionCoordinator | undefined;
    const manager = await deps.createProjectionShardManager({
      shardCount: options.shardCount ?? 1,
      // Exactly what Run 11 measured. postReady stays empty: everything
      // post-READ_READY is host-side, by design.
      preReadyKinds: ["document-view", "document-indexer"],
      postReadyKinds: [],
      db: options.db,
      poolSize: options.poolSize,
      onReadReady: (event) => coordinator!.acceptReadReady(event),
      onShardFatal: options.onFatal,
    });
    coordinator = new HybridProjectionCoordinator({
      eventBus: deps.eventBus,
      logger: deps.logger,
      manager,
      preReady: deps.readModels,
      postReady: [deps.subscriptionNotificationReadModel, deps.processorManager],
      lookupOnly: [deps.documentView, deps.documentIndexer],
    });
    deps.registerShutdownHook(() => coordinator!.shutdown());
    return coordinator;
  };
}
```

The `let` + non-null assertion is safe because `onReadReady` can only fire in
response to a `read-ready` message, which requires a `write-ready` to have been
routed, which requires `manager.start()` — and `start()` is called by
`HybridProjectionCoordinator.start()`, which the reactor invokes well after
this factory has returned and assigned `coordinator`.

### Step 7 — Switchboard wiring

**Status: landed.** Env resolution (`6d38308828`): `resolveProjectionWorkerOptions`,
`assertProjectionWorkerSupported({ dev, reactorDbUrl })` (imports
`isPostgresUrl` from `./utils.mjs` rather than taking it as a parameter), the
`projectionWorker` option in `types.ts`, and 38 tests. `server.mts` wiring
(`265526877`): resolution next to `workerPool`, nulled with a warning when a
caller-provided reactor is used, model sources registered when the executor
pool is off, `applicationName: "switchboard-projection"`, and a once-latched
`onFatal` that sends SIGTERM. The `options.signalHandlers === false` branch
sketched below was dropped: `StartServerOptions` has no such field and
switchboard always installs the handlers. Flagged, not fixed:
`buildWorkerDbConfig` errors still say "Worker pool requires...", and
`REACTOR_DB_ACQUIRE_TIMEOUT_MS` reaches the projection pool only through
`workerPool?.acquireTimeoutMs`.

**New file:** `apps/switchboard/src/projection-worker.mts` — mirror the shape of
`apps/switchboard/src/worker-pool.mts` (`resolveWorkerPoolOptions`,
`resolveHostPoolSize`, `buildWorkerDbConfig`):

```ts
const DEFAULT_DB_POOL_SIZE_PROJECTION = 8;   // see Q4

export type SwitchboardProjectionWorkerOptions = { dbPoolSize: number };

/** Enabled by REACTOR_PROJECTION_WORKER=1; null when off (the default). */
export function resolveProjectionWorkerOptions(
  input: { enabled?: boolean; dbPoolSize?: number } | undefined,
  env: NodeJS.ProcessEnv,
): SwitchboardProjectionWorkerOptions | null { /* ... */ }
```

Env vars: `REACTOR_PROJECTION_WORKER` (on/off) and
`REACTOR_DB_POOL_SIZE_PROJECTION` (pool size; same name the bench already
reads).

**File:** `apps/switchboard/src/server.mts` — after the `workerPool` block and
after the two `withReadModelFactory` registrations (`NodeProcessor`,
`registerAttachmentReferenceReadModel`) so nothing about their order changes:

```ts
    if (projectionWorker) {
      reactorBuilder.withReadModelCoordinatorFactory(
        createHybridProjectionCoordinatorFactory({
          shardCount: 1,
          poolSize: projectionWorker.dbPoolSize,
          db: buildWorkerDbConfig(reactorDbUrl!, {
            dbPoolSizePerWorker: projectionWorker.dbPoolSize,
            acquireTimeoutMs: workerPool?.acquireTimeoutMs ?? 5000,
          }),
          onFatal: onProjectionWorkerFatal,
        }),
      );
    }
```

with the handler defined once, latched:

```ts
    // dropWriteReady fires onShardFatal once per dropped job — at Run 11
    // rates that is ~1k calls/s during the shutdown window — so latch, or
    // the builder's "Received SIGTERM again" line floods the one trace an
    // operator wants clean.
    let projectionWorkerFatalFired = false;
    const onProjectionWorkerFatal = (shardId: string, reason: Error) => {
      if (projectionWorkerFatalFired) return;
      projectionWorkerFatalFired = true;
      reactorLogger.error(
        `Projection worker ${shardId} died; shutting down so the ` +
          `supervisor restarts a healthy process`, reason,
      );
      // Reuses the builder's withSignalHandlers() path: reactor.kill(), then
      // the shutdown hooks (api.dispose, hybrid coordinator shutdown), then
      // database.destroy(). server.mts has no shutdown() of its own — the
      // returned handle's shutdown() only disposes the api.
      // applySwitchboardReactorDefaults installs the handlers unless
      // options.signalHandlers === false (builder-defaults.mts); with them
      // off, nothing would catch the signal, so exit directly.
      if (options.signalHandlers === false) {
        process.exit(1);
      }
      process.kill(process.pid, "SIGTERM");
    };
```

Preconditions, validated at boot with the same messages `workerPool` uses —
the projection worker rebuilds its own registry from the manifest, so it
inherits all three:

1. not `dev` (Vite-loaded models cannot cross a thread boundary);
2. a Postgres `reactorDbUrl` (PGlite cannot be shared across threads);
3. worker-importable document-model sources, i.e.
   `withDocumentModelSources(await resolveWorkerModelSources(...))` must have
   run — `resolvedModelManifest` is what the worker init message carries. If
   the projection worker is enabled without the executor worker pool,
   switchboard must still call `resolveWorkerModelSources` and
   `withDocumentModelSources`.

The explicit `db` above only takes effect once Step 4's `config.db` fix lands;
without it `createProjectionShardManager` resolves the db from
`workerPool.db` / `projectionShardConfig.db` only, and the projection worker
cannot be enabled independently of the executor pool.

**File:** `apps/switchboard/src/types.ts` — document the option next to the
existing `workerPool` / `REACTOR_WORKERS` block.

---

## Testing

Templates to copy structure from:
`packages/reactor/test/builder/read-model-factory.test.ts` (builder factory
wiring against a real `buildModule()` with a `StubReadModel`),
`packages/reactor/test/core/reactor-builder.test.ts` (builder guards),
`packages/reactor/test/projection/projection-shard-manager.test.ts` with
`fake-projection-transport.ts` (host-side manager driven by a fake
`IProjectionTransport`, no thread, no Postgres — the `within()` /
`nextEvent()` helpers there are the pattern), and
`apps/switchboard/test/worker-pool.test.ts` (pure env-var resolution).

### `packages/reactor/test/projection/projection-shard-manager.test.ts` (extend)

Already covers: zero-op relay + zeroed batch-completed + no `write-ready`
posted; `onShardFatal` on `exit` after ready, on `error`, on a dropped
write-ready, and *not* during shutdown; trackers advance per model and not on
`success: false`. Add for Step 2:

- with `onReadReady` set, a relayed `read-ready` invokes the hook and nothing
  is emitted on the host bus; `emitReadReady` then emits it;
- with `onReadReady` absent the manager still emits on the host bus
  (pure-shard path unchanged);
- the zero-op relay also goes through `onReadReady` when set;
- `drain()` resolves immediately when the only shard has exited (2d); with
  two shards, one dead, it resolves on the live shard's `drained` alone;
- a shard exiting while a drain is pending releases that drain (2d, second
  half) instead of leaving it to the timeout.

### `packages/reactor/test/builder/read-model-coordinator-factory.test.ts` (new)

- factory receives `readModels` containing the `withReadModel` stub and the
  `withReadModelFactory` stub, and **not** `module.documentView` /
  `module.documentIndexer` (Q5 regression guard);
- factory receives `subscriptionNotificationReadModel` and the same
  `processorManager` / `documentView` / `documentIndexer` instances the module
  exposes;
- returned coordinator becomes `module.readModelCoordinator`;
- the bound `createProjectionShardManager` (with a fake transport factory via
  `withProjectionWorkerFactory`) wires the module's two trackers: a fake
  `readmodel-indexed` advances `module.documentViewConsistencyTracker`;
- the bound creator does not register a shutdown hook of its own, and
  `registerShutdownHook` appends to the list `withShutdownHook` uses.
  `shutdownHooks` is private with no accessor, so assert indirectly: spy on
  the returned coordinator's `shutdown()` and on the transport's
  `terminate()`, drive the signal handler (`withSignalHandlers()` + emit
  `SIGTERM` on `process` with `process.exit` stubbed), and assert each ran
  exactly once — a second `manager.shutdown()` would call `terminate()`
  again;
- the bound creator honours `config.db` with no worker pool configured, and
  rejects a `db` on a different target than the worker pool's;
- the bound creator rejects a kind list that does not name each built-in
  exactly once (validation moved in Step 4);
- `withReadModelCoordinator` + `withReadModelCoordinatorFactory` throws;
- `withProjectionShards` + `withReadModelCoordinatorFactory` throws (Step 5);
- `withReadModel` / `withReadModelFactory` + `withReadModelCoordinatorFactory`
  builds — no `projectionShardConfig`, so the sharding guards do not fire.

### `packages/reactor/test/projection/hybrid-projection-coordinator.test.ts` (new)

Construct a real `ProjectionShardManager` over `createFakeProjectionTransports`
with `onReadReady` wired to the coordinator under test, so the hook, the
FIFO assumptions and `emitReadReady` are all exercised rather than mocked.

Ordering — the cases that matter most:
1. **Stage order per job.** Record a global sequence; assert
   `host-preReady < JOB_READ_READY < host-postReady` for one relayed
   read-ready.
2. **Per-key serialization (Q1).** Push two read-ready messages for the same
   `documentId:scope:branch` back-to-back with a host pre-ready model whose
   `indexOperations` resolves on a manual deferred. Assert job 2's pre-ready
   has not started until job 1's chain completes, and that `JOB_READ_READY`
   for job 1 precedes job 2's pre-ready.
3. **Cross-key parallelism.** Two different documentIds run concurrently
   (job 2 progresses while job 1's pre-ready is blocked).
4. **Host pre-ready sees consistent built-ins (Q2).** With the module's
   trackers passed as `consistencyTrackers`, post `readmodel-indexed(success)`
   for both built-ins and then `read-ready`, as the worker does. Assert the
   host pre-ready model's `indexOperations` observes
   `tracker.waitFor(coords)` already resolved for both trackers, and that the
   coordinator itself never calls `tracker.update`.

Failure:
5. Host pre-ready throws → `JOB_READ_READY` is still emitted, host post-ready
   still runs, the error is logged, later jobs on the same key still process.
6. Host post-ready throws → chain still completes; next job on the key runs.
7. **Shutdown around a worker death (Q3).** Two variants: (a) transport
   `exit` after ready, then `shutdown()`; (b) `shutdown()` first, then
   `exit` while its drain is pending. Both resolve well under
   `drainTimeoutMs` and call the transport's `terminate`.
8. Zero-operation `JOB_WRITE_READY` → `JOB_READ_READY` emitted host-side via
   the hook, no chain entry, no `write-ready` posted to the worker.

Lifecycle:
9. `drain()` resolves only after both worker chains and host chains are empty.
10. `getChainDepth()` sums worker-reported depth and host chain count.
11. `addReadModel(model, "pre_ready")` indexes on subsequent jobs;
    `"post_ready"` runs after emit; duplicate name throws; **and the added
    model is visible through the same `readModels` array reference captured
    before the call** (the reactor-api capture pattern).
12. `readModels` contains host pre/post models **and** documentView /
    documentIndexer (so `getReadModel(name)` keeps working —
    `processors/host-module.ts`).

Metrics:
13. Exactly one `READMODEL_BATCH_COMPLETED` per job reaches the host bus (the
    worker's relay), and one `READMODEL_INDEXED` per host model per job,
    tagged with that model's name and stage.

### `apps/switchboard/test/projection-worker.test.ts` (new)

Mirror `worker-pool.test.ts`: default off; `REACTOR_PROJECTION_WORKER=1`
enables; `REACTOR_DB_POOL_SIZE_PROJECTION` parsed and defaulted to 8; invalid
values rejected with the same message shape as `resolveHostPoolSize`;
enabling in dev or without a Postgres URL throws.

### Integration

**Status: landed** (`31846099b`) as
`packages/reactor/test/integration/hybrid-projection-worker-postgres.test.ts`,
not in `test/builder/integration.ts` (that file is a SyncBuilder harness and
is not matched by the vitest include). Follows the existing `-postgres.test.ts`
precedent: reads `REACTOR_TEST_PG_URL` (default
`postgres://postgres:postgres@localhost:5433/reactor`, always provided in CI),
no skip gate, and creates its own `reactor_hybrid_worker_test` database
because the worker hardcodes `withSchema("reactor")`. The parent database is
supplied via `withKysely(<pg Kysely>)` — under the factory path neither
`workerPool` nor `projectionShardConfig` is set, so without it the parent
would silently fall back to PGlite while the worker read Postgres. The worker
thread runs through a tsx bootstrap (`projection-worker-bootstrap.mjs`,
mirroring `test/executor/worker/entry/worker-bootstrap.mjs`) because
`projectionWorkerEntryPath` resolves to `dist/` which does not exist under
vitest; the `.mjs` is listed in `eslint.config.js` `unsafeIgnoredFiles` like
its precedent.

Five cases over a real thread and real pool: coordinator is a
`HybridProjectionCoordinator`; `reactor.get(id, undefined, token)` returns the
latest write inside 5 s; `subscriptionManager.onDocumentStateUpdated` fires on
`execute`; the job reaches `READ_READY`; and the host read model saw every
`documentId:scope:branch:index` exactly once, each strictly before its
`JOB_READ_READY`. ~1.3 s wall clock including worker spawn.

---

## Status — 2026-09-08, end of implementation pass

Implementation and unit/integration verification are complete on
`feat/hybrid-projection-worker` (not pushed). Measurement and rollout
verification remain.

**Verified:**
- reactor `pnpm test`: 191 files / 3067 tests; switchboard `pnpm test`: 13 /
  209; `tsc --build` for reactor, switchboard and
  `opentelemetry-instrumentation-reactor`; reactor `pnpm build`; eslint 0
  errors across every touched file (one "file ignored" warning from the
  deliberate `unsafeIgnoredFiles` entry for the worker bootstrap `.mjs`).
- `dist/index.js` still has no eager `node:worker_threads` import (the two
  matches are JSDoc text present on `main`).
- Production switchboard smoke (`node dist/index.mjs`, Postgres on 5433,
  `REACTOR_PROJECTION_WORKER=1`): with `REACTOR_WORKERS=0` and with
  `REACTOR_WORKERS=2` — `Projection worker enabled`, `projection worker
  initialized: projection-shard-0`, GraphQL `createEmptyDocument` +
  `execute` + `findDocuments` (served by the worker-side indexer) returns the
  written name, `pg_stat_activity` shows a `switchboard-projection` pool,
  SIGTERM exits 0 in well under a second with the graceful sequence and no
  lingering thread. The no-Postgres guard produces the exact expected message.

**Found and fixed on the way (pre-existing on `main`):**
- `7b25d06eb` — `BASE_MODEL_SPECIFIERS` in `worker-pool.mts` lacked
  `@powerhousedao/reactor-group`, which `builder-defaults.mts` registers as a
  live module, so every `REACTOR_WORKERS>0` or `REACTOR_PROJECTION_WORKER=1`
  boot crashed with `registered only as live modules:
  powerhouse/reactor-group@1` unless `PH_REGISTRY_PACKAGES` happened to list
  it. This blocked the executor worker pool too, not just this feature.
- `5c9da1a45` — the live-module-only check now also runs when only the
  projection worker is configured (Step 6 notes).

**Code-review findings, fixed (PR #2988 review, three commits):**
- Config mismatch was invisible: the factory path's `db` does not exist when
  `resolveReactorDbConfig()` picks the parent database, so a host that
  configured Postgres only through `createHybridProjectionCoordinatorFactory`
  got a PGlite parent and a Postgres worker in silence — every built-in read
  model empty, nothing raised. The worker `db` must now name the parent's
  database unless `withKysely` owns the parent connection.
- A worker whose `init` threw posted a log line and stayed put: `startup()`
  waited out `initTimeoutMs` and then reported the timeout rather than the
  cause, the thread was never terminated, and sibling init timers stayed
  armed. The worker now reports `init-failed` with the marshalled error (it
  reports rather than exits, so the cause cannot lose a race with `exit`), a
  transport error or premature exit settles the pending init, `shutdown()`
  settles whatever is left, and the builder tears the manager down before
  rethrowing.
- `runHostChain` emitted no `READMODEL_BATCH_COMPLETED`, so the pre/post-ready
  stage histograms excluded every read model this feature keeps on the host —
  the numbers Verification 2 below depends on. The host now reports its own
  batch alongside the worker's relayed one.
- `apps/switchboard/src/index.mts` now exits non-zero on a boot failure. It
  previously logged and continued, so a supervisor could not tell a failed
  boot from a healthy one (same behaviour for the executor-pool guards on
  `main`) — which would have made the init-failure fix above stop short of
  actually killing the process.

**Found, not fixed (pre-existing, outside this plan's scope):**
- `buildWorkerDbConfig` error messages say "Worker pool requires..." even
  when only the projection worker is on; `REACTOR_DB_ACQUIRE_TIMEOUT_MS`
  reaches the projection pool only through `workerPool?.acquireTimeoutMs`.
- Switchboard boot warns `no importable document-models entry for
  <switchboard cwd>` — pre-existing, harmless.

**Post-review verification (serial, nothing else on the machine):**
- reactor `pnpm tsc --build` 0, `pnpm test` 191 files / 3075 tests green in
  253s (the Postgres integration case runs for real against the compose
  database on 5433 — it has no skip guard); switchboard `pnpm tsc --build` 0,
  `pnpm test` 13 / 209 green; eslint 0 on every touched file.
- Running both suites concurrently produced 28 reactor and 5 switchboard
  failures, every one a PGlite `beforeEach` hook timeout (120000ms and
  10000ms) in files untouched by this branch, and both suites took an order
  of magnitude longer (3233s / 2709s). Run them serially: concurrent runs on
  one machine cannot distinguish a defect from CPU starvation.

**Remaining, in order:**
1. Verification 2 — bench sweep against Run 11 with host-side stub read
   models through the hybrid factory. Not run. The plan's rule stands:
   measure before any staging rollout, and do not quote 10x for switchboard.
2. Verification 3–4 — staging metrics (`reactor.host.eventloop.utilization`
   is the go/no-go) and functional parity (subscription fires, processor sees
   operations, consistency-token read returns).
3. `powerhouse-k8s-hosting`: set `REACTOR_PROJECTION_WORKER=1` and raise
   `limits.cpu` for the extra thread (separate repo, per the scope boundary).
4. Reviewer-visible: one new `unsafeIgnoredFiles` line in `eslint.config.js`;
   `validateBuiltInKindCoverage` error text still names `withProjectionShards`
   on the factory path (academy docs quote it).

## Verification

1. **Unit + integration.**
   `pnpm --filter @powerhousedao/reactor test` and
   `pnpm --filter @powerhousedao/switchboard test`.
   Postgres-backed cases: `pnpm --filter @powerhousedao/reactor docker:up`
   first (compose maps **5433**→5432, user/pw `postgres`, db `reactor`;
   `packages/reactor/docker-compose.yml`), `docker:down` after.

2. **Bench sweep for the throughput claim.**
   `packages/reactor/bench/test/integration/matrix.sh` honours `WORKER_LIST`,
   `NUM_DRIVES`, `VUS`, `DURATION` and brings up
   `docker compose --profile observability` (Prometheus 9091, Grafana 3002).
   Reproduce Run 11's cell — `NUM_DRIVES=64 VUS=128 DURATION=60s`,
   `REACTOR_WORKERS=8`, `N_PROJECTION_SHARDS=1` — as the control, then add a
   bench-host mode that registers a host-side stub read model plus a stub
   post-ready model through the hybrid factory, and compare. That is the
   closest available proxy for switchboard's real shape, and it is the honest
   way to find out how much of the 1246 jobs/s survives host-side work.
   Append the run to `BASELINE.md` in the existing table format.

3. **Post-landing success signal — the metrics from `e23f219ab` / `deb71b911`.**
   In a staging switchboard with `REACTOR_PROJECTION_WORKER=1`:
   - `reactor.host.eventloop.utilization` should fall from ~0.99 (Run 10);
     this is the primary signal. If it does not move, the loop is being pinned
     by GraphQL/HTTP rather than projection, and the hypothesis is wrong for
     switchboard.
   - `reactor.host.eventloop.delay.p99` down; `reactor.host.cpu.utilization`
     up by roughly the worker's share (Run 11 saw 3.4 → 4.0 cores).
   - `reactor.db.pool.acquire.wait_duration{pool=reactor-host}` flat or down.
   - The new `projection-shard-0` forwarding pool
     (`reactor-builder.ts:865-872`) should report non-zero `size` — if it does
     not, the worker never opened its pool.
   - `readmodel.coordinator.chain.depth` (`instrumentation.ts:355`) bounded
     rather than climbing — a climbing depth is the backpressure gap in Q1
     turning into a real leak.

4. **Functional parity checks that sharding would have broken.**
   Against staging: a GraphQL subscription fires on a mutation; a package
   processor observes operations; a read-after-write query carrying a
   consistency token returns rather than timing out.

---

## Risks

| Risk | Mitigation |
| --- | --- |
| **The 10x does not transfer.** Bench-host has no GraphQL, subgraphs, auth, processors or subscriptions; those stay on the host loop. | Do not quote 10x for switchboard anywhere. Measure with the augmented bench (Verification 2) *before* the staging rollout, and treat `reactor.host.eventloop.utilization` as the go/no-go. |
| **Host chain map grows unbounded** if host pre-ready is slower than the worker (Q1). | Parity with today's `chains` map, which has the same property. Observe via `getChainDepth()`; alert on sustained growth. Bounded ingress scoped as a follow-up. |
| **Consistency-token reads hang** if the manager's `consistencyTrackers` wiring is bypassed — e.g. a coordinator factory that builds its own manager without them (Q2; `waitFor` has no timeout). | The bound `createProjectionShardManager` always passes the builder's trackers; the factory deps offer no other way to build one. Builder test asserts a fake `readmodel-indexed` advances the module tracker. Consider a follow-up giving `waitForConsistency` a bounded default timeout so the failure is an error, not a hang. |
| **Late `addReadModel` registrations invisible to `getReadModel()`** if `readModels` is a getter/spread rather than one mutable array. Passes every unit test that reads the property fresh. | Hold a single array, push in `addReadModel` (Step 3); test case 11 captures the reference before the call. |
| **Worker death stalls every job silently** (Q3). | `onShardFatal` (landed) → switchboard sends itself SIGTERM → graceful shutdown → k8s restarts. Never emit `JOB_FAILED`: the writes are committed. |
| **Shutdown after a worker death stalls 30 s and skips `manager.shutdown()`** because `drain()` waits on the dead transport (Q3). | Step 2d: `drain()` skips not-ready shards. Step 3: `shutdown()` catches a drain failure and still terminates. Test case 7. |
| **Double-indexing** if the built-ins leak into the factory's `readModels` (Q5). | Structural: Step 1 keeps `callerReadModels` distinct; test case 1 asserts absence. |
| **Connection exhaustion** past the pooler's 25 server slots (Q4). | Default 8, env-overridable. Watch `reactor.db.pool.*`. Do not raise host/worker defaults in the same change. |
| **Startup latency and boot failure surface grow** — `manager.startup()` blocks `buildModule()` for up to `initTimeoutMs` (30 s default, `projection-shard-manager.ts:30`). | Off by default; the option is opt-in per deployment. Keep the timeout configurable. |
| **`READMODEL_BATCH_COMPLETED` double-counting** if an inner `ReadModelCoordinator` is reused on the host. | Explicitly rejected in Step 3; the hybrid emits only `READMODEL_INDEXED` host-side. |
| **The worker's `document-view` runs with `documentDecisions: false`** hardcoded (`build-projection-stack.ts:130-132`) while the host may have the flag on (`reactor-builder.ts:647`). | Out of scope here but **must be checked before enabling on any deployment that sets the flag**; today it is a latent divergence in the shipped sharding path too. |

---

## Explicitly unknown

- How much of Run 11's 1246 jobs/s survives once host pre-ready and post-ready
  work is reintroduced. Nobody has measured it. Verification 2 exists to find
  out, and the answer could be anywhere between "most of it" and "very little".
- Whether switchboard's loop is dominated by projection at all. Run 10 was
  measured on bench-host. Switchboard could be GraphQL-bound, in which case
  this change costs a thread and buys little.
- Whether `KyselyDocumentView.indexOperations` /
  `KyselyDocumentIndexer.indexOperations` are idempotent. Unverified, and it
  gates any future respawn-and-replay recovery (Q3).
- Real per-pod Postgres connection totals including switchboard's non-reactor
  pools (Q4).

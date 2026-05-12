# Executor Worker Pool — Design Notes

## Goal

Increase reactor throughput across **many documents** by running a pool of executor workers in separate Node processes (or worker threads). The queue already serializes jobs per `documentId:scope:branch`; the bottleneck is that today there is effectively one executor running on the event loop, so even though the queue could hand out jobs for thousands of distinct documents in parallel, only one runs at a time. A pool unlocks that latent parallelism.

Non-goals:

- Multiple reactors. There is exactly one `Reactor` in the parent process. Workers are dumb executors.
- Distributing across machines. This is single-host scaling.
- Changing the public `IReactor` API.

## Architecture

```
+-----------------------------------------------------------+
|  Parent process (switchboard)                             |
|                                                           |
|   Reactor                                                 |
|    +-- IQueue            (per-doc serialization)          |
|    +-- IJobTracker                                        |
|    +-- IEventBus         (read models, subs, sync read it)|
|    +-- ISubscriptionMgr  (live GraphQL callbacks)         |
|    +-- ReadModelCoordinator                               |
|    +-- ISyncManager                                       |
|    +-- IDocumentModelRegistry  (source of truth)          |
|    +-- ICollectionMembershipCache  (parent-owned)         |
|    +-- WorkerPoolJobExecutorManager  <-- NEW              |
|             |   |   |                                     |
|             v   v   v                                     |
|         [IPC channels via MessagePort / child_process]    |
+-----------|---|---|---------------------------------------+
            v   v   v
       +------+ +------+ +------+
       | W#0  | | W#1  | | W#N  |   each worker:
       |      | |      | |      |    - SimpleJobExecutor
       |      | |      | |      |    - own IWriteCache
       |      | |      | |      |    - own IOperationIndex cache
       |      | |      | |      |    - own IDocumentMetaCache
       |      | |      | |      |    - own pg.Pool (small) -> shared Postgres
       |      | |      | |      |    - local IDocumentModelRegistry (replicated)
       +------+ +------+ +------+
```

Parent owns everything that holds non-serializable state (callbacks, subscriptions, in-memory queue, event bus subscribers). Workers own only what the executor needs: caches, DB access, registered model modules.

## Worker thread vs child process

We'll specify `child_process` per the original ask, but the same protocol works for `worker_threads`. Recommendation: **start with `worker_threads`** because:

- `MessagePort` supports structured clone and transferable `ArrayBuffer`s, which makes the JobResult / JobWriteReadyEvent payload cheaper to ship than `child_process` JSON-over-pipe.
- Startup cost (~20 ms vs ~80 ms for `fork`), faster failure recovery.
- Same Node version guaranteed, same ESM resolution, same env.
- PGlite (single-process) can still work in dev/test if we keep DB calls in parent — though for production worker pooling we will require Postgres anyway.

The pool implementation should hide the transport behind one interface (`IExecutorWorker`) so swapping `child_process` for `worker_threads` is a single-file change.

## Files to change

| File                                                     | Change                                                                                                                 |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/executor/interfaces.ts`                             | Add `IExecutorWorker` and a worker-pool-specific status type.                                                          |
| `src/executor/worker-pool-job-executor-manager.ts`       | **New.** Replaces `SimpleJobExecutorManager` when pool mode is enabled. Same `IJobExecutorManager` interface.          |
| `src/executor/worker/worker-entry.ts`                    | **New.** Standalone module that boots a `SimpleJobExecutor` inside a worker.                                           |
| `src/executor/worker/protocol.ts`                        | **New.** Message type definitions for parent ↔ worker IPC.                                                             |
| `src/executor/worker/worker-handle.ts`                   | **New.** Parent-side wrapper around a single worker (lifecycle, in-flight tracking, restart).                          |
| `src/core/reactor-builder.ts` (`reactor-builder.ts:304`) | Choose `SimpleJobExecutorManager` vs `WorkerPoolJobExecutorManager` based on a new `executorConfig.workerPool` option. |
| `src/executor/types.ts`                                  | Add `WorkerPoolConfig` and extend `JobExecutorConfig`.                                                                 |
| `apps/switchboard/src/server.mts` (`server.mts:255`)     | Plumb env var (e.g. `EXECUTOR_WORKERS=4`) into the builder.                                                            |

`SimpleJobExecutor` itself does **not** change — workers instantiate it unchanged. That's a deliberate constraint: the executor's behavior is already covered by tests, so we only need to test the new IPC plumbing, not re-test the executor.

## Wire protocol

All messages are plain JSON-clonable objects. Field naming mirrors existing reactor types.

### Parent → worker

```ts
type ParentMessage =
  | {
      type: "init";
      workerId: number;
      config: JobExecutorConfig;
      dbConfig: DbConfig; // points at PgBouncer in prod
      modelManifest: ModelManifestEntry[];
      signatureVerifier?: SignatureVerifierSpec; // module + export to import in-worker
    }
  | { type: "execute"; correlationId: string; job: Job }
  | { type: "load-model"; correlationId: string; documentType: string }
  | { type: "abort"; correlationId: string }
  | { type: "shutdown"; graceful: boolean };
```

- `init` is sent once after spawn. `modelManifest` lists model packages/versions the worker must dynamically import to populate its local `IDocumentModelRegistry`. Reducer functions are **never** serialized — they're re-imported in the worker.
- `execute` ships a `Job` (already serializable per `queue/types.ts`).
- `abort` cancels the in-flight job. Worker forwards to the existing `AbortSignal` in `simple-job-executor.ts:107`.
- `load-model` is sent when the parent's `DocumentModelResolver` discovers a new model — broadcast to all workers so the next dispatch finds it.

### Worker → parent

```ts
type WorkerMessage =
  | { type: "ready"; workerId: number }
  | {
      type: "result";
      correlationId: string;
      result: JobResult;
      writeReady?: JobWriteReadyEventPayload;
    }
  | { type: "model-loaded"; correlationId: string }
  | { type: "model-load-failed"; correlationId: string; error: ErrorInfo }
  | {
      type: "log";
      level: "debug" | "info" | "warn" | "error";
      message: string;
      args: unknown[];
    }
  | { type: "metrics"; activeJobs: number; totalJobsProcessed: number };
```

The `result` message carries **both** the `JobResult` (which the manager already knows how to handle for success/failure/retry/defer) **and** the `JobWriteReadyEventPayload`. The parent re-emits `JOB_WRITE_READY` on the in-parent `IEventBus` so that read models, subscription manager, and sync manager observe it exactly as today.

`writeReady` is omitted on failure or when the executor produced no operations. When present, it carries `operations: OperationWithContext[]` and `jobMeta` only — the parent fills in `collectionMemberships` at emission time from its own cache (see "Cache coherence: collection membership" below).

Note: today the executor emits `JOB_WRITE_READY` directly from inside `executeJob` (`simple-job-executor.ts:232`). In worker mode the worker's local `IEventBus` is a no-op stub; the parent does the emission once the result arrives. This is the only behavioral change to executor wiring.

## Routing strategy: sticky by document

The executor's `IWriteCache` and `IDocumentMetaCache` are warm in-memory caches keyed by `documentId`. If the same document hops between workers, every worker eventually has a partial cache for it, hit rates drop, and worse: **one worker's writes invalidate another worker's stale snapshot without it knowing**. (`ICollectionMembershipCache` is also keyed by `documentId` but is mutated by cross-document writes, so sticky routing alone can't keep it coherent — it lives on the parent. See "Cache coherence: collection membership" below.)

Routing must be **sticky per `documentId`**: hash `documentId` to a worker index. This is correct for free because the queue already enforces "at most one job executing per document at a time" — a sticky worker always sees a fresh post-commit snapshot before its next job on that document.

```
workerIndex = hash(documentId) % numWorkers
```

When a worker dies, jobs hashed to it must be re-routed; the replacement worker will start with a cold cache for those documents but will warm up. Acceptable.

Alternative considered: round-robin with cache invalidation broadcasts. Rejected — race-prone, more IPC traffic, defeats cache locality.

## Document model registry replication

The parent's `IDocumentModelRegistry` holds `DocumentModelModule` objects containing reducer functions (not serializable). Workers must construct their own registry by **re-importing** the same model packages.

Two paths:

1. **Static manifest at init.** ReactorBuilder.withDocumentModels takes an array of modules; in worker mode the builder records the corresponding package specs (`name@version` or file path) and ships that manifest to each worker on `init`. The worker imports them locally.
2. **Dynamic load on demand.** When the parent's `DocumentModelResolver` (`document-model-resolver.ts:17`) loads a new model via `IDocumentModelLoader`, broadcast a `load-model` message to all workers; each worker runs its own loader for the same `documentType`.

Both paths must coexist. Existing recovery flow (`simple-job-executor-manager.ts:216` — `ModuleNotFoundError` triggers `resolver.ensureModelLoaded`) moves to the parent and broadcasts.

**Constraint to add:** registered models must be reachable from the worker entry's module resolution. In practice this means model packages live in `node_modules` (already true in the monorepo) and `withDocumentModels` accepts either modules **plus** their package specs, or just specs. Probably introduce `withDocumentModelSpecs(spec[])` as a worker-friendly alternative.

## Database

PGlite is single-process and **must not** be used with the worker pool. Builder validation: if `workerPool.enabled && storage instanceof PGlite` → throw at startup.

For Postgres: every worker and the parent point at **PgBouncer**, not directly at Postgres. PgBouncer multiplexes the (small) per-worker `pg.Pool`s onto a much smaller pool of real Postgres connections, so `numWorkers * workerPgPoolSize` does not have to fit under Postgres `max_connections` — only the PgBouncer server pool does. Workers should use a small client pool (e.g. 2–4 conns) and rely on PgBouncer for fan-in.

Mode note: **transaction pooling** in PgBouncer is incompatible with session-scoped features (prepared statements without protocol-level support, `LISTEN/NOTIFY`, advisory locks held across statements, `SET` outside a transaction). The Kysely execution scope is transaction-scoped (`KyselyExecutionScope` wraps each job in a transaction), which is compatible. Action items: audit `IOperationStore`, `IOperationIndex`, and any read-model code paths for the above patterns before flipping the flag in production. Disable prepared-statement caching in the `pg` driver where needed.

`IOperationStore`, `IWriteCache`, `IOperationIndex`, `IDocumentMetaCache`, and `KyselyExecutionScope` are all instantiated inside the worker. They never cross the IPC boundary. `ICollectionMembershipCache` stays in the parent (see "Cache coherence: collection membership" below).

## Signature verification

`SimpleJobExecutor` accepts a `SignatureVerificationHandler` (`simple-job-executor.ts:79`) and calls it via `SignatureVerifier.verifyActions` at the top of `processActions` (`simple-job-executor.ts:273`). Verification is **CPU-expensive** and is one of the primary reasons to parallelize. It **must run in the worker**, not the parent — otherwise we just move the bottleneck.

Implications for the existing API:

- `SignatureVerificationHandler` is currently passed as a function reference in the builder, which cannot cross the IPC boundary. The builder API needs a worker-friendly variant — pass a **module spec** (`{ packageName, exportName }` or `{ filePath, exportName }`) that the worker imports during `init` and instantiates locally.
- Any verifier state that must agree across workers (e.g. trusted-key registry, revocation list) must be (a) loaded fresh inside each worker on boot, (b) refreshed via a parent-broadcast message when it changes, or (c) backed by a shared store the workers read from. Pick one based on what state today's handler actually holds.
- If callers want to keep passing a function for in-process mode, the builder accepts both forms: a function (in-process only) or a spec (works for both). Validate at `start()` and throw if a function-only verifier is configured with `workerPool.enabled`.

This is the one place we are knowingly committing to API churn for the verifier. Action: enumerate every current implementer of `SignatureVerificationHandler` in the monorepo and confirm each can be expressed as a spec + init args.

## What stays in the parent

These are referenced by `SimpleJobExecutorManager` today and must remain in the parent:

- `IQueue` — dispatch, dequeue, retry, defer. The parent dispatches `Job`s to workers via IPC; the queue never leaves the parent.
- `IJobTracker` — `markRunning`/`markFailed` happen in the parent based on the worker's reply.
- `IEventBus` — parent emits `JOB_RUNNING`, `JOB_FAILED`, `JOB_WRITE_READY` on the parent bus. Workers have a stub bus.
- Deferred-jobs map for `DocumentNotFoundError` (`simple-job-executor-manager.ts:30`) and the `flushDeferredJobs` flow stay in the parent.
- `DocumentModelResolver` — coordinator for model loading; broadcasts to workers.
- `ReadModelCoordinator`, `ISyncManager`, `ReactorSubscriptionManager` — all subscribe to the parent `IEventBus`. Untouched.
- `ICollectionMembershipCache` — single authoritative copy. The parent enriches each outgoing `JOB_WRITE_READY` with `collectionMemberships` and invalidates entries when relationship- or delete-affecting ops land. See next section.

## Cache coherence: collection membership

`ICollectionMembershipCache` is keyed by `documentId` but its entries are mutated by ops on _other_ documents (`ADD_RELATIONSHIP { source, target }` changes `target`'s membership). Sticky-by-documentId routing keeps `IWriteCache` and `IDocumentMetaCache` coherent for free, but does nothing for membership, because the source and target of a relationship op hash to different workers.

**Decision.** The membership cache lives in the parent. Workers do not query, hold, or invalidate it. The parent computes `collectionMemberships` at the moment it emits `JOB_WRITE_READY`, after receiving the worker's `result`.

Flow per successful result:

```
on_result(result):
  if not result.success: emit-failure-path; return
  if any op in result.operations is ADD_RELATIONSHIP / REMOVE_RELATIONSHIP / DELETE_DOCUMENT:
    for each affected target docId: collectionMembershipCache.invalidate(targetId)
  docIds = unique(result.operations.map(o => o.context.documentId))
  memberships = collectionMembershipCache.getCollectionsForDocuments(docIds)
  emit(JOB_WRITE_READY, { jobId, operations, jobMeta, collectionMemberships: memberships })
```

Two responsibilities, on different cadences:

- **Lookup runs on every successful job with operations.** SyncManager routes ordinary mutations too, not just relationship ops, so the membership map must always be populated. Today's in-worker executor already does this lookup unconditionally; we are relocating, not adding, work.
- **Invalidation runs only when the result contains `ADD_RELATIONSHIP`, `REMOVE_RELATIONSHIP`, or `DELETE_DOCUMENT`.** Pure mutation jobs leave the cache untouched.

The parent's event loop serializes result processing, so the invalidation-then-lookup sequence is observed in a consistent order across sibling jobs. Two concurrent in-flight jobs on different documents whose results race to the parent will produce `JOB_WRITE_READY` events whose membership maps reflect "the world as the parent saw it" at each emission point — which is one of the valid serializations of the concurrent ops. Any momentarily mis-routed op (e.g., a mutation on `Y` emitted before a sibling `ADD_RELATIONSHIP { target: Y }` has been processed) is healed by SyncManager's cursor-based catch-up; this is the same guarantee SyncManager relies on for any concurrent producer.

Cost: one membership lookup per emitted `JOB_WRITE_READY` on the parent. Hot documents stay in the in-memory cache; cold misses go to Postgres. This adds to the parent's event-loop load and is one of the inputs to issue #5 (parent as the next bottleneck).

## The new manager (sketch)

`WorkerPoolJobExecutorManager` implements `IJobExecutorManager` (`executor/interfaces.ts:22`). It is structurally similar to `SimpleJobExecutorManager` but with `executors: IJobExecutor[]` replaced by `workers: WorkerHandle[]`, and `executor.executeJob(job, signal)` replaced by a promise-returning `worker.dispatch(job, signal)` that:

1. Picks worker by `hash(job.documentId) % workers.length`.
2. Sends `{ type: "execute", correlationId, job }`.
3. Returns a promise resolved by the matching `result` message.
4. Honors the same timeout race (`AbortSignal.timeout(jobTimeoutMs)` → send `abort` to worker).

The post-result branching — retry, defer, fail, model-recovery retry, deferred-job flush — is **copy-pasted unchanged** from `simple-job-executor-manager.ts:131-326`. That logic operates on `JobResult` and parent-side state; it doesn't care that the executor lives in another process.

When the worker returns `writeReady`, the manager enriches the payload with `collectionMemberships` from the parent's `ICollectionMembershipCache` (invalidating first if the ops are relationship- or delete-affecting) and then calls `this.eventBus.emit(JOB_WRITE_READY, payload)`. See "Cache coherence: collection membership" for the exact ordering.

## Worker lifecycle

- **Spawn** at `start(numWorkers)`. Wait for each worker's `ready` before accepting jobs.
- **Healthcheck**: heartbeat every N seconds; missing two heartbeats → kill + respawn.
- **Crash recovery**: on `exit` with non-zero, mark in-flight jobs failed with retry (let the existing retry path handle it), respawn worker, re-route hashed jobs.
- **Graceful shutdown**: parent sends `shutdown { graceful: true }`, stops dispatching new jobs to that worker, waits for in-flight to drain or timeout, then `worker.terminate()`.
- **Forced shutdown**: `stop(false)` immediately terminates workers.

The existing graceful-stop loop in `simple-job-executor-manager.ts:89` translates 1:1: replace "wait for `activeJobs` counter" with "wait for all workers' in-flight maps to empty."

## Config

Extend `JobExecutorConfig`:

```ts
interface JobExecutorConfig {
  maxConcurrency?: number; // existing — # of in-process executors
  jobTimeoutMs?: number;
  // ... existing
  workerPool?: {
    enabled: boolean;
    numWorkers: number; // total worker processes/threads
    workerType: "thread" | "process"; // default "thread"
    heartbeatMs?: number;
    workerPgPoolSize?: number; // per-worker pg pool size
  };
}
```

When `workerPool.enabled` is true, `maxConcurrency` is ignored in favor of `numWorkers`.

Surface in switchboard via env: `REACTOR_WORKER_POOL=1`, `REACTOR_WORKERS=4`.

## Test plan

- **Unit:** mock `IExecutorWorker` and test `WorkerPoolJobExecutorManager` dispatch, sticky routing, timeout/abort, crash-recovery, deferred-job flow — same matrix that exists for `SimpleJobExecutorManager`.
- **Integration:** spin a real worker thread executing against PGlite (parent-owned proxy) **or** a Postgres container. Run a multi-document throughput test that today plateaus at single-executor throughput and confirm scaling.
- **Existing tests:** must continue to pass with default config (worker pool disabled). The new manager is opt-in.
- **Switchboard end-to-end:** verify GraphQL subscriptions still receive events (they live in parent, so this just confirms `JOB_WRITE_READY` is re-emitted correctly).

## Logging

Each worker is given a thin `ILogger` implementation whose only job is to send a `log` message to the parent. The parent owns the actual logger and writes the streams. This keeps logs correlated by `jobId`/`workerId` and avoids interleaved stdout from N processes.

The forwarding logger serializes the format args; structured log args must already be JSON-clonable (true today for the reactor's logger calls). The worker also catches its own uncaught errors / unhandledRejections and forwards them as `error`-level log messages plus a process-level fault signal so the parent can decide to respawn.

## Metrics

`WorkerPoolJobExecutorManager.getStatus()` aggregates per-worker counters into the existing `ExecutorManagerStatus` shape:

- `isRunning`: true iff at least one worker is up.
- `numExecutors`: count of live workers.
- `activeJobs`: sum of in-flight maps across workers.
- `totalJobsProcessed`: sum of per-worker counters reported via the `metrics` message.

Per-worker detail (queue depth, last heartbeat, restart count) is exposed via an extended `getWorkerStatus()` method for ops/debug, but is not part of `IJobExecutorManager`.

## Dispatch and backpressure: per-worker queues

Sticky routing turns the dispatcher into N independent per-worker queues, **not** one shared pool:

- Each `WorkerHandle` owns a small in-memory FIFO of pending `Job`s hashed to it.
- The manager dequeues from the parent `IQueue` and immediately hands off to the matching `WorkerHandle.enqueue(job)`.
- The worker handle sends `execute` to its worker when its own in-flight slot is free (workers process one job at a time — `SimpleJobExecutor` is single-threaded inside the worker, and concurrent jobs would race the worker's local caches).
- When a worker's queue is full above some threshold, the manager stops dequeuing from the parent `IQueue` for **that worker's hash bucket**, leaving those jobs in the parent queue. Other buckets keep flowing. This is the explicit accepted trade-off: one document or one hash bucket flooding does **not** stall other workers.

This replaces the single `activeJobs < executors.length` gate in `simple-job-executor-manager.ts:66`. We accept that hot documents may queue deep on a single worker; that is correct behavior because per-document serialization is already a hard constraint.

Future option (not in scope now): consistent-hashing rebalance or a "shed load" hook for known-hot documents.

## Phasing

1. **Protocol + worker-handle skeleton.** Define message types, write `WorkerHandle` with the IPC wiring, no executor yet. Round-trip a fake echo job.
2. **Worker entry boots `SimpleJobExecutor`.** Static `withDocumentModelSpecs` only. Single-worker test passes.
3. **Pool manager.** Sticky routing, in-flight map, post-result branching ported from `SimpleJobExecutorManager`. Multi-worker test passes.
4. **Dynamic model loading.** `load-model` broadcast + worker-side resolver. Recovers from `ModuleNotFoundError` the same way as today.
5. **Crash recovery + heartbeats.** Kill a worker mid-job, verify retry path.
6. **Switchboard wiring.** Env-driven, opt-in. Throughput benchmark vs. baseline.

Each phase is independently mergeable behind the `workerPool.enabled` flag.

## Open issues and critique

This section captures holes, inconsistencies, and underspecified areas in the design above. Items here need decisions before the design is buildable, not just before it ships.

### Correctness holes

**27. Exactly-once execution is not addressed.**

"On `exit` with non-zero, mark in-flight jobs failed with retry." A worker can commit its Postgres transaction and then die before the `result` IPC message is flushed. Parent assumes failure, retries — and the action either gets applied twice or fails with `RevisionMismatchError` / `DuplicateOperationError` from the optimistic-concurrency check in `KyselyOperationStore.executeApply`. That is a noisy failure mode the existing in-process executor never sees. The design must at minimum: (a) acknowledge it, (b) require workers to send `result` before transaction commit is fully flushed _or_ rely on `action.id` idempotency, and (c) decide whether `DuplicateOperationError` on retry should map to success.

**26. Per-worker FIFO doesn't do what the design implies.**

`InMemoryQueue.dequeueNext()` (`queue.ts:243-301`) gates on `isDocumentExecuting(documentId)` and only un-gates on `completeJob` / `failJob` / `deferJob`. The handle is parent-owned. If the manager dequeues and "immediately hands off" to a worker FIFO, the document is marked executing the moment the job lands in the FIFO. A second job for the same document cannot be dequeued until the worker finishes the first one and the parent calls `completeJob`. So the only reason a worker FIFO would grow is _different documents hashed to the same bucket_.

The doc's mental model — "one document or one hash bucket flooding" — is correct for the bucket case but conflates the two. More importantly, this means the per-worker FIFO is redundant with the parent queue: you can dispatch directly. If you keep the FIFO, you've duplicated state and now have to handle losing it on crash (see #24).

**25. Bucket-level backpressure has no implementation path.**

"When a worker's queue is full above some threshold, the manager stops dequeuing from the parent `IQueue` for that worker's hash bucket, leaving those jobs in the parent queue." `IQueue.dequeueNext()` returns the first ready job across all docs; there is no API to dequeue "anything except bucket N." This needs either a new queue method (`dequeueNextExcluding(buckets)`) or peek-and-skip semantics. The design depends on a queue facility that does not exist and neither flags the gap nor sketches the change. This is the whole backpressure story.

**24. Worker crash silently drops pending FIFO jobs.**

"On `exit` with non-zero, mark in-flight jobs failed with retry... re-route hashed jobs." The in-flight job is one. The pending FIFO jobs are several, were already dequeued from `IQueue`, and now exist only in the dead worker's parent-side handle. The design says "re-route" without specifying destination. If they go to the replacement, the replacement might still be booting (importing modules, validating models). If they go back into `IQueue`, the per-doc `markJobExecuting` flag is still set because the dequeue-side mark was never paired with a `completeJob` / `failJob`. Either way: explicit FIFO-flush + per-doc unmark step on crash is required and the doc skips it.

### Inconsistencies

**23. PGlite test plan contradicts PGlite ban.**

Database section: "PGlite is single-process and must not be used with the worker pool... throw at startup." Test plan: "spin a real worker thread executing against PGlite (parent-owned proxy) or a Postgres container." A parent-owned PGlite proxy means every DB call traverses IPC, defeating the point of moving the executor out-of-process. Pick one: invent the proxy explicitly (and own its perf implications), or drop PGlite from the test matrix.

**22. Env var name disagrees with itself.**

Files-to-change table says `EXECUTOR_WORKERS=4`. Config section says `REACTOR_WORKERS=4` (with `REACTOR_WORKER_POOL=1`). Pick one before someone wires it up twice.

**21. `child_process` was the stated ask; design silently overrides to `worker_threads`.**

The override is fine on technical merit but the doc never names the trade-off the original ask was making: V8 isolation, OOM containment, restart-via-spawn cleanliness. With `worker_threads` a single bad worker can blow the heap of the whole process. State the trade-off explicitly.

**20. Diagram and PGlite discussion implicitly assume threads, not processes.**

The doc claims the protocol works for either transport, but with `child_process` you lose `MessagePort` transferables (one of the stated thread advantages) and you can't share PGlite even via a "parent-owned proxy" without a fully different IPC layer.

### Underspecified areas

**19. Model load ordering is racy.**

Worker init waits for `ready` before accepting jobs. OK at boot. But dynamic `load-model` broadcast has no ordering guarantee with respect to in-flight `execute` messages — a worker can receive `execute(docTypeX)` before its `load-model(docTypeX)` import finishes. The design relies on the existing `ModuleNotFoundError` recovery path to absorb this, which means every newly-loaded model costs one wasted execute + retry per worker. Document this as the explicit behavior, or buffer `execute` until pending `load-model` imports complete.

**18. Model version disagreement is not addressed.**

The parent's registry can resolve a specific `(documentType, version)`. The `load-model` message carries only `documentType`. Two workers can end up running different reducer code for the same documentType if the loader's resolution is non-deterministic (e.g., "latest"). Ship `(documentType, version)` and pin it.

**17. SignatureVerifier spec is missing init args.**

`SignatureVerifierSpec = { packageName, exportName }` (or `filePath`). A real verifier (KMS-backed, trusted-key registry, revocation list) needs constructor args — keystore URL, audience, public-key paths. The doc says verifier state must be "loaded fresh / refreshed via broadcast / backed by a shared store. Pick one based on what state today's handler actually holds." The action item is "enumerate every current implementer" — but no implementer is enumerated. This is the riskiest API churn in the design and is left as TBD.

**16. `dbConfig: DbConfig` serializability is asserted, not verified.**

`DbConfig` can include callbacks (e.g., `onError`, lifecycle hooks). The protocol assumes structured-clone-safe data. Spell out the serializable subset and validate it in the builder before spawning workers.

**15. `getExecutors()` behavior in pool mode.**

`IJobExecutorManager.getExecutors()` returns `IJobExecutor[]`. In worker pool mode there are no in-process executors. The doc never says what this returns — empty array, proxy objects, anything that wraps the worker IPC. Existing test code and any external observer breaks silently.

**14. Abort protocol is hand-waved.**

"Worker forwards to the existing `AbortSignal` in `simple-job-executor.ts:107`." The worker must maintain `Map<correlationId, AbortController>`, fire the right one from the receive-message handler, and clean up on result. None of this is in the protocol. If the worker's executor is CPU-stuck and doesn't check the signal, the abort is a no-op — the doc doesn't escalate ("if no result within timeout+grace, terminate the worker"). Without escalation, a hung verifier hangs the bucket forever.

**13. Heartbeat semantics on `worker_threads`.**

Worker threads don't get OS-level signal handling. The heartbeat is a JS-level message exchange. If the worker thread's event loop is blocked (CPU loop in a reducer or in signature verification), it can't post heartbeats — which is actually a feature here. State that. And `worker.terminate()` is cooperative-then-forcible; `kill -9` doesn't apply.

**12. `maxConcurrency` is silently ignored when `workerPool.enabled`.**

Silent overrides cause confusion. Either throw on conflict or document a coupling (e.g., `maxConcurrency = numWorkers`).

**11. Worker-side `IDocumentModelLoader`.**

"Each worker runs its own loader for the same documentType" — but the architecture diagram lists `IDocumentModelLoader` nowhere on the worker side, and "What stays in the parent" implies the loader is parent-only. Concrete loader implementations may need filesystem paths or remote registry credentials; those need to flow to the worker via `init`. Section omits this.

### Missing concerns

**10. `pg` prepared statements + PgBouncer transaction pooling.**

The doc says "Disable prepared-statement caching in the `pg` driver where needed." `node-postgres` uses named prepared statements when `text` is reused; Kysely emits them by default. Transaction-pooled PgBouncer routes each transaction to a different server connection that doesn't know about prior `PREPARE`. Expect intermittent "prepared statement does not exist" errors under production load. Mitigations: (a) PgBouncer >= 1.21 with `prepared_statement_caching`, (b) force `pg` to simple/unnamed protocol (perf cost), or (c) ensure every statement is inside its transaction so connection pinning helps. "Disable it" is not an answer — pick one and own the cost.

**9. Per-worker `pg.Pool` of 2-4 connections is over-sized.**

Workers process one job at a time inside one transaction. Concurrency-1 per worker means at most one in-use connection. A pool of 2 is fine for keep-alive; 4 is wasteful. With 8 workers and pool size 4, 32 server slots are reserved in PgBouncer for ~8 concurrent transactions. Default to 1, allow 2 for warm-up.

**8. `JOB_WRITE_READY` now arrives out of commit order across documents.**

Today the executor is single-threaded so `JOB_WRITE_READY` events fire in commit order. With workers, two writes on different documents commit at different times but their `result` messages reach the parent based on IPC scheduling. The new invariant is "JOB_WRITE_READY ordering is per-documentId-FIFO, not global." Confirm SyncManager and read models don't rely on global ordinal-monotonic event delivery, and state the new contract.

**7. Memory cost scales linearly with `numWorkers`.**

N copies of the document model registry, write cache, meta cache, op-index Kysely binding, and `pg.Pool`. For a heavy registry (lots of generated reducer code) N=8 is a real number. Quote an order of magnitude.

**6. CPU sizing guidance is absent.**

Workers are mostly CPU-bound (verifier + reducer). `numWorkers ~= cores` is the obvious default; say it.

**5. Parent event loop becomes the next bottleneck.**

With N busy workers, the parent receives `result` messages at N x throughput, then synchronously runs `JOB_WRITE_READY` subscribers (read models, sync manager, awaiter). If any subscriber is slow, IPC backlog grows and worker idle time rises. Move slow read-model work off the parent's hot path, or note this as the next bottleneck after enabling the pool.

**4. "Copy-pasted unchanged" post-result logic is a maintenance smell.**

~200 lines of branchy logic — retries, defers, model recovery, error history formatting — duplicated between managers. Either refactor into a shared module both managers call, or commit to keeping them in sync and write a divergence test.

**3. `JOB_RUNNING` timing shift.**

Today `JOB_RUNNING` fires immediately before `executor.executeJob`. In pool mode it fires before the IPC `execute` message is sent. Anything timing job duration on this event will include IPC latency. Mention it.

**2. Worker-thread crash mode.**

`uncaughtException` in a worker thread terminates the thread by default. The doc says the worker "forwards them as `error`-level log messages plus a process-level fault signal" — but the thread is gone by the time you'd flush the log. Add an explicit `process.on('uncaughtException', ...)` handler in worker entry that synchronously posts a `log` message and then re-throws.

**1. Phase 0 baseline is missing.**

The Phasing section starts with "round-trip a fake echo job." Before any of this matters, write a reproducible multi-doc throughput benchmark showing the current executor saturates a single core and that throughput grows linearly with workers. Without that baseline the entire effort is unverifiable.

### Smaller nits

- Architecture diagram lists "own pg.Pool (small) -> shared Postgres" but the Database section requires PgBouncer. Diagram should say "-> PgBouncer -> Postgres."
- "Same Node version guaranteed, same ESM resolution" for `worker_threads` doesn't help if model packages rely on top-level `await` plus a bundler that mishandles it. Add a sentence.
- `log` message `args: unknown[]` will fail structured-clone on `Error` objects with non-cloneable `cause`, circular refs, or class instances. Specify a sanitizer in the wire protocol section, not "true today."
- `metrics` message carries `activeJobs` and `totalJobsProcessed` which the parent already derives from `WorkerHandle` state. Pick worker-as-truth or parent-as-truth; don't ship both.
- The doc says the executor doesn't change, then says "the worker's local IEventBus is a no-op stub; the parent does the emission." That is an executor wiring change. Acknowledge it as such.
- `withDocumentModelSpecs(spec[])` is "probably" introduced. Commit or reject before phasing starts.

### Top three to fix before building

1. Spec the bucket-level dequeue from `IQueue`, or drop per-worker FIFOs in favor of direct dispatch.
2. Lock down the SignatureVerifier API including init args, state-sharing strategy, and the migration plan for current implementers.
3. Address exactly-once execution under worker crash (critique #27): decide between flush-before-commit and `action.id` idempotency, and define whether `DuplicateOperationError` on retry maps to success.

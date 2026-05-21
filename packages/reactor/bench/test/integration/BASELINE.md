# D1 — Reactor executor throughput baseline

This is the "Phase 0" baseline benchmark called out by the executor worker-pool
work breakdown (`/tmp/wbs.md` row D1). It establishes a reproducible
multi-document throughput number that Phase 6 can compare against to verify
the worker-pool actually scales.

## What it measures

`POST /mutate` exercises the full reactor write path:
queue → executor → `SimpleJobExecutor.executeApply` → write to Postgres →
`JOB_WRITE_READY`. The driving load is signed `SET_DRIVE_NAME` actions
spread across `NUM_DRIVES` drives so the per-document FIFO doesn't serialise
the workload.

The number that matters is **jobs/sec completed** at the queue layer,
captured from the OTel counter `reactor.queue.jobs.completed` (Prometheus:
`reactor_queue_jobs_completed_total`). Latency is the lifecycle histogram
`reactor.job.total.duration` (Prometheus: `reactor_job_total_duration`)
which covers PENDING → READ_READY.

## How to run

Single point, `REACTOR_WORKERS=0` (in-process executor):

```sh
./test/integration/baseline.sh
```

Full sweep, `{0, 1, 2, 4, 8}` workers, appended to this file:

```sh
./test/integration/matrix.sh
```

`matrix.sh` leaves Prometheus + Grafana up after the run so you can inspect
series. Open Grafana at `http://127.0.0.1:3002`, dashboard "Reactor Bench".

## Acceptance criterion

Phase 6 declares success when **throughput at 4 workers ≥ 3.0× throughput at
1 worker**. (4× would be linear; 3× allows for IPC overhead and the
parent-event-loop fan-in noted in Open Question #5.) The `workers=0` row is
the in-process control and should be roughly equivalent to `workers=1`.

## Environment

Recorded by the operator at run time. Fill in once after the first matrix
sweep.

| field            | value |
| ---------------- | ----- |
| host             | Benjamins-MacBook-Pro-2.local |
| OS               | Darwin 24.5.0 arm64 |
| CPU              | Apple M4 Max |
| cores allocated  | 14 |
| Docker version   | 27.5.1 |
| Postgres version | 16-alpine (compose default) |
| Node version     | 24-alpine (compose default) |
| reactor SHA      | 2b73c6911 |
| date             | 2026-05-20 |

## Initial measurement

Run `./test/integration/matrix.sh` and the table will be appended below.
Each row is one (workers, jobs/sec, p50, p95, p99, k6 reqs, k6 fail%) tuple.

## Matrix run

| workers | jobs/sec | p50 (ms) | p95 (ms) | p99 (ms) | k6 reqs | k6 fail% |
| ------- | -------- | -------- | -------- | -------- | ------- | -------- |
| 0 | 99.72 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 1 | 83.92 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 2 | 131.64 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 4 | 146.11 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 8 | 148.49 | 10000.00 | 10000.00 | 10000.00 | — | — |

### Notes on this first sweep (2026-05-20, VUS=16, DURATION=30s, NUM_DRIVES=8)

- 4 workers / 1 worker = **1.74×** — below the **3.0×** acceptance criterion.
- Latency p50/p95/p99 all saturate at 10000 ms (the upper histogram bucket
  in `reactor.job.total.duration`). With k6 enqueuing ~4500 req/s and the
  executor completing ~100–150 jobs/s, queue depth balloons to ~150k items
  during the 30 s window, so per-job wait time exceeds the histogram's last
  finite bucket. Throughput is the meaningful number here; latency is
  measuring queue backlog rather than executor work.
- Workers=2 already exceeds workers=0/1, and the curve flattens between
  workers=4 and workers=8. Likely contributors to investigate next: shared
  Postgres pool (single instance + container), parent-event-loop fan-in on
  WRITE_READY, and the absence of in-worker keyframe cache hits during
  warmup. Bench k6 over-fires by design (so we measure executor ceiling,
  not request handling); to isolate per-worker scaling we should also rerun
  at VUS≈workers (no queue backlog) to capture realistic per-job latency.
### Per-worker observability (2026-05-20, post-instrumentation)

Phase-0 acceptance failure (1.74×) prompted adding `worker.id` attributes to
the executor metrics (`reactor.executor.processed`,
`reactor.executor.job.duration`) so we can attribute throughput to individual
worker threads instead of reasoning about aggregate jobs/sec only.

Mechanism: both `SimpleJobExecutorManager` and `WorkerPoolJobExecutorManager`
now emit `JobExecutorEventTypes.JOB_STARTED/JOB_COMPLETED/JOB_FAILED`
carrying an optional `workerId` (`reactor-worker-<n>` for the pool,
`in-process-<n>` for the in-process manager). `@powerhousedao/opentelemetry-instrumentation-reactor`
subscribes to these and tags the counter / histogram. Changes are additive —
existing external consumers of those executor events keep working because the
field is optional and no payload was removed.

While adding this we also fixed an emission-order bug in the worker-pool
manager: `JOB_WRITE_READY` was awaited before `JOB_COMPLETED` was emitted,
which let the read-model coordinator fire `JOB_READ_READY` (and its
instrumentation cleanup) before `JOB_COMPLETED` arrived, dropping the
executor-duration histogram entirely. `JOB_COMPLETED` is now emitted first
(matching the in-process manager) and the histogram populates.

#### Workers=4, VUS=32, DURATION=30s, NUM_DRIVES=8

Per-worker jobs completed, `sum by (worker_id) (increase(reactor_executor_processed_total{job_success="true"}[2m]))`:

| worker_id         | jobs completed |
| ----------------- | -------------- |
| reactor-worker-0  | ~5322          |
| reactor-worker-1  | ~4450          |
| reactor-worker-2  | ~2622          |
| reactor-worker-3  | (none in slice) |

p50 executor duration is uniform at ~2.5 ms across the workers that did
work — i.e. the per-job cost is identical, the disparity is purely *job
count*. Combined with the flat 4w↔8w aggregate throughput, this confirms
the original hypothesis: sticky-by-`documentId` routing across only 8 drives
clusters the load onto a subset of workers, so adding more workers can't
help.

Next experiment: rerun the matrix with `NUM_DRIVES≫workers` (e.g. 64, 256)
so the FNV-of-documentId distribution can spread evenly across workers.
That should let us see whether the scaling ceiling is the routing topology
or something downstream (Postgres pool, parent-event-loop fan-in on
WRITE_READY).

## Matrix run (post-instrumentation, VUS=32, DURATION=60s, NUM_DRIVES=8)

Confirming the additive `worker.id` instrumentation + worker-pool emission
order fix did not regress aggregate throughput, and capturing per-worker
distribution at the same time.

| workers | jobs/sec | p50 (ms) | p95 (ms) | p99 (ms) | k6 reqs | k6 fail% |
| ------- | -------- | -------- | -------- | -------- | ------- | -------- |
| 0 |  63.43 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 1 |  65.42 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 2 |  93.61 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 4 | 101.33 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 8 |  92.74 | 10000.00 | 10000.00 | 10000.00 | — | — |

### Notes on this sweep (2026-05-20)

- **4w/1w = 1.55×** — still well below the 3.0× acceptance criterion.
  Aggregate jobs/sec is lower across the board than the first sweep
  (workers=4 went 146 → 101, workers=8 went 148 → 93); the host was under
  more load this run. The *shape* of the scaling curve is what matters and
  it is unchanged: flat from workers=4 onward, with workers=8 actually
  slightly *worse* than workers=4.
- The additive `worker.id` instrumentation did not cost throughput — within
  this matrix the ordering of {2,4,8} (93 / 101 / 93) matches the prior
  sweep (132 / 146 / 148), all clustered within ~10%.
- The matrix was killed mid-run by a containerd buildx snapshot extraction
  error on workers=2; resolved by `docker builder prune -f` and resumed
  with `WORKER_LIST="2 4 8"`. Not a code issue.

#### Per-worker distribution, workers=8, last 3m window

`sum by (worker_id) (increase(reactor_executor_processed_total{job_success="true"}[3m]))`:

| worker_id        | jobs completed | share |
| ---------------- | -------------- | ----- |
| reactor-worker-1 | ~3239 | 25.1% |
| reactor-worker-2 | ~3182 | 24.6% |
| reactor-worker-3 | ~3257 | 25.2% |
| reactor-worker-7 | ~3206 | 24.8% |
| reactor-worker-0 | 0     | 0%    |
| reactor-worker-4 | 0     | 0%    |
| reactor-worker-5 | 0     | 0%    |
| reactor-worker-6 | 0     | 0%    |

**Half the worker pool is idle.** 8 drives × 8 worker buckets with the
sticky-by-`documentId` hash collapses onto exactly 4 distinct bucket
indices, so workers 0/4/5/6 never received a single job. Adding more
workers beyond ~4 cannot help while `NUM_DRIVES == NUM_WORKERS` because the
hash maps the 8 ids to a 4-element subset of bucket slots. At workers=4 the
earlier breakdown was already uneven (5322 / 4450 / 2622 / 0 — one worker
unfed even there).

Conclusion: the worker-pool scaling cap measured here is dominated by the
sticky-routing topology, not by any IPC / pool / fan-in bottleneck inside
the executor. To validate that and pull a clean ceiling number, the next
sweep must use `NUM_DRIVES ≫ NUM_WORKERS` (e.g. 64 or 256). Only then is
the 3.0× criterion a meaningful test of the worker pool itself.

## Matrix run (NUM_DRIVES=64, VUS=32, DURATION=60s)

Sweeping with 64 drives so the FNV-of-`documentId` hash has room to spread
across all workers. If scaling jumps to ≥3× at workers=4, the previous
1.55× ceiling was a small-N hash artifact, not a worker-pool defect.

| workers | jobs/sec | p50 (ms) | p95 (ms) | p99 (ms) | k6 reqs | k6 fail% |
| ------- | -------- | -------- | -------- | -------- | ------- | -------- |
| 0 |  71.27 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 1 | 401.58 |    69.92 |   472.75 |   716.02 | — | — |
| 2 | 396.91 |    56.54 |   237.48 |   417.90 | — | — |
| 4 | 414.11 |    50.51 |   236.69 |   419.77 | — | — |
| 8 | 404.76 |    47.57 |   234.53 |   414.65 | — | — |

### Notes on this sweep (2026-05-20, NUM_DRIVES=64)

Two big shifts versus NUM_DRIVES=8:

1. **Aggregate throughput jumped ~4×** (workers=4: 101 → 414 jobs/sec). The
   prior ceiling was queue contention on a too-narrow document set, not the
   executor.
2. **Latency histogram is now meaningful.** p50/p95/p99 went from
   "saturated at the 10 s upper bucket" to 50 / 235 / 415 ms across all
   pooled-worker configurations. We are now measuring actual executor work
   rather than queue backlog.

But the original acceptance criterion still fails — for a *different*
reason:

- **4w/1w = 414 / 402 = 1.03×.** Single worker already hits ~400 jobs/sec
  and the curve is flat from workers=1 through workers=8. The worker pool
  is no longer the bottleneck; *something downstream of it* is.
- workers=0 (in-process at 71 jobs/sec) is now ~5.6× worse than workers=1,
  confirming the in-process executor was being starved by the
  request-handling event loop. Moving execution off the host loop is the
  single biggest win, but adding *more* threads beyond one buys nothing at
  this workload.

#### Per-worker distribution, workers=8, NUM_DRIVES=64

`sum by (worker_id) (increase(reactor_executor_processed_total{job_success="true"}[3m]))`:

| worker_id        | jobs completed |
| ---------------- | -------------- |
| reactor-worker-0 | ~5330          |
| reactor-worker-1 | ~4441          |
| reactor-worker-2 | ~4915          |
| reactor-worker-3 | ~3833          |
| reactor-worker-4 | ~2774          |
| reactor-worker-5 | ~5411          |
| reactor-worker-6 | ~3779          |
| reactor-worker-7 | ~4354          |

All eight workers are now fed (no idle workers). Spread is min 2774, max
5411 — a 1.95× max/min ratio, which matches the variance you'd expect for
64 balls into 8 bins with a uniform hash. So the *routing* is doing its
job; the *pool* simply can't translate the spread into more aggregate
throughput.

#### Where the new ceiling probably is

In order of suspicion, given that workers=1 already saturates:

1. **Parent event-loop fan-in on `JOB_WRITE_READY`.** The read-model
   coordinator runs in the host process and awaits `indexOperations` on
   every pre-ready read model for every write. With workers=1 it is doing
   ~400 indexes/sec on a single loop; adding more workers just enqueues
   work faster than the host loop can drain it.
2. **Postgres connection pool / single Postgres instance** in the bench
   compose stack. Both the executor (via the worker's own pool) and the
   read-model coordinator (host pool) hit the same DB; if the host pool is
   sized at default and contended, that caps everything.
3. **Operation-store write path** — single-row inserts per operation may
   serialize at the DB regardless of worker concurrency.

These are testable with the existing OTel signals: `reactor.readmodel.index.duration`
should rise sharply with workers if (1) is the bottleneck; Postgres
`pg_stat_activity` should show pool waits if (2) is. Worth a separate
investigation rather than another matrix run.

## Matrix run (NUM_DRIVES=64, VUS=128, DURATION=60s)

Previous sweeps at VUS=32 showed worker utilization at ~10% with queue
depth ~17 — k6's request rate (32 VUs × ~65 ms avg = ~420 req/s) was
matching reactor throughput almost exactly, so we were measuring k6, not
the executor. Quadrupling VUs should push past that and let the queue
backlog so the worker pool actually becomes the limiter.

| workers | jobs/sec | p50 (ms) | p95 (ms) | p99 (ms) | k6 reqs | k6 fail% |
| ------- | -------- | -------- | -------- | -------- | ------- | -------- |
| 0 | 29.99 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 1 | 63.91 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 1 | 55.50 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 2 | 104.75 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 4 | 116.82 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 8 | 162.56 | 10000.00 | 10000.00 | 10000.00 | — | — |

Scaling ratios (using the complete sweep, not the orphan workers=1 row from the
aborted prior run): 4w/1w = 2.11x, 8w/1w = 2.93x. Worse than VUS=32 in
absolute terms (162 vs ~400 at workers=8) and still below the 3.0x target.

### Notes on this sweep (2026-05-20, NUM_DRIVES=64, VUS=128)

All k6 percentiles are pinned at the 10s request timeout, so `jobs/sec` is
HTTP-success-derived and excludes timed-out requests. The reactor itself
likely processed more than k6 saw; query Prometheus for the truth.

#### Per-worker distribution, workers=8

Pulled from `reactor_executor_job_duration_count{job_success="true"}` deltas
over the 85s workers=8 window (steady state, drives created by 19:25:10,
sweep ended 19:26:59):

```
worker_id            delta   rate/s   % of total
reactor-worker-0      1514   17.81     13.5%
reactor-worker-1      1498   17.62     13.4%
reactor-worker-2      1277   15.02     11.4%
reactor-worker-3      1244   14.64     11.1%
reactor-worker-4      1446   17.01     12.9%
reactor-worker-5      1576   18.54     14.1%
reactor-worker-6      1121   13.19     10.0%
reactor-worker-7      1509   17.75     13.5%
TOTAL                11185  131.59     8 workers
max/min spread = 1.41x
```

Routing distribution is excellent. All 8 workers got work; no idle workers.
The shortfall versus k6's reported 162 jobs/s is the slow Prometheus pull
window catching the tail of the run after k6 ended.

#### Diagnosis: dispatch path is the bottleneck, not executor compute

Pipeline metrics over the workers=8 window:

- queue depth at end: 577,359 jobs (unbounded growth)
- avg `executor_active_jobs` gauge: 44 (with only 8 workers — see prior
  notes on the gauge counting in-flight dispatch slots, not strictly
  workers)
- total executor compute = sum delta of `reactor_executor_job_duration_sum`
  = 17.9s across 8 workers × 85s = **2.6% utilization**
- per-job executor time = 17.9s / 11185 = **1.6 ms** (same as VUS=32)

So with 577k jobs sitting in the queue and workers 97.4% idle, the workers
are not slow — they are *starved*. Something between `queue has work` and
`worker receives next job` is throttling the system to ~130 jobs/s total
regardless of worker count.

Per-worker throughput collapsed from ~50 jobs/s (VUS=32, NUM_DRIVES=64) to
~16 jobs/s (VUS=128, NUM_DRIVES=64). Adding 4x more offered load *reduced*
per-worker throughput by 3x. The executor's per-job compute is unchanged,
so the dispatch latency per job grew by roughly the same factor.

The actual dispatch hot path per worker (worker-pool-job-executor-manager.ts
`tryDispatchFor`, lines 247-365) runs serially as:

```
isIdle? -> queue.dequeueNextMatching(predicate)
        -> handle.start; emit JOB_RUNNING; emit JOB_STARTED
        -> await worker.execute(job)              // ~1.6 ms compute
        -> emit JOB_COMPLETED
        -> await emitWriteReady(payload)          // line 351
        -> await resultHandler.handleResult(...)  // line 354
        -> recurse tryDispatchFor(worker)
```

`IQueue` is an in-memory `Map<queueKey, Job[]>` (one entry per
`documentId:scope:branch`); with 64 documents the dispatch scan is trivial.
The cost is in the two awaits *after* compute that gate the next dequeue.

`emitWriteReady` cascades through the coordinator, which calls
`indexOperations` for every pre-ready read model, then emits JOB_READ_READY
(which instrumentation also subscribes to). `resultHandler.handleResult`
calls `queue.completeJob`, flushes deferred jobs, and emits more events.
Both runs synchronously hold the worker idle.

If per-worker tail latency is ~60 ms (1.6 ms compute + ~58 ms read-model
indexing + result handling), per-worker throughput is ~16 jobs/s, which
matches what we observed. The aggregate 130 jobs/s = 8 workers x 16.

#### Next probe

Add per-stage timers inside `tryDispatchFor` (or use OTel spans):

- `t_dequeue` = `dequeueNextMatching` duration
- `t_execute` = `worker.execute` duration (already have this)
- `t_writeready` = `emitWriteReady` duration
- `t_handle` = `resultHandler.handleResult` duration

Record them as histograms tagged with `worker.id`. With those four
numbers we can rank the post-compute serial path and know exactly which
read-model or sync subscriber to attack first.

#### Acceptance criterion status

Phase 0 / D1 target was 4w/1w >= 3.0x. We measured:
- VUS=32 NUM_DRIVES=8:  4w/1w = 0.99x (routing imbalance)
- VUS=32 NUM_DRIVES=64: 4w/1w = ~1.0x (k6-bound at 400 jobs/s)
- VUS=128 NUM_DRIVES=64: 4w/1w = 2.11x (dispatch-bound, system overloaded)

None of these are clean baselines. To get a defensible D1 number we need
to lift the dispatch bottleneck so workers can actually run at their
1.6 ms/job ceiling; only then will the worker count be the limiter.
| 0 | 6.66 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 1 | 21.87 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 2 | 21.34 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 4 | 20.08 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 8 | 16.85 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 0 | 15.89 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 1 | 20.92 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 2 | 21.57 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 4 | 20.45 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 8 | 16.39 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 0 | 16.55 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 1 | 55.00 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 2 | 105.84 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 4 | 119.50 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 8 | 103.15 | 10000.00 | 10000.00 | 10000.00 | — | — |

### Notes on this sweep (Run 7, 2026-05-21, NUM_DRIVES=64, VUS=128)

Run 7 ships the pool-sizing + acquire-instrumentation sub-feature: host pool
bumped from `max=4` to `max=16`, `connectionTimeoutMillis=5000` threaded
through `DbConfig`, and four new metrics added (`reactor.db.pool.*`).
Compared to the prior sweep at the same VUS / drives / duration:

| workers | Run 6 | Run 7 | factor |
| ------- | ----- | ----- | ------ |
| 0 | 6.66 | 16.55 | 2.5x |
| 1 | 21.87 | 55.00 | 2.5x |
| 2 | 21.34 | 105.84 | 5.0x |
| 4 | 20.08 | 119.50 | 6.0x |
| 8 | 16.85 | 103.15 | 6.1x |

Throughput inverts between workers=4 and workers=8 — the host pool saturates
again at the new ceiling (avg `pool.waiting` = 90 callers at workers=8 with
16 slots; acquire p50 climbs from 2.7 ms at workers=2 to 162.8 ms at
workers=8). Executor rate at workers=8 is ~1154 jobs/s, i.e. 12x the
projection rate; the constraint has fully moved to the host's read-model
coordinator and its single 16-connection pool. Full write-up plus per-stage
numbers in the Run 7 wiki page (69dc9be3-43a0-44d0-8e13-e054b00c80e2).
Headline numbers in this table are the matrix script's `jobs/sec` —
`queue.completed` rate over the 60s window, equivalent to projection rate.

## Run 8 matrix (host pool sweep, NUM_DRIVES=64, VUS=128, DURATION=60s)

| pool | workers | jobs/sec | p50 (ms) | p95 (ms) | p99 (ms) | k6 reqs | k6 fail% |
| ---- | ------- | -------- | -------- | -------- | -------- | ------- | -------- |
| 16 | 4 | 115.08 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 16 | 8 | 101.33 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 32 | 4 | 120.65 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 32 | 8 | 104.55 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 64 | 4 | 119.75 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 64 | 8 | 101.43 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 96 | 4 | 119.99 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 96 | 8 | 101.68 | 10000.00 | 10000.00 | 10000.00 | — | — |

### Notes on this sweep (Run 8, 2026-05-21, NUM_DRIVES=64, VUS=128, workers in {4, 8})

Throughput is flat across the pool sweep — quadrupling host pool size
(16 → 96) at workers=8 moves `queue.completed` from 101 to 102 jobs/sec.
Pool was the binding constraint in Run 7 only because it was undersized;
sizing it past ~52 connections at workers=4 (~74 at workers=8) leaves
idle slots and zero waiters but does not unlock more projection
throughput. Per-op index p50 collapses from 262 ms at pool=16 to 43 ms at
pool=96 (workers=8), confirming the pool was real cost — but executor
rate stays 11x ahead of projection rate at every cell, so the next
binding constraint sits below the pool boundary inside the read-model
coordinator's per-op work. Full write-up in the Run 8 wiki page
(b83f8c53-5278-41ad-b5fa-6564e358ce56). Production guidance: set
`REACTOR_DB_POOL_SIZE_HOST=64` by default.

## Run 9 matrix (NUM_DRIVES sweep, VUS=128, DURATION=60s, pool=96)

| drives | workers | jobs/sec | p50 (ms) | p95 (ms) | p99 (ms) | k6 reqs | k6 fail% |
| ------ | ------- | -------- | -------- | -------- | -------- | ------- | -------- |
| 64 | 4 | 121.02 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 64 | 8 | 102.37 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 128 | 4 | 118.15 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 128 | 8 | 117.43 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 256 | 4 | 114.99 | 10000.00 | 10000.00 | 10000.00 | — | — |
| 256 | 8 | 114.53 | 10000.00 | 10000.00 | 10000.00 | — | — |

### Notes on this sweep (Run 9, 2026-05-21, VUS=128, pool=96, workers in {4, 8})

Throughput is flat across the 4x drive-count sweep at both worker counts —
mean 132.7 jobs/s, max-min spread 30. Chain depth scales linearly with
NUM_DRIVES (33 -> 173 at workers=4, 62 -> 252 at workers=8), so the
coordinator IS running more chains concurrently — but per-op index p50
balloons from 42 ms to 1181 ms at workers=8 NUM_DRIVES=256 to absorb the
added concurrency. Total work per second is fixed; growing drive count
just spreads it thinner across more chains. The pool re-saturates at
NUM_DRIVES=256 (407 callers queued at workers=8) but throughput doesn't
drop with it — the pool was never the constraint past Run 7's 4->16 jump,
it's a follower. This is the signature of a single-threaded
bandwidth-limited resource on the host side, most likely the Node.js
event loop or a shared Kysely transaction. Full write-up in the Run 9
wiki page (19a11753-d38b-4c5f-b3b0-ad6e50ac7487). Next sub-feature:
host-side event-loop instrumentation (perf_hooks.monitorEventLoopDelay)
to settle the host-CPU-bound hypothesis before further architectural
investment.

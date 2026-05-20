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

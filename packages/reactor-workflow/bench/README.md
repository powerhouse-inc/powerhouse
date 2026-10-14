# Workflow benchmarks

`run.ts` repeats one workflow operation and prints its latency for each batch,
followed by a breakdown by span. It uses the built engine (`dist/`), a real
in-process reactor and a fresh PGlite run journal. Run `pnpm build` after you
change `src/`.

```bash
pnpm bench --workload piece --runs 100
pnpm bench --workload reactor-write --runs 40 --history 5000
pnpm bench --workload runs-page --seed-runs 100000
pnpm bench --workload reactor-read --runs 40 --profile
pnpm bench:profile bench/.out/<run>/workers
```

## Workloads

The first four fire a one-step workflow. The last two read the journal; they
fire `core` runs only during the warm-up.

| `--workload`    | What is measured                                                         |
| --------------- | ------------------------------------------------------------------------ |
| `core`          | a run of `core:assert`, in-process; no worker is forked                  |
| `piece`         | a run of a no-op piece in a forked worker                                |
| `reactor-read`  | a run of `piece-reactor` `document-get`, over the reactor RPC            |
| `reactor-write` | a run of `piece-reactor` `document-dispatch`, over the reactor RPC       |
| `runs-page`     | `runsPage`, the run listing Studio polls (`--scope`, `--page-size`)      |
| `purge`         | `onDocumentsPurged` for a document no run touched: a scan of the journal |

## Options

| Option                | Default                        | Effect                                                         |
| --------------------- | ------------------------------ | -------------------------------------------------------------- |
| `--runs`              | 100                            | Measured operations                                            |
| `--warmup`            | 5                              | Unmeasured runs fired first                                    |
| `--steps`             | 1                              | Steps per workflow, chained                                    |
| `--concurrency`       | 1                              | Operations in flight                                           |
| `--pool`              | `--concurrency`                | Most piece children (`PH_WORKFLOWS_RUN_CONCURRENCY`)           |
| `--mix`               | the workload                   | Step kinds repeated across `--steps`, e.g. `piece,core`        |
| `--batch`             | 25                             | Operations per printed row                                     |
| `--seed-runs`         | 0                              | Runs inserted into the journal by SQL before measuring         |
| `--seed-steps`        | 3                              | Steps per seeded run                                           |
| `--history`           | 0                              | Extra operations on the workflow document before measuring     |
| `--scope`             | `all`                          | `runs-page`: every workflow's runs, or `workflow` for one      |
| `--page-size`         | 25                             | `runs-page`: runs per page                                     |
| `--profile`           | off                            | Write CPU profiles of the host and of every forked worker      |
| `--pyroscope`         |                                | Push those profiles to this Pyroscope; turns on `--profile`    |
| `--otlp`              |                                | Export every span to this OTLP/HTTP endpoint                   |
| `--no-trace`          | off                            | Run without a tracer or meter, to measure what telemetry costs |
| `--postgres`          |                                | Postgres server URL; each run creates a fresh database on it   |
| `--pglite-dir`        |                                | On-disk PGlite under this directory, as Switchboard keeps it   |
| `--policy`            | `PARALLEL`                     | The workflow's `policy.concurrency`; `QUEUE` runs one at a time |
| `--reactor-workers`   | 0                              | Reactor executor worker threads (`REACTOR_WORKERS`); Postgres  |
| `--projection-worker` | off                            | The reactor's projection worker thread; Postgres               |
| `--out`               | `bench/.out/<time>-<workload>` | Directory for `result.json` and profiles                       |

Columns:

- `stepAvg` is the sum of each step's own `startedAt..endedAt`.
- `overhead` is the rest of `fire()`: reading the workflow, the run-user lookup,
  and the journal writes.
- In the span table, `perRun` is the total time in that span divided by the
  measured operations. Spans nest, so the column does not add up to a run.
- The `host` line gives the main thread's event-loop utilization and the CPU
  the bench process used across all its threads, in cores. Children are not
  counted.
- `PH_WORKFLOWS_WORKER_MAX_REQUESTS=1` retires every child after one request,
  for a cold baseline to compare the warm pool against.

## Spans and metrics

The runtime takes `telemetry: { tracer, meter }` in its host deps; Switchboard
passes the providers it registers. Spans, all children of `workflow.run`:

| Span                                           | Covers                                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| `workflow.load`                                | reading the workflow document                                                           |
| `workflow.run_user`                            | the publish run-user lookup; only with a reactor connection                             |
| `workflow.journal.{start,step,finish}`         | run journal writes                                                                      |
| `workflow.step`                                | one block, with `piece.name`, `action.name`, `piece.version`                            |
| `workflow.piece.resolve`                       | finding the piece's bundle                                                              |
| `workflow.reactor.scope`                       | checking a step's reactor connection                                                    |
| `workflow.worker.acquire`                      | waiting for a child; only when every child is busy                                      |
| `workflow.worker.<request>[.cold]`             | one request to a worker; `.cold` when it forked the child                               |
| `workflow.worker.boot`                         | fork until the child's entry has loaded; first request only                             |
| `workflow.worker.piece.load`                   | importing the piece in the child; `piece.cached` if reused                              |
| `workflow.worker.reactor.open`                 | the child's reactor RPC session, its runtime import included                            |
| `workflow.worker.models`                       | loading a document model for `ctx.reactor`; under `action` when the action asked for it |
| `workflow.worker.action`                       | the action's own `run`                                                                  |
| `workflow.worker.ipc.{in,out}`                 | the request reaching the child, and the reply reaching the host                         |
| `workflow.reactor.<method>`                    | one `ctx.reactor` call a piece made over the RPC                                        |
| `workflow.runs.page`, `workflow.journal.purge` | the read side                                                                           |

Metrics: `workflow.runs` (`run.status`, `trigger.kind`), `workflow.run.duration`,
`workflow.step.duration` (`piece.name`, `step.status`), `workflow.phase.duration`
(`phase`: every span above without the `workflow.` prefix) and
`workflow.worker.pool.{size,active,idle,waiting}`.

- `run.status` is `REFUSED` for a fire stopped before its run began (no access,
  not enabled, connection unreadable); those are not failed runs.
- On metrics, `piece.name` is `unresolved` unless the block resolved to a real
  piece, since a workflow author can type any name. Spans keep the raw name.

## Profiles

Workers profile through `PH_WORKFLOWS_WORKER_CPU_PROF_DIR`. When it is set, each
forked worker runs with `--cpu-prof` and is stopped with SIGTERM instead of
SIGKILL, so that it can write its profile.

## Local Grafana, Tempo and Pyroscope

```bash
docker compose -f scripts/profiling/docker-compose.yml up -d  # from the repo root
pnpm bench --workload reactor-write --runs 40 \
  --postgres postgres://postgres:postgres@localhost:5432/postgres \
  --reactor-workers 8 --projection-worker
pnpm bench --workload reactor-write --runs 40 \
  --otlp http://localhost:4318 --pyroscope http://localhost:4040
```

- Spans go through the collector to Tempo; metrics a Switchboard sends go to
  Prometheus.
- Grafana is at http://localhost:3030, with the Prometheus, Tempo and Pyroscope
  datasources already set up.
- Profiles are pushed to the Pyroscope service `reactor-workflow-bench`, with the
  labels `process` (`host` or `worker`), `workload`, `steps`, `concurrency` and
  `bench_run`. Its own UI is at http://localhost:4040.
- To push profiles you already have, run
  `node bench/pyroscope-push.ts <dir> --labels process=worker`.

## In a Linux container

`bench/docker.sh <cpus> <memory> <command>` runs a command in
`node:24-bookworm-slim` with a CPU quota and a memory limit, on the profiling
stack's network. Inside it, `os.availableParallelism()` and
`process.constrainedMemory()` report those limits. Build on the host first;
the monorepo is mounted as is.

```bash
docker compose -f scripts/profiling/docker-compose.yml up -d postgres  # from the repo root
bench/docker.sh 4 4g node bench/run.ts --workload reactor-write \
  --runs 128 --concurrency 8 \
  --postgres postgres://postgres:postgres@postgres16:5432/postgres
bench/docker.sh 4 4g node bench/run.ts --workload reactor-write \
  --runs 128 --concurrency 4 --pglite-dir /tmp/pg
```

On-disk PGlite fsyncs every commit unless `PH_PGLITE_FSYNC=0`.

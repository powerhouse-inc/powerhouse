# Profiling Scripts

Scripts for benchmarking and profiling the Powerhouse reactor and switchboard.

## Quick Start

```bash
# Start PostgreSQL and Pyroscope
docker compose -f scripts/profiling/docker-compose.yml up -d --wait

# Build packages and run a profiling session (1 doc, 25 ops x 100 loops, PostgreSQL + Pyroscope)
# Automatically builds dependencies, runs migrations, and runs pyroscope-analyse after completion
./scripts/profiling/run-reactor-direct.sh 1 -o 25 -b 5 -l 100 \
  --db "postgresql://postgres:postgres@localhost:5432/postgres" \
  --pyroscope http://localhost:4040 \
  --file

# Or run reactor-direct.ts directly if packages are already built
tsx ./scripts/profiling/reactor-direct.ts 1 -o 25 -b 5 -l 100 \
  --db "postgresql://postgres:postgres@localhost:5432/postgres" \
  --pyroscope http://localhost:4040 \
  --file

# Or analyse an existing Pyroscope profile manually
tsx ./scripts/profiling/pyroscope-analyse.ts 'http://localhost:4040/?query=...'

# View flame graphs at http://localhost:4040

# Tear down containers and volumes
docker compose -f scripts/profiling/docker-compose.yml down -v
```

## Prerequisites

Install dependencies from this directory:

```bash
cd scripts/profiling
pnpm install
```

Build the packages that the profiling scripts depend on. Run these from the repository root:

```bash
pnpm --filter document-model run tsc --build
pnpm --filter @powerhousedao/reactor run build
pnpm --filter @powerhousedao/reactor run build:bundle
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" pnpm --filter document-drive run migrate
pnpm --filter @powerhousedao/switchboard run tsc --build
pnpm --filter @powerhousedao/reactor-api run build:misc
```

- `migrate` runs `prisma generate && prisma db push` — required once per fresh PostgreSQL database to create the schema. Re-run if you wipe the database.
- `build:bundle` produces the JS bundle for `@powerhousedao/reactor` (the `tsc` build only emits declaration files). Required for `reactor-direct.ts` to resolve the package at runtime.
- `build:misc` copies `.graphql` schema files into the reactor-api dist. Without this, the reactor subgraph (which provides `jobStatus` and other queries) fails to start silently.
- Rebuild after any source changes in these packages, otherwise the scripts will run against stale code.

Scripts are run with [tsx](https://github.com/privatenumber/tsx). The GraphQL-based scripts (`docs-*`) require a running switchboard instance (default: `http://localhost:4001/graphql`).

## Scripts

### `reactor-direct.ts` — Direct reactor profiling

Benchmarks the reactor directly, bypassing the GraphQL API. This isolates reactor performance from network/API overhead.

```bash
# Create 10 documents (default)
tsx reactor-direct.ts

# Create 5 documents, each with 20 operations repeated 10 times
tsx reactor-direct.ts 5 --operations 20 --op-loops 10

# Batch operations (10 ops per execute call instead of 1)
tsx reactor-direct.ts 1 -o 100 --batch-size 10

# Target an existing document
tsx reactor-direct.ts --doc-id <id> -o 25 -l 5

# Use PostgreSQL instead of in-memory PGlite
tsx reactor-direct.ts 10 -o 5 --db "postgresql://postgres:postgres@localhost:5432/reactor"

# Use file-backed PGlite
tsx reactor-direct.ts 10 --db "./data"

# Enable Pyroscope continuous profiling
tsx reactor-direct.ts 1 -o 100 -l 10 --pyroscope

# Save output to a timestamped file (e.g. 2026-02-18T12-00-00-000Z-reactor-direct.txt)
tsx reactor-direct.ts 5 -o 20 -l 10 -p --file

# Save output to a specific file
tsx reactor-direct.ts 5 -o 20 -l 10 -p -O results.txt

# Show percentiles and verbose output
tsx reactor-direct.ts 5 -o 20 --percentiles --verbose --show-action-types
```

| Flag                  | Short | Description                                                                                                              |
| --------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------ |
| `N` (positional)      |       | Number of documents to create (default: 10)                                                                              |
| `--operations`        | `-o`  | Operations per loop (default: 0)                                                                                         |
| `--op-loops`          | `-l`  | Loops per document (default: 1)                                                                                          |
| `--batch-size`        | `-b`  | Operations per execute call (default: 1)                                                                                 |
| `--db`                |       | Database connection string or PGlite path                                                                                |
| `--doc-id`            | `-d`  | Use an existing document (skips creation)                                                                                |
| `--pyroscope`         |       | Enable Pyroscope profiling (optionally pass server address). Automatically runs `pyroscope-analyse.ts` after completion. |
| `--otel`              |       | Enable OpenTelemetry metrics export (optionally pass OTLP endpoint, default: `http://localhost:4318`)                    |
| `--file`              |       | Write output to a timestamped file (default name: `reactor-direct.txt`)                                                  |
| `--output`            | `-O`  | Write output to a specific file (no timestamp prefix)                                                                    |
| `--verbose`           | `-v`  | Show per-operation timings                                                                                               |
| `--percentiles`       | `-p`  | Show p50/p90/p95/p99 stats                                                                                               |
| `--show-action-types` | `-a`  | Show action names in min/max timings                                                                                     |

### `pyroscope-analyse.ts` — Pyroscope profile analysis

Extracts profiling data from Pyroscope and generates a markdown analysis report with top functions, module breakdown, and wall vs CPU comparison tables.

Typically invoked automatically by `reactor-direct.ts --pyroscope`, but can also be run standalone against any Pyroscope profile URL.

```bash
# Analyse a Pyroscope profile URL (extracts query, from, until automatically)
tsx pyroscope-analyse.ts 'http://localhost:4040/?query=wall%3Awall%3Ananoseconds%3Awall%3Ananoseconds%7Bservice_name%3D%22reactor-direct-profiler%22%7D&from=1770991542&until=1770992234'

# Explicit parameters
tsx pyroscope-analyse.ts --query 'process_cpu{service_name="reactor"}' --from 1700000000 --until 1700003600

# Save raw JSON and markdown report to files
tsx pyroscope-analyse.ts 'http://localhost:4040/...' --output-json /tmp/profile --output-md report.md

# Compare against a previous baseline
tsx pyroscope-analyse.ts 'http://localhost:4040/...' --baseline /tmp/profile

# Show top 50 functions, wall profile only
tsx pyroscope-analyse.ts 'http://localhost:4040/...' --top 50 --profiles wall
```

| Flag             | Description                                                                |
| ---------------- | -------------------------------------------------------------------------- |
| URL (positional) | Pyroscope browser URL (query, from, until extracted automatically)         |
| `--pyroscope`    | Pyroscope base URL (default: `http://localhost:4040`)                      |
| `--query`        | Pyroscope query (alternative to URL)                                       |
| `--from`         | Start timestamp in epoch seconds                                           |
| `--until`        | End timestamp in epoch seconds                                             |
| `--output-json`  | Save raw JSON per profile type (`{base}-wall.json`, `-samples.json`, etc.) |
| `--output-md`    | Save markdown report to file (default: stdout)                             |
| `--baseline`     | Compare against previously saved JSON                                      |
| `--top`          | Number of top functions to show (default: 25)                              |
| `--profiles`     | Comma-separated profile types to fetch (default: `wall,samples,cpu`)       |

**Output sections:**

- **Profiling Summary** — total wall/CPU time, wall:CPU ratio, unique function count, top module
- **Top Functions by Self Time** — ranked table of hottest functions from the wall profile
- **Module Breakdown** — self time aggregated by module (derived from file paths)
- **Wall vs CPU Comparison** — per-function wall vs CPU time with ratio (1.0 = compute-bound, >>1.0 = I/O-bound)
- **Baseline Comparison** — delta table per module when `--baseline` is provided

### `docs-create.ts` — Create documents via GraphQL

Creates documents and performs operations through the switchboard GraphQL API. Useful for end-to-end profiling including API latency.

```bash
# Create 10 documents
tsx docs-create.ts 10

# Create 5 documents with 10 operations each
tsx docs-create.ts 5 --operations 10

# Run operations on existing documents
tsx docs-create.ts --doc-id abc123 -o 25 -l 100
tsx docs-create.ts -d doc1 -d doc2 -o 10

# Batch operations (10 ops per mutateDocument call instead of 1)
tsx docs-create.ts 1 -o 100 --batch-size 10

# Custom endpoint
tsx docs-create.ts 50 --endpoint http://localhost:4001/graphql

# Save output to a timestamped file
tsx docs-create.ts 5 -o 20 -l 10 -p --file

# Save output to a specific file
tsx docs-create.ts 5 -o 20 -l 10 -p -O results.txt

# Show percentiles and action type names in min/max
tsx docs-create.ts 5 -o 20 --percentiles --show-action-types

# Use async mutation variants (returns job ID instead of document)
tsx docs-create.ts 1 -o 25 --async

# Async with batching
tsx docs-create.ts 1 -o 100 -b 10 --async
```

| Flag                  | Short | Description                                                                 |
| --------------------- | ----- | --------------------------------------------------------------------------- |
| `N` (positional)      |       | Number of documents to create (default: 10)                                 |
| `--operations`        | `-o`  | Operations per loop (default: 0)                                            |
| `--op-loops`          | `-l`  | Loops per document (default: 1)                                             |
| `--batch-size`        | `-b`  | Operations per `mutateDocument` call (default: 1)                           |
| `--doc-id`            | `-d`  | Use existing document(s), can be repeated                                   |
| `--endpoint`          |       | GraphQL endpoint (default: `http://localhost:4001/graphql`)                 |
| `--async`             |       | Use `*Async` mutation variants (fire-and-forget; returns job ID)            |
| `--async-timeout`     |       | Max ms to wait for a polled job to reach terminal status (default: `30000`) |
| `--file`              |       | Write output to a timestamped file (default name: `docs-create.txt`)        |
| `--output`            | `-O`  | Write output to a specific file (no timestamp prefix)                       |
| `--verbose`           | `-v`  | Show detailed operation timings                                             |
| `--percentiles`       | `-p`  | Show p50/p90/p95/p99 stats                                                  |
| `--show-action-types` | `-a`  | Show action names in min/max timings                                        |

### `docs-count.ts` — Count documents (fast)

Counts documents using the `totalCount` GraphQL field (single request per type).

```bash
tsx docs-count.ts
tsx docs-count.ts --type powerhouse/document-model
tsx docs-count.ts --verbose
```

> **Note:** `totalCount` may be inaccurate. Use `docs-list.ts --count-only` for a reliable count.

### `docs-list.ts` — List/count documents (paginated)

Lists or counts documents using cursor-based pagination. More reliable than `docs-count.ts`.

```bash
tsx docs-list.ts
tsx docs-list.ts --count-only
tsx docs-list.ts --type powerhouse/document-model --timing
```

| Flag           | Short | Description                 |
| -------------- | ----- | --------------------------- |
| `--endpoint`   |       | GraphQL endpoint            |
| `--type`       |       | Filter by document type     |
| `--count-only` |       | Only output the total count |
| `--timing`     | `-t`  | Show per-request timing     |

### `docs-reset.ts` — Delete all documents

Deletes all documents from the switchboard in batches.

```bash
tsx docs-reset.ts
tsx docs-reset.ts --endpoint http://localhost:4001/graphql
```

### `run-reactor-direct.sh` — Build and run reactor-direct

A convenience wrapper that builds all required packages before running `reactor-direct.ts`. Use this after switching branches or when dependencies may be stale.

```bash
./scripts/profiling/run-reactor-direct.sh 1 -o 25 -b 5 -l 100 \
  --db "postgresql://postgres:postgres@localhost:5432/postgres" \
  --pyroscope http://localhost:4040
```

The script runs in order:

1. `pnpm --filter document-model run tsc --build`
2. `pnpm --filter @powerhousedao/reactor run build` (declarations) + `build:bundle` (JS)
3. `pnpm --filter @powerhousedao/opentelemetry-instrumentation-reactor run build`
4. `DATABASE_URL=... pnpm --filter document-drive run migrate`
5. `tsx reactor-direct.ts [your args]`

All arguments are passed through to `reactor-direct.ts`. See the [`reactor-direct.ts`](#reactor-directts--direct-reactor-profiling) section for available flags.

### `switchboard-pyroscope.sh` — Run switchboard with Pyroscope

Starts the switchboard with [Pyroscope](https://pyroscope.io/) continuous profiling enabled in wall:wall + CPU mode. Pyroscope is initialized at the top level before the server starts, so the full startup is captured. Supports selecting the runtime (Node.js or Bun) for comparison benchmarks.

```bash
./scripts/profiling/switchboard-pyroscope.sh
./scripts/profiling/switchboard-pyroscope.sh --runtime bun
./scripts/profiling/switchboard-pyroscope.sh --mode legacy
./scripts/profiling/switchboard-pyroscope.sh -r bun -m legacy --postgres "postgresql://postgres:postgres@localhost:5432/reactor"
./scripts/profiling/switchboard-pyroscope.sh --otel
./scripts/profiling/switchboard-pyroscope.sh --otel http://localhost:4318
```

| Flag         | Short | Description                                                                                                                     |
| ------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| `--runtime`  | `-r`  | Runtime: `node` (default) or `bun`                                                                                              |
| `--mode`     | `-m`  | Storage mode: `v2` (default) or `legacy`                                                                                        |
| `--postgres` | `-p`  | PostgreSQL database URL; sets `DATABASE_URL` — migrations run automatically before the server starts when `DATABASE_URL` is set |
| `--otel`     |       | Enable OpenTelemetry metrics export (default: `http://localhost:4318`); sets `OTEL_EXPORTER_OTLP_ENDPOINT`                      |

## Infrastructure

### `docker-compose.yml`

Provides PostgreSQL 16, Pyroscope, an OpenTelemetry collector, and Prometheus for profiling:

```bash
# Start all services
docker compose -f scripts/profiling/docker-compose.yml up -d --wait

# Start individual services
docker compose -f scripts/profiling/docker-compose.yml up postgres -d
docker compose -f scripts/profiling/docker-compose.yml up pyroscope -d
docker compose -f scripts/profiling/docker-compose.yml up otel-collector prometheus -d
```

| Service          | Port       | Description                                            |
| ---------------- | ---------- | ------------------------------------------------------ |
| `postgres`       | 5432       | PostgreSQL 16 (user: `postgres`, password: `postgres`) |
| `pyroscope`      | 4040       | Grafana Pyroscope continuous profiling server          |
| `otel-collector` | 4317, 4318 | OpenTelemetry collector (gRPC + HTTP OTLP receivers)   |
| `prometheus`     | 9090       | Prometheus metrics UI                                  |

## Typical Workflows

### Benchmark reactor in isolation

```bash
# In-memory (fastest, no I/O)
# Use the wrapper on a fresh branch to build packages first:
./scripts/profiling/run-reactor-direct.sh 10 -o 50 -l 5 -p

# Or run directly if packages are already built:
tsx reactor-direct.ts 10 -o 50 -l 5 -p

# Against PostgreSQL
docker compose -f scripts/profiling/docker-compose.yml up postgres -d
tsx reactor-direct.ts 10 -o 50 -l 5 -p --db "postgresql://postgres:postgres@localhost:5432/postgres"
```

### Profile reactor with Pyroscope

```bash
docker compose -f scripts/profiling/docker-compose.yml up pyroscope postgres -d

# Run profiling via the wrapper (builds packages + runs migrations first)
# Automatically analyses and saves report after completion
./scripts/profiling/run-reactor-direct.sh 1 -o 25 -b 5 -l 100 \
  --db "postgresql://postgres:postgres@localhost:5432/postgres" \
  --pyroscope
# Output: {timestamp}-pyroscope.md, {timestamp}-pyroscope-{wall,samples,cpu}.json

# Or analyse a previous run manually
tsx pyroscope-analyse.ts 'http://localhost:4040/?query=...'

# Compare two runs
tsx pyroscope-analyse.ts 'http://localhost:4040/?query=...' --baseline ./1771254033-pyroscope

# Open http://localhost:4040 to view flame graphs interactively
```

### Profile reactor with OTel metrics

```bash
docker compose -f scripts/profiling/docker-compose.yml up otel-collector prometheus postgres -d --wait

./scripts/profiling/run-reactor-direct.sh 1 -o 25 -b 5 -l 2000 \
  --db "postgresql://postgres:postgres@localhost:5432/postgres" \
  --otel

# Open http://localhost:9090 to query metrics (use the Graph tab for time series)
```

### Prometheus metrics reference

#### Counters — use `rate(...[interval])` for per-second rates

| Metric                                        | Description                           |
| --------------------------------------------- | ------------------------------------- |
| `reactor_queue_jobs_enqueued_total`           | Jobs added to the queue               |
| `reactor_queue_jobs_dequeued_total`           | Jobs dequeued for execution           |
| `reactor_queue_jobs_completed_total`          | Jobs completed (READ_READY)           |
| `reactor_queue_jobs_failed_total`             | Jobs permanently failed               |
| `reactor_executor_processed_total`            | Total jobs processed by executors     |
| `reactor_executor_operations_generated_total` | Operations produced by executors      |
| `reactor_eventbus_events_emitted_total`       | Events emitted on the event bus       |
| `reactor_sync_dead_letters_added_total`       | Sync ops moved to dead letter storage |

#### Gauges — instant values, useful for queue depth graphs

| Metric                         | Description                    |
| ------------------------------ | ------------------------------ |
| `reactor_queue_depth`          | Pending jobs across all queues |
| `reactor_executor_active_jobs` | Jobs currently executing       |
| `reactor_sync_remotes`         | Active remote count            |

#### Histograms — available with `_bucket`, `_sum`, `_count` suffixes

| Metric                                          | Description                                 |
| ----------------------------------------------- | ------------------------------------------- |
| `reactor_executor_job_duration_milliseconds`    | Execution time: RUNNING → WRITE_READY       |
| `reactor_job_total_duration_milliseconds`       | Full lifecycle: PENDING → READ_READY/FAILED |
| `reactor_readmodel_index_duration_milliseconds` | Indexing time: WRITE_READY → READ_READY     |

#### Example PromQL queries

```promql
# Queue depth over time (Graph tab)
reactor_queue_depth

# Throughput: completed jobs per second
rate(reactor_queue_jobs_completed_total[1m])

# Failure rate
rate(reactor_queue_jobs_failed_total[1m])

# Average ms per operation (accounts for batch size — matches script output)
sum(rate(reactor_job_total_duration_milliseconds_sum[60s])) /
  sum(rate(reactor_executor_operations_generated_total[60s]))

# Fastest jobs over time (P1), normalised by batch size
# Replace 5 with your --batch-size value
histogram_quantile(0.01, rate(reactor_job_total_duration_milliseconds_bucket[30s])) / 5

# Slowest jobs over time (P99), normalised by batch size
# Replace 5 with your --batch-size value
histogram_quantile(0.99, rate(reactor_job_total_duration_milliseconds_bucket[30s])) / 5

# P99 and P50 job latency
histogram_quantile(0.99, rate(reactor_job_total_duration_milliseconds_bucket[2m]))
histogram_quantile(0.50, rate(reactor_job_total_duration_milliseconds_bucket[2m]))

# Average executor time vs read-model indexing time
rate(reactor_executor_job_duration_milliseconds_sum[1m]) / rate(reactor_executor_job_duration_milliseconds_count[1m])
rate(reactor_readmodel_index_duration_milliseconds_sum[1m]) / rate(reactor_readmodel_index_duration_milliseconds_count[1m])

# Operations generated per second
rate(reactor_executor_operations_generated_total[1m])
```

> **Tip:** For short benchmark runs, switch to an instant query (Table tab) since `rate()` needs at least two scrape points (scrape interval is 5s).

### Profile reactor with Pyroscope and OTel metrics

```bash
docker compose -f scripts/profiling/docker-compose.yml up -d --wait

./scripts/profiling/run-reactor-direct.sh 1 -o 25 -b 5 -l 2000 \
  --db "postgresql://postgres:postgres@localhost:5432/postgres" \
  --pyroscope http://localhost:4040 \
  --otel http://localhost:4318 \
  --file

# Flame graphs: http://localhost:4040
# Metrics:      http://localhost:9090
```

### End-to-end switchboard benchmark

```bash
# Terminal 1: start switchboard (use --runtime bun to compare runtimes)
./scripts/profiling/switchboard-pyroscope.sh --runtime node

# Terminal 2: run workload
tsx docs-create.ts 20 -o 10 -l 5 -p

# Cleanup
tsx docs-reset.ts
```

### Profile switchboard end-to-end with Pyroscope

```bash
docker compose -f scripts/profiling/docker-compose.yml up pyroscope postgres -d

# Terminal 1: start switchboard with Pyroscope (wall:wall + CPU mode)
# Migrations run automatically when --postgres is provided
./scripts/profiling/switchboard-pyroscope.sh \
  --postgres "postgresql://postgres:postgres@localhost:5432/postgres"

# Terminal 2: run workload
tsx docs-create.ts 1 -o 25 -b 5 -l 100

# Open http://localhost:4040 to view the switchboard flame graph
# (use service_name="powerhouse-mono-switchboard" in the query)
```

### Profile switchboard with OTel metrics

```bash
docker compose -f scripts/profiling/docker-compose.yml up otel-collector prometheus postgres -d --wait

# Terminal 1: start switchboard with OTel metrics export
./scripts/profiling/switchboard-pyroscope.sh \
  --postgres "postgresql://postgres:postgres@localhost:5432/postgres" \
  --otel

# Terminal 2: run workload
tsx docs-create.ts 1 -o 25 -b 5 -l 100

# Open http://localhost:9090 to query metrics (Graph tab for time series)
# Use the same PromQL queries as the reactor-direct OTel workflow above
```

Switchboard reads the following env vars on startup:

| Env var                       | Default                      | Description                                                                 |
| ----------------------------- | ---------------------------- | --------------------------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | _(unset — metrics disabled)_ | OTLP HTTP endpoint. The `--otel` flag sets this to `http://localhost:4318`. |
| `OTEL_METRIC_EXPORT_INTERVAL` | `5000`                       | Export interval in milliseconds.                                            |
| `OTEL_SERVICE_NAME`           | `switchboard`                | Service name attached to all exported metrics.                              |

Combine with `--runtime node` and Pyroscope for flame graphs alongside metrics.

# Profiling Scripts

Scripts for benchmarking and profiling the Powerhouse reactor and switchboard.

## Quick Start

```bash
# Start PostgreSQL and Pyroscope
docker compose -f scripts/profiling/docker-compose.yml up -d --wait

# Run a profiling session (1 doc, 25 ops x 100 loops, PostgreSQL + Pyroscope)
# Automatically runs pyroscope-analyse after completion
tsx ./scripts/profiling/reactor-direct.ts 1 -o 25 -b 5 -l 100 \
  --db "postgresql://postgres:postgres@localhost:5432/postgres" \
  --pyroscope http://localhost:4040

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
pnpm --filter @powerhousedao/switchboard run tsc --build
```

Rebuild after any source changes in these packages, otherwise the scripts will run against stale code.

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

# Custom endpoint and document type
tsx docs-create.ts 50 --documentType powerhouse/document-model --endpoint http://localhost:4001/graphql
```

| Flag             | Short | Description                                                 |
| ---------------- | ----- | ----------------------------------------------------------- |
| `N` (positional) |       | Number of documents to create (default: 10)                 |
| `--operations`   | `-o`  | Operations per loop (default: 0)                            |
| `--op-loops`     | `-l`  | Loops per document (default: 1)                             |
| `--doc-id`       | `-d`  | Use existing document(s), can be repeated                   |
| `--endpoint`     |       | GraphQL endpoint (default: `http://localhost:4001/graphql`) |
| `--documentType` |       | Document type for new documents                             |
| `--verbose`      | `-v`  | Show detailed operation payloads                            |
| `--percentiles`  | `-p`  | Show p50/p90/p95/p99 stats                                  |

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

### `switchboard-pyroscope.sh` — Run switchboard with Pyroscope

Starts the switchboard with [Pyroscope](https://pyroscope.io/) continuous profiling enabled.

```bash
./scripts/profiling/switchboard-pyroscope.sh
./scripts/profiling/switchboard-pyroscope.sh --mode legacy
./scripts/profiling/switchboard-pyroscope.sh --postgres "postgresql://postgres:postgres@localhost:5432/reactor"
```

| Flag         | Short | Description                              |
| ------------ | ----- | ---------------------------------------- |
| `--mode`     | `-m`  | Storage mode: `v2` (default) or `legacy` |
| `--postgres` | `-p`  | PostgreSQL database URL                  |

### `switchboard-runtime.sh` — Run switchboard with different runtimes

Starts the switchboard with a chosen runtime (Node.js or Bun) for comparison benchmarks.

```bash
./scripts/profiling/switchboard-runtime.sh --runtime node
./scripts/profiling/switchboard-runtime.sh --runtime bun
./scripts/profiling/switchboard-runtime.sh -r bun -m legacy
```

| Flag         | Short | Description                              |
| ------------ | ----- | ---------------------------------------- |
| `--runtime`  | `-r`  | Runtime: `node` (default) or `bun`       |
| `--mode`     | `-m`  | Storage mode: `v2` (default) or `legacy` |
| `--postgres` | `-p`  | PostgreSQL database URL                  |

## Infrastructure

### `docker-compose.yml`

Provides PostgreSQL 16 and Pyroscope containers for profiling:

```bash
# Start PostgreSQL
docker compose -f scripts/profiling/docker-compose.yml up postgres

# Start Pyroscope (view at http://localhost:4040)
docker compose -f scripts/profiling/docker-compose.yml up pyroscope

# Start both
docker compose -f scripts/profiling/docker-compose.yml up
```

| Service     | Port | Description                                            |
| ----------- | ---- | ------------------------------------------------------ |
| `postgres`  | 5432 | PostgreSQL 16 (user: `postgres`, password: `postgres`) |
| `pyroscope` | 4040 | Grafana Pyroscope continuous profiling server          |

## Typical Workflows

### Benchmark reactor in isolation

```bash
# In-memory (fastest, no I/O)
tsx reactor-direct.ts 10 -o 50 -l 5 -p

# Against PostgreSQL
docker compose -f scripts/profiling/docker-compose.yml up postgres -d
tsx reactor-direct.ts 10 -o 50 -l 5 -p --db "postgresql://postgres:postgres@localhost:5432/postgres"
```

### Profile reactor with Pyroscope

```bash
docker compose -f scripts/profiling/docker-compose.yml up pyroscope postgres -d

# Run profiling — automatically analyses and saves report after completion
tsx reactor-direct.ts 1 -o 25 -b 5 -l 100 \
  --db "postgresql://postgres:postgres@localhost:5432/postgres" \
  --pyroscope
# Output: {timestamp}-pyroscope.md, {timestamp}-pyroscope-{wall,samples,cpu}.json

# Or analyse a previous run manually
tsx pyroscope-analyse.ts 'http://localhost:4040/?query=...'

# Compare two runs
tsx pyroscope-analyse.ts 'http://localhost:4040/?query=...' --baseline ./1771254033-pyroscope

# Open http://localhost:4040 to view flame graphs interactively
```

### End-to-end switchboard benchmark

```bash
# Terminal 1: start switchboard
./scripts/profiling/switchboard-runtime.sh --runtime node

# Terminal 2: run workload
tsx docs-create.ts 20 -o 10 -l 5 -p

# Cleanup
tsx docs-reset.ts
```

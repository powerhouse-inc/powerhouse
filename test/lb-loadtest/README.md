# `@powerhousedao/lb-loadtest`

Sustained-load consistency harness for `apps/switchboard-lb`. Drives a
configurable mix of `createDocument` / `mutateDocument` / `document(identifier:)`
calls through the LB at a target rate and concurrency for a fixed duration,
asserts per-doc backend pinning + write/read consistency on every response,
aggregates failures by category, and reports `PASS` / `FAIL` based on
whether any consistency check failed during the run.

This is **not** a throughput benchmark — it is a load-shaped correctness
test. Failures are bucketed and counted, not bailed on.

## Prerequisite — start the LB stack

The harness talks to a real switchboard cluster behind the LB. From the
repo root:

```bash
docker compose -f apps/switchboard-lb/docker-compose.yml -f apps/switchboard-lb/docker-compose.real.yml --profile observability up --build
```

This builds three switchboard backends (pinned to `6.0.0-dev.202`, the
first published image exposing the in-repo reactor schema) plus the LB,
each backend with its own PGlite volume. The `observability` profile
additionally starts Prometheus (scraping `lb:9090` every 5s) and Grafana
with the pre-provisioned `switchboard-lb` dashboard for watching a run live.

| Service    | URL                             | Notes                                        |
| ---------- | ------------------------------- | -------------------------------------------- |
| LB         | `http://127.0.0.1:8080/graphql` | What the harness drives.                     |
| LB health  | `http://127.0.0.1:8080/health`  | Readiness probe.                             |
| Grafana    | `http://127.0.0.1:3001/`        | Anonymous Admin; dashboard auto-provisioned. |
| Prometheus | `http://127.0.0.1:9091/`        | Direct query UI.                             |

Tear down with:

```bash
docker compose -f apps/switchboard-lb/docker-compose.yml -f apps/switchboard-lb/docker-compose.real.yml --profile observability down -v
```

## Run

```bash
pnpm --filter @powerhousedao/lb-loadtest verify [-- <flags>]
```

The harness waits for `/health` 200, runs a one-shot schema preflight
(asserts `createDocument` / `mutateDocument` / `document(identifier:)` are
present — fails fast if the image is stale), then starts `--concurrency`
workers that emit operations sampled from the workload mix until the
duration deadline.

## Run table

| Scenario              | Command                                                                                                   | What it exercises                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Smoke (default)       | `pnpm --filter @powerhousedao/lb-loadtest verify`                                                         | 60s × c50, default 10/30/60 mix, no rate cap                          |
| 10s sanity            | `... verify -- --duration-sec 10 --concurrency 5 --progress-interval-ms 2000`                             | Quick check that the stack is healthy                                 |
| Sustained heavy       | `... verify -- --duration-sec 300 --concurrency 200 --rate-rps 1000`                                      | 5min @ 1000 ops/s capped — pinning under sustained fan-out            |
| Read-heavy            | `... verify -- --duration-sec 60 --concurrency 100 --create-weight 5 --mutate-weight 15 --read-weight 80` | Read-dominant shape; pool grows slowly                                |
| Write-heavy           | `... verify -- --duration-sec 60 --concurrency 50 --create-weight 20 --mutate-weight 60 --read-weight 20` | Mutate-dominant shape; per-doc reactor serialization under contention |
| Pure creates          | `... verify -- --duration-sec 30 --concurrency 50 --create-weight 1 --mutate-weight 0 --read-weight 0`    | Pool-growth path only; per-create LB hashing                          |
| Rate-capped baseline  | `... verify -- --duration-sec 60 --concurrency 50 --rate-rps 200`                                         | Predictable throughput for cross-run comparison                       |
| Long burn             | `... verify -- --duration-sec 1800 --concurrency 100 --rate-rps 500`                                      | 30min @ 500 ops/s — leak hunt, GC pressure, slow drift                |
| Bigger mutate batches | `... verify -- --duration-sec 60 --concurrency 50 --actions 10`                                           | 10 `SET_MODEL_NAME` actions per `mutate` call                         |

`pnpm` swallows the first `--`; that's why the flag list always starts
with a literal `--`.

## CLI reference

| Flag                       | Default                         | Notes                                                                       |
| -------------------------- | ------------------------------- | --------------------------------------------------------------------------- |
| `--url URL`                | `http://localhost:8080/graphql` | LB GraphQL endpoint. Sets `--health-url` to `<base>/health` automatically.  |
| `--health-url URL`         | derived from `--url`            | Overrides the auto-derived health URL.                                      |
| `--duration-sec N`         | `60`                            | Sole termination control. Workers drain when the deadline is reached.       |
| `--concurrency N`          | `50`                            | Number of parallel async workers.                                           |
| `--rate-rps N`             | unset (unlimited)               | Global ops/sec cap, slot-based pacer shared across workers.                 |
| `--actions M`              | `1`                             | `SET_MODEL_NAME` actions per `mutateDocument` call.                         |
| `--create-weight N`        | `10`                            | Mix weights — normalized internally; at least one must be `> 0`.            |
| `--mutate-weight N`        | `30`                            |                                                                             |
| `--read-weight N`          | `60`                            |                                                                             |
| `--progress-interval-ms N` | `5000`                          | Cadence of `[t=…]` progress lines.                                          |
| `--request-timeout-ms N`   | `30000`                         | Per-fetch `AbortController` timeout. Timeouts record as `<type>.transport`. |
| `--timeout-ms N`           | `60000`                         | `/health` readiness wait at startup.                                        |
| `--skip-schema-preflight`  | off                             | Skip the introspection check (use only when running against a known stack). |

## Output

Progress (every `--progress-interval-ms`):

```
[t=15.0s] ops=2847 (190/s) ok=2832 fail=15 pool=283
```

Final summary:

```
[summary] duration=60.0s ops=11400 throughput=190.0/s ok=11385 fail=15
[mix] create=1140 mutate=3420 read=6840
[dist] 172.24.0.2:8080=3801  172.24.0.3:8080=3793  172.24.0.4:8080=3791
[failures]
  mutate.pin (12):
    K=abc12345-… backend=172.24.0.4:8080 != createBackend=172.24.0.2:8080
    …
PASS|FAIL  <one-liner>
```

Exit code is `1` if any consistency failure was recorded, `0` otherwise.

### Failure categories

| Kind                      | Trigger                                                                           |
| ------------------------- | --------------------------------------------------------------------------------- |
| `<type>.transport`        | HTTP non-200, abort/timeout, or fetch-level error.                                |
| `<type>.gqlErrors`        | Response has a non-empty `errors` array.                                          |
| `create.idMismatch`       | `data.createDocument.id` ≠ the UUID we set on `header.id`.                        |
| `create.backend`          | No `X-LB-Upstream` response header on a successful create.                        |
| `mutate.pin` / `read.pin` | Response backend ≠ the doc's create backend (consistent-hash invariant violated). |
| `mutate.state`            | `data.mutateDocument.state.global.name` ≠ the last `SET_MODEL_NAME` we just sent. |
| `read.id`                 | `data.document.document.id` ≠ the doc we asked for.                               |

`read` deliberately does not assert `state.global.name` — concurrent
mutates of the same doc make any name check racy. The `mutate.state`
check is race-free because the reactor serializes per-doc and
`mutateDocument` returns post-action state, so each call gets its own
last-sent name back regardless of interleavings.

## How the routing key smuggling works

The LB's `lua/route.lua` hashes by `$doc_id`, extracted from the JSON
variables map (`TOP_KEYS = identifier, documentIdentifier, parentIdentifier,
childIdentifier, docId`). For `mutateDocument` / `document(identifier:)`
the routing key is the declared variable. For `createDocument` we
pre-generate a UUID `K`, set `document.header.id = K`, and pass
`{ document, documentIdentifier: K }` — Apollo Server silently ignores
the extra `documentIdentifier` because the operation only declares
`$document`, but the LB still hashes by it. Result: all three operations
on a doc hash to the same backend.

The schema preflight uses the same trick with a fixed string
(`documentIdentifier: "schema-preflight"`) because the LB rejects
requests without a routing key.

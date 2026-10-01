# Registry e2e

The dev tenant in miniature: three registry replicas with their own throwaway `/data`, MinIO for S3, Postgres, and the npm-cache-proxy NGINX (`docker/compose.yml`). Images are built from git refs, so any two commits can be compared on the same stack.

Both scripts take refs as `A=<ref> B=<ref>` (default `A=origin/main B=HEAD`) and need a `ph login` session for Renown tokens in `REGISTRY_E2E_RENOWN_DIR`; without one they fall back to Verdaccio accounts.

## Consistency checks

```bash
pnpm test
```

Publishes a piece package and checks, on NGINX and on every replica: how long until each can serve it, whether `latest` follows a new version, whether concurrent publishes all appear in every listing, and what a replacement or freshly started replica serves. Writes `results/docker-<label>.json` and `results/comparison.md`. `pnpm test:dev` runs the same checks against registry.dev.vetra.io.

## Benchmark

```bash
pnpm bench
```

For each ref, on a fresh stack:

1. **Publish storm:** publishes `BENCH_PACKAGES` (30) piece packages, `BENCH_PUBLISH_CONCURRENCY` (6) at a time, and measures how long each takes to answer on every replica.
2. **Reads:** `BENCH_CONCURRENCY` (16) concurrent clients for `BENCH_LOAD_SECONDS` (15) per endpoint, straight to the replicas: a page of `/packages`, a `/packages` search, a page of `/pieces`, a piece version, a piece bundle, a CDN file and npm metadata.
3. **Rollout:** replaces every replica at once and measures readiness, when each lists every piece again, and the CPU used over 90 seconds.

Container CPU and memory are sampled throughout. Writes `results/bench-<time>.json` and a Markdown table beside it.

## Stress test

```bash
pnpm stress [REF=HEAD]
```

Runs the stack as the alpha tenant deploys it (`docker/compose.stress.yml`): two registry replicas that only record jobs, one worker, Postgres behind a transaction-mode pgbouncer, MinIO, and the NGINX cache, each with its production CPU and memory limit. It seeds `STRESS_SEEDS` (60) piece packages, then ramps each scenario in `STRESS_SCENARIOS` until a step breaks:

- **reads-cached:** the read mix through NGINX with its cache, `STRESS_READ_LEVELS` concurrent clients.
- **reads-uncached:** the same mix with a query NGINX neither serves from nor stores in its cache, so every read reaches a replica.
- **publish:** `STRESS_PUBLISH_LEVELS` publishes per second, issued on a schedule; measures the publish reply, and how long each version takes to be processed once the queue drains.
- **mixed:** uncached reads while `STRESS_MIXED_PUBLISH_RATE` (4) publishes a second arrive.

A step breaks at more than 1% failures, a p99 over 2 s, a restart or OOM kill, or a processing lag p95 over 30 s. Each step records requests per second, latency, failures by status and route, the cores and peak memory each container used against its limits, Postgres connections, and the job queue. The report names the first component to saturate and what was saturated when the step broke, with error lines from the logs. Load comes from up to eight generator processes; a ramp stops early when they are CPU-bound, so a client limit isn't mistaken for the registry's.

`STRESS_STEP_SECONDS` (20) sets the step length, `STRESS_WORKER_CONCURRENCY` (8) the worker's parallel jobs, and `STRESS_KEEP_STACK=1` leaves the stack running afterwards. Writes `results/stress-<time>.md` and a JSON file with every sample.

Without a Renown login it publishes as a Verdaccio account instead.

### Profiling a replica

```bash
STRESS_COMPOSE_OVERRIDE=docker/compose.profile.yml STRESS_SCENARIOS=reads-uncached \
  STRESS_READ_LEVELS=16 STRESS_STEP_SECONDS=5 STRESS_KEEP_STACK=1 pnpm stress
```

`STRESS_COMPOSE_OVERRIDE` adds a compose file to the stack. `docker/compose.profile.yml` opens registry-1's Node inspector on `127.0.0.1:4939`, so a CDP client can wrap any load in `Profiler.start` and `Profiler.stop` and get a `.cpuprofile` of that window alone. Nothing is sampled while no profile records. Tear the stack down with both files: `REGISTRY_IMAGE=registry-e2e:<sha> docker compose -f docker/compose.stress.yml -f docker/compose.profile.yml down -v`. `results/profile-*.md` holds what a profile found.

### Legacy mode

```bash
STRESS_ARCH=legacy pnpm stress REF=origin/main
```

Runs the Verdaccio registry as dev deploys it (`docker/compose.stress-legacy.yml`): two replicas that serve their own publishes from their own `/data`, with the new stack's limits (`REGISTRY_CPUS`, `REGISTRY_MEM`, `REGISTRY_HEAP_MB` and `REGISTRY_NODE_ENV` override them), shared MinIO, Postgres behind pgbouncer, and the NGINX cache. There is no worker, and a stub answers uplink lookups so misses don't reach npmjs. With no queue to watch, processing lag is the time until the first replica serves `/pieces/<name>?version=`; a version that never reaches every replica is reported as divergence without stopping the ramp. After seeding, both replicas are replaced so they reload the package list from S3, and reads use only the seeds every replica then serves. The read mix uses `origin/main`'s routes: flat bundle names (`/-/pieces/bundled/<name with / as ->-<version>.tgz`) and `?limit=30` on `/packages`, so it answers one page as the stateless listing does. Writes `results/stress-legacy-<time>.md`, which also reports how many published names verdaccio's S3 package list lost.

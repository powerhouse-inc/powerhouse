# Stress comparison: legacy vs stateless registry

Back-to-back runs on the same laptop, both with 2 registry replicas limited to 1 core and 1 GB each, pgbouncer in transaction mode, MinIO, and the NGINX cache. Steps are 20 s, the levels are the defaults, and both runs use the same break criteria. The legacy run ended at 16:18:24 UTC and the stateless run started at 16:18:28.

- **Legacy:** `origin/main` (`cbed7db121`), `STRESS_ARCH=legacy`. Report: [stress-legacy-2026-09-30T16-18-24-693Z.md](stress-legacy-2026-09-30T16-18-24-693Z.md).
- **Stateless:** `feat/registry-stateless` at `f6b9ee88c9`, which is `c632f14cc8` plus a harness-only change. Default mode. Report: [stress-2026-09-30T16-28-28-045Z.md](stress-2026-09-30T16-28-28-045Z.md).

Host load, as the 1-minute average when each scenario started:

| Scenario       | Legacy | Stateless |
| -------------- | ------ | --------- |
| reads-cached   | 1.9    | 4.8       |
| reads-uncached | 11.3   | 12.1      |
| publish        | 10.1   | 8.5       |
| mixed          | 2.3    | 3.4       |

Most of this load comes from the run itself: the previous scenario's generators and containers. Docker has 18 CPUs and 8 GB.

## Headline: the legacy replicas never agree

In the legacy design, each replica serves only what it published itself. The results match the previous run.

- **Divergence:** at every publish rate, from 1/s to 64/s, 100% of published versions (2,540 of 2,540) never reached the other replica.
- **S3 package list:** verdaccio's S3 package list keeps only the last writer's view, because each replica rewrites the whole list from its own memory. 1,489 of 3,000 published names were missing from it at the end.
- **Rollouts lose packages:** a fresh replica reloads its list from S3, so a rollout drops packages. After seeding, 0 of 60 seeds were served by both replicas. After both replicas were replaced, 30 were served by both and 30 by neither, although their tarballs were in S3.

In the stateless run, all 2,540 published versions reached `ready` in `registry_versions` after the queue drained, with none unprocessed. Replicas read one shared catalog, so they can't diverge. The stateless mode does not poll each replica for every version.

The report shows divergence in its own column and does not count it as a break, so the capacity ramps below can still be compared.

## Per scenario

| Scenario              | Architecture | Max sustained   | req/s      | p99 at max | First to saturate                  | Break                                           |
| --------------------- | ------------ | --------------- | ---------- | ---------- | ---------------------------------- | ----------------------------------------------- |
| reads-cached          | legacy       | 1024 (no break) | 15.4–22.2k | 185 ms     | nginx (1 core) at 16               | none                                            |
| reads-cached          | stateless    | 1024 (no break) | 14.4–22.0k | 140 ms     | nginx (1 core) at 16               | none                                            |
| reads-uncached        | legacy       | 512             | 3.0–3.4k   | 953 ms     | both replicas' event loops at 16   | p99 4078 ms at 1024                             |
| reads-uncached        | stateless    | 1024 (no break) | 5.9–6.9k   | 1812 ms    | both replicas' event loops at 16   | none                                            |
| publish               | legacy       | 64/s (no break) | 64         | 1877 ms    | both replicas' event loops at 64/s | none on capacity; **100% divergence from 1/s**  |
| publish               | stateless    | 64/s (no break) | 64         | 384 ms     | nothing saturated                  | none; lag p95 22.1 s at 64/s, 670 jobs queued   |
| mixed (4 publishes/s) | legacy       | 128             | 462–576    | 1127 ms    | both replicas' event loops at 32   | p99 4161 ms at 256                              |
| mixed (4 publishes/s) | stateless    | 128             | 1.29–1.48k | 1600 ms    | **Postgres (2 cores) at 16**       | p99 3416 ms at 256, Postgres at 1.92 of 2 cores |

### CPU and memory per component at the breaking or top step

Values are cores used / limit, then peak memory as a percent of the limit.

- **reads-uncached at 1024:**
  - Legacy: registries 0.90 / 0.97 cores, 22–26% memory. MinIO 0.47 of 2 cores. Postgres 0.03 cores.
  - Stateless: registries 1.02 / 1.01 cores, 23% memory. MinIO 0.28 cores. Postgres 0.85 cores. pgbouncer 0.16 cores.
- **publish at 64/s:**
  - Legacy: registries 0.98 / 0.99 cores, 38–41% memory. MinIO 0.43 cores.
  - Stateless: registries 0.34 / 0.35 cores. Worker 0.48 cores, with 670 jobs queued. MinIO 0.49 cores. Postgres 0.2 cores.
- **mixed at 256:**
  - Legacy: registries 0.84 / 1.00 cores, 43–46% memory.
  - Stateless: registries 0.24 / 0.25 cores, 23% memory. Postgres 1.92 of 2 cores. Worker 0.07 cores. MinIO 0.14 cores.

## Why each one broke

- **Cached reads:** NGINX's one core caps both at ~15–22k req/s. The registry is idle.
- **Uncached reads:** both are bound by the Node event loop at about one core per replica, from the first step.
  - The stateless registry now serves about twice as many uncached reads (5.9–6.9k vs 3.0–3.4k req/s), and it didn't break at 1024.
  - This matches the per-replica CPU in [profile-2026-09-30T16-30.md](profile-2026-09-30T16-30.md): the mix now costs ~0.14–0.16 ms of replica CPU per request, down from ~0.30. The artifact cache takes cdn-file from 269 to 40 µs, and the uplink 404 and manifest caches take npm-metadata from 785 to 319 µs.
- **Publish:** the legacy registry writes and indexes a publish on the replica that receives it, so that replica serves it after ~1 s. Its event loops saturate at 64/s. The stateless registries only record the job, and the worker's concurrency of 8 sets the limit: lag p95 is 1.2 s at 32/s and 22.1 s at 64/s.
- **Mixed:** both break at 256 clients.
  - Legacy: ~550 req/s with both event loops saturated. By this scenario each replica holds ~1,500 packages, and `/packages` and `/pieces` scan the whole CDN cache synchronously on every request.
  - Stateless: ~1.3–1.5k req/s, with Postgres at its 2-core limit from the first step and the replicas at 0.25 cores. The catalog holds ~2,600 packages by then.
  - The Postgres cost comes from `/packages`, its search, and `/pieces`. At 2,600 packages a search costs ~59 ms of Postgres CPU, `/pieces` 3.3 ms and `/packages` 1.8 ms, against 2.6, 0.3 and 0.3 ms at 60 packages. The profile has the numbers and the query plan.

## Regressions and open issues

- **Listing and search scale with the catalog in Postgres.** In the previous run, stateless mixed held 1.2–1.3k req/s with the replicas at ~0.89 cores. This run holds 1.3–1.5k with the replicas at 0.25 cores and Postgres saturated. The capacity is about the same, but the bottleneck is now Postgres. Postgres is shared, so adding replicas won't raise it.
  - Search is a seq scan of `registry_packages` that computes `word_similarity`, `ts_rank` and `count(*) OVER ()` for every matching row (46 ms at 2,600 rows). The GIN indexes on `search_doc` and `search_tsv` are not used.
  - The probe names are all alike, so a probe search matches every row. That overstates search cost for a real catalog, but not the per-row scan.
- **Page cache keyed by the full URL.** `sendCachedPage` keys on `req.originalUrl` (`packages/registry/src/middleware.ts:359`), so any extra query parameter misses and adds an entry. The harness's `_nocache` misses on every list request. In the mixed scenario, `catalog.onChange` also clears the cache 4 times a second. A hit costs 42–85 µs, against 157–302 µs for a miss at 60 packages.
- **npm-tarball is unchanged** at ~390 µs, and is now the costliest route in the mix. The artifact cache doesn't cover `readTarball`.
- **Log noise:** replicas log express-rate-limit's `ValidationError` about `X-Forwarded-For` without `trust proxy`. Verdaccio's user-route limiter likely keys on NGINX's address rather than the client's.

## What doesn't map one to one

- **Publish lag:** the two architectures measure it differently.
  - Stateless: worker queue lag, from the publish reply until `registry_versions` is `ready`.
  - Legacy: time until the first replica serves `/pieces/<name>?version=`, polled once a second, so ~1 s is the floor.
  - Reaching the other replica is reported as divergence, not lag.
- **Routes:** the legacy mix uses `origin/main`'s paths: flat bundle names (`/-/pieces/bundled/<name with / as ->-<version>.tgz`), and `?limit=30` on `/packages` and its search, so both return one 30-item page. Legacy `/pieces` has no paging and returns the whole catalog. The previous legacy run read `/packages` without `limit`, which returns every package.
- **Catalog:** legacy reads use only the 30 seeds both replicas serve after the rollout. The stateless reads use all 60.

## Caveats

- **Auth:** both runs publish as a Verdaccio account, not with Renown tokens.
- **Uplink:** legacy uplink misses go to a local 404 stub, faster than npmjs would answer. The stateless stack uses npmjs, and its uplink 404 cache keeps repeat reads off npmjs.
- **Rollout step:** the legacy run replaces both replicas after seeding, so it has a warm restart the stateless run doesn't.
- **Host:** the laptop is shared with other agents. See the host load table above.
- **Dev limits:** the dev tenant's real limits (3 replicas, 4 cores and 4 GiB each) were not run.

## Previous run

`cbed7db121` (legacy) vs `774ecb7232` (stateless, before the SQL search, the caches and the hardening), 20 s steps. Reports: [stress-legacy-2026-09-30T14-05-44-528Z.md](stress-legacy-2026-09-30T14-05-44-528Z.md) and [stress-2026-09-30T14-16-23-765Z.md](stress-2026-09-30T14-16-23-765Z.md). Host load at start: ~3 for legacy and ~4–5 for stateless.

| Scenario       | Legacy: max, req/s, p99, break                    | Stateless `774ecb7232`: max, req/s, p99, break                |
| -------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| reads-cached   | 1024, 15.6–20.6k, 105 ms, none                    | 1024, 15.5–18.7k, 287 ms, none                                |
| reads-uncached | 512, 2.8–3.2k, 996 ms, p99 5039 ms at 1024        | 1024, 2.7–3.6k, 1972 ms, none                                 |
| publish        | 64/s, 64, 1917 ms, none; 100% divergence from 1/s | 64/s, 64, 1964 ms, none; lag p95 28.6 s at 64/s               |
| mixed          | 128, ~460, 1735 ms, p99 6773 ms at 256            | 128, ~1.2–1.3k, 678 ms, p99 2573 ms at 256 (registries ~0.89) |

That run also found 1,483 of 3,000 names missing from the legacy S3 package list, and 30 of 60 seeds served by neither replica after a rollout.

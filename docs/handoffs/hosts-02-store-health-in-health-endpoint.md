# Make reactor-api's /health report store health

**Type:** Implement
**Size:** M   **Area:** packages/reactor (storage, inspector, core), packages/reactor-api, apps/switchboard

> **Correction to the item as filed:** the "poisoned group-commit store" does not occur on reactor-api hosts. `withGroupCommitPGlite` is used only by Connect (`apps/connect/src/reactor.worker.ts:257`, `pglite.db.ts:196`) and reactor-monitor (`packages/reactor-monitor/src/build-reactor.ts:203`). On Switchboard, a poisoned PGlite session, a PGlite wasm abort, a dead PGlite worker thread and a dead projection worker already take the process down (`apps/switchboard/src/pglite-dialect.ts:18-32`, `pglite-store.mts:31-55`, `server.mts:746-757`). The static `/health` is real; what it misses is listed under Problem.

## Context
`/health` is registered before auth and always answers `200 OK` (`packages/reactor-api/src/server.ts:850-851`). `/ready` answers 503 until the host calls `markReady` (`server.ts:853-857`, gate at :404-412; Switchboard calls it at `apps/switchboard/src/server.mts:1788`). Store health exists only through the inspector: `createReactorInspector` reports a group-commit store's health and otherwise `tracked: false, healthy: false` (`packages/reactor/src/inspector/from-module.ts:24-38`, :63-64; type at `src/inspector/types.ts:63-74`). reactor-api builds its inspection source without a `storageHealth` provider (`server.ts:1763-1767`), so server hosts always report untracked. switchboard-lb probes `/health` every 2s for observability only; it never removes a peer from the ring (`apps/switchboard-lb/ARCHITECTURE.md:246`, :262, :329).

## Problem
- A Switchboard on Postgres whose database is unreachable, or whose host pool cannot hand out a connection, keeps answering `/health` 200. The host pool is built with no acquire timeout (`apps/switchboard/src/server.mts:398-412`; `REACTOR_DB_ACQUIRE_TIMEOUT_MS` applies to worker pools, `worker-pool.mts:86`), so a stuck pool shows only as latency.
- Between a fatal condition and process exit (shutdown hooks and grace), `/health` and `/ready` still answer 200.
- Hosts that embed reactor-api with PGlite but not Switchboard's handlers get nothing on a poisoned session: `HardenedPGliteDialect` defaults `onPoisoned` to a no-op (`packages/reactor/src/storage/kysely/pglite-dialect.ts:183`), and `/health` keeps answering 200.
- The inspector's `storageHealth` reads `tracked: false` on every server host, so the monitor cannot tell a dead store from an untracked one.
- `apps/switchboard-lb/ARCHITECTURE.md:329` says a `/readyz` is a follow-up; `/ready` exists, so that line is stale.

## Goal
`/health` (or a documented sibling) returns non-200 when the reactor's store cannot serve, server hosts report `tracked: true` storage health to the inspector, and orchestrators have one documented probe for each of liveness and readiness.

## Acceptance criteria
- A store-health provider on the built reactor module for every store kind: Postgres (bounded `select 1` through the reactor's Kysely, cached for a short TTL so probes do not load the pool), in-process PGlite and `ThreadedPGlite` (latched unhealthy on `onPoisoned`, abort or exit), group-commit (existing `storage.health`, `src/storage/kysely/group-commit-storage.ts:40`).
- reactor-api `/health` uses it: 200 with a small JSON body when healthy, 503 when not. Shutting down flips both `/health` and `/ready` to 503.
- reactor-api passes the provider into `createReactorInspectionSource`, so `inspection { storageHealth }` reports `tracked: true` on Switchboard.
- Tests: reactor-api route tests for healthy, Postgres unreachable (stopped container or bad URL) and poisoned PGlite; existing `/health` tests updated (`packages/reactor-api/test/boot-services.test.ts:56`, `apps/switchboard/test/boot-port-zero.test.ts:75-97`).
- Docs: `apps/switchboard/README.md:513` describes both probes; `apps/switchboard-lb/ARCHITECTURE.md:329` corrected.

## Constraints and invariants
- `/health` stays before auth and cheap; it must not run a query per request against a saturated pool (the LB probes every 2s per worker, `ARCHITECTURE.md:329`).
- A poisoned PGlite session is never recovered in process (`packages/reactor/src/storage/storage-flush.ts:21-27`, `pglite-dialect.ts:126-132`): latch, never clear.
- Untracked must not read as healthy (`src/inspector/types.ts:63`).
- Existing `IStorageHealthProvider`/`StorageHealthTracker` (`src/storage/storage-health.ts:1-21`) and `IInspectorStorageHealthProvider` already exist; extend rather than add a third shape.
- The LB must keep pinning on failure: a 503 from `/health` must not change routing (`ARCHITECTURE.md:262`).

## Suggested approach
1. Add a provider factory in packages/reactor (next to `storage-health.ts`) and expose it on `InProcessReactorModule` (`src/core/types.ts`) from `buildModule`, covering Kysely-on-Postgres with a TTL ping.
2. For PGlite, let the host pass its poison/abort/exit signals in: Switchboard's `reactorPgliteDialectOptions` and `onPgliteAbort`/`onPgliteWorkerExit` mark the tracker before triggering the fatal shutdown.
3. Replace the static route at `server.ts:851`; wire the same provider into `createReactorInspectionSource` at :1764.
Open question (ask before coding): liveness vs readiness. A 503 on a k8s liveness probe restarts the pod, which is the right recovery for a poisoned PGlite session but may cause restart loops during a short Postgres outage. Options: Postgres failure flips `/ready` only and poison flips `/health`; or `/health` stays liveness and a new `/health/store` carries store state.

## Verify
- `pnpm build` in packages/reactor first (reactor-api loads it from dist).
- In packages/reactor, packages/reactor-api, apps/switchboard: `pnpm tsc --build`, `pnpm test`, `pnpm lint`.
- Manual: run Switchboard against Postgres, stop the database, `curl -i localhost:<port>/health` returns 503 within the TTL.

## Working rules
- Work in a git worktree on a new branch; the main checkout is shared with other sessions — never `checkout -b` in it.
- Read docs/TROUBLESHOOTING.md first. Workspace deps load from dist/: run `pnpm build` in each dependency you touched (and @powerhousedao/shared if changed) before trusting a test result.
- Verify with the real commands (`pnpm tsc --build`, `pnpm test`, `pnpm lint`) in each package you touched. No retry logic to paper over flakes.
- Keep comments terse; default to none.
- Open the PR with `ghx pr create --input pr.json` (start from `ghx pr create --example`); the description is 2–3 sentences, no sections. Wait for CI with `ghx ci wait <pr>`. Merge with a merge commit, not squash.

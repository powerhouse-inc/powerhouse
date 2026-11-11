# Define a store-engine seam for the reactor's write side

**Type:** Design first (write an ADR/plan, stop for review before code)
**Size:** L   **Area:** packages/reactor (executor, storage, cache, catch-up, sync, core), packages/reactor-hypercore

## Context
Every job runs inside `IExecutionScope.run` (`packages/reactor/src/executor/execution-scope.ts:59-64`). `KyselyExecutionScope` (:94-158) opens one Kysely transaction per job and binds to it the operation store, operation index, keyframe store, write cache, document meta cache, collection membership cache, per-document purge locks, write identity and the purger. `ReactorBuilder` takes only a Kysely database (`withKysely`, `src/core/reactor-builder.ts:663-666`) and constructs `KyselyOperationStore` (:1072) and `KyselyExecutionScope` (:1194) itself; the executor worker does the same (`src/executor/worker/build-worker-executor.ts:160`, :201). `HypercoreOperationStore` implements `IOperationStore` (`packages/reactor-hypercore/src/hypercore-operation-store.ts:41`) but no builder accepts it and no host uses it.

## Problem
Swapping the store engine means swapping all of these together, because they share one transaction or depend on Postgres semantics:
- Transaction scoping is Kysely-specific: `withTransaction` lives on `KyselyOperationStore` (`src/storage/kysely/store.ts:58`) and `KyselyOperationIndex` (`src/cache/kysely-operation-index.ts:167`), not on `IOperationStore` (`src/storage/interfaces.ts:143`) or `IOperationIndex` (`src/cache/operation-index-types.ts:50`).
- AppendCondition is guarded with `pg_advisory_xact_lock(hashtext(key))` (`store.ts:310-323`) plus a `WHERE NOT EXISTS` insert.
- Purge locks use `pg_advisory_xact_lock[_shared]` (`src/storage/kysely/document-purges.ts:13-25`), wired through `documentLocks` (`execution-scope.ts:130-145`).
- Write identity is written in the job's transaction (`execution-scope.ts:147`, `src/storage/kysely/write-identity-store.ts`, migration `028_create_write_identity.ts`).
- Read-side catch-up's settled watermark reads `pg_current_snapshot`/`txid_current_snapshot` and refuses PG < 10 (`src/catch-up/settled-watermark.ts:30-50`).
- Sync refill (the outbox) reads the operation index up to `watermark.settledThrough` (`src/sync/sync-manager.ts:3561-3569`), so the index and the watermark must agree with the store.
- `HypercoreOperationStore` checks `AppendCondition` in process with no locks (`hypercore-operation-store.ts:54-100`), which assumes a single writer. The executor worker pool has several writers per database.
- `DefaultExecutionScope` (`execution-scope.ts:66-92`) exists but runs with `NOOP_DOCUMENT_LOCKS` and no purger: it is not a safe default for a durable store.

## Goal
An approved ADR that defines what a store engine must provide (one interface or a bundle), how a builder accepts it, and which features (worker pool, catch-up, purge, sync) each engine can support.

## Acceptance criteria
- ADR in `docs/adr/` (use the `adr` skill; next number is 0009). Stop for review before code.
- The ADR lists every component bound to the job transaction and every Postgres-specific primitive above, with the replacement contract for each.
- It states the capability matrix: which builder options (`withWorkerPool`, `withProjectionShards`, catch-up, purges, sync) an engine without cross-process locks may enable, and where the builder refuses the rest.
- If approved: a builder hook (for example `withExecutionScopeFactory` or `withStoreEngine`), Kysely as the default, and a contract test suite any engine runs (append conditions under concurrency, purge lock exclusion, watermark never passes an uncommitted ordinal).

## Constraints and invariants
- One transaction per job covers the operation append, index rows, write identity and purge checks (`execution-scope.ts:111-157`); a partial commit must be impossible.
- `findIdempotentReplay` matches only same `(documentId, scope, branch, index)` with the same opId and skip (`src/storage/kysely/store.ts:409`); replay semantics must not widen.
- The settled watermark must never pass an ordinal whose transaction is still open; catch-up and sync refill both depend on it.
- Executors and projection workers address the same database as the host (`reactor-builder.ts:1778-1790`, :1842-1860).
- `withGroupCommitPGlite` is incompatible with worker pools and custom executors (`reactor-builder.ts:831-860`); a new engine must state its flush contract the same way.

## Suggested approach
Questions and options for the ADR:
1. Seam shape: (a) an `IExecutionScope` factory plus engine-provided `IOperationIndex`, `IWriteIdentityStore`, keyframe store and watermark probe; (b) a single `IStoreEngine` bundle that the builder and worker init both consume; (c) keep Kysely and support only other SQL dialects through Kysely.
2. Locks: are purge and append locks part of the engine contract, or does the engine declare "single writer" and the builder refuse worker pools?
3. Watermark: an `ISettledWatermark` probe per engine (`src/catch-up/types.ts:10`); what a log-structured store (hypercore) reports.
4. Worker init: `DbConfig` is Postgres-shaped (`src/executor/worker/protocol.ts:147-160`); how a worker opens a non-Postgres engine.
5. Migrations: `src/storage/migrations/` owns the schema; what a non-SQL engine runs instead.
Open question: whether reactor-hypercore is a real target or only a proof of the interface. Ask before designing around it.

## Verify
- After code, in `packages/reactor`: `pnpm tsc --build`, `pnpm test`, `pnpm lint`. In `packages/reactor-hypercore` (if touched): same three. Run `pnpm build` in packages/reactor before downstream packages.
- Throughput: the default Kysely path must not regress; record before/after with `/bench-record` (harness in `packages/reactor/bench`, reference numbers in `bench/test/integration/BASELINE.md`).

## Working rules
- Work in a git worktree on a new branch; the main checkout is shared with other sessions — never `checkout -b` in it.
- Read docs/TROUBLESHOOTING.md first. Workspace deps load from dist/: run `pnpm build` in each dependency you touched (and @powerhousedao/shared if changed) before trusting a test result.
- Verify with the real commands (`pnpm tsc --build`, `pnpm test`, `pnpm lint`) in each package you touched. No retry logic to paper over flakes.
- Keep comments terse; default to none.
- Open the PR with `ghx pr create --input pr.json` (start from `ghx pr create --example`); the description is 2–3 sentences, no sections. Wait for CI with `ghx ci wait <pr>`. Merge with a merge commit, not squash.

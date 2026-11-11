# Decide whether the executor worker pool can run on PGlite

**Type:** Design first (write an ADR/plan, stop for review before code)
**Size:** M   **Area:** packages/reactor (executor/worker, core), packages/reactor-api (pglite/worker), apps/switchboard

> **Correction to the item as filed:** "PGlite can't be shared across threads" is incomplete. PGlite already runs in its own worker thread behind a message proxy: `ThreadedPGlite` (`packages/reactor-api/src/pglite/worker/threaded-pglite.ts:85-97`, enabled by `PH_PGLITE_WORKERS`, wired at `apps/switchboard/src/server.mts:416-432`). The missing piece is that executor workers can only open Postgres, and `ThreadedPGlite` serves one client thread.

## Context
With `REACTOR_WORKERS=N`, executor workers run jobs off the host event loop. Run 10 found the host loop, not Postgres, capped throughput (`packages/reactor/bench/test/integration/BASELINE.md`), which is why the pool matters. Each worker receives a `DbConfig` in its init message (`packages/reactor/src/executor/worker/protocol.ts:147-160`, required at :225) and builds its own `KyselyOperationStore` and `KyselyExecutionScope` over a pg pool (`src/executor/worker/build-worker-executor.ts:160-210`). Switchboard refuses the pool, and the projection worker, without a Postgres URL (`apps/switchboard/src/boot-preconditions.mts:58-62`, :76-80); `ph host check` reports the same list (:3).

## Problem
- `DbConfig` is host/port/user/password only; there is no way to hand a worker an embedded store.
- One PGlite instance is single-session: the hardened dialect serializes statements through one lease (`packages/reactor/src/storage/kysely/pglite-dialect.ts:29-41`), and `ThreadedPGlite` runs requests one at a time with a reserve/release admission per transaction (`threaded-pglite.ts:231-249`; protocol `pglite/worker/protocol.ts:105-135`).
- `ThreadedPGlite` lives in reactor-api, is owned by the host thread's `Worker`, and has no way for a second thread to connect to it (no `MessagePort` handoff).
- `KyselyExecutionScope` holds one transaction per job (`src/executor/execution-scope.ts:111-157`), so with one PGlite session N workers serialize at the store. The only gain is reducer/derivation CPU moved off the host loop; whether that pays for the message hops is unmeasured.
- Group-commit PGlite cannot be combined with a worker pool (`src/core/reactor-builder.ts:849-853`); Switchboard's server PGlite does not use group commit (ADR 0004, `docs/adr/0004-pglite-nodefs-over-atomic-snapshot.md`).

## Goal
An approved ADR that decides, with a bench result, whether worker-pool-on-PGlite is supported; if yes, the connection model and what Switchboard's preconditions become.

## Acceptance criteria
- A bench run (single-node PGlite Switchboard or bench host on PGlite) comparing in-process executor against N workers sharing one PGlite thread, recorded with `/bench-record`. The ADR states the pass criterion before the run.
- ADR in `docs/adr/` (use the `adr` skill; next number is 0009). Stop for review before code.
- If approved: a worker init variant that carries a PGlite connection (for example a `MessagePort` to the PGlite thread), multi-client admission in the PGlite worker, `boot-preconditions.mts` relaxed only for the supported combination, and tests for interleaved transactions from two workers.
- If rejected: `boot-preconditions.mts` messages and Switchboard docs say why in one sentence, and this item is closed.

## Constraints and invariants
- One transaction per job with purge locks and write identity inside it (`execution-scope.ts:111-157`). Advisory locks work on PGlite but only within its single session.
- A poisoned PGlite session is never reused; Switchboard takes the fatal shutdown (`apps/switchboard/src/pglite-dialect.ts:18-32`, `pglite-store.mts:77-95`). Worker clients must observe the same.
- Statement deadlines start only after admission (`threaded-pglite.ts:231-238`); queued time must not count against them.
- Workers and host address the same store (`reactor-builder.ts:1778-1790`).
- The dev-mode refusal (Vite-loaded models cannot cross threads, `boot-preconditions.mts:52-56`) and the trust-policy refusal (:25-46) stay.

## Suggested approach
Questions for the ADR:
1. Is the CPU win real? Profile a PGlite Switchboard under load: share of host loop time in reducers vs in PGlite I/O and dialect overhead.
2. Connection model options: (a) transfer a `MessagePort` per executor worker to the PGlite thread and give `ThreadedPGlite` a multi-client admission queue; (b) workers execute reducers only and send the write set to the host, which commits (changes the executor protocol); (c) PGlite wire-protocol socket server shared by workers (single session, so same serialization).
3. Where the code lives: `ThreadedPGlite` is in reactor-api, the worker builder in reactor. Which package owns the PGlite client a worker uses?
4. Effect on the projection worker, which has the same refusal (:76-80).
Open question: does any deployment need this (single-node PGlite hosts under load), or is Postgres the answer for anyone who needs workers? Ask before building.

## Verify
- Bench: `packages/reactor/bench` harness and `/bench-record`; compare against `bench/test/integration/BASELINE.md`.
- After code: `pnpm tsc --build`, `pnpm test`, `pnpm lint` in packages/reactor, packages/reactor-api and apps/switchboard. Run `pnpm build` in packages/reactor, then packages/reactor-api, before apps/switchboard tests.

## Working rules
- Work in a git worktree on a new branch; the main checkout is shared with other sessions — never `checkout -b` in it.
- Read docs/TROUBLESHOOTING.md first. Workspace deps load from dist/: run `pnpm build` in each dependency you touched (and @powerhousedao/shared if changed) before trusting a test result.
- Verify with the real commands (`pnpm tsc --build`, `pnpm test`, `pnpm lint`) in each package you touched. No retry logic to paper over flakes.
- Keep comments terse; default to none.
- Open the PR with `ghx pr create --input pr.json` (start from `ghx pr create --example`); the description is 2–3 sentences, no sections. Wait for CI with `ghx ci wait <pr>`. Merge with a merge commit, not squash.

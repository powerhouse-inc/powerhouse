# Decide how projection could run as a separate service

**Type:** Design first (write an ADR/plan, stop for review before code)
**Size:** L   **Area:** packages/reactor (projection, read-models, events, job-tracker), apps/switchboard

> **Correction to the item as filed:** READ_READY is decided jointly, not host-side alone. The worker decides it for the built-in kinds: its local bus fires `JOB_READ_READY` after `document-view`/`document-indexer` index (`packages/reactor/src/projection/projection-worker/build-projection-stack.ts:372`) and it posts `read-ready` (`projection-worker/run-projection-worker.ts:235-241`). With a bare `ProjectionShardManager` the host only relays that (`projection-shard-manager.ts:540-545`). In the hybrid coordinator Switchboard runs, the host then runs its own pre-ready models on a per-queueKey chain before emitting (`hybrid-projection-coordinator.ts:71-100`). Moving projection out of process is blocked by the host-side state listed under Problem.

## Context
`ProjectionShardManager` implements `IReadModelCoordinator` on the host and talks to the projection worker over `IProjectionTransport` (`packages/reactor/src/projection/transport.ts:25-36`). Only `createProjectionThreadTransport` (worker_threads) exists (:38-64). Switchboard runs the hybrid coordinator: the worker indexes `document-view`/`document-indexer`, and the host runs other pre-ready models, subscriptions and processors after the worker's read-ready (`src/projection/hybrid-projection-coordinator.ts:36-80`; wired at `apps/switchboard/src/server.mts:1035-1042`). The worker opens its own Postgres pool from a `DbConfig` (`src/core/reactor-builder.ts:1863-1867`).

## Problem
State and consumers that assume the projector shares the host process:
- Consistency trackers live on the host. The host keeps each job's coordinates in `pendingCoordinates` keyed by jobId (`projection-shard-manager.ts:140-160`, set at :476-481) because `readmodel-indexed` carries only a count, then advances trackers from it (:613-633). `ConsistencyToken` waits resolve against those trackers (`src/read-models/base-read-model.ts:421-430`).
- Ordering: `acceptReadReady` assumes trackers were advanced before read-ready arrives ("port FIFO", `hybrid-projection-coordinator.ts:71-72`). A network transport must keep per-shard FIFO or carry coordinates in the message.
- READ_READY consumers are host subscribers: `InMemoryJobTracker` (`src/job-tracker/in-memory-job-tracker.ts:61`), `JobAwaiter` (`src/shared/awaiter.ts:120`), telemetry counters (`src/telemetry/counters.ts:42`).
- No durability: a job sent to a shard that is not ready is dropped and reported through `onShardFatal` (`projection-shard-manager.ts:490-527`); Switchboard then exits (`server.mts:746-757`). A remote service with partial outages cannot use "exit on loss".
- Catch-up sweeps run in the worker and report back through `readmodel-swept` (:580-590) and `catchup-status`.
- The write cache is invalidated only by the committing process (`src/decision/types.ts:26-33`); the read gate reads through the read side instead, so a remote projector must not assume host cache coherence.

## Goal
An approved ADR that states whether a projector in another process or service is supported, the protocol between it and the host (or what replaces the host's role), and the failure contract.

## Acceptance criteria
- ADR in `docs/adr/` (use the `adr` skill; next number is 0009). Stop for review before code.
- The ADR names the transport, message ordering and loss guarantees, where trackers live, and how a reconnecting projector resumes (cursor from `ViewState` plus catch-up).
- It states the first measurable win (event-loop or throughput) against `packages/reactor/bench/test/integration/BASELINE.md` Run 10/11, or recommends not doing it.
- If approved: a non-thread `IProjectionTransport` with a contract test shared by both transports.

## Constraints and invariants
- Only `READ_READY` and `FAILED` are terminal; `WRITE_READY` is not (`src/shared/types.ts:184-195`). Every job must get exactly one READ_READY, including empty jobs (`projection-shard-manager.ts:453-466`).
- `JOB_FAILED` is reserved for unwritten operations; a projection loss must not emit it (`projection-shard-manager.ts:493-500`).
- Trackers advance only after a successful index (`advanceConsistencyTrackers`, :604-633).
- Projector and host must address the same database (`reactor-builder.ts:1842-1860`).
- Read models registered through `withReadModel` are rejected with projection shards (`reactor-builder.ts:936-966`).

## Suggested approach
Questions and options for the ADR:
1. Keep the host as coordinator and only move the projector (remote `IProjectionTransport`), or move READ_READY ownership out of the host entirely (trackers and job status read from the projector or from the database)?
2. Transport options: socket/HTTP stream per shard; a Postgres-backed channel (LISTEN/NOTIFY plus a table); reuse of reactor-browser's cross-process bus proxy (`packages/reactor-browser/src/rpc/event-bus-proxy.ts:8`) as a pattern.
3. Make `readmodel-indexed` self-describing (carry coordinates) so the host need not hold `pendingCoordinates`.
4. Replace drop-and-exit with resend from the operation index: the projector resumes from its `ViewState` cursor and catch-up fills gaps; READ_READY for in-flight jobs is then late, not lost. Define the awaiter timeout behaviour.
5. Interaction with write-01 (multiple projectors) and with T-040 in `packages/reactor/bench/TASKS.jsonl` (post-ready work delays the next READ_READY).

## Verify
- Bench: `packages/reactor/bench` harness (`bench/test/integration/run10.sh`, `run11.sh`, `BASELINE.md`), records via `/bench-record`.
- After code, in `packages/reactor`: `pnpm tsc --build`, `pnpm test`, `pnpm lint`; `pnpm build` there before `apps/switchboard` `pnpm test`.

## Working rules
- Work in a git worktree on a new branch; the main checkout is shared with other sessions — never `checkout -b` in it.
- Read docs/TROUBLESHOOTING.md first. Workspace deps load from dist/: run `pnpm build` in each dependency you touched (and @powerhousedao/shared if changed) before trusting a test result.
- Verify with the real commands (`pnpm tsc --build`, `pnpm test`, `pnpm lint`) in each package you touched. No retry logic to paper over flakes.
- Keep comments terse; default to none.
- Open the PR with `ghx pr create --input pr.json` (start from `ghx pr create --example`); the description is 2–3 sentences, no sections. Wait for CI with `ghx ci wait <pr>`. Merge with a merge commit, not squash.

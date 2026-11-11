# Let the inspector and queue telemetry work with any queue that supports them

**Type:** Implement
**Size:** S   **Area:** packages/reactor (inspector, core/reactor-builder)

**Deck correction:** the deck overstates this. The inspector is already typed against a structural `IInspectableQueue`; only two `instanceof InMemoryQueue` checks block a custom queue.

## Context
`ReactorBuilder.withQueue` accepts any `IQueue` (`packages/reactor/src/core/reactor-builder.ts:699-701`). The inspector (queue tab, pause/resume levers in reactor-monitor, Connect and the reactor-api inspection source) and memory telemetry's `queue` gauge only light up for `InMemoryQueue`. The inspector itself is already typed against a structural interface, `IInspectableQueue` (`src/inspector/types.ts:220-227`, exported from `src/inspector/index.ts:50`), with `paused`, `pause`, `resume`, `getPendingJobs`, `getExecutingJobIds`, `getJob`.

## Problem
Two call sites narrow to the class:
- `createReactorInspector` passes the queue only if `module.queue instanceof InMemoryQueue` (`src/inspector/from-module.ts:47`). A custom queue that implements `IInspectableQueue` is dropped, so `getQueueState` returns the empty state (`src/inspector/reactor-inspector.ts:235-238`) and pause/resume reject with "its queue is not the in-memory one" (`reactor-inspector.ts:127-128`, :341-360).
- The telemetry gauge is registered only for `queue instanceof InMemoryQueue` (`reactor-builder.ts:1691-1693`), calling `InMemoryQueue.stats()` (`src/queue/queue.ts:47-60`), which is not on any interface.
- The same pattern gates the tracker gauge (`reactor-builder.ts:1688`); out of scope here (see the job-tracker task).

## Goal
A custom `IQueue` that also implements `IInspectableQueue` gets the queue tab and pause/resume, and one that exposes `stats()` gets the `queue` gauge, with no change for `InMemoryQueue`.

## Acceptance criteria
- A structural type guard (e.g. `isInspectableQueue(q)`) replaces the `instanceof` at `from-module.ts:47`.
- A small exported interface for telemetry stats (e.g. `IQueueStats { stats(): Record<string, number> }`) and a guard replace the `instanceof` at `reactor-builder.ts:1691`; `InMemoryQueue` declares both interfaces (`queue.ts:27`).
- Tests: in `test/inspector/reactor-inspector.test.ts` (or a new test), a non-InMemory queue stub implementing `IInspectableQueue` shows pending jobs and can be paused/resumed through `createReactorInspector`; a builder or telemetry test shows the gauge registered for a stub with `stats()`.
- Docstring on `NO_INSPECTABLE_QUEUE` (`reactor-inspector.ts:127-128`) reworded to name the missing interface, not the class.

## Constraints and invariants
- `IQueue` (`src/queue/interfaces.ts:14-148`) stays unchanged; inspection stays optional, not part of the queue contract (`inspector/types.ts:219` says so).
- `InMemoryQueue.resume()` re-emits `JOB_AVAILABLE` per non-empty queue (`queue.ts:707-722`) so executors wake; a custom queue's `resume` must do the equivalent. Document that on `IInspectableQueue.resume`.
- Inspector results must stay plain data (`inspector/types.ts:229`, "plain-data results for any transport").
- Guards must not throw on objects that lack the members.

## Suggested approach
1. In `src/inspector/types.ts` add `isInspectableQueue(value: unknown): value is IInspectableQueue` checking each member's type; use it in `from-module.ts:47`.
2. Add `IQueueStats` next to `IQueue` (or in `telemetry/`), make `InMemoryQueue implements IQueue, IInspectableQueue, IQueueStats`, and switch `reactor-builder.ts:1691`.
3. Export the new interface and guard from `index.ts` / `src/inspector/index.ts` if other packages need them.
Open question (record in the PR, do not solve): for a queue shared by several hosts, does `pause` stop this host's consumers or every host? The current lever assumes one process.

## Verify
In `packages/reactor`: `pnpm tsc --build`, `pnpm test`, `pnpm lint`. No dependency changes, so no dist rebuild needed before reactor tests. If you export new symbols, `pnpm build` in `packages/reactor` and run `pnpm test` in `packages/reactor-monitor` (reads reactor from dist).

## Working rules
- Work in a git worktree on a new branch; the main checkout is shared with other sessions — never `checkout -b` in it.
- Read docs/TROUBLESHOOTING.md first. Workspace deps load from dist/: run `pnpm build` in each dependency you touched (and @powerhousedao/shared if changed) before trusting a test result.
- Verify with the real commands (`pnpm tsc --build`, `pnpm test`, `pnpm lint`) in each package you touched. No retry logic to paper over flakes.
- Keep comments terse; default to none.
- Open the PR with `ghx pr create --input pr.json` (start from `ghx pr create --example`); the description is 2–3 sentences, no sections. Wait for CI with `ghx ci wait <pr>`. Merge with a merge commit, not squash.

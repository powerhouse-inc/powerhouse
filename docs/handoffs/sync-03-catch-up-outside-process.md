# Design read-side catch-up for consumers outside the reactor process

**Type:** Design first (write an ADR/plan, stop for review before code)
**Size:** M   **Area:** packages/reactor (catch-up), packages/reactor-api (GraphQL), docs

## Context

`operation_index_operations.ordinal` is a serial column. Values are not dense, and a concurrent transaction can commit a lower ordinal after a higher one. Read-side catch-up (#3124) handles this. `SettledWatermark` finds the highest ordinal below which nothing more can appear (`packages/reactor/src/catch-up/settled-watermark.ts:225-…`, probe at `:161-222`). Each consumer keeps a `ContiguousCursor` (`catch-up/contiguous-cursor.ts`), and `CatchUpScheduler` sweeps consumers up to the watermark (`catch-up/scheduler.ts`). They are built in the host process (`core/reactor-builder.ts:1149-1160`) or in the projection worker thread (`projection/projection-worker/build-projection-stack.ts:338-351`). Consumers implement `ICatchUpConsumer` (`catch-up/types.ts:40-50`): processors, read models, the projection worker and group re-evaluation.

## Problem

Verified on main b957b9e811:
- Every consumer runs in-process against the reactor's own Kysely handle. Cursors live in that database: `ViewState` for read models and `ProcessorCursor` for processors (`admin/catch-up-admin.ts:53-60`).
- A remote reactor is already safe. Sync derivation stops at `settledThrough` (`sync/sync-manager.ts:3561`), so the gap rule holds across `pollSyncEnvelopes`.
- A non-reactor consumer in another service has nothing to use:
  - Over the network, nothing serves operations by ordinal range. The reactor subgraph has `operations`, `documentOperations` and sync envelopes (`reactor-api/src/graphql/reactor/schema.graphql:111`, `:729`, `:779`), and `documentChanges` is live-only (`:995`). `catchUpStatus` on the inspection subgraph exposes the watermark status but no feed (`graphql/inspection/schema.ts:373`).
  - On the same Postgres, the building blocks are exported (`catch-up/index.ts`), and `pnpm catchup` (`admin/run-catchup.ts`) already builds a `SettledWatermark` from outside the process (`catch-up-admin.ts:79-90`). But there is no documented pattern, no cursor table for a foreign consumer, and no example.
- The probe takes an xid with `pg_current_xact_id()`/`txid_current()` (`settled-watermark.ts:198-204`). That fails on a hot standby, so a consumer cannot probe a read replica. The probe also needs `pg_sequence_last_value` rights on the ordinal sequence (`:192-196`).
- PGlite stores cannot be opened by a second process at all.

## Goal

An ADR that picks how an out-of-process consumer gets the read-side guarantee (every ordinal at or below its cursor applied, none skipped), and that names the follow-up work.

## Acceptance criteria

- The ADR compares the options below on: correctness under the gap rule, replica support, auth and read gates, load on the primary, and operational cost.
- It states what is promised and what is not: per-stream ordering, deletes and purges (erasure markers), and the auth scope.
- It names the API or package surface, the cursor storage, and a test plan, for example a consumer in a second Node process against the test Postgres that sees no gap under concurrent writers.
- If the choice is the library route, it lists the exports to stabilise and the privileges the database role needs.

## Constraints and invariants

- The gap rule: never advance past an ordinal that is not settled (`settled-watermark.ts`, `ProbeSettler`). A consumer must not use `max(ordinal)` as its cursor.
- Ordinals are per reactor and per database (`sync/design.md:178-204`). A cursor is meaningless against another reactor's store.
- Read gates: anything served over the network goes through the same document policy as `get` and sync serving (`reactor-api/src/services/sync-serving-gate.ts`). A direct-DB consumer bypasses them, and the ADR must say so.
- Purged documents: erasure removes rows and leaves markers. A foreign consumer must handle that the way in-process ones do (check `isPurgeMarker` handling in `sync/utils.ts:120-126`).
- Do not add load to the write path. The in-process probe is coalesced and runs one at a time (`ISettledWatermark.refresh`, `types.ts:10-17`).

## Suggested approach

Options to compare:
- **(a) Library on the same database.** Document and stabilise `createKyselyWatermarkProbe` + `SettledWatermark` + `ContiguousCursor` + `getOrdinalsInRange` (`cache/operation-index-types.ts:101`) as a supported consumer kit. Add a cursor table the consumer owns, and an example consumer. Primary-only because of the xid.
- **(b) Ordinal feed over GraphQL.** Add a query like `operationsSince(after: Int, limit: Int)` that returns rows up to `settledThrough` with `nextCursor`, gated by document policy. The consumer stores the cursor. This works from any network and serves no unsettled rows.
- **(c) Sync as the feed.** The consumer runs a minimal reactor-free sync client (GqlRequestChannel semantics, no executor). This reuses envelopes and acks but brings in the sync protocol's weight.

Open questions: Is a standby-safe watermark possible, for example by probing on the primary and publishing `settledThrough`, so replicas only read? Who is the first real consumer? Name it, because it decides between (a) and (b).

## Verify

The ADR is the deliverable. Use the `adr` skill. Back each claim with a file:line on main. For the later implementation: `pnpm tsc --build` and `pnpm test` in `packages/reactor` (Postgres tests need `REACTOR_TEST_PG_URL`; see TROUBLESHOOTING on the compose override), plus an `events` bench record, which #3124 never took (`docs/HANDOFF.md`, "Small").

## Working rules

- Work in a git worktree on a new branch; the main checkout is shared with other sessions — never `checkout -b` in it.
- Read docs/TROUBLESHOOTING.md first. Workspace deps load from dist/: run `pnpm build` in each dependency you touched (and @powerhousedao/shared if changed) before trusting a test result.
- Verify with the real commands (`pnpm tsc --build`, `pnpm test`, `pnpm lint`) in each package you touched. No retry logic to paper over flakes.
- Keep comments terse; default to none.
- Open the PR with `ghx pr create --input pr.json` (start from `ghx pr create --example`); the description is 2–3 sentences, no sections. Wait for CI with `ghx ci wait <pr>`. Merge with a merge commit, not squash.

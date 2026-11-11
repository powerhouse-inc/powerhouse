# Serve the remaining reactor admin levers over GraphQL and wire them into the monitor

> **Partly stale in the deck.** The deck says queue pause, catch-up sweep, rebuilds, SQL, the `ISyncAdmin` levers and `listHolds` are not on GraphQL, which implies there is no remote admin at all. In fact `InspectionAdminSubgraph` already serves processor retry/rerun, catch-up priority, memory telemetry, heap snapshots and keyframe clean-up/reclaim to listed admins, and the monitor uses it. `listHolds` is also served already, as the `syncHolds` query on the reactor subgraph (`packages/reactor-api/src/graphql/reactor/schema.graphql:789-790`, `subgraph.ts:680-701`, commit 9f475e2f97). The monitor's remote handle just doesn't call it. This prompt covers what is still missing.

**Type:** Implement
**Size:** M   **Area:** packages/reactor-api (graphql/inspection), packages/reactor (inspector ops), packages/reactor-monitor (remote)

## Context

The reactor's inspection surface is one op table per channel. Each row is tiered `read`, `admin` or `sql` (`packages/reactor/src/inspector/ops.ts:10-16`, `INSPECTOR_OPS` `:19-90`, `SYNC_INSPECTION_OPS` `:97-110`). In-process and worker hosts serve every tier the host grants. Over GraphQL, the read rows are served by the inspection subgraph (`packages/reactor-api/src/graphql/inspection/schema.ts:373-382`). A separate `inspection-admin` subgraph (`admin-schema.ts`, `admin-subgraph.ts:119-220`) serves a hand-picked set of admin rows. It runs only when `INSPECTION_ADMIN_ENABLED` is set (`reactor-api/src/api-config.ts:100`, `config.ts:25`), and only for listed admins (`admin-subgraph.ts:147`). The monitor drives a remote Switchboard through it (`packages/reactor-monitor/src/remote/levers.ts:13-…`, `keyframe-levers.ts`).

## Problem

Verified on main b957b9e811. These have no GraphQL field:
- `IInspectorAdmin.pauseQueue`, `resumeQueue`, `sweepCatchUp`, `rebuildKeyframes`, `rebuildSnapshots` (`reactor/src/inspector/types.ts:268-290`; ops rows `ops.ts:74-83`).
- `ISyncAdmin.resetChannel`, `requeueDeadLetter`, `clearDeadLetter` (`reactor/src/sync/interfaces.ts:359-371`; rows `ops.ts:105-107`).
- Not missing, but unused remotely: `syncHolds` and `peerAgreement` are on the reactor subgraph (`schema.graphql:789-793`), open to supreme admins and to the channel's bound address. The monitor's remote sync proxy still rejects `listHolds` and `agreement()` with `notServed` (`reactor-monitor/src/remote/sync-manager.ts:171-186`).
- `IReactorDbQuery.queryDb` (`types.ts:302-304`, tier `sql`).

Also, the comment at `ops.ts:13` ("Only a read op has a GraphQL root field") has been wrong since the admin subgraph landed.

## Goal

A listed admin can pull every `admin`-tier lever against a remote Switchboard over GraphQL. The monitor's remote handle uses these fields, and the existing `syncHolds` query, instead of refusing.

## Acceptance criteria

- New `inspection-admin` mutations: queue pause/resume, catch-up sweep, keyframe and snapshot rebuild per document, and the three sync repair levers. Each one is refused for non-admins, just as the existing fields are.
- The monitor's remote `listHolds` calls the existing `syncHolds` query. Do not add a second holds field. If the monitor's caller is neither a supreme admin nor the bound address, show the refusal; do not widen the rule.
- `inspectionAdmin` reports the new capabilities, so clients can feature-detect them.
- `reactor-monitor/src/remote/` wires the new fields. `listHolds` no longer throws `notServed`.
- Tests: extend `reactor-api/test/inspection-admin-subgraph.test.ts` (admin allowed, non-admin refused, disabled host serves no field), plus a monitor remote test for `listHolds`.
- Fix the `ops.ts:13` comment. Update the academy reference page for inspection if it lists the fields.

## Constraints and invariants

- Off by default: the subgraph exists only when `INSPECTION_ADMIN_ENABLED` is set (`api-config.ts:100`). Do not add any admin field to the read subgraph.
- Only listed admins may call these (`isOperator`, `resolvers.ts:44-60`). The operator check is independent of document policy.
- `requeueDeadLetter` refuses `Outbox`-side dead letters (`sync-manager.ts:1945-1950`). Keep that, and map `SyncRepairRefusedError` to a client error, as `refusable` does for keyframes (`admin-subgraph.ts:207-216`).
- `sweepCatchUp` and the rebuilds can run for a long time. Follow `inspectionRerunProcessor`'s rule: answer once done or after a bounded wait, and report progress through a read.
- Wire types come from the reactor's `toWire*` helpers. Do not hand-shape them in reactor-api.

## Suggested approach

1. Add the fields to `admin-schema.ts` and the resolvers in `admin-subgraph.ts`, calling `args.inspection.admin` (`source.ts:27-58`).
2. Sync levers need the sync manager's `ISyncAdmin`. Check how `source.ts` reaches `syncInspector` and pass the admin half the same way.
3. Open question: should `queryDb` go over GraphQL at all? Arbitrary SQL over HTTP is a larger exposure than the in-process `sql` tier. Lean towards leaving it out and documenting why. If it is added, it needs its own env flag, separate from `INSPECTION_ADMIN_ENABLED`.
4. Rewind/replay is not here. It needs `sync-02a-rewind-replay-protocol.md` first, then a lever for it lands here.

## Verify

Rebuild dists first: `pnpm build` in `packages/reactor` if `inspector/` or `sync/` changed, since reactor-api and reactor-monitor load it from dist. Then in `packages/reactor-api`: `pnpm tsc --build`, `pnpm test`, `pnpm lint`. In `packages/reactor-monitor`: `pnpm tsc --build`, `pnpm test`. Smoke test against a local Switchboard started with `INSPECTION_ADMIN_ENABLED=true`: pause the queue from the monitor, then resume it.

## Working rules

- Work in a git worktree on a new branch; the main checkout is shared with other sessions — never `checkout -b` in it.
- Read docs/TROUBLESHOOTING.md first. Workspace deps load from dist/: run `pnpm build` in each dependency you touched (and @powerhousedao/shared if changed) before trusting a test result.
- Verify with the real commands (`pnpm tsc --build`, `pnpm test`, `pnpm lint`) in each package you touched. No retry logic to paper over flakes.
- Keep comments terse; default to none.
- Open the PR with `ghx pr create --input pr.json` (start from `ghx pr create --example`); the description is 2–3 sentences, no sections. Wait for CI with `ghx ci wait <pr>`. Merge with a merge commit, not squash.

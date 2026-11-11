# Design a rewind/replay request between reactors

**Type:** Design first (write an ADR/plan, stop for review before code)
**Size:** L   **Area:** packages/reactor (sync, channels), packages/reactor-api (sync schema)

## Context

Each channel has a forward-only cursor in each direction. The cursors are in different ordinal frames: `outboxAck` uses the server's ordinals and `ackOrdinal` uses the client's (`packages/reactor/src/sync/design.md:178-204`). Today the only repair is `ISyncAdmin.resetChannel`, which "rebuilds the channel from cursor storage" (`src/sync/interfaces.ts:359-371`). It cannot move a cursor back. PR #3168 (`origin/feat/multi-reactor`, 8ec8ce4046) had `rewindInboxCursor`, which lowered a polling channel's in-memory and stored inbox cursor and then pulled again. That code is at `git show 8ec8ce4046:packages/reactor/src/sync/sync-manager.ts` around line 1677 and `.../channels/gql-req-channel.ts:426-470`. It was dropped when #3168 was split up, and "held-back outbound serving" was cut with it. Both were left for a later PR with an explicit replay request. `docs/HANDOFF.md` lists this as "Multi-reactor: rewind/replay protocol ... deferred".

## Problem

Verified on main b957b9e811:
- No `rewind` exists anywhere in `packages/reactor/src/sync`.
- The old design only worked on a polling channel. A served `GqlResponseChannel` has no cursor of its own to move (`git show 8ec8ce4046:packages/reactor/src/sync/interfaces.ts:86-95`), so the server could not ask the client to re-push.
- The sender's outbox is derived from the operation index above the remote's ack, minus rows sourced from that remote (`sync-manager.ts:3550-3580`, `excludeSourceRemote` at `:3573`). Lowering the receiver's cursor does not bring back rows the sender excludes by source.
- Operators fall back to hand-run SQL against `sync_cursors` plus a restart, which is what `rewindInboxCursor` used to replace.

## Goal

An accepted ADR in `docs/adr/` that specifies a replay request: who can ask a peer to re-serve, from which point, in whose frame, and how it interacts with acks, holds and the serving gate. Do not write code until the ADR is reviewed.

## Acceptance criteria

- The ADR answers every question under "Suggested approach" and compares at least the options listed there.
- It says whether the same mechanism repairs the missing-resend cases (`protocol-02a-lost-operation-resend.md`; `sync-01-resend-refused-rows.md`) or why it does not.
- It defines the wire change (`reactor-api/src/graphql/reactor/schema.graphql`, `pollSyncEnvelopes`/`touchChannel`/`pushSyncEnvelopes`) and the change to `IChannel` (`interfaces.ts:37-127`), including what `LocalChannel` does.
- If it changes protocol semantics, it says whether `spec/PeerAgreement.qnt` needs a new action and which invariant a replay could break (`outboxGated`, `noMisreadRowsSpread`).
- It lists the tests that would prove it: a quiet pair recovering a gap in both directions, over GQL and over local channels.

## Constraints and invariants

- Ordinals are per reactor. A request names a point in the frame of the side that serves it (`design.md:178-204`).
- The inbox ack never passes an unapplied item (`gql-res-channel.ts:73-…`, received markers kept until their outcome, `sync-manager.ts:2740`).
- Peer agreement holds and the outbox gate still apply to replayed rows (`gateOutbound`, `sync-manager.ts:1239-1272`).
- The read gate on sync serving still applies (`reactor-api/src/graphql/reactor/subgraph.ts:810-835`, `collectHeldSyncOperations` at `resolvers.ts:1959`). A replay must not serve more than a normal poll would.
- Channel binding: only the bound address may ask for a replay (`subgraph.ts:230-266`).
- Receivers dedup by action id. A replay may resend rows the receiver already has, but it must not change which rows are live.

## Suggested approach

Questions the ADR must answer:
1. Who initiates: the receiver ("send me from X"), the sender ("I am resending from X"), or both? How does a served channel ask its client?
2. In what unit is X: the server's ordinal, a timestamp (`sinceTimestampUtcMs` already exists in `RemoteOptions`), or a per-document revision? What happens to ordinals in a non-dense serial column (see `catch-up/settled-watermark.ts`)?
3. Does a replay bypass `excludeSourceRemote`? If so, how does it avoid echo loops?
4. How does it interact with holds (`releaseSupported`, `:1074`), dead letters and quarantine?
5. What is the operator surface: an `ISyncAdmin` lever, plus GraphQL in `sync-02b-remote-admin-mutations.md`?
6. What does "held-back outbound serving" mean in the new design, and is it needed? Read the #3168 branch to decide.

Options to compare: (a) restore `rewindInboxCursor` for polling channels only; (b) a replay request envelope type next to `OPERATIONS`/`ACK` (`schema.graphql`, `SyncEnvelopeType`); (c) a per-document re-serve (backfill like `backfillDocument`, `sync-manager.ts:1105-1139`) started by the receiver.

## Verify

The ADR is the deliverable. Use the `adr` skill. Ground every claim in a file:line on main. If you prototype, keep it off the PR. Later implementation: `pnpm tsc --build`, `pnpm test` in `packages/reactor` and `packages/reactor-api`, and `pnpm bench:sync`.

## Working rules

- Work in a git worktree on a new branch; the main checkout is shared with other sessions — never `checkout -b` in it.
- Read docs/TROUBLESHOOTING.md first. Workspace deps load from dist/: run `pnpm build` in each dependency you touched (and @powerhousedao/shared if changed) before trusting a test result.
- Verify with the real commands (`pnpm tsc --build`, `pnpm test`, `pnpm lint`) in each package you touched. No retry logic to paper over flakes.
- Keep comments terse; default to none.
- Open the PR with `ghx pr create --input pr.json` (start from `ghx pr create --example`); the description is 2–3 sentences, no sections. Wait for CI with `ghx ci wait <pr>`. Merge with a merge commit, not squash.

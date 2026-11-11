# Design a resend path for rows a peer lacks and the sender will never send again

**Type:** Design first (write an ADR/plan, stop for review before code)
**Size:** L   **Area:** packages/reactor (sync, executor), packages/reactor/spec (Quint)

## Context

Repo: `/Users/benjaminjordan/projects/powerhouse/powerhouse`, checked at main b957b9e811. Paths below are relative to it.

Sync sends a remote what its outbox derives from the operation index past the remote's cursor, minus rows that came from that remote. `SyncManager` reads the index with `excludeSourceRemote: remote.meta.name` (`packages/reactor/src/sync/sync-manager.ts:3573`). Nothing ever re-offers a row that is behind the cursor or stamped with the receiver as its source. Two known cases lose a row this way:

1. **A replica lost a live operation of its own (#6).** A wrote `x`, B holds `x` stamped with A as source, and A's store no longer applies `x`. B never sends `x` back, so the pair diverges for good. The load path that caused the damage has since been fixed; the tests build the damaged store by hand (`damaged()`, `packages/reactor/test/sync/lost-operation-resend.test.ts:283`). Stores damaged before the fix still need a repair path.
2. **A peer narrows its protocol, then widens again.** A row refused on receipt as `PEER_PROTOCOL_UNSUPPORTED` (`SyncManager.refuse`, `sync-manager.ts:1190-1223`) is dead-lettered. When the peer later announces support again, nothing resends it. The Quint model states this as `noLostRows` (`packages/reactor/spec/PeerAgreement.qnt:446`; `spec/README.md:48`), which the `fixed` and `asBuilt` instances still violate (`spec/README.md:80`, `:98`). No code test pins this case; only the Quint model shows it.

`docs/HANDOFF.md` ("Lost rows after a peer narrows its protocol") and the undo v3 merge note (`git -C /Users/benjaminjordan/projects/powerhouse/powerhouse show 38cdedc760^:docs/plans/2026-10-19-undo-v3-deviations.md`, "Known gaps", first bullet) both record this as known and unplanned. Nobody has decided it must be fixed.

Two related gaps share the mechanism (the receiver will not take, or the sender will not offer, rows below an ack). They are items in `protocol-02-undo-v3-known-gaps.md`: a local-channel receiver drops a release push at or below its inbox ack (`src/sync/channels/local-channel.ts:344`), and a release's outbox is not persisted (`sync-manager.ts:1084-1089`). A design here should say whether it covers them.

A narrower Implement prompt for case 2 alone exists beside this one (`sync-01-resend-refused-rows.md`). If this design picks a different mechanism for case 2, say that the narrower prompt is superseded.

## Problem

Pinned `it.fails` in `test/sync/lost-operation-resend.test.ts` (verified on main b957b9e811):
- v2, missing resend: `:388` quiet pair, `:399` traffic both ways, `:414` A writes older than `x`, `:464` echo arrives alone, `:493` full backfill under the same names, `:539` new remote name from the client's since-timestamp.
- v2, not resend: `:438` and `:594` ("BUG (b)": a trivial-append load keeps the sender's skip, so a v2 `NOOP` undoes the wrong row). Their v3 twins pass (`:651`, `:733`). They belong with the base-reducer 2 `NOOP` pins in `protocol-01-peer-undo-in-reshuffle-br2.md`; leave them out of this design.
- v3: `:677` "is repaired when A's reshuffle echo reaches B alone" ("v3 has no lost-operation resend either", `:675`).

Passing neighbours show the repairs that do work: `:425`/`:651` B's own backdated write re-appends `x`; `:517` a new remote name with backfill from timestamp 0.

## Goal

An approved design (ADR or plan) that says whether to build a resend path, and if so which mechanism, covering both cases above. No code until it is reviewed.

## Acceptance criteria

- Each pinned case is reproduced and classified: still reachable on current main, or only from a store damaged by old code.
- The design answers the questions under Suggested approach, with a recommendation: build, partial (repair tool only), or wontfix with documentation.
- If it proposes a protocol change, the Quint model is updated so `noLostRows` holds in the proposed instance, and the design names the instance and the `quint verify` / Apalache command that checks it.
- The design states its cost against the sync bench (`pnpm bench:sync:record`), at least as an estimate.
- Stop for review. Do not change sync code.

## Constraints and invariants

- Replica agreement: replicas must converge on the same stored set and derive the same state. Any new message or field is a protocol change: deterministic across peers and switched on fleet-wide through peer agreement (`packages/shared/document-model/peer-agreement.ts`), with an older peer degrading safely.
- Base-reducer 1 and 2 behaviour is frozen (`git -C /Users/benjaminjordan/projects/powerhouse/powerhouse show 38cdedc760^:docs/plans/2026-10-19-undo-v3-deviations.md`, "Base-reducers 1 and 2 are unchanged"). A v2-only repair that changes what a v2 replica stores needs an explicit exception; a repair that only re-delivers rows the receiver already accepts is fine.
- Erasure: a resend must never re-serve rows of a purged document. Today's tombstone checks are in `emitBatches` (`sync-manager.ts`, "refuses tombstoned non-marker rows").
- Base-reducer 3 refuses a repeated action id as `DUPLICATE_ACTION` on a rule scope; v1/v2 refuse a repeat only under `signatureVerification: "enforce"` (the default). A re-delivery stored exactly as it arrived is not a repeat. A resend must be idempotent on both.

## Suggested approach

Read the test file, `SyncManager` outbox derivation (`sync-manager.ts:3540-3600`), `releaseSupported`/`backfillDocument` (`:1074-1137`), and the Quint `send` action (`PeerAgreement.qnt:330-380`). Then answer:

1. Which side detects the gap? Options: the receiver asks (a digest or per-document head exchange), the sender re-offers on a trigger (peer widened, reshuffle echo), or an operator repair command.
2. For case 2, is it enough to keep `PEER_PROTOCOL_UNSUPPORTED` refusals as holds at the sender and release them on widen, like `UNSUPPORTED_PROTOCOL` refusals already are (Quint decision 11)?
3. For case 1, is a one-off repair (re-add the remote with backfill from 0, which `:517` shows works) acceptable instead of a protocol change? What does an operator need to detect divergence?
4. Does the design also fix the local-channel release drop and the unpersisted release outbox?
5. Open: how much divergence of this kind exists in deployed stores? If none is known, a repair command plus documentation may be the right answer.

## Verify

- The pinned tests above still fail on the design branch (no code changed).
- Quint: the command the design names passes for the proposed instance and still fails `noLostRows` for `asBuilt`.

## Working rules

- Work in a git worktree on a new branch; the main checkout is shared with other sessions — never `checkout -b` in it.
- Read docs/TROUBLESHOOTING.md first. Workspace deps load from dist/: run `pnpm build` in each dependency you touched (and @powerhousedao/shared if changed) before trusting a test result.
- Verify with the real commands (`pnpm tsc --build`, `pnpm test`, `pnpm lint`) in each package you touched. No retry logic to paper over flakes.
- Keep comments terse; default to none.
- Open the PR with `ghx pr create --input pr.json` (start from `ghx pr create --example`); the description is 2–3 sentences, no sections. Wait for CI with `ghx ci wait <pr>`. Merge with a merge commit, not squash.

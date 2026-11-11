# Resend rows refused as PEER_PROTOCOL_UNSUPPORTED once the peer widens

> **Mis-described in the handoff deck and `docs/HANDOFF.md`.** They say this defect is pinned as `it.fails` in `packages/reactor/test/sync/lost-operation-resend.test.ts`. It is not. That file pins a different defect (#6: a replica that lost its own live operation is never re-sent it, because `excludeSourceRemote` filters it out at `src/sync/sync-manager.ts:3573`). It never mentions `PEER_PROTOCOL_UNSUPPORTED`. The case here has **no code test**. Only the Quint model shows it (`noLostRows`). Do not try to flip the `it.fails` in `lost-operation-resend.test.ts`.
>
> **Overlap:** `protocol-02a-lost-operation-resend.md` is a design-first prompt that covers this case and #6 together. Check its status before you start. If its ADR has landed and picks a mechanism for this case, use that mechanism. This prompt is the narrow receiver-side fix for this case alone.

**Type:** Implement
**Size:** M   **Area:** packages/reactor (sync, spec)

## Context

Peer agreement lets each reactor refuse rows on receipt (`SyncManager.refuseOnReceipt`, `packages/reactor/src/sync/sync-manager.ts:1169-1188`). `refuse()` (`:1191-1224`) has three outcomes. It returns `UNSUPPORTED_PROTOCOL` when this reactor cannot run the version, and also when the model refuses it. It returns `PEER_PROTOCOL_UNSUPPORTED` (`:1214`) when the sending remote wrote at a version its own manifest does not announce, as far as this receiver's record of that peer knows. The Quint model gives the invariant: `noLostRows` ("no PEER_PROTOCOL_UNSUPPORTED refusal drops a legitimate row the receiver lacks", `spec/PeerAgreement.qnt:445-446`, set at `:370-373`). It is violated in every instance, including `asBuilt` (`spec/README.md:98`, `spec/scripts/sim.sh:54`).

## Problem

Verified on main b957b9e811:
- `refuse()` dead-letters the row and removes it from the inbox (`sync-manager.ts:1221-1222`). The inbox ack then passes the refused row, so the sender trims it from its outbox and never derives it again.
- Only `UNSUPPORTED_PROTOCOL` refusals from the `Outbox` side become a sender-side hold (`deadLetter.onAdded`, `:2191-2200`), and a hold is released by `releaseSupported` (`:1074-1101`). `PEER_PROTOCOL_UNSUPPORTED` takes the plain dead-letter path (`:2241-2298`). It does not quarantine (`src/sync/utils.ts:595-603`).
- When the peer's manifest changes, `applyPeerManifest` (`:746-772`) stores the new record and runs `holdUnsupported` and `releaseSupported`. Nothing re-examines this receiver's own `PEER_PROTOCOL_UNSUPPORTED` dead letters from that remote. The refused rows stay lost until an operator runs `requeueDeadLetter` by hand.
- The model shows the same thing: the receiving step marks `peerRefuse`, the sender's outbox excludes the item, and no step adds it back (`PeerAgreement.qnt:348-373`).

## Goal

When a remote's manifest widens to cover the version of a row this reactor refused as `PEER_PROTOCOL_UNSUPPORTED`, the row is applied without operator action. `noLostRows` holds in a model instance that includes the fix.

## Acceptance criteria

- A new test in `test/sync/peer-agreement/` reproduces the loss first. Start from the Fleet setup in `holds.test.ts:161-181` ("refuses writes from a peer into a document it does not announce"). After the refusal, the peer announces the wider manifest, and the test asserts that the receiver ends up holding the document. Commit it as `it.fails` first, then flip it to `it` together with the fix.
- Also covered: the dead letter is gone after the replay, and the document was never quarantined. The flow also works after a receiver restart, with dead letters read back from `deadLetterStorage`, including a restart after the widening manifest was stored but before the replay ran.
- A row that is still unsupported after the widening stays dead-lettered.
- Quint: add a switch for the fix to `PeerAgreement.qnt`. Do not silently change what `asBuilt` means, because it is pinned to commit 50611d8c1b (`spec/README.md`, "As built"). Either add a new instance with the switch on, or re-pin `asBuilt` to the fix commit and say so in that README section. Update `spec/scripts/sim.sh` so `noLostRows` is expected to hold for the instance that has the fix. `pnpm spec:check` passes.
- Update `docs/HANDOFF.md`: remove the "Lost rows after a peer narrows its protocol" entry, or change it to point only at #6.

## Constraints and invariants

- A refusal never quarantines the document (`utils.ts:595-616`).
- Never apply a row this reactor cannot run. Replayed rows go back through `refuseOnReceipt` and the executor's own check, not around them.
- Ordinals are per reactor (`src/sync/design.md:178-204`). The inbox ack is in the sender's frame. Do not lower the ack or re-pull to recover rows.
- Manifests are applied in arrival order per remote (`queuePeerManifest`, `:726-744`), and older manifests are ignored (`isOlderManifest`, `:756`). Run the replay from inside that chain.
- `requeueDeadLetter` refuses an `Outbox`-side dead letter (`:1945-1950`) and dedups in-flight requeues (`:1915-1930`). Reuse it and keep both properties.

## Suggested approach

1. In `applyPeerManifest`, after `releaseSupported`, list this remote's dead letters with `errorType === "PEER_PROTOCOL_UNSUPPORTED"` (`deadLetterStorage.list`, used at `:1644`). Requeue each one that `holdReason(newPeer, versions, capabilities)` now clears. Also run the replay in the same-revision branch (`:760-767`), the way it already retries `releaseSupported`. Otherwise a crash after the new manifest is stored but before the requeue finishes leaves the rows lost, because the next handshake brings the same revision and returns early.
2. Keep replay order per document: requeue in `jobId`/ordinal order so dependencies hold. Check how `requeue` (`:1933-…`) sets `jobDependencies`.
3. Open question: dead letters persist fire-and-forget (`:2277`), and the in-memory mailbox evicts beyond `maxDeadLettersPerRemote` (default 100, `:194`, `:2301-2306`). Confirm `findDeadLetter` (`:2121`) reads storage, so evicted rows can still be replayed. Decide whether a lost persist is acceptable or needs awaiting for this error type.
4. Open question: on a served channel, the client also receives the refusal as an `Outbox`-side dead letter through `pollSyncEnvelopes`. Make sure the fix does not also resend from the sender and produce duplicates. Duplicates should dedup by action id, but check this.

## Verify

From `packages/reactor`: `pnpm tsc --build`, `pnpm vitest run test/sync/peer-agreement`, `pnpm test`, `pnpm lint`. Run `pnpm build` in `packages/shared` first if its dist predates its last `src` commit. Spec: `pnpm spec:check` (needs `quint` and Java 17+ for Apalache). Run `pnpm bench:sync:smoke` to confirm the manifest path has not slowed down.

## Working rules

- Work in a git worktree on a new branch; the main checkout is shared with other sessions — never `checkout -b` in it.
- Read docs/TROUBLESHOOTING.md first. Workspace deps load from dist/: run `pnpm build` in each dependency you touched (and @powerhousedao/shared if changed) before trusting a test result.
- Verify with the real commands (`pnpm tsc --build`, `pnpm test`, `pnpm lint`) in each package you touched. No retry logic to paper over flakes.
- Keep comments terse; default to none.
- Open the PR with `ghx pr create --input pr.json` (start from `ghx pr create --example`); the description is 2–3 sentences, no sections. Wait for CI with `ghx ci wait <pr>`. Merge with a merge commit, not squash.

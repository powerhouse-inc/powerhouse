# Triage the open undo v3 known gaps

**Type:** Triage (confirm, recommend fix or wontfix, then stop)
**Size:** M (triage of six items; each fix is S or M)   **Area:** packages/reactor, packages/reactor-browser, packages/reactor-mcp, packages/workflow

## Context

Undo v3 (base-reducer 3, `RETRACT` by action id) merged on 2026-11-02 as the stack #3322..#3348 and is on by default. Its merge note listed 11 known gaps:

```
git -C /Users/benjaminjordan/projects/powerhouse/powerhouse show 38cdedc760^:docs/plans/2026-10-19-undo-v3-deviations.md
```

(section "Known gaps"). The note was deleted with its plan; `docs/HANDOFF.md` ("Known gaps in landed work") points at it. These were recorded as known limitations at merge, not committed work. Nobody has decided any must be fixed.

Re-checked against main b957b9e811 on 2026-11-11: 1 fixed, 3 by design, 7 still current. The largest, lost-operation resend, has its own prompt (`protocol-02a-lost-operation-resend.md`). The other 6 are below.

## Problem

Each item below states today's behaviour with a citation. Paths are relative to the repo root.

## Goal

For each item: confirm it on current main, judge whether it is worth fixing, and record Implement, Decide (needs a product or protocol call) or Wontfix with a reason. Stop with that table. Implement only items marked Implement after review, one small PR each.

## Acceptance criteria

- A table with one row per item: confirmed (yes/no, with file:line), verdict, one-line reason, size.
- For every Wontfix: the follow-up names where the limit gets documented (code comment at the cited site, package README, or `docs/TROUBLESHOOTING.md`) and, for item 4, that the `it.fails` becomes a plain `it` asserting today's behaviour.
- No code changes in the triage PR, if any PR at all.

## Constraints and invariants

- Base-reducer 1 and 2 behaviour is frozen (merge note, "Base-reducers 1 and 2 are unchanged"; `docs/adr/0007-action-ids-and-auth-clock.md:44-49`; corpus `packages/reactor/test/v2-corpus/v2-corpus.test.ts`). Fixes apply to v3 only.
- Replica agreement: anything that changes what a replica stores, refuses or derives is a protocol change. It must be deterministic across peers and switched fleet-wide, never per host. Item 6 is one.
- Error classification crosses the queue and worker hops by `name` only (`docs/TROUBLESHOOTING.md`, "A new terminal job error retries until the limit"). A new refusal must be a named error and, if terminal, join `JobResultHandler`'s allow-list (`packages/reactor/src/executor/job-result-handler.ts`).

## Items

### 1. Light client asks `createDefaults` twice per create

- **Today:** `GraphQLReactorClient.newDocument` runs `getCreateSignaturePolicy()` and `getCreateProtocolVersions()` in parallel (`packages/reactor-browser/src/graphql-client/graphql-reactor-client.ts:1250-1251`); `RemoteDocumentController.headNewDocument` does the same (`packages/reactor-browser/src/remote-controller/remote-controller.ts:375-384`). They issue `GetCreateDefaults` and `GetCreateProtocolVersions` (`graphql-client/create-defaults.ts:31-115`), two round trips, both on the `createDefaults` field.
- **Expected if fixed:** one query selecting `signaturePolicy` and the per-type `protocolVersions`, keeping the fallbacks for older hosts (`queriesUnknownArgument(error, "documentType")`, `create-defaults.ts:89`).
- **Call:** Implement if cheap (S); a perf nit, not a correctness issue. Wontfix is reasonable.

### 2. A copy keeps its source's versions

- **Today:** `copyNode` builds the copy's header with `withSelectedVersions(srcDoc.header, base, options?.protocolVersions)` (`packages/reactor/src/client/drive-write-client.ts:133-145`, used at `:625`): the source's versions win over the host's selection unless `CopyNodeOptions.protocolVersions` overrides them (`packages/reactor/src/client/types.ts:126-129`). reactor-drive refuses the override (`packages/reactor-drive/src/client/reactor-drive-write-strategy.ts:385-389`). A v3 document copied where only v2 runs is refused there.
- **Question:** when does this bite? Source and copy live on the same reactor, so the copy is refused only where the source is already unwritable (for example `undoV3=false` with `REACTOR_UNSUPPORTED_STORED_DOCUMENTS=read-only`), or after the copy syncs to a v2-only peer, which would also hold the source.
- **Call:** likely Wontfix plus a doc line on `CopyNodeOptions`. Decide if a "copy down to v2" use case exists.

### 3. Workflow editor and reactor-mcp plan undo from the whole history

- **Today:** reactor-mcp pages every row of each touched scope plus the document scope (`scopeOperations`, `packages/reactor-mcp/src/tools/operations.ts:440-461`, called at `:518-531`) and plans with `undoRedoBatch`. The workflow editors read the whole global scope (`globalHistory`, `packages/workflow/editors/shared/editor-chrome.tsx:66-84`) and plan with `planRetraction` (`packages/workflow/editors/shared/undo-plan.ts:147-160`). Neither uses the reactor's undo-targets cache.
- **Catch:** the cache's API resolves one step per call (`IReactor.resolveUndoRedo`, `packages/reactor/src/core/types.ts:338-343`; `undoRedoTargets`, `packages/reactor/src/client/types.ts:590-595`). reactor-mcp needs counted steps over earlier actions in the same batch; the editor needs "every live row of the last edit outside a skip policy". Using the cache means widening that API.
- **Call:** Decide. Measure first: cost per undo on a document with 10k+ global rows. If it is under a second, Wontfix.

### 4. Local-channel receiver drops a release push at or below its inbox ack

- **Today:** `LocalChannel.receivePush` drops any sync op whose highest ordinal is at or below the inbox ack (`packages/reactor/src/sync/channels/local-channel.ts:328-347`, the check at `:344`). A release backfill (`SyncManager.backfillDocument`, `packages/reactor/src/sync/sync-manager.ts:1105-1137`) carries the sender's original ordinals, so a document released toward a local peer never loads there. Pinned `it.fails` at `packages/reactor/test/sync/channels/local-channel/unit.test.ts:538`; its comment names the fix: a release flag on the push frame.
- **Expected if fixed:** a flagged release push bypasses the ack floor; unflagged pushes keep today's drop.
- **Call:** Implement (S/M) if local channels carry mixed-version peers in practice (they are wired in Connect, `apps/connect/src/utils/reactor.ts:106`, `apps/connect/src/utils/worker-local-peers.ts:71`, and in reactor-monitor); otherwise Wontfix. Check whether the design in `protocol-02a` covers it first.

### 5. A release's outbox is not persisted

- **Today:** `SyncManager.releaseSupported` queues the history (`backfillDocument`) and removes the hold straight after (`packages/reactor/src/sync/sync-manager.ts:1074-1089`). Release entries are only in the in-memory outbox (`awaitingPush`, `:3539`). A restart before the push loses the document from that peer: the hold is gone and the rows are below the cursor.
- **Expected if fixed:** remove the hold only after the peer acks the release, or persist the pending release and re-run it at startup (the path at `sync-manager.ts:763` already retries a release interrupted before its hold was removed).
- **Call:** Implement (S) by moving the hold removal after delivery, unless `protocol-02a` subsumes it.

### 6. An empty timestamp is not refused before the v3 sort

- **Today:** for a mutation, `positionByTimestamp` (called at `packages/reactor/src/executor/simple-job-executor.ts:1066`) sorts v3 jobs with `compareCanonical` (`:2909-2916`) before `processActions` validates timestamps (`:1897-1913`). The validation itself skips falsy values (`action.timestampUtcMs && !isValidISOTimestamp(...)`), as does the load check (`:3474-3490`). `compareCanonical` (`packages/shared/document-model/action-order.ts:35-41`) gets `NaN` from `Date.parse("")` and falls through to action-id order, so the sort is not a total order.
- **Expected if fixed:** on v3, refuse an empty or unparsable timestamp with `InvalidOperationTimestampError` before positioning, on both execute and load.
- **Protocol note:** a load refusal changes what a v3 replica stores. Check whether any conforming client can emit an empty timestamp (the shared `createAction` stamps one). If none can, a refusal on all v3 replicas is safe to ship in one release; say so explicitly.
- **Call:** Implement (S).

## Suggested approach

Confirm each item at its citation, run the two pinned tests, and fill the table. For items 3 and 6, gather the one measurement or grep each needs. Stop and report.

## Verify

- `pnpm vitest run test/sync/channels/local-channel/unit.test.ts` in packages/reactor: one expected fail (item 4).
- For any later Implement PR: `pnpm tsc --build`, `pnpm test`, `pnpm lint` in each touched package; packages/reactor's `test/v2-corpus` stays green.

## Working rules

- Work in a git worktree on a new branch; the main checkout is shared with other sessions — never `checkout -b` in it.
- Read docs/TROUBLESHOOTING.md first. Workspace deps load from dist/: run `pnpm build` in each dependency you touched (and @powerhousedao/shared if changed) before trusting a test result.
- Verify with the real commands (`pnpm tsc --build`, `pnpm test`, `pnpm lint`) in each package you touched. No retry logic to paper over flakes.
- Keep comments terse; default to none.
- Open the PR with `ghx pr create --input pr.json` (start from `ghx pr create --example`); the description is 2–3 sentences, no sections. Wait for CI with `ghx ci wait <pr>`. Merge with a merge commit, not squash.

## Excluded, with reason

- **A raw document-scope `UNDO` load onto a stored v2 document overflows the stack.** Fixed in 9f288763d9 (#3365, "refuse a loaded UNDO operation on base-reducer 1 and 2").
- **The undo-targets cache trusts an appended row's stored `error`.** By design: it assumes deterministic reducers, which the whole derivation already assumes. The cache re-derives on a rewind, a retraction or a named row (`tailAppliesIncrementally`, `packages/reactor/src/cache/kysely-write-cache.ts:1283-1302`).
- **A stored unknown base-reducer number runs as whatever the reader runs.** By design: `resolveBaseReducerVersion` (`packages/shared/document-model/base-reducer-protocol.ts:170-181`) runs it as the highest known version so a newer document stays readable; writes are still refused unless the reactor's support lists the number (merge note, "Base-reducer numbers this build does not know").
- **Action ids from clients before `generateActionId` are random.** By design: ADR 0007 orders ids per process only (`docs/adr/0007-action-ids-and-auth-clock.md:10-11`, `:36-39`); old ids cannot be reordered after the fact.
- **Lost-operation resend.** Still current; split out to `protocol-02a-lost-operation-resend.md`.

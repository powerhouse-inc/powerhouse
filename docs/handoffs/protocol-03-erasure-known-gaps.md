# Triage the open document-erasure known gaps

**Type:** Triage (confirm, recommend fix or wontfix, then stop)
**Size:** M (triage of 34 entries; each fix is S or M)   **Area:** packages/reactor, packages/reactor-privacy, packages/reactor-api, packages/reactor-drive, packages/reactor-workflow, packages/shared, apps/switchboard

## Context

Document erasure merged as #3147/#3151. A purge is requested through the privacy subgraph's `requestErasure` mutation (`packages/reactor-privacy/src/subgraph/schema.ts`, supreme admins, `PH_PRIVACY_ENABLED`), queued by the erasure scheduler (`packages/reactor-privacy/src/erasure/scheduler.ts`), and run by `DocumentPurgeService` (`packages/reactor/src/admin/document-purge-service.ts`). Peers receive a signed purge marker over sync.

The merge-time deviation note recorded 38 open items and pre-existing bugs:

```
git -C /Users/benjaminjordan/projects/powerhouse/powerhouse show 38cdedc760^:docs/plans/2026-09-30-document-erasure-deviations.md
```

(sections "Open items" and "Pre-existing bugs found, not fixed"). These are known limitations recorded at merge, not committed work. Nobody has decided any must be fixed.

Re-checked against main b957b9e811 on 2026-11-11: 4 fixed, 2 by design, 1 outside the repo, 31 still current. Two bullets have two independent parts (sync 4, workflow), and one fixed item left a residual, so the list below has 34 entries. Ten (entries 25-34) are pre-existing bugs, not erasure defects. Paths are relative to the repo root.

## Problem

Each entry states today's behaviour with a citation. Lines are as of b957b9e811.

## Goal

For each entry: confirm it, judge whether it is worth fixing, and record Implement, Decide or Wontfix with a reason. Stop with that table. Implement only entries marked Implement after review, batched into small PRs by area.

## Acceptance criteria

- A table with one row per entry: confirmed (yes/no, file:line), verdict, one-line reason, size.
- Every Wontfix names where the limit gets documented (code comment, package README, `apps/academy/docs/academy/04-Reference/01-Reactor/12-DocumentErasure.md`, or `docs/TROUBLESHOOTING.md`).
- No code changes in the triage.

## Constraints and invariants

- Replica agreement: what a receiver admits for a marker must be the same on every replica. Changes to marker admission or refusal (entry 20) are protocol changes: deterministic, fleet-wide.
- Error names cross the queue and worker hops; only `name`, `message`, `stack` and `documentId` survive. A new terminal error joins `JobResultHandler`'s allow-list (`packages/reactor/src/executor/job-result-handler.ts`; `docs/TROUBLESHOOTING.md`, "A new terminal job error retries until the limit"). Sync recognises a purged load by name and `documentId` (`isPurgedFailure`, `packages/reactor/src/sync/sync-manager.ts:268-275`).
- Purged data must never be re-served or re-cached; any change near the fence (`packages/reactor/src/read-models/base-read-model.ts`, `purgeFence`) keeps that.
- Base-reducer 1 and 2 behaviour is frozen; nothing here should need to touch it.

## Entries

### Release, CI and operations

1. **No env var for `jobTimeoutMs`.** Default 30 s (`packages/reactor/src/executor/types.ts:185`, field `:201`). Switchboard passes only `maxSkipThreshold` and `featureFlags` (`apps/switchboard/src/builder-defaults.mts:41-44`, `apps/switchboard/src/server.mts:926-929`). An `allowLarge` purge needs more. Fix: `REACTOR_JOB_TIMEOUT_MS` in `apps/switchboard/src/config/from-env.ts`. Call: Implement (S).
2. **A refused privacy subgraph is silent** (residual of the fixed `core = false` item). `registerSubgraphInstance` returns `undefined` on rejection (`packages/reactor-api/src/graphql/graphql-manager.ts:1298-1299`); `apps/switchboard/src/privacy.mts:181-189` ignores the result and logs "Privacy add-on started". The note intended this to be boot-fatal. Fix: throw `PrivacyBootError` on `undefined`. Call: Implement (S).

### Erasure scheduler

3. **Full pass scans every active item.** `activeItems()` has no limit (`packages/reactor-privacy/src/erasure/scheduler.ts:366-391`, run each `intervalMs`, `:269-273`). Fix: keyset pages. Call: Decide; measure at 10k items first.
4. **Old clients and relays never report a refusal.** Refusals arrive only from clients that announce `marker-refusal` (`packages/reactor-api/src/graphql/reactor/resolvers.ts:2364`; client side `packages/reactor/src/sync/channels/gql-req-channel.ts:949`). The host does not check the feature, so an old client reads as converged once its cursor passes the marker (documented, `apps/academy/docs/academy/04-Reference/01-Reactor/12-DocumentErasure.md:132`). Fix: a remote without the feature reads as unconfirmed until `markerGrace`. Call: Decide (changes the reported outcome, not delivery).
5. **`SyncManager.records` goes stale after the scheduler deletes a remote.** The scheduler deletes `sync_remotes` and `sync_received_markers` rows with raw SQL (`scheduler.ts:891`, `:905`); a remote kept after a failed start stays in `records` (`packages/reactor/src/sync/sync-manager.ts:383`, `:1503`). Fix: a `SyncManager` method that deletes and forgets. Call: Implement (S).
6. **`enqueuePurge` with several ids can run them concurrently.** Enqueues race and failures are swallowed (`packages/reactor/src/admin/document-purge-service.ts:82-86`); the capacity check precedes an awaited dequeue (`packages/reactor/src/executor/simple-job-executor-manager.ts:96-101`, `:149-163`). The scheduler passes one id (`scheduler.ts:678`), so only other callers are exposed. Fix: reserve the slot before dequeue; log rejected emits. Call: Implement (S), or document "one id at a time".

### Sync

7. **Entries after a pending marker are not trimmed while the ack is held.** The inbox never acks past an unapplied marker (`packages/reactor/src/sync/mailbox.ts:20`, `:161`), so the sender keeps later entries, capped by `maxHeldOperationsPerRemote` (default 10 000; `sync-manager.ts:3326`). Follows from the ack-hold contract. Fix: selective ack of the marker. Call: likely Wontfix; the cap bounds it.
8. **A marker re-push waits up to 300 s after a remote restarts.** Unacked markers are re-pushed only after `retryMaxDelayMs` (`gql-req-channel.ts:1272`, called at `:615`; default in `packages/reactor/src/sync/channels/gql-request-channel-factory.ts:94`). Fix: re-push at once when the poll shows a restart. Call: Decide.

### Processors, read models and notifications

9. **Owed cursor rows warn forever; released rows are never cleaned.** `packages/reactor/src/processors/processor-manager.ts:747` (warn and keep), `:993` (`releaseCursors`); the only delete is `:1557`. Fix: drop orphaned owed rows as the live path does (`:819`); GC released rows. Call: Implement (S).
10. **`seedRegistry` race** (in the workflow service, not `ProcessorManager`). `seedRegistry` registers from a `find()` snapshot (`packages/reactor-workflow/src/reactor/service.ts:1357`); deletion and purge paths do not wait for it (`:2173`), so a stale snapshot may re-arm a workflow deleted or purged during seeding (not reproduced). Fix: gate on `seedPromise`. Call: reproduce, then Implement (S).
11. **`isNamespaceDrive` returns false silently with no drive id.** `packages/shared/processors/relational/types.ts:133`; documented in academy (`apps/academy/docs/academy/03-Build/04-WorkWithData/06-RelationalDbProcessor.md:301`). Fix: warn once. Call: Implement (S).
12. **An owed deletion creates a relational namespace only to drop it.** `eraseDrive` runs the factory as-is (`processor-manager.ts:1049`); the generated factory creates and migrates the schema (`packages/codegen/src/templates/processors/relational-db/factory.ts`, `packages/shared/processors/relational/utils.ts:84`). Fix: pass a deleted-drive flag so the template skips `createNamespace`/`initAndUpgrade`. Call: Wontfix unless it shows in boot time.
13. **A processor that always throws on deletion is redelivered on every registration.** Rows stay `errored` (`processor-manager.ts:551`, `:590`); `eraseOwed` runs on every `init` and `registerFactory` (`:176`, `:221`). Fix: park after N attempts. Call: Implement (S).
14. **No tombstone cache for processor delivery.** One `findPurged` per routed batch and per backfill page (`processor-manager.ts:771`, `:776`, `:1153`). Fix: an in-process set of purged ids, filled from markers and a startup load, queried only on a miss. Call: Decide; measure with the sync bench first.
15. **Workflow fires made while the journal was down are in memory only.** `unjournaledFires`, capped at 65 536 (`service.ts:2250`, `:583`). A restart forgets them. Fix: persist the keys to the dedupe store when the journal reopens, or do not fire while it is down. Call: Decide (M).
16. **A third-party trigger registration with no in-memory binding never runs `onDisable`.** `packages/reactor-workflow/src/reactor/trigger-supervisor.ts:1444`, `:1457`; `service.ts:1487` says so. Fix: resolve a binding from the row's block identity through the piece catalog before disabling. Call: Decide (M).
17. **The attachment residual race is untested.** The `"skip"` fence checks `findPurged` and writes without a lock (`base-read-model.ts:473`); the purge tests (`packages/reactor-attachments/test/read-models/attachment-reference/purge.test.ts:170`, `:191`, `:222`) never commit a purge between check and write. Fix: one Postgres test. Call: Implement (S).
18. **`SubscriptionNotificationReadModel` is live-only.** No cursor or sweep (`packages/reactor/src/subs/subscription-notification-read-model.ts:20`, `:48`); `appliedDeletion` is set only in the live context (`packages/reactor/src/executor/simple-job-executor.ts:1448`). A marker reached only by a sweep emits no Deleted. Fix: emit purge notices from the swept path, reading the deletion from stored state. Call: Decide (M).
19. **The GraphQL subscription does not carry `purged`.** `DocumentChangeContext` has only `parentId`, `childId` (`packages/reactor-api/src/graphql/reactor/schema.graphql:343-346`); the in-process client sets it (`packages/reactor/src/client/types.ts:84`). A GraphQL client shows "deleted", not "erased". Fix: add `purged: Boolean`, regenerate through codegen. Call: Implement (S) if Connect over GraphQL needs the notice.

### Executor and storage

20. **A marker load has no size cap; a timeout retries.** `preparePurgeLoad` (`simple-job-executor.ts:1387`) has no `maxPurgeOperations` check, unlike the local path (`:1357-1367`). `TimeoutError` is not terminal (`job-result-handler.ts:197-222`), and sync retries the marker without limit (`sync-manager.ts:3011-3041`). Fix: cap on load with a named terminal error that sync dead-letters as `MARKER_REFUSED`. Protocol change: every replica must apply the same cap. Call: Decide.
21. **1 024 lock buckets block about 39% of 500-id locked read-model batches during a purge.** `PURGE_LOCK_BUCKETS` (`packages/reactor/src/storage/kysely/document-purges.ts:8`, key at `:28`). Fix: more buckets; per-id keys exhausted the lock table before (note, "Stage 1"). Call: Decide; measure.
22. **Precondition 1 misses a branch holding only global or local rows.** Branches come from document-scope streams only (`simple-job-executor.ts:1296-1325`, `heldStreams` `:1543-1555`). Probably unreachable. Fix: list branches from every stream and refuse any without readable deleted state. Call: Implement (S) or Wontfix.
23. **A keyframe written after the job commits can run in autocommit.** Fire-and-forget write on the job transaction (`packages/reactor/src/cache/kysely-write-cache.ts:588-608`, `packages/reactor/src/storage/kysely/keyframe-store.ts:176-213`). Inferred from kysely source, not reproduced. Fix: give post-commit keyframe writes their own transaction. Call: Wontfix unless reproduced.
24. **Two `PurgeFence` symbols.** Class at `packages/reactor/src/executor/util.ts:345` (not exported); read-model type at `base-read-model.ts:86`, exported at `packages/reactor/index.ts:490`. Fix: rename the class. Call: Implement (S).

### Pre-existing bugs (not erasure-specific)

25. **Agreement and decision-field fallbacks never fire on HTTP 400.** A non-OK response throws category `"http"` without reading the body (`gql-req-channel.ts:1629-1635`); `classifyError` makes a 4xx unrecoverable (`:1341-1346`); `isAgreementRejection` and `rejectsDecisionFields` accept only `"graphql"` (`:957-966`, `:987-997`). Existing tests mock a 200 with `errors`. Confirm Apollo 5 returns 400 for an unknown field before fixing. Fix: parse a 4xx body for `errors`. Call: Implement (S).
26. **`getBySlug` throws a plain `Error`.** `packages/reactor/src/core/reactor.ts:275`. Fix: `DocumentNotFoundError`. Call: Implement (S); check callers matching the message.
27. **The cascade planner reads `getIncoming` without paging.** `packages/reactor/src/client/write-client.ts:866-873`; indexer default limit 100 (`packages/reactor/src/storage/kysely/document-indexer.ts:227`). A target with over 100 incoming edges loses removals. Call: Implement (S).
28. **`deleteDocuments` runs cascades concurrently with no ordering.** `write-client.ts:930-945`, `packages/reactor/src/client/reactor-client.ts:787-802`. Fix: one merged plan, one batch. Call: Implement (M).
29. **`BatchAggregator` leaks a pending batch for a job that never settles.** `packages/reactor/src/sync/batch-aggregator.ts:39`, removal only at `:172-179`. Call: Implement (S): evict on a terminal tracker status or cap.
30. **The Reactor's `JOB_FAILED` subscriber is never disposed.** `reactor.ts:157-167`; `kill()` runs only constructor disposers (`:183`). Call: Implement (S).
31. **`NodeProcessor` works only when the drive schema equals `REACTOR_SCHEMA`.** ViewState and the watermark probe use the drive-scoped handle (`packages/reactor-drive/src/processors/node-processor.ts:135-150`; `base-read-model.ts:529`, `:577`). Fix: a separate handle for ViewState and the probe, as `purgeLookup` already has. Call: Decide (M): is a separate drive schema supported?
32. **Models from `withReadModel` / `withReadModelFactory` never get `attachCatchUp`.** `packages/reactor/src/core/reactor-builder.ts:504`, `:516`; only built-ins are attached (`:1390-1405`). Call: Implement (S).
33. **`NodeProcessor` suffix replay re-inserts a deleted, unpurged child.** Only `findPurged` guards the replay (`node-processor.ts:285`, `:318-328`, `:621-629`). Read from code, not reproduced. Fix: also skip targets marked deleted in the reactor schema, through `purgeLookup`. Call: reproduce, then Implement (S).
34. **Test factory cleanup runs twice when `create()` throws.** `beforeEach` never resets `cleanup` (e.g. `packages/reactor/test/storage/sync-remote/unit.test.ts:16-24`; factory `packages/reactor/test/factories.ts:1081-1084`). Call: Implement (S), test-only.

## Suggested approach

Work area by area. Confirm each entry at its citation; where a call says "measure" or "reproduce", do that first. Fill the table and stop. Entries 1, 2, 5, 9, 11, 24, 26, 27, 29, 30, 32 and 34 look like one-commit fixes; group them into two or three PRs after review.

## Verify

- Triage: no code changes.
- Later PRs: `pnpm tsc --build`, `pnpm test`, `pnpm lint` in each touched package. Erasure suites need Postgres (`REACTOR_TEST_PG_URL`; see `docs/TROUBLESHOOTING.md` on compose `ports: !override`). The reactor-privacy and reactor-workflow Postgres suites run in `.github/workflows/check-pr-reactor.yml` shard 3 (`:113-121`).

## Working rules

- Work in a git worktree on a new branch; the main checkout is shared with other sessions — never `checkout -b` in it.
- Read docs/TROUBLESHOOTING.md first. Workspace deps load from dist/: run `pnpm build` in each dependency you touched (and @powerhousedao/shared if changed) before trusting a test result.
- Verify with the real commands (`pnpm tsc --build`, `pnpm test`, `pnpm lint`) in each package you touched. No retry logic to paper over flakes.
- Keep comments terse; default to none.
- Open the PR with `ghx pr create --input pr.json` (start from `ghx pr create --example`); the description is 2–3 sentences, no sections. Wait for CI with `ghx ci wait <pr>`. Merge with a merge commit, not squash.

## Excluded, with reason

- **`isPurgedFailure` matched message text.** Fixed in 3290fcb277: matches `name` and `documentId` (`packages/reactor/src/sync/sync-manager.ts:268-275`).
- **reactor-privacy tests did not run in CI.** Fixed in 152ecff77b: `pnpm test:reactor-packages` in `check-pr-reactor.yml:113-115`. Residual: the workflow triggers on `packages/reactor*/**` only, so a change to `packages/shared` alone does not run it; same for every reactor package, so not erasure-specific.
- **The reactor-workflow Postgres purge suite did not run in CI.** Fixed in 72215b2acd: `check-pr-reactor.yml:117-121`.
- **The privacy subgraph registered with `core = false` could collide.** Fixed in 9853df4aab: host origin outranks package and model subgraphs. Residual kept as entry 2.
- **reactor-privacy is `publishConfig.access: public`.** By design: switchboard is published and depends on it (`packages/reactor-privacy/package.json:11-13`, `apps/switchboard/package.json:118`).
- **OpenPanel and Vetra's Codegen processor receive drive deletions outside their filter.** By design: a deleted drive's processors get the deletion whatever their filter (`packages/reactor/src/processors/processor-manager.ts:505`; academy `04-Reference/01-Reactor/05-Processors.md:266`). Both already skip it by type.
- **Recipes-repo processors handle only `DELETE_DOCUMENT`; `ACADEMY_LLM_COMPLETE.md` is stale.** Recipes is outside this repo. Both `apps/academy/ACADEMY_LLM_COMPLETE.md` copies are already slated for deletion in `docs/plans/2026-09-30-graphql-document-argument-names.md` (via `docs/HANDOFF.md`).

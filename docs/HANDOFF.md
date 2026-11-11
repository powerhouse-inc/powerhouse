# Handoff

State of open work as of 2026-11-06 (main `a88b2cfb13`).

## Start here

- `docs/TROUBLESHOOTING.md` - build, test, CI and runtime traps.
- `.claude/README.md` - repo agents, commands and the bench pipeline.
- `docs/adr/` - architecture decisions. `docs/specs/auth-scope.md` - auth scope design and stage status.
- `RELEASE.md`, `docs/BREAKING-CHANGES-GUIDE.md` - release flow.
- `docs/handoffs/` - agent task prompts for open reactor work, one per item; index in its `README.md`.

## Plans in progress

Each plan's Status line says what is done and what remains.

| Plan | Remaining |
|---|---|
| `docs/plans/2026-09-30-graphql-document-argument-names.md` | Stage 5b leftovers (lb-loadtest, switchboard-lb `mixed-load.js`), 5c-5e (`operations.graphql`, reactor-browser, renown), delete both `ACADEMY_LLM_COMPLETE.md`, stage 7 (recipes `anonymous-subscriptions`), then drop the deprecated args |
| `docs/plans/2026-10-01-subgraph-attachments.md` | Route workflow attachment reads through `AuthorizedAttachmentService` (stage 2 as written is obsolete), refuse an expired upload-first send |
| `docs/plans/2026-10-02-reactor-tests-on-windows.md` | Track D: reactor gate in `check-windows.yml` |
| `docs/plans/2026-10-02-testing-policy.md`, `-rollout.md` | Proof fixes and backfills landed; phase 0 (adopt the policy, CLAUDE.md pointers, review checklist) never done |
| `docs/plans/2026-10-13-uniform-runners.md` | Built behind `FEATURE_UNIFORM_RUNNERS_ENABLED`; flip on, remove flag, delete legacy boot paths |

## Open work without a plan

- **Auth scope stages 9-10.** Migrate permission tables to grants, then retire the tables. Enforcement cannot be turned on until stage 9 lands; all four auth flags default off. Until then an unprotected document is readable by anyone (`packages/reactor-api/src/services/authorization.service.ts`). See `docs/specs/auth-scope.md`.
- **Remove the `documentDecisions` flag.** Intended to be always on; still defaults off in `packages/reactor/src/core/feature-flags.ts`. Not started.
- **Lost rows after a peer narrows its protocol.** Rows refused as `PEER_PROTOCOL_UNSUPPORTED` are never resent once the peer widens again. No code test pins it; only `noLostRows` in `packages/reactor/spec/PeerAgreement.qnt` fails. `packages/reactor/test/sync/lost-operation-resend.test.ts` pins a different defect (#6, `excludeSourceRemote` at `packages/reactor/src/sync/sync-manager.ts:3573`: a replica that lost its own live operation is never re-sent it); its pins at `:438` and `:594` are base-reducer 2 skip bugs.
- **Multi-reactor:** rewind/replay protocol was deferred. Remote admin is partial: holds are on GraphQL (`syncHolds`, 9f475e2f97), and the inspection-admin subgraph (`INSPECTION_ADMIN_ENABLED`) serves processor, catch-up priority, telemetry and keyframe levers. Queue pause/resume, catch-up sweep, rebuilds and the three `ISyncAdmin` levers have no GraphQL field (`queryDb` deliberately has none). The monitor's remote handle still refuses `listHolds`.
- **Peer UNDO inside a load reshuffle**, base-reducer 2 documents only. `it.fails` in `packages/reactor/test/executor/load-rewind.test.ts`. Base-reducer 3 (the default) passes.
- **undici HTTP 421 retry.** Worked around in `packages/reactor-browser/src/graphql-client/transport.ts`; never reported upstream.
- **Hybrid projection worker** (#2988, plan removed): never benchmarked against Run 11 (needs a bench-host hybrid mode); staging parity checks and the `REACTOR_PROJECTION_WORKER=1` rollout belong to powerhouse-k8s-hosting.
- **Reactor worker** (#3167, plan removed): nothing checks `typeof SharedWorker` before starting it, and no doc states browser support. New projects default to it via the hosts scaffold; legacy config still defaults off.
- **Small:** no `events` before/after bench record for read-side catch-up (#3124); the `DYNAMIC_BASE_PLACEHOLDER` rewrite from #3167 was never verified.

## Known gaps in landed work

Known limitations recorded at merge in deviation notes removed with their plans; read them with `git show 38cdedc760^:<path>`. Not committed work: nobody has decided any must be fixed. Checked against main `b957b9e811` on 2026-11-11; the items below still describe current behaviour.

`docs/plans/2026-10-19-undo-v3-deviations.md` - "Known gaps": 11 recorded, 1 fixed (#3365), 3 by design, 7 current:

- Lost-operation resend: no path re-sends a row behind the cursor or sourced from the receiver (`packages/reactor/src/sync/sync-manager.ts:3573`); `it.fails` in `packages/reactor/test/sync/lost-operation-resend.test.ts`.
- Light client asks `createDefaults` twice per create (`packages/reactor-browser/src/graphql-client/graphql-reactor-client.ts:1250-1251`, `remote-controller/remote-controller.ts:375-384`).
- A copy keeps its source's versions (`packages/reactor/src/client/drive-write-client.ts:133-145`).
- Workflow editor and reactor-mcp plan undo from the whole history (`packages/reactor-mcp/src/tools/operations.ts:440-461`, `packages/workflow/editors/shared/editor-chrome.tsx:66-84`).
- Local-channel receiver drops a release push at or below its inbox ack (`packages/reactor/src/sync/channels/local-channel.ts:344`); `it.fails` in `packages/reactor/test/sync/channels/local-channel/unit.test.ts:538`.
- A release's outbox is not persisted; the hold is removed before delivery (`sync-manager.ts:1074-1089`).
- An empty timestamp is not refused before the v3 sort (`packages/reactor/src/executor/simple-job-executor.ts:1066`, `:1897-1913`).

`docs/plans/2026-09-30-document-erasure-deviations.md` - "Open items" and "Pre-existing bugs found, not fixed": 38 recorded, 4 fixed, 2 by design, 1 outside the repo, 31 current. Two of those have independent parts (one sync item, one workflow item) and a fixed item left a residual, so 34 lines below. The last ten are pre-existing bugs, not erasure defects.

- No env var for `jobTimeoutMs` (`apps/switchboard/src/builder-defaults.mts:41-44`).
- A refused privacy subgraph is silent; boot logs "Privacy add-on started" (`apps/switchboard/src/privacy.mts:181-189`).
- Erasure scheduler's full pass scans every active item (`packages/reactor-privacy/src/erasure/scheduler.ts:366-391`).
- Old clients and relays never report a marker refusal and read as converged (`packages/reactor-api/src/graphql/reactor/resolvers.ts:2364`).
- `SyncManager.records` goes stale after the scheduler deletes a remote with raw SQL (`scheduler.ts:891`, `:905`).
- `enqueuePurge` with several ids can run them concurrently (`packages/reactor/src/admin/document-purge-service.ts:82-86`).
- Entries after a pending marker are not trimmed while the ack is held (`packages/reactor/src/sync/mailbox.ts:161`).
- A marker re-push waits up to 300 s after a remote restarts (`packages/reactor/src/sync/channels/gql-req-channel.ts:1272`).
- Owed processor cursor rows warn forever; released rows are never cleaned (`packages/reactor/src/processors/processor-manager.ts:747`, `:993`).
- Workflow `seedRegistry` can re-arm a workflow deleted during seeding (`packages/reactor-workflow/src/reactor/service.ts:1357`); not reproduced.
- `isNamespaceDrive` returns false silently with no drive id (`packages/shared/processors/relational/types.ts:133`).
- An owed deletion creates a relational namespace only to drop it (`processor-manager.ts:1049`).
- A processor that always throws on deletion is redelivered on every registration (`processor-manager.ts:176`, `:221`).
- No tombstone cache for processor delivery; one `findPurged` per batch (`processor-manager.ts:771`).
- Workflow fires made while the journal was down are in memory only (`service.ts:2250`).
- A trigger registration with no in-memory binding never runs `onDisable` (`packages/reactor-workflow/src/reactor/trigger-supervisor.ts:1444`).
- The attachment purge-fence race is untested (`packages/reactor/src/read-models/base-read-model.ts:473`).
- `SubscriptionNotificationReadModel` is live-only; a swept marker emits no Deleted (`packages/reactor/src/subs/subscription-notification-read-model.ts:20`).
- The GraphQL subscription does not carry `purged` (`packages/reactor-api/src/graphql/reactor/schema.graphql:343-346`).
- A marker load has no size cap, and a timeout retries without limit (`simple-job-executor.ts:1387`).
- 1 024 purge lock buckets block about 39% of 500-id locked read-model batches (`packages/reactor/src/storage/kysely/document-purges.ts:8`).
- Purge precondition 1 misses a branch holding only global or local rows (`simple-job-executor.ts:1296-1325`).
- A keyframe written after the job commits can run in autocommit (`packages/reactor/src/cache/kysely-write-cache.ts:588-608`); not reproduced.
- Two `PurgeFence` symbols (`packages/reactor/src/executor/util.ts:345`, `base-read-model.ts:86`).
- Agreement and decision-field fallbacks never fire on HTTP 400 (`gql-req-channel.ts:1629-1635`).
- `getBySlug` throws a plain `Error` (`packages/reactor/src/core/reactor.ts:275`).
- The cascade planner reads `getIncoming` without paging (`packages/reactor/src/client/write-client.ts:866-873`).
- `deleteDocuments` runs cascades concurrently with no ordering (`write-client.ts:930-945`).
- `BatchAggregator` leaks a pending batch for a job that never settles (`packages/reactor/src/sync/batch-aggregator.ts:39`).
- The Reactor's `JOB_FAILED` subscriber is never disposed (`reactor.ts:157-167`).
- `NodeProcessor` works only when the drive schema equals `REACTOR_SCHEMA` (`packages/reactor-drive/src/processors/node-processor.ts:135-150`).
- Models from `withReadModel` / `withReadModelFactory` never get `attachCatchUp` (`packages/reactor/src/core/reactor-builder.ts:504`, `:516`).
- `NodeProcessor` suffix replay re-inserts a deleted, unpurged child (`node-processor.ts:318-328`); not reproduced.
- Test factory cleanup runs twice when `create()` throws (`packages/reactor/test/storage/sync-remote/unit.test.ts:16-24`).

`docs/plans/2026-10-01-retire-atomic-node-fs-deviations.md` - the downgrade path was never tested.

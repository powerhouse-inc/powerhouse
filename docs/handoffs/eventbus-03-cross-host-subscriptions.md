# Let GraphQL `jobChanges` and `documentChanges` see changes from every host

**Type:** Design first (write an ADR/plan, stop for review before code)
**Size:** M   **Area:** packages/reactor-api (graphql/reactor), packages/reactor (subs, job-tracker), apps/switchboard-lb

**Separate bug found while verifying (fix it on its own, not as part of this task):** the `jobChanges` poll never stops for a successful job. `ensureJobSubscription` treats a job as terminal on `"FAILED"`, `"READ_MODELS_READY"` or a set `completedAtUtcIso` (`packages/reactor-api/src/graphql/reactor/pubsub.ts:174-177`). No `JobStatus` is `"READ_MODELS_READY"` (it is `READ_READY`, `packages/reactor/src/shared/types.ts:192`), and the READ_READY transition sets no `completedAtUtcIso` (`packages/reactor/src/job-tracker/in-memory-job-tracker.ts:101-110`). The subgraph also discards the release function `ensureJobSubscription` returns (`subgraph.ts:1619`), so nothing cancels the 1 s timer. Each successful job watched by `jobChanges` keeps a poll alive for the life of the process.

## Context
Each Switchboard runs an independent reactor and owns its drives; `switchboard-lb` pins document-scoped HTTP by `Drive-Id` (`apps/switchboard-lb/conf/routes.conf:22-30`, `apps/switchboard-lb/ARCHITECTURE.md`). GraphQL subscriptions are served from in-process state: `jobChanges` polls `read.getJobStatus` on the instance holding the socket (`pubsub.ts:143-198`), and `documentChanges` is a `DocumentChangeFeed` over that instance's `read.subscribe` (`pubsub.ts:60-133`), fed by `SubscriptionNotificationReadModel` (`packages/reactor/src/subs/subscription-notification-read-model.ts:20`).

## Problem
- `/graphql/subscriptions` runs no Lua, so `$doc_id` is empty (`routes.conf:8-20`). The config comments disagree on what an empty key does: `routes.conf:24-26` says round-robin fallback, `upstreams.conf:2-7` says all such requests hash to one server. Not tested; confirm before relying on either. Either way the socket is not routed to the drive's owner.
- On a non-owner, `getJobStatus` for an unknown job returns FAILED with `JOB_NOT_FOUND_ERROR_NAME` and `documentId: ""` (`packages/reactor/src/core/reactor.ts:1167-1187`); the filter calls `servesDocument` first (`subgraph.ts:1628-1634`), which returns false for an empty id (`packages/reactor-api/src/graphql/base-subgraph.ts:397-409`), so every subscriber, admins included, hears nothing.
- `documentChanges` on a non-owner reports only writes committed on that instance.
- Impact is limited for the bundled client: `GraphQLReactorClient` waits on `jobStatus` over HTTP and uses `jobChanges` only to wake early, falling back to polling if the subscription fails (`packages/reactor-browser/src/graphql-client/graphql-reactor-client.ts:268`, :325). Raw GraphQL subscribers get nothing.
- `SubscriptionNotificationReadModel` is a post-ready read model, not a catch-up consumer, so a lost `WRITE_READY` is never reported even on the owner (deck note; not re-verified).

## Goal
An approved design for subscriptions behind the load balancer (route to owner, or fan in from all hosts), then the change, with single-instance behaviour unchanged.

## Acceptance criteria
- ADR in `docs/adr/` (use the `adr` skill) answering the questions below; stop for review.
- After approval: a test (two reactors, or an LB harness test under `apps/switchboard-lb`) showing a subscriber on instance A receives a change committed on instance B, or is routed to B.
- Unknown-job behaviour on `jobChanges` defined and tested (no false FAILED, no silent hang).
- `apps/switchboard-lb/ARCHITECTURE.md` updated for the subscription route.

## Constraints and invariants
- Authorization stays per event: `servesDocument` plus `canReadDocument` (`subgraph.ts:1625-1647`); one read gate for all consumers.
- Only `READ_READY` and `FAILED` are terminal (`shared/types.ts:184-195`).
- One `DocumentChangeFeed` per subject, shared by its sockets (`pubsub.ts:60-133`).
- Ownership: a request for another instance's drive gets a wrong-shard error (`routes.conf:26-27`); do not add a shared database between Switchboards unless the ADR decides to.

## Suggested approach
ADR questions and options:
1. Route-to-owner: pass `Drive-Id` (or a connection param) on the WS upgrade and run `route.from_header()` in the subscription location; one socket per drive owner. Simplest; client must open one socket per owner.
2. Fan-in: an index-derived change stream (an `ICatchUpConsumer` publisher, `packages/reactor/src/catch-up/types.ts`) to a broker; every instance's feed reads it. Keyed by `(documentId, scope, branch, index)`, since ordinals are per reactor.
3. `jobChanges`: needs job status readable from any host. That is the job-tracker task (`queue-01-job-tracker-hook.md`); depend on it rather than build a second store.
4. Keep, change or deprecate `jobChanges` given the client already polls `jobStatus`?

## Verify
In `packages/reactor-api`: `pnpm tsc`, `pnpm test`, `pnpm lint` (aliases reactor to source, `vitest.config.ts:19-24`). If reactor changes: `pnpm tsc --build`, `pnpm test`, `pnpm lint` in `packages/reactor`, and `pnpm build` there for packages that read its dist. LB changes: follow `apps/switchboard-lb/ARCHITECTURE.md` milestone scripts.

## Working rules
- Work in a git worktree on a new branch; the main checkout is shared with other sessions — never `checkout -b` in it.
- Read docs/TROUBLESHOOTING.md first. Workspace deps load from dist/: run `pnpm build` in each dependency you touched (and @powerhousedao/shared if changed) before trusting a test result.
- Verify with the real commands (`pnpm tsc --build`, `pnpm test`, `pnpm lint`) in each package you touched. No retry logic to paper over flakes.
- Keep comments terse; default to none.
- Open the PR with `ghx pr create --input pr.json` (start from `ghx pr create --example`); the description is 2–3 sentences, no sections. Wait for CI with `ghx ci wait <pr>`. Merge with a merge commit, not squash.

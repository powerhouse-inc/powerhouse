# Design moving a drive between Switchboards, then LB rebalancing

**Type:** Design first (write an ADR/plan, stop for review before code)
**Size:** L   **Area:** apps/switchboard-lb, apps/switchboard, packages/reactor-api, packages/reactor (sync, storage, admin), packages/reactor-browser

## Context
switchboard-lb (OpenResty) routes by `hash $doc_id consistent` with `max_fails=0` on every peer (`apps/switchboard-lb/conf/upstreams.conf:7`, :16-18); `$doc_id` is the `Drive-Id` header (`lua/route.lua:3-12`). Each Switchboard runs an independent reactor with its own store; there is no shared queue or database between instances (`ARCHITECTURE.md:47-68`). A Switchboard "owns" a drive when the drive document is in its store: `DriveOwnershipCache` walks drives at boot and asks the reactor on a miss, so drives that arrive by sync also count (`packages/reactor-api/src/graphql/gateway/drive-ownership-cache.ts:17-90`). A request for a drive the instance does not hold gets `421 Misdirected Request` (`graphql/gateway/drive-middleware.ts:49`, :192), and the browser client forgets that drive on 421 (`packages/reactor-browser/src/graphql-client/switchboard-backend.ts:284`, `errors.ts:23-36`).

## Problem
- Rebalancing is a stated non-goal: "Pinning is sticky once established" (`apps/switchboard-lb/ARCHITECTURE.md:23`). An external `doc_id → backend` directory is deferred because Switchboard has no migration support (§5.4, :268-270).
- Adding a backend remaps about 1/N of drives; removing one makes its drives unroutable. Both are maintenance events and "the backend list is effectively immutable in prod" (§6.3, :291-296). Open question Q4, "How do operators migrate a document between backends?", is undecided (:368).
- No tool moves a drive's stored data between Switchboards. `ph` has no such command (`clis/ph-cli/src/commands/`); the only local purge origin is `DocumentPurgeService` (`packages/reactor/src/admin/document-purge-service.ts:19`), driven by the erasure scheduler, so "remove the drive from the source" has no supported path either.
- On failure the LB keeps routing to the dead pin (503) by design (`ARCHITECTURE.md:246`, :262); there is no failover target because no other instance has the data.

## Goal
An approved ADR that defines how one drive (with its child documents) moves from Switchboard A to B without lost or duplicated operations, and how the LB learns the new owner; implementation follows in reviewed stages.

## Acceptance criteria
- ADR in `docs/adr/` (use the `adr` skill; next number is 0009). Stop for review before code.
- The ADR has a data inventory per drive, built from `packages/reactor/src/storage/migrations/`: operations and keyframes, index and read-model rows (rebuildable or not), write identity (`028`), sync remotes, holds, received markers and purge refusals (`021`-`027`), purge tombstones (`024`), permission tables (`029`), attachments (reactor-api attachment store). For each: copy, rebuild on B, or drop.
- It defines the cutover: how A stops accepting writes for the drive, how in-flight jobs and sync peers are handled, and when B starts answering instead of 421.
- It picks the LB side: ring remap with a coordinated move of the remapped drives, or an explicit directory (§5.4), and updates `ARCHITECTURE.md` §1, §5.4, §6.3 and Q4.
- Each later implementation stage has its own tests, including a two-Switchboard test that moves a drive under write load and checks operation counts and document state on both sides.

## Constraints and invariants
- For a drive, all successful mutations land on one backend at a time (`ARCHITECTURE.md:254-256`). No window where A and B both accept writes.
- Routing stays advisory: the owner's 421 is what corrects a misroute (`ARCHITECTURE.md:11`), so B must not answer for a drive before its data is complete, and A must 421 after cutover.
- Sync peers dedup by action id (`packages/reactor/src/sync/sync-manager.ts:1100-1104`); operation identity and signatures must survive the move unchanged.
- Purges and erasure (`reactor-privacy`) must not be undone by copying a tombstoned document back.
- The LB must still never silently re-route a pinned drive to an instance without its data (`ARCHITECTURE.md:262`).

## Suggested approach
Questions and options for the ADR:
1. Transport: (a) reuse sync, B pulls the drive from A as a remote (drives already arrive by sync, `drive-ownership-cache.ts:52-56`), then cut over; (b) dump and restore of the drive's rows between databases; (c) a reactor-level export/import of operations replayed on B.
2. Freeze on A: is there a per-drive read-only or drain mode today? None found; mark it as new work and say where it lives (drive middleware vs reactor queue).
3. Removal from A after cutover: a non-erasure delete path, or keep the data and rely on 421 plus the ownership cache's `remove()`.
4. LB: ring change plus moving exactly the remapped drives (needs a tool that lists them from the ring), vs a directory consulted in `balancer_by_lua` (§9 Q1 chose the native hash directive for the MVP and names a directory as the case for Lua balancing, `ARCHITECTURE.md:356-358`).
5. Operator interface: a `ph` command, a Switchboard admin mutation, or a script under `apps/switchboard-lb/scripts`.
Open question: how a document that belongs to more than one drive moves. The LB pins by whichever drive the client puts in `Drive-Id`, and cross-drive work is instance-to-instance (`ARCHITECTURE.md:235-238`), so a per-drive move must decide which instance keeps shared documents.

## Verify
- switchboard-lb has no pnpm scripts: `apps/switchboard-lb/scripts/test.sh` (busted in Docker) and `apps/switchboard-lb/test/integration/*.sh`.
- Reactor and reactor-api changes: `pnpm build` in packages/reactor then packages/reactor-api; in each touched package `pnpm tsc --build`, `pnpm test`, `pnpm lint`; apps/switchboard `pnpm test`.

## Working rules
- Work in a git worktree on a new branch; the main checkout is shared with other sessions — never `checkout -b` in it.
- Read docs/TROUBLESHOOTING.md first. Workspace deps load from dist/: run `pnpm build` in each dependency you touched (and @powerhousedao/shared if changed) before trusting a test result.
- Verify with the real commands (`pnpm tsc --build`, `pnpm test`, `pnpm lint`) in each package you touched. No retry logic to paper over flakes.
- Keep comments terse; default to none.
- Open the PR with `ghx pr create --input pr.json` (start from `ghx pr create --example`); the description is 2–3 sentences, no sections. Wait for CI with `ghx ci wait <pr>`. Merge with a merge commit, not squash.

# Design a tool that moves a drive's stored data from one Switchboard to another

> **Scope split.** The load balancer side is out of scope here: directory-based pinning, rebalancing, and adding a backend without remapping are covered by `hosts-03-rebalancing-switchboard-lb.md`. This prompt covers the data move and the hand-off between the two Switchboards. Agree the hand-off contract (when the source starts answering 421, when the LB or router flips) with that prompt's ADR, and do not duplicate it.

**Type:** Design first (write an ADR/plan, stop for review before code)
**Size:** L   **Area:** packages/reactor (sync), packages/reactor-api (gateway), apps/switchboard, apps/reactor-monitor, packages/reactor-router

## Context

A Switchboard owns a drive if the drive document exists in its reactor. `DriveOwnershipCache.holds` asks the reactor on a miss and caches a positive answer (`packages/reactor-api/src/graphql/gateway/drive-ownership-cache.ts:57-70`). The cache is filled at boot (`:32-46`), added to on create (`graphql/reactor/subgraph.ts:885`) and removed from on delete (`:1360`). A request whose `Drive-Id` the host does not hold gets a 421 (`gateway/drive-middleware.ts:36-51`, `:192`). `switchboard-lb` consistent-hashes `Drive-Id` and never rebalances (`apps/switchboard-lb/ARCHITECTURE.md:24`, `:270`, `:293`, Q4 at `:368`). On the client, `reactor-router` routes by placement, and a 421 corrects a route.

## Problem

Verified on main b957b9e811:
- No tool copies a drive's stored data between Switchboards. The monitor's "Save to host config" only edits the builder's draft (`apps/reactor-monitor/src/builder/save-placement.ts:1`, `:15-41`). It changes where the router sends requests, not where the data is.
- One primitive could move the data: a Switchboard can pull a drive from another one over sync with `remoteDrives` (`apps/switchboard/src/server.mts:1799-1812`; config `config/schema.ts:280`). Nothing drives that as a move: no cut-over, no source freeze, no completeness check, no clean-up.
- After a copy, the source still holds the drive and keeps answering for it, because ownership is "the document exists" and the positive answer is cached. Only a delete through the resolver evicts it.
- Ordinals are per reactor (`packages/reactor/src/sync/design.md:178-204`). Every Connect client's channel to the source has cursors in the source's frame (`outboxAck`) and an `ackOrdinal` the source issued. Those are meaningless at the target, so clients cannot be re-pointed. They must re-register.
- Some state does not travel by sync: attachments (`packages/reactor-attachments`), permission-table rows (`reactor-api/src/services/authorization.service.ts`, until auth stages 9-10 move them into the auth scope), workflow runs and leases, sync holds and dead letters, and processor and read-model state. The last two rebuild on the target through catch-up, but that costs time.

## Goal

An accepted ADR for a drive move: copy, verify, cut over, retire the source copy. It states what moves, what is rebuilt, the client-visible window, and the operator surface. It also defines the source/target contract that `hosts-03` relies on.

## Acceptance criteria

- The ADR defines the phases with the exact state at each step: what each side answers for the drive (200, 421, refuse writes), and what a client sees.
- It defines "complete": for example, every operation of every document in the drive's collection (`DriveCollectionId.forDrive`) is present on the target by action id, per scope and branch. It also says how that is checked.
- It lists every non-operation store and whether it is moved, rebuilt or dropped, with file:line references.
- It says how Connect clients move over: re-register, cursor reset, and the outbox of unsent local writes (pushed to the source, or re-pushed to the target and deduplicated by action id).
- It covers failure and rollback at each phase, and a move with writes in flight.
- It says where the tool runs: a `ph` CLI command, a monitor action, or an admin mutation (see `sync-02b-remote-admin-mutations.md`).

## Constraints and invariants

- A drive is writable on exactly one Switchboard at a time. The LB doc (`ARCHITECTURE.md:262`) treats split-brain write logs as the failure to avoid.
- Per-reactor ordinals and ack semantics (`design.md:178-204`). Never copy `sync_cursors` rows between stores.
- Read gates apply to the copy: a sync pull is served through the serving gate (`reactor-api/src/graphql/reactor/subgraph.ts:810-835`). The puller needs an identity that may read everything in the drive, or the copy is silently partial.
- Peer agreement: a target that cannot run a document's protocol version holds or refuses it (`sync-manager.ts:1191-1224`). A move must fail loudly rather than leave a partial copy.
- Purged documents: erasure markers must arrive before or with any rows (`sync/utils.ts:120-126`).

## Suggested approach

Start from `remoteDrives`: the target adds a pull remote for the drive. Then wait for the pull to catch up (sync status, or an action-id diff). Freeze writes on the source for that drive, with a new refusal state the drive middleware can report. Run a final pull, then evict the drive from the source's ownership cache and make the source answer 421. Flip placement (monitor or LB, per `hosts-03`). Delete the source copy last, after a grace period.

Open questions:
1. Is local scope synced? If not, how does it move? Check `filterForRemote` (`sync/utils.ts:120`) and the scope filter that `remoteDrives` uses.
2. Should the freeze be a document-level flag in the reactor or a gateway-level refusal? A gateway refusal does not stop sync pushes from other replicas.
3. Copy attachments by content hash on the target, or leave them fetch-through to the source until the copy finishes?
4. How does `reactor-router` learn the new placement? Through the 421 correction path, an explicit placement push, or both?

## Verify

The ADR is the deliverable. Use the `adr` skill. Any prototype must show, with two local Switchboards (`apps/switchboard-lb/docker-compose.real.yml` gives three real ones), that a drive moved under write load has identical action-id sets per document on the target, and that the source answers 421 afterwards. Run `pnpm bench:sync` from `packages/reactor` to size the copy.

## Working rules

- Work in a git worktree on a new branch; the main checkout is shared with other sessions — never `checkout -b` in it.
- Read docs/TROUBLESHOOTING.md first. Workspace deps load from dist/: run `pnpm build` in each dependency you touched (and @powerhousedao/shared if changed) before trusting a test result.
- Verify with the real commands (`pnpm tsc --build`, `pnpm test`, `pnpm lint`) in each package you touched. No retry logic to paper over flakes.
- Keep comments terse; default to none.
- Open the PR with `ghx pr create --input pr.json` (start from `ghx pr create --example`); the description is 2–3 sentences, no sections. Wait for CI with `ghx ci wait <pr>`. Merge with a merge commit, not squash.

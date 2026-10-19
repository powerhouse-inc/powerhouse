# Plan: Landing multi-reactor in slices

Date: 2026-10-06 (PR #3168, `feat/multi-reactor` at 8ec8ce4046)
Status: proposed. Nothing here is implemented.

## Overview

PR #3168 is about 216 commits and +66k lines across roughly five initiatives: storage self-heal, sync and local channels, the inspection plane and monitor, the router and remote backend, and workflow and attachment work. 18 of those commits fix code that is already on main, and 86 rework code added earlier in the same branch. It is too large to review or revert as one unit, and several of its pieces depend on each other through types that live in the wrong package.

This plan lands the work as ten smaller PRs instead of one merge. Each PR sits behind an abstraction that already exists in the branch, and each needs one named change before it is ready. The PRs run in four parallel lanes, each goes through a review loop before merge, and #3168 shrinks as they land until only the last slice is left.

From a high level, we propose moving self-heal assembly into `ReactorBuilder`, splitting read interfaces from repair interfaces, moving the local peer registry and the capability record into `@powerhousedao/reactor`, and giving the router a narrower `IRoutableBackend` in place of `IReactorClient`. `reactor-monitor` lands last, or stays unmerged as a private dev tool.

## Assessment

The seams are good:

- `HardenedPGliteDialect`
- `IStorageFlusher` and `FlushGuardedSyncCursorStorage`
- `LocalChannelPort` and `CompositeChannelFactory`
- `IInspector`, served over three transports
- `RouteDispatcher` and placement by `bucketFor`
- `ILocalAttachmentBackend`

They are not simple to use. Every host builds them by hand:

- The self-heal setup is written out three times: the Connect worker, in-tab Connect, and the monitor.
- The local peer registry is copied twice, and the copies already build their keys differently.
- The capability record has four shapes. The same Switchboard gets `workflows: true` from the monitor and `workflows: false` from Connect.

They leak:

- The capability record is defined in `reactor-monitor`, a dev-only package, and `reactor-router` depends on it.
- Elsewhere, missing support is found out by trial: a call throws (in five different ways), the UI branches on reactor kind, or a stub silently does nothing.

## Gating changes

Each slice below needs one of these before it lands.

1. **Self-heal assembly in `ReactorBuilder`.** One method, such as `withSelfHealingPGlite({ pg, openInstance, onUnrecoverable })`. It builds the dialect and client, pairs deferred flush with the flusher, creates the health tracker, and attaches the storage-recreated listener before sync starts.
2. **Read and repair split apart.**
   - 2a: `ISyncInspector` becomes a read interface plus `ISyncAdmin` (rewind, reset, requeue, clear). `InspectableSyncManager` goes away.
   - 2b: `IInspector` becomes a read interface plus `IInspectorAdmin`. One operation table, with an admin flag on each operation, drives worker dispatch, GraphQL resolvers and the admin UI.
3. **Local peer registry in reactor.** `LocalChannelPortRegistry` and `registerLocalPeer` move next to `LocalChannelFactory`, and both copies are deleted. The registry owns closing the port; `LocalChannel.shutdown` only unsubscribes.
4. **Capability facts in reactor.** A reactor reports its own facts through `IInspector.info()`: storage and durability, workflows, sync channels, admin tiers. Facts about how the viewer reaches it (hosting, inspection transport) stay on the handle. `reactor-router` stops depending on `reactor-monitor`.
5. **`IRoutableBackend` in `reactor-router`.** It declares the reads and writes a backend serves, plus a `supports` record. `find` support is a predicate, since it depends on the arguments. The router derives `drives`, `rename`, `createEmpty*`, the async variants and `deleteDocuments` itself. `DriveClient` takes `executeBatch`, not a whole `IReactor`.
6. **Per-process lease token.** The workflow singleton lease gets an instance token; heartbeat and release match on it. `onLost` is wired only after that.
7. **Attachment transport in `reactor-attachments`.** `MonitorAttachmentTransport` and the per-peer server and transport pairing move out of the monitor. `authorize` defaults to deny.

## PRs, in order

| # | PR | Packages | Gate | Needs |
|---|---|---|---|---|
| 1 | Sync and storage defect fixes | reactor, connect, switchboard | none | none |
| 2 | Dev worker fingerprint (remaining two commits) | builder-tools, connect | none | none |
| 3 | Sync repair actions | reactor | 2a | 1 |
| 4 | PGlite self-heal and group commit | reactor, connect | 1 | 1, 3 |
| 5 | Inbox head-of-line fix | reactor | none | 4 |
| 6 | Workflow hardening | reactor-workflow, workflow, switchboard | 6 (lease only) | none |
| 7 | Inspection surface | reactor, reactor-browser, reactor-api | 2b, 4 | 3 |
| 8 | GraphQL remote surface | reactor-api, reactor-browser | none | none |
| 9 | Local channel and composite factory | reactor, reactor-browser | 3 | 4 |
| 10 | Router, then Connect behind `multiReactor`, then attachment transfer | reactor-router, connect, reactor-attachments | 4, 5, 7 | 7, 8, 9 |

Notes per PR:

1. The fixes in the branch that apply to main as it is: the hardened dialect, poll loop fixes, cursor-after-write, missing-ancestor handling, the reshuffle early return, statement timeouts, and the workflow journal and crash-replay bounds. It has to be rebased onto main's switch to stock NodeFS. Hunks that touch the monitor are dropped.
2. Two of the four fingerprint commits already reached main with #3167.
3. The repair actions only. Inspection reads wait for PR 7.
4. This PR needs PR 3 because storage recovery resets channels through the repair interface. It carries the sync recovery edits in `SyncBuilder` and `SyncManager`, since without them a recreate closes the cursor fence for good. The in-tab Connect store moved from `relaxedDurability: true` to `false` without a deferred flush; this PR has to fix that or measure it.
5. Per-document inbox lanes and holding the ack below unapplied operations.
6. The engine fixes land first. The lease lands after gate 6. Release notes need three behaviour changes: run retention defaults to 30 days, a firing is abandoned after 3 crashed deliveries, and retries are capped at 10.
7. `IInspector` and its wire shape, the worker RPC ops, and the read half of the GraphQL inspection subgraph.
8. `executeBatch`, `meta` and `protocolVersions` over GraphQL can land as a plain API extension. The client additions follow once the `""` placeholder values and invented job fields are replaced.
9. The builder change that refuses `withChannelScheme` together with `withSync` is split into its own PR, since it breaks existing callers.
10. `reactor-router` joins the published package lists. `reactor-monitor` is marked `private: true`, or stays on the branch.

## Delivery

### Parallel lanes

The dependency table allows four lanes. PRs in the same wave run at the same time, each in its own worktree off main.

| Wave | Lane A: storage and sync | Lane B: workflow | Lane C: remote API | Lane D: inspection and routing |
|---|---|---|---|---|
| 1 | PR 1 | PR 6 (engine fixes) | PR 8 | design gate 4 and gate 5 (no code on main yet) |
| 2 | PR 3 | PR 6 (lease, gate 6) | PR 2 | |
| 3 | PR 4 | | | PR 7 |
| 4 | PR 5, PR 9 | | | |
| 5 | | | | PR 10 |

PR 1 and PR 2 both edit the Connect worker, so PR 2 waits for PR 1 instead of running beside it. PR 4 and PR 7 both touch `@powerhousedao/reactor`, but in different directories (storage vs inspector), so they can run together. A lane that finishes early takes the next PR whose dependencies have merged.

### Per-PR loop

Every PR goes through the same steps:

1. Branch from current main. Bring over the slice's commits from `feat/multi-reactor`, or re-implement them where a gating change reshapes the code. Re-implementing is expected for gates 1 to 5.
2. Apply the gating change and fix any blocking bug assigned to the slice, each with a test.
3. Run a code-review loop: review at high effort, fix the confirmed findings as separate commits, review again. Stop when a pass confirms nothing new.
4. Verify with the repo's real commands (build, lint, the package's tests) and record the commands and exit codes.
5. Open the PR with a two or three sentence description. CI failures get fixed at the cause, not re-run.
6. Merge. Then merge main into `feat/multi-reactor` (step below).

Pushing and opening each PR needs a go-ahead per PR.

### Shrinking #3168

PR #3168 is never merged as-is. After each slice lands, main is merged into `feat/multi-reactor`, and conflicts are resolved in favour of main's version, with the branch's remaining code adapted to it. Where a slice re-implemented code, the branch's copy is deleted, not kept beside it. The diff size of #3168 against main is recorded after each merge, so progress is visible as the PR shrinks.

When PR 9 has landed, what remains of #3168 should be PR 10 plus the monitor. At that point #3168 is either retargeted to become PR 10, or closed and replaced by a fresh PR 10, whichever leaves the smaller history.

## Bugs that block their slice

These block landing no matter how clean the abstraction is.

- **Local sync is cut on storage recovery** (PR 9). Recovery resets every remote, `LocalChannel.shutdown` closes a port it did not create, and the next channel either throws or gets a closed port. Operator reset and the inbox-rewind fallback hit the same path. The branch's test passes only because it hands over a fresh port before the reset. Gate 3 fixes this.
- **Rolling deploys drop the workflow lease** (PR 6). With a stable owner name, the old pod's `release()` deletes the new pod's lease. Gate 6 fixes this.
- **A recreate during build can block cursor writes until restart** (PR 4). Hosts attach the recreate listener after build, so an early recreate is never seen. Found by reading the code; not reproduced. Gate 1 fixes this.
- **The router reports real remote jobs as unknown** (PR 10). GraphQL `waitForJob` returns an empty `documentId`, which the router reads as "no such job". A 2000-job cache hides it for now.
- **The router never recognises a wrong-shard reply** (PR 10). The server's 421 arrives wrapped in a `ClientError`, and the check looks for a bare object.

## Decisions

- **Capability facts live in reactor, not `reactor-router`.** They are facts a reactor reports about itself. The router and the monitor both consume them.
- **The local peer registry lives in reactor, not `reactor-browser`.** It depends only on reactor, and it has to own closing the port next to `LocalChannelFactory`.
- **No shared "remote link" primitive.** Both link brokers live in the monitor, one calls the other, and reactors never broker ports.
- **The monitor is a dev tool.** No production package depends on it.

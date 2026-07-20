# ADR 0001 — Lazy drive sync (on-demand document sync)

- **Status:** Proposed
- **Date:** 2026-07-16
- **Deciders:** acaldas
- **Implements:** TBD (proposal)

## Context

Connect eagerly syncs an entire drive on connect. When it (or any frontend on
the sync adapter) opens a remote drive on a Switchboard reactor, it streams the
full operation history of every document from timestamp 0 and replays it locally.
Two costs follow:

1. **Cold load** — opening a drive pulls all operations of all documents,
   regardless of what the user looks at.
2. **No prioritization** — the document the user opens has no priority over the
   thousands they never touch.

The goal is **lazy sync**: sync the drive document first (it lists its children),
then sync an individual document's operations only when it is opened. Opening a
document waits for its initial sync, after which it is writable. Lazy sync must
be built on the sync protocol (not the fetch/GraphQL document subgraphs), be
opt-in, and require minimal changes in Connect.

Four verified facts about the current stack shape the decision. The sync cursor
is per-channel, collection-wide, and forward-only, so a live channel's filter
cannot be widened to backfill a document whose operations predate the cursor. A
document's operation log is global and reachable only through a collection it is
a member of (`operation-index.find` inner-joins on `document_collections`). Two
drive models coexist, and this ADR targets the legacy `powerhouse/document-drive`
model, whose node list can diverge from `document_collections`. The full verified
list, with file and code references, is in the implementation issue.

## Decision

Introduce **lazy drive sync** as an opt-in mode built on scoped sync channels.
The unit of laziness is a **document channel**, created on demand.

- **Document channels are forced, not chosen.** The forward-only cursor
  forbids mutating the drive channel's filter to add a document, so each lazily
  opened document gets its own channel scoped by `filter.documentId`. A fresh
  channel auto-backfills that document's full history from ordinal 0. Channels
  dedup by `documentId` and stay synced for the session.
- **`preloadDocuments` makes it opt-in.** `addRemoteDrive(url, { preloadDocuments })`
  defaults to eager (today's behavior); with `false` it registers only a
  drive-only channel, and child contents sync on demand. New `addRemoteDocument`/
  `removeRemoteDocument` verbs open and release document channels.
- **Status is a six-state model, not a binary.** A shared, mutating document
  needs more than loading-vs-loaded: `available` (listed, not synced),
  `loading` (backfilling), `synced` (caught up, writable), `missing` (caught up,
  a member, nothing materialized), `unreachable` (a node exists but no live
  membership), `not-referenced` (unknown). The `missing` verdict is
  membership-authoritative: assert it only after confirming membership via
  `getCollectionsForDocuments`; a node with no membership is `unreachable`.
- **Completion is a channel-level signal.** `waitForInitialSync(remoteName)`
  resolves when the initial backfill drains. It cannot come from `SyncStatus`,
  which is document-keyed and returns `undefined` for exactly the empty/missing
  case that must be detected.
- **Suspense rides a client decorator, not the cache.** A `LazyReactorClient`
  wraps `IReactorClient.get`, injected only when `preloadDocuments:false`, and
  blocks on the `waitForInitialSync` gate before re-reading. `document-cache.ts`
  is unchanged. Never cache a "not-yet" rejection, to avoid poisoning the promise
  cache.
- **Provisioning is an internal strategy.** `preloadDocuments` stays a boolean in
  the public API, but which channels opening a drive creates is a strategy, so
  future policies are not new booleans. The eager default stays byte-identical to
  today.

See the implementation issue for the public API surface, routing/re-homing
mechanics, transport (coalesced batch polling), and the optional server-side
work.

## Abstractions: kept, modified, dropped

- **Keep** — route via `getCollectionsForDocuments`; the `LazyReactorClient`
  decorator seam (zero cache changes); the `preloadDocuments` boolean plus an
  internal provisioning strategy.
- **Modify** — no single `DriveMembershipProvider`; routing runs on the uniform
  `document_collections` index (no abstraction needed), and only the model-specific
  tree/existence signal sits behind a thin provider. Combining them would invite
  using the tree for routing — the divergence bug.
- **Drop** — initial-sync-complete as a `SyncStatus` field (must be channel-level);
  a generic reference-counted subscription manager (one flavor, one consumer —
  build the concrete document registry).

## Consequences

### Positive

- Opening a lazy drive transfers only the drive document; child contents load on
  demand. First paint is proportional to the drive doc, not the drive.
- No reactor-core, operation-store, cursor, keyframe, or server changes are
  required for the client-only design. Multi-channel-per-collection and
  `add`/`remove` already exist.
- Connect changes reduce to one flag plus its existing `<Suspense>` + error
  boundary; the explicit `addRemoteDocument` verb remains for programmatic callers.
- The write/push path is unchanged: a lazily-synced document's writes push on its
  own channel, and the drive-only channel ignores them.

### Negative / risks

- **N open documents = N logical channels**, forced by the cursor model. Coalesced
  batch polling with chunking (in the issue) collapses poll cost to `ceil(N / chunk)`
  requests per endpoint per tick, so this is not a scaling ceiling — but that
  transport work is a prerequisite for opening lazy drives at scale.
- **`preloadDocuments:false` breaks whole-drive-assuming consumers.** Code that
  iterates `state.global.nodes` and calls `useDocuments(childIds)` / `find({parentId})`
  hits misses/suspends for un-opened documents; `useDocuments` returns a silent
  partial list. Audit every such caller before flipping the flag.
- **Promise-cache poisoning** if a "not-yet" state rejects before drain. Mitigated
  by the never-reject-before-drain rule.

### Confidence and revisit

Confidence is high in the channel model — it is built on existing primitives
(multi-channel-per-collection, `add`/`remove`, ordinal-0 backfill). Confidence is
medium in the batch-poll scaling claim, which is unverified at thousands of open
documents. Revisit if per-endpoint request size or server parse cost regresses,
or if `reactor-drive` becomes the default drive model.

## Known limitations (not solved in iteration 1)

- A document with no drive-collection membership (created outside any drive, or
  after leaving every drive) is unsyncable — there is no non-drive collection
  concept. Rendered as `unreachable`.
- Targets the legacy `powerhouse/document-drive` model. `reactor-drive` needs a
  different tree/existence provider (NodeProcessor read model + child headers);
  the routing/registry layer is already model-agnostic.

## Alternatives considered

- **Keep eager-only sync** (do nothing). Rejected: cold load scales with drive
  size, not usage.
- **Preview via the fetch/GraphQL document subgraphs** (`document` query returns
  materialized `state` without history). Rejected: the requirement is to stay on
  the sync protocol; it would introduce a second, divergent read path.
- **Widen the drive channel's filter on demand.** Impossible under the current
  cursor model (collection-wide, forward-only; `touchChannel` discards changed
  filters). This is what forces document channels.
- **Write directly on a snapshot before history loads.** Deferred: requires a
  baseline-revision concept in the operation store and a keyframe/state-at-revision
  server query. Iteration 1 waits for initial sync, then writes.

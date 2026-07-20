# ADR 0002 — `IReactorBrowserClient`: a swappable client interface for the reactor-browser hooks

- **Status:** Proposed
- **Date:** 2026-07-16
- **Deciders:** acaldas
- **Implements:** TBD (proposal)

## Context

`@powerhousedao/reactor-browser` ships two unrelated ways for a React app to
work with document models, and they share almost no code.

1. **The full-reactor path.** Hooks (`useDocument`, `useDocuments`,
   `useDispatch`, `useDocumentOperations`, `useDrives`) read and write through
   `window.ph.reactorClient`, an `IReactorClient` from `@powerhousedao/reactor`.
   Behind it sits the whole runtime: PGLite, a job queue, the sync manager and
   its GraphQL channels, a document indexer. It is local-first, but heavy.
   Connect and Studio use it.

2. **The `RemoteDocumentController` path.** A lightweight class that wraps a
   `PHDocumentController` (the model reducer + generated action methods) and
   syncs over plain GraphQL (`MutateDocument` / `GetDocument` /
   `GetDocumentOperations`). A plain webapp uses it when it only wants to talk to
   a remote Switchboard and does not want to boot the full reactor. `vetra.to`
   uses it for its document models.

The second path has structural problems that block the local-first flow a
webapp wants (edit while offline, push on reconnect):

- **No persistence.** State and the pending-action queue live only in memory; a
  refresh loses un-pushed edits.
- **No offline model.** No reconnect flush, no durable retry.
- **No shared cache.** Two controllers for the same document diverge.
- **Not React friendly.** Imperative methods and non-reactive objects.
- **It reimplements sync** on weaker primitives instead of reusing what already
  exists, and gets no realtime.

The two paths duplicate the same concepts (a reducer wrapper, an action tracker,
a document cache) in incompatible shapes, so a webapp cannot adopt the ergonomic
hooks (`useDocument`/`useDispatch`) without adopting the whole reactor.

The objective is one React integration, two interchangeable implementations —
the full reactor for Connect/Studio, and the light client for webapps —
with local-first writing available behind the light client. Migrating a webapp
from the light client to a reactor should be a matter of configuration.

### Implementation details

Several codebase facts constrain the design (the hooks touch only ~9
`IReactorClient` methods; the server materializes head state; operation hashes
are state-based via `hashDocumentStateForScope`; the server reshuffles rather
than hard-rejecting stale writes; Switchboard already exposes sync primitives;
`ViewFilter.revision` is not honored over GraphQL; `createClient` is server-safe
but the hooks are not; Renown is client-only; `window.ph` is both a React store
and an ambient service locator). These are catalogued in the implementation issue under "Codebase constraints".

## Decision

### 1. Define `IReactorBrowserClient` as a subset of `IReactorClient`

Define `IReactorBrowserClient` as a type-only `Pick` subset of `IReactorClient`,
so the reactor is a drop-in with zero changes and any implementation is checked
against the reactor's own signatures. The interfaces includes the read primitives
(`get`/`subscribe`), the write method (`execute`), and the document-lifecycle
methods a standalone webapp needs (`create`, `deleteDocument`); drive-scoped and
node/relationship variants stay off it.

### 2. Hooks depend on the subset; the injection mechanism is unchanged

Retype the existing `window.ph` client slot (`setReactorClient` /
`useReactorClient`) to `IReactorBrowserClient`, and on the `DocumentCache`
constructor (read subset) and `queueActions` (`execute`) accordingly.

### 3. Ship a GraphQL implementation: `GraphQLReactorClient`

Implement `GraphQLReactorClient implements IReactorBrowserClient` over
`createClient(url)`, mapping each method to an existing Switchboard operation.
The local-first machinery (IndexedDB cache, outbox, reducer) lives inside the
class, invisible to the hooks, so `RemoteDocumentController`'s responsibilities
(wrap a reducer, track actions, sign, push) collapse into `execute`.

### 4. Read path — preview the current remote state, no point-in-time replay

`get` returns the current `state` on the remote server; the read path never fetches
or replays operations. The operation list stays available (`getOperations` is part
of the interface, and `useDocumentOperations` already reads it, which is enough for an
audit log / revision list). Reconstructing state as of revision N is out of
scope: it would need client-side replay or a server-side `revision` view filter,
neither part of this decision. This keeps the default read a single cheap query.

### 5. Write path — local-first `execute`

`execute` applies actions locally, by running the reducer, and pushes them to the
remote server when available.. It needs, beyond the current state, the reducer, the
document type, and the current revision for the operation scope. It reduces each action
onto the current state, persists to IndexedDB, returns the optimistic document immediately,
and enqueues the operations for push.

### 6. Signer support carries over

Preserve `RemoteDocumentController`'s per-action signing, but make it ambient:
the client resolves the current session's `ISigner` (supplied by the provider)
at push time and signs in the `execute` write path, using the same
`signer.signAction` + `context.signer` shape. If a signer is set, every write is
signed automatically; if none is set, writes push unsigned. Signing needs only the
current state — the `previousStateHash` is the synthetic tail's hash from decision 5
— `getOperations` to fetch the operation history is not necessary to sign a new action.

### 7. Abstract `window.ph` behind a base `ReactorProvider` that defaults to the window

Replace `window.ph`'s two roles with two coordinated pieces. For the component
role, a client-only base `ReactorProvider` publishes a resolved client through
React Context, and a `GraphQLReactorProvider` wrapper builds the light client
from config (and mounts Renown when given `app`) before delegating to the base;
`useReactorClient()` reads context first and falls back to the `window.ph` store,
so Connect/Studio keep working with no provider mounted. For the ambient role
(~40+ non-component imperative call sites that cannot use `useContext`), add a
`getReactorClient()` getter over the existing `setReactorClient` writer,
defaulting to `window.ph.reactorClient`. The window stays the default backing
store, so the imperative layer migrates one module at a time with nothing
breaking in between. The migration is non-breaking: swapping an internal
`window.ph.reactorClient` read for `getReactorClient()` changes zero call sites,
and only a signature change would break callers (bounded to ~20 in-repo sites).
The light client is built in a `useState` initializer, never at module scope, so
a shared SSR instance cannot leak a per-session token or signer between requests.
Provider code and the SSR construction rule are in the issue.

### 8. React-friendly write hooks over the imperative actions

Wrap the imperative action layer in thin hooks that resolve the client via
`useReactorClient()` and return a mutation-hook shape (a memoized callback plus
`{ isPending, error }`), following the manual-`useState` pattern already in
`useDocumentOperations` so the shared hooks stay dependency-free. The document
lifecycle hooks (`useCreateDocument`, `useDeleteDocument`, `useRenameDocument`)
work against both implementations; reads and per-document writes
(`useDocument`, `useDispatch`, `useDocumentOperations`) already exist and stay.
Drive / node-tree actions (`addFile`, `moveNode`, …) call `client.drives.*`,
off the interface, so their hooks stay on the full-reactor surface.

## Choosing an implementation: full reactor vs. light client

Both implementations sit behind the same `IReactorBrowserClient` and the same
hooks, so this is a deployment choice, not an API choice. Because migrating
between them is a configuration swap (decision 1), choosing "wrong" early is
cheap. Two questions decide it.

**Q1 — who is authoritative for the data?** The light client treats a central
Switchboard as authoritative: it reads materialized head state and the server
owns reconciliation (and, optionally, signature verification), so local
verifiability is redundant. The full reactor is for when the app must be an
authority itself — materializing state locally, being the executor, reconciling
with no central server (peer-to-peer, multi-drive) — where local verifiability
matters because there is no trusted server to defer to. Rule of thumb: one
trusted Switchboard → light client; no single authority, or the app is itself a
sync node → full reactor.

**Q2 — does the app need reactor-node capabilities?** Some capabilities exist
only on the full reactor because they are kept off the shared interface (decision 1):
multi-drive management, relationships, jobs, batch and node mutations;
peer-to-peer sync and being a sync target; full offline authority; richer
client-side conflict/merge beyond the server reshuffle. Everything a standalone
webapp needs — read/edit/create/delete documents against a remote, local-first
optimistic writes with reconnect flush, SSR + hydration, smallest bundle — the
light client provides.

## Abstractions: kept, modified, dropped

- **Kept:** the `window.ph` injection mechanism (`makePHEventFunctions`), the
  hook surface, `PHDocumentController`, the document-model registry, `ISigner`
  and its `context.signer` shape, `DocumentCache`.
- **Modified:** `useReactorClient` / `DocumentCache` / `queueActions` retyped to
  `IReactorBrowserClient`; `useReactorClient` gains a context-first,
  `window.ph`-fallback lookup; `DocumentCache` gains an additive `seed(docs)`.
- **Added:** the base `ReactorProvider` and the `GraphQLReactorProvider` wrapper;
  a `getReactorClient()` ambient getter; `useReactorAuth`; the
  `@powerhousedao/reactor-browser/graphql` server-safe import path; interface-level
  mutation hooks (`useCreateDocument`/`useDeleteDocument`/`useRenameDocument`,
  optional `useDocumentHistory`).
- **Dropped (superseded):** `RemoteDocumentController` and its per-document React
  glue; its logic moves into `GraphQLReactorClient.execute` and the shared hooks.

## Consequences

### Positive

- Webapps get the ergonomic hooks (`useDocument`/`useDispatch`) without the full
  reactor runtime.
- One interface, two implementations: Connect/Studio and webapps share the whole
  hook surface, and the full reactor needs no change.
- Local-first (offline edit + reconnect push) becomes an `execute`
  implementation detail, not a per-consumer concern.
- A shared cache and realtime reactivity for the GraphQL path (via
  `DocumentCache` + `documentChanges`), which `RemoteDocumentController` lacked.
- Less duplication: the reducer-wrapper / action-tracker / cache concepts stop
  existing in two incompatible shapes.
- No `@powerhousedao/reactor` changes, so the interface lands without touching
  the reactor's release surface.
- SSR supper: public documents render on the server (no auth,
  materialized state), Renown-gated features stay client-only, and server-fetched
  data hydrates the shared `DocumentCache` via `seed` with no flash or refetch.
- Explicit, testable client injection via `ReactorProvider`, without breaking the
  ambient `window.ph` consumers.

### Negative / risks

- Local hashing must match the server exactly; if `hashDocumentStateForScope`
  semantics drift between client and server, locally-stamped hashes disagree.
  Mitigated by importing the shared function rather than reimplementing.
- Two implementations to keep behaviorally aligned (`execute` return shape, error
  semantics). The interface constrains but does not guarantee this — hence the
  conformance suite run against both.
- The ambient accessor is still a service locator. Imperative code that calls
  `getReactorClient()` keeps locator-style coupling until migrated to explicit
  injection — a deliberate, incremental compromise.

### Confidence and revisit

Confidence is high: the design reuses existing primitives (the `Pick` subset,
`makePHEventFunctions`, `hashDocumentStateForScope`, the Switchboard sync
protocol) and adds no reactor changes. Reopen this ADR if `hashDocumentStateForScope`
semantics diverge between client and server (the local write path assumes they
match), or if a webapp needs multi-drive / node capabilities that the shared interface omits
by design (that would push it onto the full reactor or force widening the `Pick`).

## Known limitations (not solved here)

- No point-in-time preview over GraphQL (missing `ViewFilterInput.revision`);
  a future server-side view filter would close it (decision 4).
- Conflict semantics are the server's reshuffle model, surfaced only as the
  reconciled result; richer client-side merge UX is out of scope.
- Outbox durability format (IndexedDB schema, retry/backoff policy) is left to
  the implementation; only the requirement is fixed here.

## Alternatives considered

- **Keep `RemoteDocumentController`, add persistence + an outbox to it.** Fixes
  offline but leaves the second, divergent abstraction and the per-document React
  glue in place, and never gives webapps the shared hooks.
- **Reuse the full reactor with a lighter storage backend** (IndexedDB instead
  of PGLite) behind the same `IReactorClient`. Still pulls in the job queue and
  sync engine; heavier than webapps need.
- **Rebuild the whole client on React Query.** React Query fits the read path
  well (`useDocument` → `useQuery`, with dedup, SWR, Suspense, and
  `dehydrate`/`HydrationBoundary` for SSR), and vetra.to already depends on it.
  It is the wrong core for the event-sourced write path: its mutation model is a
  fire-and-forget optimistic overlay that reverts on settle and owns no operation
  log, causal ordering, state-based hashing, or reconciliation.

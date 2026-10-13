# Plan: Remote Switchboards as router backends

Date: 2026-10-13 (main at 5c5f301ee5)
Status: decided. Nothing here is implemented.

## Overview

A Switchboard is already a router backend. Slice 10b put one into Connect behind `multiReactor`: `createGraphQLRoutableBackend` adapts `GraphQLReactorClient` to `IRoutableBackend`, and `buildMultiReactorClient` routes over the tab's reactor plus the Switchboard of the first default drive. Both PR 10 blockers from the decomposition plan are fixed on main.

What it does not do yet:

- Nothing is ever placed on it.
- Every drive it holds is also synced into the local reactor, and the local reactor comes first in the backend order. In practice the remote only answers for ids that the local reactor lacks.
- A hung Switchboard stalls local writes.
- It is Connect-only code, and only one remote is supported.

This plan makes the Switchboard a real home for collections. Two explicit settings describe each collection: whether the local reactor syncs it, and which remote it lives on. A synced collection is read and written locally, and sync carries the writes to its remote. A collection that is not synced is read and written on its remote directly. The plan also adds deadlines, capability facts, fresh routes, and end-to-end tests against a real Switchboard. Connect and the reactor monitor are the hosts. v1 targets single-instance Switchboards.

## Current state

### Works today

| What | Anchor |
|---|---|
| Switchboard as `IRoutableBackend`. GraphQL serves every required member. The optional ones (`isDocumentIdTaken`, `loadBatch`, relationship writes, `evaluateActions`, the module registry) and `submit` are absent by declaration. | `apps/connect/src/store/graphql-routable-backend.ts:100-173` |
| `find` support predicate: a search that names `ids`/`slugs`, or a point-in-time view, is not servable. | `packages/reactor-browser/src/graphql-client/graphql-reactor-client.ts:1494` |
| Facts from `inspection { info }` on the root endpoint. `access` is hard-coded to `{admin:false, sql:false}`. | `graphql-routable-backend.ts:18-33,164-170` |
| `Drive-Id` header, sent only for drives this backend has seen in its own responses (`KnownDrives`). | `graphql-routable-backend.ts:40-84`; `graphql-reactor-client.ts:838-856` |
| A Switchboard 421 is mapped to `GraphQLWrongBackendError`, which the router reads as a misroute. | `graphql-reactor-client.ts:1704-1740`; `packages/reactor-router/src/errors.ts:74-88` |
| Jobs carry their real `documentId` (commits `85840b82c5`, `e23e82da7e`). A `JOB_NOT_FOUND` reply becomes `undefined`. | `graphql-reactor-client.ts:1625-1660`; `graphql-routable-backend.ts:153-159` |
| Bearer token per request, and on the websocket. `notifyCredentialsChanged` reopens realtime. | `packages/reactor-browser/src/graphql-client/auth.ts:25-57`; `apps/connect/src/store/multi-reactor.ts:106` |
| Actions are signed in the tab before they leave: `execute` by state prediction, `executeBatch` per action. | `graphql-reactor-client.ts:597-650,676-720,976-1006` |
| Server side: `Drive-Id` validation, with a lookup in the reactor on a cache miss, and a 421 `{error:"wrong-shard", driveId}` body. | `packages/reactor-api/src/graphql/gateway/drive-middleware.ts:52-80,188-196`; `drive-ownership-cache.ts:52-68` |
| Router: misroute retry, `OwnershipGuard`, strict fan-in `find`, change dedup. | `packages/reactor-router/src/dispatcher.ts:635-679`; `guard.ts:35-82`; `routing-client.ts:567-598`; `subscribe-mux.ts:11-47` |
| Connect falls back to the local drive list when the router cannot list drives. | `apps/connect/src/store/app-reactor-client.ts:49-65` |
| Inspection subgraph (read-only): `info` and `documentModels` serve every caller; `drives` is read as the caller. | `packages/reactor-api/src/graphql/inspection/schema.ts:196-221` |
| The worker broadcasts its sync remote list to every tab (`SYNC_REMOTES_CHANGED_EVENT`). Today it does so only after a local peer is adopted or removed. | `packages/reactor-browser/src/rpc/reactor-host.ts:592,611,616-627`; `sync-manager-proxy.ts:43,165` |

### Missing or wrong

| # | Gap | Anchor |
|---|---|---|
| G1 | Nothing is ever placed on the remote. `PLACE_ON_LOCAL` requires `inspectable`, and the remote's reach is `inspection: "none"`. | `multi-reactor.ts:36-44,166-167`; `placement.ts:30` |
| G2 | Default drives are synced locally under `multiReactor`, so both backends hold them, and the router picks whichever backend comes first in its order. No collection can live on the remote without a local copy. | `apps/connect/src/store/reactor.ts:575,582`; `packages/reactor-browser/src/actions/drive.ts:180-245`; `dispatcher.ts:454-468`; `multi-reactor.ts:150` |
| G3 | `GraphQLReactorClient` has no request deadline. `owns()` probes every backend, and `assertNotHeldElsewhere` runs on every create, so a hung Switchboard stalls local creates and uncached reads. | `dispatcher.ts:454-468,524-541`; `guard.ts:61-82` |
| G4 | The ownership probe is `documentServed`, which runs through the read gate, so a document withheld from the caller answers "no". | `packages/reactor-api/src/graphql/reactor/subgraph.ts:477-487` |
| G5 | Learned document routes never refresh except on a refusal. `KnownDrives` never forgets a drive after a 421. | `table.ts:275-288`; `graphql-routable-backend.ts:40-63` |
| G6 | No document-type facts. A create of a type the Switchboard lacks fails remotely with an opaque error. | `packages/reactor-router/src/types.ts:33-41` |
| G7 | The signer and token come from the ambient `window.ph.renown`. The code is in `apps/connect`, so no other host can use it. | `graphql-routable-backend.ts:104-107`; `multi-reactor.ts:143-147` |
| G8 | One remote only, taken from the first default drive URL. | `app-reactor-client.ts:93-109`; `multi-reactor.ts:69-80` |
| G9 | The monitor never routes to a remote handle. | `apps/reactor-monitor/src/lib/router.ts:12-17` |
| G10 | All coverage runs against a stub Switchboard. | `apps/connect/test/store/switchboard-stub.ts` |
| G11 | Attachments use one service bound to the default-drive origin, whatever backend holds the document. | `reactor.ts:541-563` |
| G12 | Tabs learn about sync-remote changes only for local peers. Adding or removing a gql remote in one tab does not reach the others. | `reactor-host.ts:235-237` |

## Design

### 1. Descriptor and registration

The factory moves to `@powerhousedao/reactor-browser/graphql-client`. `reactor-browser` gains `@powerhousedao/reactor-router` as a dependency, imported for types only. The dependency direction (router to reactor) has no cycle, and the entry's browser-safety test still holds.

```ts
// packages/reactor-browser/src/graphql-client/switchboard-backend.ts
export type SwitchboardBackendDescriptor = {
  /** Router backend name; unique and stable for the router's life. */
  readonly name: string;
  /** `<origin>[/<prefix>]/graphql`. */
  readonly url: string;
  /** Explicit; Connect passes renown's, the monitor its handle's headers. */
  readonly tokenProvider: BearerTokenProvider;
  readonly signer: ISigner | undefined;
  readonly documentModels: () => readonly DocumentModelModule[];
  /** Bound on one request, headers through body. Default 30_000. */
  readonly requestTimeoutMs?: number;
  /** Default {failures: 3, openMs: 30_000}; see section 6. */
  readonly breaker?: { failures: number; openMs: number };
  readonly realtime?: boolean;
  /** Default "rpc"; Connect passes "none" until R6. */
  readonly inspection?: ReactorReach["inspection"];
};

export type SwitchboardBackend = {
  /** reach {hosting:"remote", inspection}; refusesMisroutes:false. */
  readonly config: RoutableBackendConfig;
  notifyCredentialsChanged(): void;
  /** Closes the realtime socket. */
  dispose(): void;
};

export function createSwitchboardBackend(
  descriptor: SwitchboardBackendDescriptor,
): SwitchboardBackend;
```

Connect builds one `SwitchboardBackend` for each entry in `instance.remoteBackends[]`. When the list is empty, it builds a single backend named `switchboard` from the first default drive's URL, which is today's behaviour. `notifyCredentialsChanged` fans out to every remote. The remote list is tab-side runtime config and stays out of the worker fingerprint, because the worker never talks to a router remote.

### 2. Capability discovery

One query at every `refreshFacts`:

```graphql
query SwitchboardFacts {
  inspection {
    info { storage { engine persistence durable selfHeal } workflows syncChannels access { admin sql } }
    documentModels { documentType supportedVersions }
  }
  __type(name: "Query") { fields { name } }
}
```

```ts
// reactor-router/src/types.ts
export type BackendFacts = {
  readonly reactor: ReactorInfo;
  readonly reach: ReactorReach;
  readonly known: boolean;
  /** Absent: the backend loads models on demand, so no constraint. */
  readonly documentTypes?: ReadonlySet<string>;
};
// RoutableBackendConfig gains:
readonly documentTypes?: () => Promise<readonly string[]>;
```

- `access` comes from the server when it is non-null; otherwise it is `{admin:false, sql:false}`.
- A Switchboard that lacks `documentServed`, `createDefaults` or `inspection` makes the facts read throw. Its facts are then `known: false`, so placement refuses it, and its probes answer `"unknown"` through the existing `queriesUnknownField` path in `isServed`.
- Before `create`, the router checks the type against the target's `documentTypes` and throws `UnsupportedByBackendError` without sending anything.
- The local backend declares no `documentTypes`, because Connect loads models on demand.
- Drives are not enumerated. A drive the remote holds is found from config, or by a probe the first time it is touched.

### 3. Collection config: sync and backend

Each collection has two settings:

- **`sync`**: whether the local reactor holds the collection and syncs it over gql. Absent means `true`.
- **`backend`**: the remote it lives on. For a synced collection, this is the sync target. For a collection with `sync: false`, it is where routed calls go. Only explicit config places a collection on a remote.

With neither setting, a default drive behaves exactly as it does today.

```jsonc
// powerhouse.config.json (connect)
"instance": {
  "multiReactor": true,
  "remoteBackends": [
    { "name": "sb", "url": "https://sb.example/graphql" }
  ],
  // Drives that are not default drives, keyed by drive id.
  "collections": {
    "<driveId>": { "backend": "sb", "sync": false }
  }
},
"drives": {
  "defaultDrives": [
    { "url": "https://sb.example/d/team", "backend": "sb" }
  ]
}
```

| `sync` | `backend` | Reads and writes | Sync remote registered | Offline |
|---|---|---|---|---|
| true (absent) | absent | local | the drive's own Switchboard for a default drive, else none | reads and writes |
| true | remote | local | the named remote | reads and writes |
| false | absent | local | none | reads and writes |
| false | remote | remote | none; an existing one is removed at boot, and its local data is ignored | none |

- **Synced collections.** Writes land on the local copy, and sync carries them to the remote, the way synced default drives work today.
- **Collections with `sync: false` and a `backend`.** Every routed call goes to that remote. These collections are online-only.
- **How Connect tells the router.** Connect turns the config into `collections` overrides: the local backend for every synced collection, and the named remote for each `sync: false` collection with a `backend`.

When both backends serve a document id, the router resolves the document's collection, so a stale local copy of a `sync: false` collection never wins:

```ts
// dispatcher.ts
async homeOf(id: string, serving: readonly RouterBackend[]): Promise<RouterBackend> {
  // A drive is its own collection; any other document is a child of one.
  const drive = isDriveId(id) ? id
    : (await serving[0].api.getIncomingRelationships(id, "child")).results[0]?.header.id;
  // drive known -> collectionRoute(drive).backend; unknown -> serving[0] (backend order)
}
```

The result is cached in the document table. The backend order now only breaks ties for documents that no configured collection holds.

During initial sync, a document of a synced collection that the remote holds but the local copy does not is served by the remote: only the remote answers the probe. Its route is provisional (section 6). Once the local copy holds the document, the next probe moves the route to local.

At boot, Connect adds or removes gql sync remotes to match the config. Today `SYNC_REMOTES_CHANGED_EVENT` fires only after a local peer is adopted or removed. R7 extends it to the sync ops `add` and `remove` (`reactor-host.ts:235-237`), so every tab's `SyncManagerProxy.list()` sees those changes.

### 4. Ownership across the network

- **Guard.** Remotes stay `refusesMisroutes: false`, so the router-side `OwnershipGuard` governs. The Switchboard refuses only drive-scoped requests that carry `Drive-Id`, and its refusal names no owner.
- **Probe.** The probe is `documentServed`, bounded by `probeTimeoutMs`. A timeout, a transport failure or an open breaker answers `"unknown"`. With `"unknown"`, `assertOwned` refuses (`guard.ts:47`), and `assertNotHeldElsewhere` lets the create proceed (`guard.ts:73`).
- **Withheld documents.** The probe stays read-gated. "Withheld" and "absent" both answer "no".
- **421 path.** A request with a `Drive-Id` gets a 421, which becomes `GraphQLWrongBackendError`, which becomes a misroute with `documentId = driveId`. The dispatcher excludes the remote for that id, forgets its routes, logs a diagnostic naming the stale override, and probes again. New: `KnownDrives.forget(driveId)` runs on the 421, so the next request stops sending the stale header.
- **Explicit placement.** A 421 can still correct a configured route, as overrides are advisory today. The diagnostic says the config is stale.

### 5. Reads, writes and subscriptions

- **Transport.** All calls go over the reactor GraphQL subgraph, and change events over its graphql-ws socket. The sync channel only replicates collections and never carries routed calls.
- **Writes.** `execute` is the `MutateDocumentWithOperations` mutation. `executeBatch` is synchronous on the server, so the jobs it returns are already settled. There is no `submit` member, so the router's async variants wait through `executeBatch` (`backend.ts:66`).
- **Write failures.** Writes are never retried on another backend (`dispatcher.ts:50-53`). A timeout on a write surfaces to the caller with the job id when one is known.
- **Reads.** A read that fails on its target is retried once on a backend that proves it holds the document (`dispatcher.ts:682-696`).
- **Subscriptions.** There is one socket per remote, filtered on the client. When two backends both report a change at the same revision, `changeKey` drops the second (`subscribe-mux.ts:11`). Intermediate revisions that differ produce extra `Updated` events; they only invalidate a cache, and no operation is duplicated. `find` dedups by id (`routing-client.ts:184,596`).
- **Socket outages.** Events missed while the socket is down are not replayed. That needs the rewind/replay protocol, which is out of scope.

### 6. Auth, signing and failure modes

| Concern | Rule |
|---|---|
| Who signs | The user's signer in the tab signs every action before it leaves, both actions the caller built and actions the router builds (`routing-client.ts:249`). The Switchboard verifies them and never signs on the user's behalf. |
| Bearer | Per request, from the descriptor's `tokenProvider`, and the same provider on the websocket `connectionParams`. Connect passes `renown.getBearerToken` without `aud`. The monitor passes its handle's `headers`. |
| Refusals | 401 and 403 are not misroutes. They surface to the caller and never fail over. |
| Inspection | Read-only. Admin mutations stay out of scope. |

| Failure | Behaviour |
|---|---|
| Remote down | After 3 consecutive transport failures the breaker opens for 30 s. A transport failure is a network error, a timeout or a 5xx; a GraphQL error with a body is an answer. While the breaker is open, every member throws without sending a request, probes answer `"unknown"`, and facts are `known: false`. Synced collections keep reading and writing locally, and sync catches up when the remote returns. Collections with `sync: false` fail until the breaker closes. Strict `find` throws `FanInPartialFailureError`, and Connect's drive list falls back to local. |
| Remote hangs | Each request rejects at `requestTimeoutMs` (30 s). Probes answer `"unknown"` at `probeTimeoutMs` (3 s), so local creates finish within that bound. |
| Partition mid-write | The write may have landed. It is not retried. `getJob` and `waitForJob` route to the recorded backend (`routing-client.ts:1046-1061`). |
| Stale routing table | A route learned from a backend later in the order, while an earlier one answered "no", stays `provisional` for 30 s and is probed again after that. Corrected and configured routes never expire. A 421 forgets both the route and `KnownDrives`. |
| Schema skew | Facts are unknown, and placement refuses the backend. A diagnostic names the missing query. |

```ts
// reactor-browser: the breaker lives in createSwitchboardBackend, where the status is visible.
// reactor-router/src/backend.ts: IRoutableBackend gains an optional
readonly health?: () => "up" | "down"; // shown by describeRouting()
// reactor-router/src/types.ts: RoutingOptions gains
readonly probeTimeoutMs?: number;     // default 3_000
readonly provisionalRouteMs?: number; // default 30_000
```

### 7. Attachments

```ts
// reactor-attachments/src/routing/routing-attachment-service.ts
export type AttachmentRouteResolver = (documentId: string) => Promise<string>; // backend name
export class RoutingAttachmentService implements IAttachmentService {
  constructor(
    resolve: AttachmentRouteResolver,
    byBackend: ReadonlyMap<string, IAttachmentService>,
    fallback: IAttachmentService,
  );
  // stat/get/getDownloadTarget: by options.documentId, else fallback.
  // reserve: ReserveAttachmentOptions gains optional documentId; same rule.
}
// RoutingReactorClient gains:
locate(identifier: string, signal?: AbortSignal): Promise<string>; // the routed backend
```

- Each remote gets its own `createRemoteAttachmentService`, built from its origin.
- The local backend maps to the fallback, which is the first remote's service. That is today's behaviour.
- Bytes for synced collections keep moving through the 10c replicator.
- Every service stays deny-by-default (gate 7). A download is authorized by the `documentId` the serving Switchboard checks.

## Stages

| # | PR | Packages | Needs |
|---|---|---|---|
| R1 | Lift the backend into `reactor-browser`, with explicit auth | reactor-browser, connect | none |
| R2 | Real-Switchboard router e2e harness | test/switchboard | R1 |
| R3 | Deadlines, probe timeout, breaker | reactor-browser, reactor-router | R1 |
| R4 | Capability facts: document types, schema skew | reactor-router, reactor-browser | R1 |
| R5 | Provisional routes | reactor-router | R3 |
| R6 | `homeOf`: route a multiply-held id by its collection | reactor-router | R5 |
| R7 | Connect config: remotes, collection `backend` and `sync`, remote-list broadcast | connect, reactor-browser, builder-tools schema | R4, R6 |
| R8 | Routing attachment service | reactor-attachments, connect | R7 |
| R10 | Monitor routes to remote handles | apps/reactor-monitor | R4 |

R3 and R4 can run in parallel after R1. R10 is independent of R5 to R8.

Every stage runs the per-PR loop under Delivery.

**R1.**
- Changes:
  - `createSwitchboardBackend` goes in `reactor-browser/graphql-client`; Connect drops `graphql-routable-backend.ts`.
  - The signer and token provider are passed explicitly.
  - `access` is read from the server.
  - `KnownDrives.forget` runs on a 421.
  - Connect passes `inspection: "none"`.
- Exit:
  - Connect behaviour is unchanged.
  - The moved unit tests pass, and the browser-entry test still passes.
  - New: a 421 followed by a retry sends no `Drive-Id`.
  - New: the descriptor's signer is used, not the ambient one.

**R2.**
- Changes:
  - New `test/switchboard/src/router.test.ts`: a router over an in-memory local reactor and the real Switchboard from `global-setup.ts`.
- Cases:
  - `get`, `execute` and `executeBatch` on a drive created on the Switchboard, with signed actions accepted.
  - `subscribe` receives a change written by a second `GraphQLReactorClient`.
  - A drive deleted on the Switchboard: the next write gets a 421.
  - An anonymous caller is refused, and the same call with a bearer succeeds.
- Exit:
  - Green locally and in CI's switchboard job.
- Later stages add cases here.

**R3.**
- Changes:
  - `requestTimeoutMs` on `GraphQLReactorClient`: every SDK call composes `AbortSignal.any([signal, AbortSignal.timeout(ms)])`.
  - The breaker and the `health` member.
  - `probeTimeoutMs` in `owns()`.
- Exit:
  - Against a stub that accepts the connection and never answers, a local `create` resolves within `probeTimeoutMs + 500 ms`.
  - A remote `get` rejects at the request deadline.
  - The breaker opens after 3 transport failures and not after a GraphQL error, and closes after `openMs`.
  - e2e: kill the Switchboard mid-suite, and local creates still complete.

**R4.**
- Changes:
  - `documentTypes` fact.
  - Create pre-check.
  - Introspection check for schema skew.
- Exit:
  - Unit: a create of an unsupported type throws without sending a request.
  - Unit: a missing query gives `known: false`.
  - e2e: the real Switchboard's facts list its models.

**R5.**
- Changes:
  - Provisional routes with a TTL.
- Exit:
  - Unit: a route learned on a later backend moves to an earlier one after the TTL, once the earlier one holds the document.
  - Unit: corrected and configured routes never expire.
  - Existing misroute tests are unchanged.

**R6.**
- Changes:
  - `homeOf` for an id that several backends serve, with the result cached in the document table.
- Exit (unit, with local and remote stubs that both hold a drive and a file):
  - A file in a synced drive routes to local, even with the remote first in the backend order.
  - A file in a `sync: false` drive with a stale local copy routes to the remote.
  - A file that only the remote holds routes there, and moves to local once local holds it (R5).

**R7.**
- Changes:
  - Runtime-config schema: `instance.remoteBackends[]`, `instance.collections`, and `backend`/`sync` on `drives.defaultDrives[]`.
  - Connect builds the backends and the `collections` overrides from config.
  - `addDefaultDrivesForNewReactor` and `addRemoteDrive` honour `sync`, and sync to `backend` when one is named.
  - The boot step removes the sync remote of any collection with `sync: false`.
  - `ReactorHost` broadcasts `SYNC_REMOTES_CHANGED_EVENT` after the sync ops `add` and `remove`.
- Exit:
  - The fingerprint test pins that remote config does not change the worker fingerprint.
  - Unit: with no new config, the router table and the sync remotes match today's.
  - `reactor-browser` RPC test: a gql remote added in one tab reaches the others' `list()`.
  - New Playwright spec `test/vetra-e2e/tests/multi-reactor.spec.ts` (Connect plus Switchboard at 4002, `multiReactor: true`, in worker mode). It checks:
    - a `sync: false` drive with a `backend` opens and edits on the Switchboard, and the change shows in a second tab;
    - a `sync: true` drive with a `backend` stays readable and writable with the Switchboard stopped, and its offline edits reach the Switchboard once it restarts;
    - a default drive with no config behaves as it does today.

**R8.**
- Changes:
  - `RoutingAttachmentService`, `RoutingReactorClient.locate`, and optional `documentId` on `reserve`.
  - Connect installs the service when there is more than one remote.
- Exit:
  - Unit: a download routes by the backend that serves its document.
  - Unit: a reservation without a document goes to the fallback.
  - e2e (R2 suite, two Switchboard endpoints): upload and download on a `sync: false` document held by the second one.

**R10.**
- Changes:
  - `isRoutable` admits remote handles, built through `createSwitchboardBackend` from `handle.url` and `handle.headers`.
  - The monitor's existing `timeoutMs` (`packages/reactor-monitor/src/types.ts:123`) maps onto `requestTimeoutMs`.
- Exit:
  - `RoutingPanel.test.tsx` covers a remote row and its health.

## Delivery

### Parallel lanes

| Wave | Lane A: router | Lane B: facts and monitor | Lane C: e2e and Connect |
|---|---|---|---|
| 1 | R1 | | |
| 2 | R3 | R4 | R2 |
| 3 | R5, then R6 (stacked) | R10 | |
| 4 | | | R7, then R8 (stacked) |

- **Stacking:**
  - A stage that follows another in the same lane stacks on that stage's unmerged branch: R5 on R3, R6 on R5, and R8 on R7.
  - A stage that depends on another lane waits for that lane's work to merge to main: R2, R3 and R4 wait for R1; R10 waits for R4; R7 waits for R4 and R6.
- **File overlap in wave 2:**
  - R3 and R4 both edit `reactor-browser/src/graphql-client/switchboard-backend.ts`, and `reactor-router/src/backend.ts` and `types.ts`. Whichever merges second merges main and resolves the conflicts. Neither reshapes the other's members.
  - R3 and R4 add their e2e cases to R2's suite only after R2 has merged, in a follow-up commit on their own branch.
- **File overlap in wave 3:** R5 and R6 both edit `dispatcher.ts` and `table.ts`, which is why they stack. R10 touches only `apps/reactor-monitor`.

### Execution model

- **Coordinator.** A coordinator subagent drives the waves. It works from scratchpad files: `handoff.md`, `rules.md` (the setup rules below), `tracker.md` (stage, branch, worktree, PR, status) and `reports/R<n>.md`. It keeps no state in its own context that is not also in those files.
- **Implementers.**
  - One implementer subagent per stage, each in its own git worktree off main, or off its base stage's branch when stacked.
  - At most 3 implementers run at once.
  - Implementers commit at each logical step, and write their outcome, any deviations, and the commands they ran with exit codes to `reports/R<n>.md`. They do not report through context.
- **Main session.** It answers escalations and pushes, opens and merges PRs. Nothing else goes through it.

### Per-PR loop

1. Implement the stage, with the tests its exit criteria name.
2. Run `/code-review` rounds. Fix the confirmed findings as separate commits, and stop when a round comes back clean.
3. The `verify` subagent runs the real CI commands for every touched package (build, lint, `pnpm test`) and records the commands and exit codes in the report.
4. Push and open the PR. A stage based on main opens a ready PR against main. A stacked stage opens a draft PR against its base stage's branch, and is retargeted to main once that base merges. The description is two or three sentences.
5. Merge with a merge commit (`gh pr merge --merge`), never a squash. Then merge main into every open stacked branch and into the next wave's worktrees.

### Agent setup rules

- In a fresh worktree, run `pnpm install`, then `pnpm build` in `packages/shared`, then build the dists of the packages under test, before any test run. Rebuild stale dists after every merge of main.
- In `reactor-browser`, run `pnpm test`. `vitest run <file>` false-greens there.
- No `git stash`, and no history rewrites (rebase, reset, amend, force-push).
- Never write "fold" in code; reducers apply or derive state.
- R2's real-Switchboard harness needs its own ports in each worktree: a free Switchboard port through `SWITCHBOARD_URL` (the default is 4001), and a free Postgres port when it runs against Postgres. R2 makes both configurable.

### Escalation

The coordinator escalates to the user, through the main session, any deviation from the design in this plan and any change of scope. It stops that stage until it gets an answer. Everything else is decided in the lane and recorded in the stage's report.

## Deferred

- **R9: load-balanced Switchboard clusters.** Behind `switchboard-lb`, a request without `Drive-Id` goes to one shared peer (`apps/switchboard-lb/ARCHITECTURE.md:91,233`). To support clusters, `KnownDrives` would learn child→drive from `create(doc, parent)` and `find({parentId})`, and send `Drive-Id` on every call whose drive it knows. Exit criteria for that work: `lb-loadtest` with router traffic shows no consistency failures. Until then, v1 supports single-instance Switchboards only.
- **Requirement-based placement.** Placing a collection by its declared requirements (`workflows`, `durableStorage`, `documentTypes`), or spreading collections by hash over eligible backends. The router supports both today; v1 Connect leaves both off.
- **Node hosts.** Switchboard-to-Switchboard routing and the CLI need a server-side signer and token story.
- Already listed as out of scope: the rewind/replay protocol, and admin mutations over remote inspection.

## Decisions

User decisions (2026-10-13):

- **`sync` is a per-collection flag; unset means `true`.** A synced collection is read and written on its local copy, and sync carries the writes to its `backend`. Only a `sync: false` collection is routed to its remote. Auth-scope checks and signature verification run the same code locally and on the remote, so a local write is checked at write time too.
- **Hosts: Connect and the reactor monitor.**
- **Remotes come from `instance.remoteBackends[]`.** An empty list falls back to the first default drive's Switchboard. R8 routes attachments across remotes.
- **Only explicit config places a collection on a remote.** Requirement-based placement is future work.
- **Load-balanced clusters are deferred.** v1 is single-instance only.

Design decisions:

- **GraphQL for routed calls, the sync channel for replication.** Sync replicates whole collections under a cursor. A routed call is a single request made with the caller's bearer and the read gate.
- **The factory lives in `reactor-browser/graphql-client`.** `reactor-router` cannot take a dependency on `reactor-browser`. Nothing generic goes in `reactor-monitor`.
- **`refusesMisroutes: false`.** The 421 covers drives only and names no owner.
- **No ungated existence query.** It would leak the existence of withheld documents. Ids are client-generated UUIDs.
- **One endpoint is one backend.**
- **Writes never fail over, and neither do 401 or 403.** A write may have landed, and an authz refusal is an answer.
- **Deadlines: 30 s per request, 3 s per probe.** A probe gates local writes, so it is the tighter bound.
- **The breaker lives in the backend, not the router.** Only the backend sees HTTP statuses.
- **Sync remotes changed at boot reach every tab.** `SYNC_REMOTES_CHANGED_EVENT` is extended to the sync ops `add` and `remove`.
- **Remote config is tab-side and outside the worker fingerprint.** The worker never reaches a router remote.

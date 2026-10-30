# Release Changelog

## 🚀 **Unreleased** — `ph host check` warns about members on one port

### ⚡ Two compound members that declare one port are a warning

Under `ph run`, a Connect or switchboard whose port is taken moves to the next free port, so a compound with two members on one port still runs. A moved Connect is a new browser origin, though, and comes up without its drives, sign-in and local data. `ph host check` now prints a warning for such a pair, for example `warning  children.connect.runner.port: cli-connect and connect both use port 6347. One will move to the next free port and lose its browser data.` Warnings never change the exit code. `checkHost()` returns them as `warnings`, beside `issues`.

✅ **What to try:** add `connect: { host: "connect" }` to `hosts/cli/host.js` in a scaffolded project and run `FEATURE_UNIFORM_RUNNERS_ENABLED=true ph host check cli`.

---

## 🚀 **Unreleased** — router settings in the host config

### ✨ Host config sets where new drives go, and the router's timeouts and breaker

A Connect host's `reactor.placement.newDrives` names the backend new drives are created on. A switchboard there means the drive is created on it with no copy in this browser; drives the host declares locally are still created in the browser. When that switchboard isn't answering, Connect shows "<sb> isn't answering, so the drive wasn't created."; when it refuses, Connect names it and its reason, or opens the sign-in prompt. The drive is not created in the browser instead, and a Connect that can't build the router for that switchboard fails to start. Without `newDrives`, new drives are created in the browser as before, or on the only switchboard when there is no browser reactor. A Connect with no browser reactor and several switchboards must set it.

`reactor.router` takes `probeTimeoutMs` (default 3 s) and `provisionalRouteMs` (default 30 s). A remote backend's `remote` block takes `requestTimeoutMs` (default 30 s), `breaker` (`{ failures, openMs }`, default 3 failures then 30 s; `false` never stops trying) and `realtime` (default true); a local backend refuses them. Connect serves these as `instance.router` and on each `instance.remoteBackends[]` entry, and builds its router and switchboard backends from them.

⚠️ **Breaking (unreleased host config):** a Connect host refuses `placement.primary` with "Connect doesn't use placement.primary. To choose where new drives go, use placement.newDrives." Switchboard hosts keep it. Connect's `instance.reactorWorker` now follows the browser reactor's own kind, so a remote listed first no longer turns a `worker` backend in-process.

`RoutingOptions.defaultBackend` (`@powerhousedao/reactor-router`) names the backend a new collection goes to when nothing places it; a create it refuses fails rather than landing elsewhere. A parentless create asks for its defaults from the backend its id is placed on, else the default backend. `createSwitchboardBackend`'s `breaker` (`@powerhousedao/reactor-browser`) takes partial settings or `false`.

✅ **What to try:** give a Connect host with a switchboard backend `sb` `placement: { newDrives: "sb" }`, run it and add a drive: it appears on the switchboard and `syncManager.list()` in the tab has no remote for it. Stop the switchboard and add another: Connect shows that sb isn't answering.

---
## 🚀 **Unreleased** — move a drive in Connect, attachments by drive

### ✨ Move a drive between its switchboard and this browser

For each drive the host keeps on a switchboard, Connect's drive settings now say where it opens and offer one action: **Keep a copy in this browser** for a drive that opens on the switchboard, or **Open on <switchboard> only** for one this browser keeps a copy of. Keeping a copy, or resetting to a config that keeps one, adds the drive's sync remote and waits until the copy holds what the switchboard holds before reads move to it, in every tab; if the copy never arrives, the drive stays on the switchboard and the sync remote is removed again. Opening on the switchboard only removes the sync remote and routes the drive there; the copy already in the browser is left in place, unread, so keeping a copy again later picks up from it.

The choice applies to this browser only. It is stored in IndexedDB, every open tab follows it, and it survives a reload. Drive settings mark a moved drive "Moved in this browser. Host config: …", with **Reset to config**. A move is dropped once the host config changes the placement it replaced. A Connect with no reactor in the browser opens every drive on its switchboard and offers no move.

Placements now reach the router after boot, once each drive is read from its switchboard, so a switchboard that does not answer no longer delays startup. A drive a plugin serves under a hashed slug (`projectHash: true`) is found among its switchboard's drives, so its placement applies under its real id and slug. The drive settings modal (`DriveSettingsModal`, `@powerhousedao/design-system/connect`) takes `children`, rendered after the location settings.

### ✨ Router: config placements after construction

`RoutingReactorClient.setConfiguredPlacement(key, backend | undefined)` (`@powerhousedao/reactor-router`) sets the config layer for one collection after the client is built, as an entry of `collections` would. A runtime placement still wins, and `describeRouting()` reports the row with `origin: "config"`.

### ✨ Attachments go to the switchboard that holds their document

`RoutingAttachmentService` (`@powerhousedao/reactor-attachments/client`) sends each call to the attachment service of the backend that serves its `documentId`, found through a resolver such as `RoutingReactorClient.locate`. A call without a document, or for a backend with no service of its own, uses the fallback service. `reserve` takes an optional `documentId` (it is not sent to the server), and so do `preprocess(file, { documentId })`, `upload({ file, documentId })` and `useAttachmentUpload().preprocess(file, { documentId })` (`@powerhousedao/reactor-browser`). A Connect linked to more than one switchboard installs this service, with the first switchboard's attachments as the fallback.

✅ **What to try:** in a host whose Connect places drive `b` on switchboard `sb`, open Connect, then `?modal=drive-settings&driveId=<b's id>`, and choose **Keep a copy in this browser**: `b` now syncs into the browser, and a second tab shows the same.

---
## 🚀 **Unreleased** — Connect opens drives on its switchboards

### ⚡ A drive placed on a switchboard keeps no copy in the browser

Connect now applies a host's `reactor.placement.drives`. A drive placed on its switchboard's remote backend opens there: Connect adds no sync remote for it, removes one an earlier boot added, and routes every read, listing and write to that switchboard. Its local data, if any, stays in the browser unread. A drive placed on a local backend, or not listed, keeps a synced copy as before. New drives are still created in the browser.

A Connect can link to several switchboards: the router gets one backend per switchboard, named by its key in `reactor.backends`, and a sign-in or sign-out reaches every one of them. A Connect with only a remote backend (no reactor in the browser) opens every drive on its switchboard, and its attachments go there.

### ⚡ The router lists a duplicated document from where it is routed

`RoutingReactorClient.read.find` (`@powerhousedao/reactor-router`) used to keep the first backend's copy of a document several backends return. It now keeps the copy from the backend the router already routes that id to: a drive's correction, runtime or config placement or learned route, else the document's cached route. With no route, backend order decides as before, and nothing extra is probed. A drive placed on a remote is therefore listed from the remote even while a stale local copy remains.

### ⚡ What the Connect runner serves

The connect runner derives three fields of the served config from the host, which `powerhouse.config.json` refuses:

- `instance.remoteBackends: [{ name, url }]`, one per remote backend, `url` being its drive address;
- `drives.defaultDrives[].backend` (the remote backend serving a remote default drive) and `.sync` (`false` when placed on it);
- `instance.collections: { <slug>: { backend, sync } }` for drives placed on a switchboard that are not default drives, such as a plugin's `workflows` drive.

`projectReactorToConnect` (`@powerhousedao/host-core`) adds `instance.remoteBackends`, and `placeConnectDrives(reactor, defaultDrives)` computes the other two. The runner no longer forces `instance.multiReactor: true`: `reactorClient` selects the router. A `placement.drives` key may now name a drive the Connect host attaches through `config.drives.defaultDrives`.

### ✨ Tabs agree on sync remotes

A sync remote one tab adds or removes in the shared worker now reaches every tab's `syncManager.list()`: the worker announces the change after `add` and `remove`, as it does for local peers. `fetchDriveInfo(url, tokenProvider?)` takes an optional token provider (default: the signed-in Renown user's).

✅ **What to try:** in a host with a switchboard `sb` and a Connect linked to `sb.drives.b.url` with `placement: { drives: { b: "sb" } }`, run `ph run`, open Connect, and edit drive `b`: the edit lands on the switchboard, and `syncManager.list()` in the tab has no remote for `b`.

---
## 🚀 **Unreleased** — a Switchboard as a router backend (`@powerhousedao/reactor-browser`)

### ✨ `createSwitchboardBackend`

`createSwitchboardBackend({ name, url, tokenProvider, signer, documentModels, ... })` from `@powerhousedao/reactor-browser/graphql-client` returns `{ config, notifyCredentialsChanged, dispose }`. `config` is a `RoutableBackendConfig` for `RoutingReactorClient`, so a host other than Connect, such as the monitor, can route to a Switchboard. `url` is the Switchboard's GraphQL endpoint. Connect's own copy of this backend is gone, and Connect now builds its remote through this function.

- **Explicit credentials.** The descriptor names its token provider and signer. `signer: undefined` pushes unsigned and never falls back to the logged-in Renown user. A function is read on every push. Connect passes `ambientRenownTokenProvider` and the new `ambientRenownSigner`, so it still signs only while someone is logged in. A `GraphQLReactorClient` `signer` option may also be such a function.
- **Request deadline.** Each request is bounded, headers through body, at `requestTimeoutMs`, which defaults to 30 s. A request past the deadline rejects with a `TimeoutError`. `GraphQLReactorClient` takes the same option, plus `fetch` for the transport.
- **Breaker and health.** Three transport failures in a row open the breaker for 30 s (configurable through `breaker`). A transport failure is a network error, a 5xx, or a deadline: the request's own, or the router's probe deadline (`probeTimeoutMs`), so a Switchboard that hangs is marked down after three probes and local creates stop waiting on it. While the breaker is open, nothing is sent: every call throws `SwitchboardUnreachableError`, `health()` reports `"down"`, and the router stops probing the backend. A GraphQL error is an answer, so it does not count, and neither does an abort by the caller.
- **Facts.** One `SwitchboardFacts` query reads the reactor info, including `access` from the server, and the document types the Switchboard serves. The router's create pre-check uses the types only when the Switchboard's model list is closed. The new inspection field `loadsModelsOnDemand` says whether it is. When a Switchboard loads models on demand, or is too old to say, its types stay open and creates are not checked. A Switchboard that lacks `documentServed`, `createDefaults` or `inspection` fails the read, so the router holds its facts as unknown.
- **421.** A refusal forgets the drive the request named, so the next request sends no stale `Drive-Id`. Under Node, the default transport (`switchboardFetch`) sends request bodies as streams. Node's fetch resends a request that got a 421, and the resend of a buffered body can fail with a `TypeError` instead of returning the 421. Browsers keep buffered bodies.

### 🐛 Switchboard `/ready` waits for its drives

`/ready` used to answer 200 about 80 ms before the default drive existed, so a client that waited for `/ready` and then opened `/d/<slug>` could get a 404. It now turns 200 only once the default drive is served. Under `ph run`, it also waits for the drives the host declares and the drives its plugins contribute. `startSwitchboard` takes `readyAfter`, a promise that `/ready` also waits for; if it rejects, the server stays not ready. Remote drives don't hold readiness back, because they sync from another server that may be down.

✅ **What to try:** start a Switchboard with `ph run`, poll `/ready`, and open `/d/<slug>` on the first 200: the drive is there.

---

## 🚀 **Unreleased** — host config: a remote link is a switchboard drive address

### ⚡ `remote.url` names a drive, and `reactor.placement.drives` says where each drive opens

A `remote` backend in a host file now links to a switchboard by the address of one of its drives, `<switchboard>/d/<slug>`, for every host kind: Connect, the assistant agent and the reactor monitor. A GraphQL endpoint names the switchboard but not a drive, and sync needs the drive. An `endpoints.graphql` output token or a `/graphql` URL in `remote.url` now fails validation with an error that names the replacement:

```js
// before
sb: { kind: "remote", remote: { url: switchboard.endpoints.graphql } },
// after
sb: { kind: "remote", remote: { url: switchboard.drives.powerhouse.url } },
// or { $output: { host: "switchboard", path: ["drives", "powerhouse", "url"] } }
```

The generated `assistant` and `cli` hosts use the new form. A project scaffolded earlier keeps its old host files (generation never overwrites them), so edit `hosts/assistant/host.js` and `hosts/cli/host.js` as above. One switchboard is one remote backend: two backends whose drive addresses share a switchboard are refused; list the second drive under `reactor.drives` instead.

`reactor.placement.drives` maps a declared drive slug to a backend. The drive's own remote backend means "open it on the switchboard, with no copy here"; a local backend means "keep a synced copy"; an unlisted drive keeps a synced copy. The host is refused when a value names no backend, places a drive on a switchboard it is not on, names a slug linked on two switchboards (or kept here and linked on one), or (where the config names every drive, plugin `config.drive` links included) uses a key that names no drive. A `reactor.drives[]` entry's `remote.url` must be a drive address too. `placementKeyIssues(host)` (`@powerhousedao/host-core/schema`) runs the key check on a declared host whose runner and reactor are already merged, for a tool that parses `declaredHostSchemas.reactorHostSchema` itself, as the reactor monitor's import now does.

`switchboardOfDrive(url)` (`@powerhousedao/host-core/schema`, and `@powerhousedao/shared/host-tokens`) splits a drive address into `{ base, graphql, slug }`. The reactor monitor's remote descriptors take a drive address too: the provision form asks for one, `ph host export` imports read `drives.<slug>.url`, and a saved monitoring set whose remote is a GraphQL URL fails with a message naming the drive address to use.

✅ **What to try:** in a project's `hosts/cli/host.js`, set the `sb` backend's `remote.url` to `{ $output: { host: "switchboard", path: ["endpoints", "graphql"] } }` and run `FEATURE_UNIFORM_RUNNERS_ENABLED=true ph host check cli`: it reports that `remote.url` must be a switchboard drive address and names `switchboard.drives.<slug>.url`.

---

## 🚀 **Unreleased** — router placement, deadlines and document-type facts (`@powerhousedao/reactor-router`)

### ✨ Move a drive while the router runs

`RoutingReactorClient.setPlacement(key, backend | undefined)` places a collection or drive on a backend for this client only, above the `collections` the router was built with; `undefined` removes it and the config applies again. `onRoutingChange(listener)` reports each placement, learned, corrected or forgotten collection route and returns the unsubscribe. Precedence is now corrected > runtime > config > learned > placed: a refusal still corrects either kind of placement, and a later `setPlacement` for that key replaces the correction. `describeRouting()` rows gain `origin` (`"config"` or `"runtime"`) and `configured` (the config's backend), so a client can show where it differs from its config. Nothing is persisted; the caller stores its own runtime placements.

### ⚡ A hung or missing backend no longer stalls the others

- **Probe deadline.** An ownership probe that does not answer within `probeTimeoutMs` (default 3 s) answers "unknown", so a local create finishes even while a remote hangs.
- **Health.** A backend may declare `health(): "up" | "down"`. While it reports down, probes answer "unknown" without a request, and `describeRouting().health` lists each declared state.
- **Provisional routes.** A route found on a backend while an earlier one in the order did not hold the document is probed again after `provisionalRouteMs` (default 30 s), so a document read from a remote during initial sync moves to the local copy once it arrives. Corrected routes and placements never expire.
- **Routing by collection.** When several backends serve a document, it goes to its drive's corrected, placed or learned backend, so a stale local copy of a drive placed on a remote never wins.

### ✨ Document-type facts and `locate`

`RoutableBackendConfig.documentTypes?: () => Promise<readonly string[] | undefined>` is read with the facts and lands in `BackendFacts.documentTypes`. A read that answers `undefined` means the backend loads models on demand: creates are not checked, and the facts stay known. A failed read of the facts or of the types makes `known` false. A create of a type the target backend lacks (`create`, `createAsync`, a batch that creates, `drives.create`, `drives.addFile`) throws `UnsupportedByBackendError` before anything is sent. `locate(identifier, signal?)` names the backend a document routes to, for an attachment service that routes by document.

✅ **What to try:** build a router over two backends with `collections: { [driveId]: "local" }`, call `setPlacement(driveId, "remote")`, and `describeRouting()` shows the drive on `remote` with `origin: "runtime"` and `configured: "local"`.

---

## 🚀 **Unreleased** — UUIDv7 action ids and same-millisecond auth bursts

### ⚡ Action ids sort in creation order; auth bursts are admitted

Action ids are now UUIDv7 from `generateActionId` (`@powerhousedao/shared/document-model`), for every document version, including base-reducer 1 and 2 documents. Ids from one process strictly increase, so actions built in the same millisecond keep their creation order wherever the id breaks a tie. `createAction`, the genesis `CREATE_DOCUMENT`/`UPGRADE_DOCUMENT` actions, `purgeDocumentAction`, the base-reducer 1/2 undo marker, the reactor and drive action builders and the workflow piece's `plainAction` use it. Document, node and folder ids stay UUIDv4, and so do the workflow editors' undo-group and redo ids for now. Code that parsed action ids as v4 should treat them as opaque strings.

Auth-scope actions are now stamped with `nextAuthTimestamp`, which strictly increases per process. A burst such as `initializeAuth` followed by `setGrant` built in one millisecond no longer fails with `AuthTimestampNotMonotonicError`. The error is still exported, and the executor still refuses an auth stamp at or below the stream's newest one, for example one set by hand or minted by another process. Every other scope keeps the wall clock. The auth clock is one per process, shared by every document, so a burst runs ahead by one millisecond per auth action built in the same millisecond, across all documents: granting 3 grants on each of 500 documents at once (`grantOnDocuments`) stamps the last grants about 1.5 s ahead. Content built before the clock catches up sorts before those grants and may be denied under `documentDecisions`; resubmit it once the clock passes the burst. If the wall clock steps back after a run-ahead, the process's auth writes are refused until the clock passes the highest stamp it sent. See ADR 0007.

✅ **What to try:** with `documentDecisions` and `authEnforcement` on, execute `[initializeAuth(...), setGrant(...), setGrant(...)]` built in one tick: the job succeeds and the three auth operations carry stamps one millisecond apart.

---

## 🚀 **Unreleased** — PGlite maintenance no longer forces a VACUUM FULL under load

### ⚡ VACUUM FULL waits for a quiet store, by default

A PGlite store whose `base/` exceeds 256 MB at open gets a one-time `VACUUM FULL`. It used to run 30 minutes after open whether or not the store had gone quiet; on a 20 GB store that held the only connection for a quarter of an hour, every processor batch, workflow tick and request hit Knex's 60 s acquire timeout, and the directory needed about twice its size in free disk meanwhile. The one-time rewrite is now off by default: on a store that is live data rather than bloat it reclaims nothing, a minute of quiet arrives naturally between jobs, and the copies it writes need about twice the store's size in free disk. The new `PH_PGLITE_VACUUM_FULL` setting chooses the policy:

```bash
PH_PGLITE_VACUUM_FULL=off       # default: never (a rewrite needs twice the store's size in free disk)
PH_PGLITE_VACUUM_FULL=quiet     # only after the quiet window, however long that takes
PH_PGLITE_VACUUM_FULL=forced    # the previous behaviour: also 30 min after open, under load
PH_PGLITE_VACUUM_FULL_ABOVE_MB=256        # the size that makes a store eligible
PH_PGLITE_VACUUM_FULL_QUIET_MS=60000      # the quiet window
PH_PGLITE_VACUUM_FULL_MAX_DEFER_MS=0      # an explicit deadline overrides the mode
```

`resolvePgliteMaintenance(env)` in `@powerhousedao/reactor-api/pglite-node` reads them, and both the switchboard's stores and `getDbClient`'s read store apply them. A finished `VACUUM FULL` now logs its duration and the `base/` size before and after; before, only a failure was logged. An unknown mode refuses to boot, since the point is never to run the forced rewrite by accident.

✅ **What to try:** boot a switchboard with `PH_PGLITE_VACUUM_FULL=quiet` on a store over 256 MB and watch the log: `VACUUM FULL waits until the store has had no writes for 60000 ms` with no `or at most ... from open` clause, then `VACUUM FULL finished in N ms; A -> B bytes` once the store has been idle a minute.

---

## 🚀 **Unreleased** — reactor fixes for base-reducer 1 and 2 documents

### 🐛 Bug fixes (`@powerhousedao/reactor`)

- **A cold read of revision 0 no longer serves a later keyframe's state.** `writeCache.getState(id, scope, branch, 0)` treated `0` as "no target", resumed from the newest keyframe and returned the head.
- **A held document reaches the peer once that peer can run it.** A document held from a peer that could not run its protocol version was released with its original ordinals, below the peer's ack, and the next ack trim dropped it unsent. Release backfills now stay in the outbox until a push succeeds. This covers GraphQL peers. A local or worker peer (`LocalChannel`) still drops a push at or below its inbox ack, so a document released toward it never loads there yet.
- **A stored refusal no longer re-holds a document after the peer restarts.** A receiver's `UNSUPPORTED_PROTOCOL` dead letter answered the reactor revision that wrote it; reloading it on restart reported it again and the sender held the document for good. Loading dead letters now drops and deletes those rows once this reactor can run the document; a refusal of a document it still cannot run is kept.
- **Re-evaluated rows reach `reactor.get`.** With `documentDecisions` on, a write or load whose backdated auth change re-evaluated the document wrote the re-appended rows but left them out of the job result and `JOB_WRITE_READY`, so the document view kept serving the state from before the pass.

✅ **What to try:** with `documentDecisions` and `authEnforcement` on, grant a writer, let it write, then remove the grant with an earlier timestamp: `reactor.get` now serves the document without the denied write.

---

## 🚀 **Unreleased** — reactor client halves

### ✨ Highlights

1. **The reactor client is split into a read half and a write half** — `IReactorReadClient` answers from read models, `IReactorWriteClient` enqueues; every write returns a `WriteHandle` with `written`, `readable` and `document()`
2. **`IReactorClient` stays as a deprecated facade** — every old method and return type keeps working for several releases; each facade write logs one deprecation warning per process
3. **Mutations no longer read the document view** — a write-side identity table resolves targets, and the permission tables move into the reactor store with a one-time backfill

---

### NEW FEATURES

#### 🔀 Read and write halves (`@powerhousedao/reactor`)

`ReactorClientModule` now carries `read` and `write` beside `client`. The read half (`get`, `getMany`, `find`, relationships, `getOperations`, `subscribe`, `waitForJob`, `getJobStatus`, `drives`) never enqueues; reads that can wait for a consistency token take it as their last parameter. The write half (`create`, `createEmpty`, `upgradeDocument`, `execute`, `executeBatch`, `rename`, `setPreferredEditor`, relationship writes, `deleteDocument(s)`, `loadBatch`, `isDocumentIdTaken`, `evaluateActions`, `describe`, `drives`) resolves when the job is accepted and returns a handle.

```typescript
const handle = await module.write.execute(invoiceId, "main", actions);
const { token } = await handle.written; // operations are in the log
const invoice = await module.read.get(invoiceId, undefined, undefined, token);
const same = await handle.document(); // readable, then the gated read-back
```

`written` and `readable` reject with `JobFailedError` only when the job itself failed; a reducer error stays on `receipt.job.result`. Over RPC the halves are `read.*` and `write.*` (protocol version 4); the router (`@powerhousedao/reactor-router`) exposes `RoutingReadClient` and `RoutingWriteClient`; `@powerhousedao/reactor-browser` and the GraphQL browser client carry `read` and `write` too, and `window.ph.reactor = { read, write }` sits beside `window.ph.reactorClient`.

✅ **What to try:** call `module.write.execute(...)` without awaiting it, then `await handle.readable` where you need the result.

#### 🧭 GraphQL resolvers get the halves on the request context

`GraphQLManager` takes `readClient` and `writeClient`. Every resolver context carries `ctx.clients.read`; `ctx.clients.write` exists only for Mutation fields, and a query that reaches for it fails with `WriteClientUnavailableError` naming the field. Package subgraphs get `subgraph.readClient`; `subgraph.reactorClient` stays as the deprecated facade. `document`, `findDocuments` and the four relationship queries accept an optional `consistency: ConsistencyTokenInput` (the shape `JobInfo.consistencyToken` reports), so a client can bound a read after its own write.

```graphql
query ($id: String!, $c: ConsistencyTokenInput!) {
  document(idOrSlug: $id, consistency: $c) {
    document {
      id
      lastModifiedAtUtcIso
    }
  }
}
```

#### 🗂️ Write-side identity (reactor migration 028)

`WriteIdentity` (documentId, branch, slug, documentType, isDeleted) is written inside the executor's transaction for every document-scope create, upgrade and delete. Write-target resolution and `write.describe` read it instead of the document view; rows missing for documents created before the migration fall back to the view once.

#### 🛡️ Permission tables in the reactor store (reactor migration 029)

`DocumentPermission`, `OperationUserPermission` and `DocumentProtection` are created in the reactor store, read through a per-process `PermissionCache` (TTL `DOCUMENT_PERMISSION_CACHE_TTL_MS`, default 30 s; 0 disables), and invalidated by the service's own writes. A purge deletes the purged document's permission rows.

#### 🧩 Processors read through `module.read`

`IProcessorHostModule` gains `read`; `dispatch` gains `createInDrive(driveId, document, parent?)` and `deleteDocument(docId, propagate?)`, so a processor never needs the write client.

### BREAKING CHANGES

None on the wire, and none at compile time for callers of `IReactorClient`. Behaviour that changed:

- Facade writes now wait for `readable` and read back through the read half with the receipt's token (a no-op wait on one store).
- `ReactorDriveClient` takes `{ read, write, readModel }`; passing `{ reactor }` still works and is deprecated.
- The RPC protocol version is 4: a tab and a worker on different versions reload instead of calling missing methods.

### MIGRATION GUIDE

1. Nothing is required this release. Each facade write logs one `[reactor-client] IReactorClient.<method> is deprecated` line per process; set `PH_SILENCE_DEPRECATIONS=1` to silence it.
2. Move writes to `module.write.<method>(...)` and read back with `handle.document()` or `module.read.get(id, view, signal, receipt.token)`; move reads to `module.read.*`; in processors use `module.read` and `module.dispatch`; in custom subgraph resolvers use `ctx.clients.read` for queries and `ctx.clients.write` for mutations.
3. Ship `@powerhousedao/reactor`, `@powerhousedao/reactor-api` and `@powerhousedao/switchboard` together. On the first boot the switchboard copies the permission rows from the read-model store into the reactor store and renames the old tables to `*_migrated_2026_10_25`; the log reports `Permission tables backfill: copied ...` or `... nothing to copy`. A mismatched pair keeps the tables on the read-model store.

### DOCUMENTATION

- `docs/adr/0006-reactor-client-halves.md` records the decision, the alternatives and the consequences.

---

## 🚀 **Unreleased** — new documents are headed with `newDocument`

### ✨ Highlights

1. **One place chooses a new document's versions** — `newDocument` heads a new, uncreated document with the protocol versions the client selects for its type and parent, and the client's create signature policy; every first-party create path goes through it
2. **The reactor core selects like a client** — `IReactor.create` gives a header without `protocolVersions` the versions the reactor selects for its type, as `newDocument` would (base-reducer 2 in this release)
3. **`RemoteDocumentController` falls back when a host has no `createDefaults`** — it creates through `createEmptyDocument`, as before. This client already needs a Switchboard that serves document `meta` and `protocolVersions`, which the released 6.2.3 does not, so the fallback does not make it work against 6.2.3

---

### NEW FEATURES

#### 🧱 `newDocument`

`IReactorReadClient.newDocument(documentType, options?, signal?)` (also on `IReactorClient`, the router client and `GraphQLReactorClient`) returns a document headed with the versions `getCreateProtocolVersions` selects and the client's create signature policy. `NewDocumentOptions` extends `CreateDocumentOptions` with `protocolVersions`, `signaturePolicy`, `initialState`, `name` and `id` (kept only under the legacy policy). Pass the result to `write.create` or `write.drives.addFile`. Every new document is base-reducer 2 in this release.

`Query.createDefaults` takes an optional `documentType`; the light client asks with it and caps the answer at what it runs. A Switchboard that predates the argument answers reactor-wide, and one without `createDefaults` gives the baseline.

`copyNode` takes an optional `CopyNodeOptions` whose `protocolVersions` override a copy's versions; `ReactorDriveClient` refuses the override.

The `CREATE_DOCUMENT` codec (`createDocumentAction`, `upgradeDocumentAction`, `creationActions`, `creationState`, `documentFromCreation`) is exported from `@powerhousedao/shared/document-model`; `@powerhousedao/reactor` still re-exports the two action creators.

### BREAKING CHANGES

- `getCreateProtocolVersions(parentIdentifier?, signal?)` is now `getCreateProtocolVersions({ documentType, parentIdentifier }, signal?)` on `IReactorReadClient`, `IReactorClient` and `IRoutableBackend`.
- `IReactorReadClient`, `IReactorClient` and `IReactorBrowserClient` declare `newDocument`; out-of-repo implementations must add it.
- `IReactor.create` fills a header without `protocolVersions` with the reactor's selection for the document type instead of a fixed `{ "base-reducer": 2 }`; the clients (`create`, `write.create`, `write.drives.addFile`) do the same with their selection. A `Reactor` constructed by hand, outside `ReactorBuilder`, has no selector and refuses such a header.
- `ReactorWriteClient.emptyDocument` and `RoutingWriteClient.emptyDocument` are removed; use `newDocument`.
- `RemoteControllerGraphQLClient` adds `GetCreateDefaults` and `GetCreateProtocolVersions`. `RemoteDocumentController.pull` without a `documentId` heads the document with the host's `createDefaults`, so `pull()` itself now queries the host and can reject; the first push creates the remote with `CreateDocument` from that header instead of `CreateEmptyDocument`. `undo(count)` is unchanged.
- `RemoteDocumentController.from(controller)` without a `documentId` reads the host's `createDefaults` at its first push, so that push can now reject on a failed read. It then creates the remote with `CreateDocument` from the wrapped document's id, initial state and protocol versions, under the host's signature policy, instead of `CreateEmptyDocument`. A legacy header under a v2-required host takes a new, derived id. A Switchboard without `createDefaults` still gets `CreateEmptyDocument`.
- Importing a `.phd` file keeps the file's `protocolVersions`. A file without them keeps the loader's legacy baseline, base-reducer 1 (legacy replay), as an import is not a create; before this release it was created at base-reducer 2.

### MIGRATION GUIDE

1. Replace `getCreateProtocolVersions(parentId)` with `getCreateProtocolVersions({ documentType, parentIdentifier: parentId })`.
2. Build new documents with `client.newDocument(type, options)` rather than `module.utils.createDocument()` plus `withSignaturePolicy`, and hand the result to `create` or `drives.addFile`.
3. Code that constructs a `Reactor` by hand and creates versionless headers through it should build it with `ReactorBuilder`, call `reactor.setCreateProtocol(selector)` with a `CreateVersionSelector`, or give the header `protocolVersions`.
4. A hand-built `RemoteControllerGraphQLClient` adds `GetCreateDefaults` and `GetCreateProtocolVersions`; one from the generated SDK has them.

---

## 🚀 **Unreleased** — PGlite storage on NodeFS

### ✨ Highlights

1. **Embedded PGlite stores are plain Postgres data directories** — Switchboard and `ph vetra` open `.ph/reactor-storage` and `.ph/read-storage` through PGlite's NodeFS; the single-file `snapshot.bin` layout is gone
2. **Every commit is fsynced before it is acknowledged** — on by default; `PH_PGLITE_FSYNC=0` turns power-loss durability off
3. **Existing stores convert themselves once** — the first boot extracts the snapshot, verifies the result and deletes the old directory

---

### NEW FEATURES

#### 💾 PGlite on NodeFS

Each embedded PGlite store is now a plain PGDATA directory on disk, and Postgres runs its own crash recovery on open. Writes no longer serialize the whole database into one file: at a 10 MB store a 10-row transaction commits in about 2 ms with fsync on where it took 50 ms, at 1 GB the old layout took 1.6 s per transaction, and a cold open takes about 0.1 s for stores up to 1 GB. Connect's IndexedDB storage is unchanged.

`PH_PGLITE_FSYNC` controls durability. On (the default), every commit reaches the device before the write is acknowledged. `PH_PGLITE_FSYNC=0` keeps commits in the OS page cache: a process crash loses nothing, but an OS crash or power loss can corrupt the store. Use it on test runners, not in production.

#### 🔄 One-time conversion of snapshot stores

On first boot, each store that still holds a `snapshot.bin` is extracted next to itself, opened, checked (`pg_control` system identifier plus a full read of every user table), swapped into place, and the old directory is deleted. Stale loose files beside the snapshot are ignored; the snapshot is authoritative. The conversion is idempotent across interruptions and needs free disk for one extra copy of the store while it runs. It runs before the PG major detection, so a PG16 snapshot store now migrates under `PH_MIGRATE_PGLITE=true` instead of logging "No PG_VERSION; skipping".

### BREAKING CHANGES

#### `PGLITE_FLUSH_INTERVAL_MS` removed

There is no flush to schedule. Switchboard warns once when the variable is set and ignores it.

#### A full disk aborts the store

A failed WAL write or fdatasync is a Postgres PANIC. Switchboard exits through its fatal-shutdown path, as it did on a flush error, but the signal is the PGlite abort rather than a flush callback.

#### `@powerhousedao/pglite-fs` is no longer part of this repository

The durable NodeFS subclass and the conversion live in `@powerhousedao/reactor-api`. Published `@powerhousedao/pglite-fs` versions stay on npm; a maintainer may run `npm deprecate @powerhousedao/pglite-fs`. Downstream repos that carry a `patches/@powerhousedao__pglite-fs@*.patch` drop it with the dependency.

### MIGRATION GUIDE

1. Make sure the volume holding `.ph/` has free space for one extra copy of its largest store before the first boot on this release.
2. Start Switchboard or `ph vetra`. Each store converts once; one info line per store reports the snapshot size, the converted size and the duration.
3. Remove `PGLITE_FLUSH_INTERVAL_MS` from deployments.
4. To downgrade, run the previous release on the same directory: its AtomicNodeFs imports the converted directory through its legacy path on first open and writes `snapshot.bin` beside it. Running this release again converts once more.

### BUG FIXES AND IMPROVEMENTS

- PG16 snapshot stores migrate to PG17 under `PH_MIGRATE_PGLITE=true`; the snapshot layout used to hide `PG_VERSION` from the migration.
- The "Removed stale PGLite lockfile" warning no longer fires on every boot; `postmaster.pid` and `pg_wal/xlogtemp.*` left by a clean close are removed before open.
- A periodic VACUUM and CHECKPOINT still runs inside the store; the CHECKPOINT bounds how much WAL a reopen after a crash replays.
- First boot of a new store and the one-time conversion sync the written tree once instead of after every file: a fresh store is ready in under a second instead of 8 s, and a 45 MB snapshot converts in 0.3 s instead of 5 s, with the same bytes on disk before the first write is acknowledged.

---
## 🚀 **Unreleased** — a failed action with a skip keeps the rewind

### BUG FIXES AND IMPROVEMENTS

- When an action with a skip throws, the base reducer now keeps the rewound state and the skip, for every base-reducer version. It used to restore the pre-skip state and zero the skip while the stored operation kept it, so replicas holding the same log could end with different states after a load reshuffle.
- Existing documents whose stored history has a failed operation with a skip keep their old state while a write-cache keyframe at or after that operation exists. They converge once those keyframes are rebuilt (inspector admin op `rebuildKeyframes`, then the next cold rebuild) or the document is synced fresh. The document view catches up on the next write to that scope.

---

## 🚀 **Unreleased** — action signature integrity (#2894)

### ✨ Highlights

1. **v2 action signatures on every write** — a signature is bound to one action in one document and branch, attributed to one user and key, and checked by every reactor that stores it
2. **Verification is on and enforcing by default** — the executor verifies each write when it first stores it; no host wiring
3. **New documents are v2-required** — they accept only v2-signed operations and take content-addressed ids instead of random UUIDs
4. **A trust policy decides which keys may sign as which users** — under `REACTOR_AUTH_ENFORCEMENT`, switchboard checks the Renown credential that binds a key to a wallet

---

### NEW FEATURES

#### 🔏 v2 action signatures

Every signer emits a v2 tuple: element [2] is `v2:` plus the base64url SHA-256 of the canonical JSON of `["v2", documentId, branch, scope, type, id, timestampUtcMs, input, signer.user.address, signer.user.networkId, signer.user.chainId, signer.app.key]`. The signed message layout is unchanged, so an older verifier still accepts a v2 tuple. `ISigner.signAction` takes the document and branch the action is written to, and `ReactorClient` resolves slugs to ids before signing. The executor signs the NOOP an `UNDO` becomes and the action a `REDO` rebuilds with the reactor's own signer.

```typescript
signAction(action: Action, target: { documentId: string; branch: string }, signal?: AbortSignal): Promise<Signature>;
```

#### ✅ Executor-owned verification, enforcing by default

The reactor verifies every write once, at admission: actions submitted to a mutation job and incoming operations in a load job, in-process and in pooled workers. A refused mutation fails with `InvalidSignatureError` (the code is in the message and on `code`); a load drops the refused operations and stores the rest. An unsigned action that names a `signer.user.address` is refused as `UNSIGNED_IDENTITY` on every document, so a write without a key cannot be decided as someone else. `signatureVerification: "log"` on the executor config records refusals without refusing. Each refusal emits `SIGNATURE_REFUSED`, counted as `reactor_signature_refusals_total{scheme,path,code}`.

#### 📄 v2-required documents, by default

`protocolVersions.signature: 2` makes a document v2-required. It refuses unsigned actions (`UNSIGNED_REQUIRED`) and legacy tuples (`SCHEME_BELOW_POLICY`). Its id is `base64url(sha256(canonicalJson({ documentType, createdAtUtcIso, nonce, protocolVersions })))`, 43 characters, so a document's requirement cannot change without changing its id and a v2-required document cannot take an id you choose. Every model's `utils.createDocument()`, `createEmpty()`, `drives.create()`, copies of legacy documents, and the documents Connect and switchboard create are now v2-required. Existing documents stay legacy.

```typescript
import { withSignaturePolicy } from "@powerhousedao/shared/document-model";

await client.createEmpty("powerhouse/document-model"); // v2-required, derived id
await client.createEmpty("powerhouse/document-model", {
  signaturePolicy: "legacy",
});
await client.drives.create({
  global: { name: "Drive" },
  signaturePolicy: "legacy",
});
await client.create(
  withSignaturePolicy(module.utils.createDocument(), "legacy", { id: "my-id" }),
);
```

#### 🎚️ Creation default override

One host-level setting picks what new documents are created as when the caller does not say. It never changes an existing document and does not change what a reactor accepts.

| Host        | Setting                                                                     |
| ----------- | --------------------------------------------------------------------------- |
| Library     | `ReactorClientBuilder.withCreateSignaturePolicy("legacy" \| "v2-required")` |
| Switchboard | `CREATE_SIGNATURE_POLICY=legacy` or `v2-required` (default)                 |
| Connect     | `connect.reactor.createSignaturePolicy` in `powerhouse.config.json`         |

`IReactorClient.getCreateSignaturePolicy()` reports it.

#### 🪪 Signature trust policy

A `SignatureTrustPolicy` (`ReactorBuilder.withTrustPolicy`, or `SignerConfig.trustPolicy`) is asked once per signed write whether `signer.app.key` may sign as `signer.user`. Without one, a signed write is refused while `REACTOR_AUTH_ENFORCEMENT` is on and accepted otherwise, because the auth scope trusts `signer.user.address`. Under `REACTOR_AUTH_ENFORCEMENT` switchboard installs `createRenownTrustPolicy` from `@renown/sdk`, which accepts a key when a Renown credential issued by the address's `did:pkh` delegates to it. The reactor's own key signing as its own user is always accepted.

The reactor's own user is read on every ask, so a login takes effect immediately. A host policy caches on (address, key) only. `createRenownTrustPolicy` refuses a missing credential at admission immediately, so a user's first operations must not be pushed before their Renown credential is visible to the receiving switchboard. A switchboard refuses to boot with `REACTOR_WORKERS` above 0, `REACTOR_AUTH_ENFORCEMENT` on and `RENOWN_SOURCE=self`, because its pooled workers would have no trust policy. `RemoteDocumentController` resolves a slug to the document id before it signs. `withSignaturePolicy(document, "v2-required", { id })` ignores `id` and derives the id.

Connect installs the same policy in its main-thread and SharedWorker reactors when `connect.reactor.featureFlags.authEnforcement` is on, reading credentials from `connect.renown.switchboardUrl` or `connect.renown.url`; with neither set the reactor fails to build.

### BREAKING CHANGES

#### Signature verification enforces by default

A write whose signature does not verify is refused. Tampered legacy input is refused at mutation admission. Set `signatureVerification: "log"` on the executor config to observe refusals first.

#### `REQUIRE_SIGNATURES` removed

The switchboard `REQUIRE_SIGNATURES` env var and `identity.requireSignatures` no longer exist; nothing reads them. Also removed: `SignerConfig.verifier`, `ReactorBuilder.withSignatureVerifier`, `WorkerPoolOptions.verifier`, `SignatureVerifierSpec` and `getRenownSignerConfig`'s `requireSignature` parameter. A v2-required document carries its own requirement.

#### New documents are v2-required, with content-addressed ids

**Before:** `module.utils.createDocument()` returned a legacy document with a random UUID, and code could overwrite `document.header.id` before creating it.

**After:** the document is v2-required and its id is derived from its header. Setting `document.header.id` on it makes its `CREATE_DOCUMENT` fail with `ID_MISMATCH`, and writing to it unsigned fails with `UNSIGNED_REQUIRED`.

**Migration:** use the id the document carries; for a chosen id, create it legacy with `withSignaturePolicy(document, "legacy", { id })`. Give every client that creates or writes documents a signer (`ReactorClientBuilder.withSigner`), or create legacy documents with `withCreateSignaturePolicy("legacy")`. A switchboard's default drive with a fixed `id` is created legacy.

#### Hosts need a signer to undo and redo on v2-required documents

A reactor with no signer stores the operations it synthesizes from `UNDO` and `REDO` unsigned, and every peer refuses them on a v2-required document. Give the reactor a signer (`ReactorBuilder.withSigner`, which `ReactorClientBuilder.withSigner` passes on) and, for pooled workers, a `workerSigner` spec. A switchboard whose Renown identity fails to initialize has no signer, so it creates legacy documents and logs a warning.

#### `IReactorClient.getCreateSignaturePolicy()`

`IReactorClient` gains `getCreateSignaturePolicy()`. An object implementing the interface by hand must add it.

### MIGRATION GUIDE

1. Upgrade every reactor in the fleet — switchboards and Connect builds — to this release before any of them creates v2-required documents. An older reactor stores whatever it would have stored before on a v2-required document and forwards it, and upgraded peers drop those operations.
2. During the rollout, set the creation default to legacy: `CREATE_SIGNATURE_POLICY=legacy` on switchboards, `connect.reactor.createSignaturePolicy: "legacy"` in Connect's config. Browser clients update on their own schedule; watch `reactor_signature_refusals_total` for refusals.
3. Make sure every host that writes documents has a signer: switchboard needs a Renown identity (`ph login`), and a library host needs `withSigner`.
4. Remove `REQUIRE_SIGNATURES` from deployments.
5. Once the whole fleet runs this release, drop the legacy override; new documents are then v2-required.

---

## 🚀 **Unreleased** — with documentDecisions on, a load places a late operation by timestamp, not by the sender's index

### 🔁 Fewer permanent divergences when a late operation arrives (documentDecisions on)

When a reactor loaded operations from a peer, it treated a local operation as preceding the batch whenever its local index was below the batch's lowest index on the peer. After reshuffles the two index spaces are unrelated (a switchboard can run hundreds of indexes ahead of a spoke). So a late operation stamped before a spoke's own newer ones was appended behind them, and the spoke's document differed from everyone else's for good.

With `documentDecisions` on (`REACTOR_DOCUMENT_DECISIONS=true`; off by default, and every replica that shares a document needs it, since each must place its own writes by timestamp):

- A local operation stamped after the earliest incoming operation is now always treated as concurrent, and the load reshuffles it into timestamp order.
- Operations on that same earliest timestamp still go by index, as before. A batch delivered whole keeps the sender's order unless the load reshuffles, which orders same-millisecond operations by action id, as before this change. When a catch-up splits a same-millisecond batch across loads, the sender's order holds only while the receiver's index for the first part is below the sender's index for the rest; otherwise the rest falls back to the reshuffle's tie-break, action id, as before this change.
- An execute batch whose actions are stamped out of order (for example `[a@100, b@90]`) is now stored in timestamp order (`b, a`), the order a peer that receives it split or reshuffles it places it in. Actions with equal timestamps keep their batch order on the author; a peer whose load reshuffles them still orders them by action id, as before this change.

With `documentDecisions` off, loads decide exactly as before.

**Trade-off:** with the flag on, a peer batch whose earliest operation is stamped before local operations now reshuffles them, even when the sender's index was ahead. Where the old rule appended, such a load now costs a reshuffle. If that reshuffle moves more operations than `maxSkipThreshold` allows, for example a spoke holding over 1000 operations stamped after a long-delayed peer operation, the load fails with `EXCESSIVE_SHUFFLE` instead of appending. Same-millisecond ties between different authors are still decided by index, as before. An out-of-order execute batch now applies in timestamp order on its author too, so an action that depends on a later-stamped one in the same batch can fail there, as it already could on any peer that received the batch split or reshuffled it.

---

## 🚀 **v6.0.0** — Jan–May 2026

### ✨ Highlights

1. **Redesigned Reactor with sync reliability** — Complete rewrite of the write model, sync pipeline, and job system with quarantine, dead letters, paging, and FIFO batching
2. **Vetra Package Ecosystem** — Private npm-compatible registry, `ph publish/install/unpublish`, and dynamic package loading at runtime in Connect and Switchboard
3. **Reactor Attachments** — New `reactor-attachments` package for document-linked file storage with reservations, direct upload, and soft-delete
4. **Switchboard Load Balancer** — Built-in `switchboard-lb` for multi-node deployments with least-conn routing and drive-id-based pinning
5. **Full Observability** — OpenTelemetry metrics, Sentry source map uploads, Prometheus exporter, and OTel-to-Sentry span bridging

---

### NEW FEATURES

#### ⚙️ Reactor — Rewritten Write Model & Sync Engine

The reactor's core write model was fundamentally rearchitected to unify transactions with execution context. The sync pipeline gained per-document quarantine (instead of blocking entire remotes), a persistent dead-letter store, buffered batched mailboxes, abort signals on GQL channels, and cursor-based paging for large sync batches.

Key additions:

- **DocumentIntegrityService** — validates and rebuilds document keyframes/snapshots
- **Sync paging** — `getOperations` now pages across scopes
- **Job timeout** via abort signals propagated through the entire job pipeline
- **Yield utilities** for cooperative scheduling in the job executor
- **Exponential backoff + jitter** on retries
- **`test-sync-queue` CLI app** for detecting sync drift on large drives

```bash
# New profiling script for direct reactor performance testing
npx tsx profiling/reactor-direct.ts --docs 1000 --otel
```

#### 📦 Vetra Package Ecosystem

A full end-to-end package ecosystem now powers Powerhouse apps. A private npm-compatible registry (Verdaccio-backed) hosts packages, and the CLI, Connect, and Switchboard all integrate with it.

**New CLI commands:**

```bash
# Publish a built package to the Powerhouse registry
ph publish

# Install from the registry (uses Powerhouse registry by default)
ph install @your-org/your-package

# Unpublish a package and purge the CDN cache
ph unpublish @your-org/your-package@1.0.0
```

**Dynamic loading:** Connect and Switchboard load processors and subgraphs at runtime from the HTTP registry — no rebuild required when new packages are published.

**Auto-discovery:** Connect automatically finds and installs the correct package when it encounters an unknown document type.

**Version picker:** The Connect UI lets users choose specific dist-tag versions when installing packages.

```json
// powerhouse.config.json
{
  "registry": "https://your-registry-url"
}
```

#### 📎 Reactor Attachments

New `reactor-attachments` package provides document-linked file storage, integrated directly into the reactor and switchboard.

Features:

- Upload reservations + direct upload to storage
- Switchboard transport implementation
- `HEAD` support, soft-delete, and case-insensitive hash indexing
- `Attachment-Metadata` headers

#### ⚖️ Switchboard Load Balancer

New `switchboard-lb` package provides HTTP load balancing for multi-node Switchboard deployments:

- **M1:** Least-connections proxying of upstream routes
- **M2:** Request pinning across restarts
- **M3:** Rewrite to drive-id header for deterministic routing

#### 📊 OpenTelemetry & Sentry Observability

```bash
# Enable OTel metrics export from Switchboard
OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo:4318 ph switchboard start

# Prometheus metrics (opt-in)
PROMETHEUS_METRICS=true ph switchboard start
```

- New `opentelemetry-instrumentation-reactor` package for distributed tracing across reactor internals
- Sentry source maps uploaded in CI and releases tagged automatically
- OTel spans bridged to Sentry for unified error correlation
- Opt-out error reporting for `ph-cli` and `ph-cmd` via config
- Lightweight Sentry SDK replaces full SDK in CLI

#### 🪝 `useDocumentSafe` Hook

```typescript
import { useDocumentSafe } from "@powerhousedao/reactor-browser";

function MyEditor({ documentId }: { documentId: string }) {
  const { document, error, isLoading } = useDocumentSafe(documentId);
  if (isLoading) return <Spinner />;
  if (error) return <ErrorBanner error={error} />;
  return <Editor document={document} />;
}
```

Replaces the pattern of calling `useDocument` and catching thrown errors — now surfaces error and loading state as first-class values.

#### 🤖 `ph code` Subcommand — AI Agent Harness

```bash
# Launch an AI-assisted code generation session
ph code
```

New subcommand that wires Mastra and ph-clint into the CLI for AI-powered code assistance scoped to your Powerhouse project.

#### 🛡️ Per-Document Authentication

- **Signature verification** on Switchboard: operations must carry a valid app-key signature
- **Per-document protection model**: configure which documents require authentication
- `ph login` / `ph logout` / `ph access-token` login flow now implemented in the Renown SDK and forwarded by the CLI

#### 🔧 Codegen Improvements

- **Versioned reducers by default** — reducers are version-stamped at generation time
- **`satisfies DocumentModelModule`** instead of type casts
- **CI/CD + Docker templates** scaffolded by `ph init` for new projects
- **Vitest coverage** scaffolded with reducer threshold checks
- **Separate `ph generate` commands** for reducers, editors, and processors
- **AGENTS.md template** with editor drag-and-drop guidance and reducer testing playbook
- **E2E codegen tests** for processor and subgraph generation

#### 🖥️ Connect Improvements

- **Processor inspector** panel showing live processor state
- **Offline preview** for locally installed packages (bundled into Connect)
- **PGlite migration banner** for DB version transitions
- **Dump & import** for local PGlite database
- **Version picker** UI for dist-tag selection
- **Git hash display** in settings/URL for build traceability
- **Drive info** shown in settings menu
- **JSON viewer** in operations tooltip
- **Retry on startup** for default drives with backoff

#### 📡 Reactor MCP

The `reactor-mcp` package now creates a fresh `McpServer` per `/mcp` request, fixing concurrent transport collision when multiple clients connect simultaneously.

---

### IMPROVEMENTS

- **tsdown** replaces the previous build toolchain across all packages: `analytics-engine`, `builder-tools`, `ph-cli`, `ph-cmd`, `registry`, `shared`, `design-system`
- **Separate node/browser processor bundles** — processors now publish distinct `node` and `browser` entrypoints
- **Tree-shaking** — `sideEffects: false` added to generated package boilerplate; pglite, jszip, and renown crypto are now lazy-loaded
- **Document cache** made compatible with GraphQL clients directly
- **Remote document controller** in `reactor-browser` for server-driven document state
- **Single batch query** in `reactor-browser` for pulling operations on remote controllers
- **Switchboard**: dynamic model loading behind `DYNAMIC_MODEL_LOADING` env var; OTel provider registration ordering enforced
- **Registry**: SSE + webhook publish notifications; npm uplink for transparent CDN fallback; Renown JWT auth in front of Verdaccio
- **`ph-cmd`** now delegates `init` and all forwarded commands to the versioned `ph-cli` binary — version pinning works correctly
- **`ph migrate`** now runs against the target codegen version with `--force` flag available
- **`ph install`**: `--allow-build` flag supported; prompts for dist-tag on prerelease publish

---

### BUG FIXES

- Reactor: orphan reshuffle and cross-batch FIFO bugs fixed; documents with out-of-order `ADD_RELATIONSHIP` now correctly backfilled
- Reactor: deleted documents no longer returned by queries; jobs targeting deleted documents are not retried
- Reactor: GQL channel now correctly handles abort signals, backpressure, and dead-letter placement
- Connect: PGlite idb cleared on storage wipe to avoid flush race; duplicate document models deduplicated by type+version
- Switchboard: falls back to a free port on `EADDRINUSE` and propagates to Vetra
- Switchboard: `migrate` command now honors correct env vars
- Registry: concurrent tarball extraction prevented; correct package version resolved on CDN
- ph-cli: lazy-loaded for faster startup; `PH_REGISTRY_URL` env takes precedence over config
- Design system: static asset paths fixed post-tsdown migration; icons path corrected

---

### ⚠️ BREAKING CHANGES

**Node.js 24 is now the minimum supported version.**

```bash
# Check your Node version
node --version  # must be >= 24.0.0

# Install Node 24 via nvm
nvm install 24 && nvm use 24
```

**`DriveEditor` renamed** — a bulk rename was applied across all packages. Search your codebase for old `DriveEditor` references and update as directed by TypeScript.

**Generated subgraph code should be deleted** — subgraphs are now generated and loaded at runtime. Delete any `src/subgraphs/` directory in your project to avoid conflicts.

```bash
rm -rf src/subgraphs/
```

## 🚀 **v5.3.0**

### ✨ Highlights

1. **Authentication & Permissions** - CLI authentication and document-level permission system on Switchboard
2. **Improved code generation with TS Morph and templates** - Faster, more reliable code generation and templates are easier to maintain
3. **Runtime Document Model Subgraphs** - No more generated subgraph code to manage

### NEW FEATURES

#### 🔐 CLI Authentication

New CLI commands for authentication workflows:

**`ph login`** - Authenticate with your Powerhouse identity

```bash
ph login
```

**`ph access-token`** - Generate access tokens for API authentication

```bash
ph access-token
```

#### 🛡️ Document Permission Service

A new permission system that provides fine-grained access control at the document level for Switchboard

**Key Features:**

- **Operation Permissions** - Control who can perform specific operations on documents
- **Document Group Permissions** - Organize documents into groups with shared access rules
- **Feature Flag** - Enable/disable via configuration

The permission service can be enabled via environment variable or configuration. When enabled, all document operations are validated against the permission rules.

#### Runtime Document Model Subgraphs

Document model subgraphs are now automatically available on Switchboard at runtime.
**Action required:** Previously generated subgraphs should be deleted to avoid conflicts.

#### React Hooks Changes

**Bug Fixes**

- _Bug fix_: Hooks that return multiple documents now correctly update when any of the documents changes
- Improved React Suspense integration to avoid triggering loading states on every document update

**Imperative document hooks**

Added `useGetDocument` and `useGetDocuments` hooks to allow fetching documents imperatively.

```typescript
const getDocument = useGetDocument();

const onDocumentSelected = async (id: string) => {
  // Document is only fetched when the callback is invoked
  const document = await getDocument(id);
};
```

**Handle result of dispatched actions**

The `dispatch` function now accepts two optional callbacks:

- `onErrors` - invoked with any errors thrown by the reducers when processing the actions.
- `onSuccess` - invoked with the updated document.

These callbacks are useful to update the UI or perform other actions based on the result of the dispatched action.

**Usage:**

```typescript
const [document, dispatch] = useDocumentById(documentId);

dispatch(
  myAction,
  // Handle errors (e.g., show toast notification)
  (errors) => {
    alert(errors);
  },
  // Handle success
  (document) => {
    console.log("Document updated:", document);
  },
);
```

### MIGRATION STEPS

#### ph migrate

Run `ph migrate` to automatically apply some necessary migrations to your project.

#### Editor Style Updates

The padding added by Connect when displaying the editor has been removed. Each editor is now able to control its own padding.

#### Delete document model subgraphs

Delete the document model subgraphs from your project to avoid conflicts with the automatically generated subgraphs.

#### vitest.config.ts Configuration Update

For existing projects generated before this release, update your project configuration files to exclude `vitest.config.ts` from TypeScript compilation and add it to ESLint's allowed project list:

**In `tsconfig.json`:**

```json
{
  "exclude": ["node_modules", "dist", "eslint.config.js", "vitest.config.ts"]
}
```

**In `eslint.config.js`:**

```javascript
{
  languageOptions: {
    parserOptions: {
      projectService: {
        allowDefaultProject: ["eslint.config.js", "vitest.config.ts"];
      }
    }
  }
}
```

This prevents issues with `package.json` imports in vitest.config.ts being copied to the dist folder during compilation.

### BUG FIXES AND IMPROVEMENTS

#### Connect UI/UX

- Renaming a file now also updates the document name
- Fixed scroll overflow issues in files list
- Better default styling for editors and codegen templates
- Enhanced drive header with info menu, share menu, and Vetra Academy links

#### Document Export

- Fixed document extension handling when exporting documents
- Improved document response naming consistency
- Better error handling in export functionality

#### Document Editor Boilerplate

- The document editor boilerplate has been updated to provide a better starting point for custom editors.

### DOCUMENTATION (Now also live on https://academy.vetra.io)

**Authorization & Permissions:**

- [Reactor API Authorization](https://staging.powerhouse.academy/academy/MasteryTrack/BuildingUserExperiences/Authorization/Authorization) - Role-based access control configuration
- [Document Permission System](https://staging.powerhouse.academy/academy/MasteryTrack/BuildingUserExperiences/Authorization/DocumentPermissions) - Fine-grained document-level permissions

**Connect Tools:**

- [Inspector Modal](https://staging.powerhouse.academy/academy/MasteryTrack/ConnectTools/InspectorModal) - Database & reactor explorer

**Other Updates:**

- Updated hooks documentation
- Vetra Studio usage guides

### **Document Model Subgraphs**

Document model subgraphs are now available automatically on Switchboard. You should delete the generated subgraphs from your project to avoid conflicts.

## 🚀 **v5.1.0**

### ✨ Highlights

1. **Inspector Tools** - New debugging tools for database and sync operations
2. **Renown Login Component** - Improved authentication UI
3. **Sync Architecture** - New reactor client with GraphQL sync channels (WIP 🚧)
4. **Cryptographic Signing (Preview)** - Document and operation signing capabilities (WIP 🚧)

### NEW FEATURES

#### 🔍 Inspector Tools

New debugging components inside Connect to help developers understand what's happening under the hood of the reactor:

- **DB Explorer** - Browse and inspect tables in the local PGlite database
- **Remotes Inspector** - View configured sync remotes and their status
- **Channel Inspector** - Debug sync channels of the reactor (inbox, outbox, dead letter queues)

These tools can be enabled via feature flags. See the [Inspector Modal documentation](https://staging.powerhouse.academy/academy/MasteryTrack/ConnectTools/InspectorModal) for details.

#### 🔐 Renown Login Component

Improved authentication UI component with:

- Better user experience for wallet-based authentication
- Playwright end-to-end tests for reliability
- ConnectCrypto and Renown ID now available in hooks

#### 🔄 Sync Architecture Improvements

Major improvements to the synchronization system. We are staging big changes ahead of migrating to the new reactor architecture.

- **Reactor Client** - New client for Connect-to-Switchboard sync
- **GraphQL Channels** - Push/pull channels for bidirectional sync
- **WebSocket Subscriptions** - Real-time updates via GraphQL subscriptions
- **Conflict Resolution** - Improved handling of concurrent modifications

#### ✍️ Cryptographic Signing (Preview)

Initial support for document and operation signing:

- Connect crypto signer and verifier
- Document creation signatures
- All actions can now be signed

> **Note:** This feature is in preview and the API may change in future releases.

### IMPROVEMENTS

- **Healthcheck Routes** - Added `/health` endpoint for Connect and Switchboard for deployment monitoring
- **Feature Flags System** - Global context for managing feature flags across hooks
- **Logging Interface** - Improved debugging output
- **Docker Workflow** - Added docker build and publish workflow for Academy

### BUG FIXES

- Fixed Safari drag-and-drop with empty dataTransfer.items
- Fixed circular imports across multiple packages
- Improved HMR (Hot Module Replacement) for external packages
- Fixed document storage with better id/slug resolution

### DOCUMENTATION

- Updated Todo List tutorial with diff-based approach
- New Vetra commands documentation
- Reactor MCP documentation updates

---

## 🚀 **v5.0.0**

✨ **Highlights**

This release introduces four major changes:

1. **Vetra Development Workflow** (`ph vetra`) - A complete development environment for building Powerhouse packages
2. **AI-Assisted Package Development** - Build document models interactively using Claude Code and Model Context Protocol (MCP)
3. **New React Hooks** - Simplified hooks for document editor development
4. **React 19 Upgrade** - Updated to React 19 with latest features and improvements

## NEW FEATURES

### **Vetra Development Workflow** (`ph vetra`)

A complete development environment for building Powerhouse packages with real-time collaboration and code generation.

**What is Vetra?**

Vetra provides an integrated development flow that combines:

- Local Switchboard server
- Connect Studio UI for visual editing
- Real-time document synchronization
- Automatic code generation for document models, editors, processors and subgraphs
- Support for remote Vetra drives

**Key Features:**

- Start a complete development environment with one command: `ph vetra`
- Hot reload for document models and editors during development (`--watch`)
- Interactive code generation mode (`--interactive`)
- Connect to remote drives for collaborative development

**Getting Started:**

```bash
# Start Vetra with defaults
ph vetra

# Development mode with hot reload
ph vetra --watch

# Interactive code generation
ph vetra --interactive

# Connect to a remote drive
ph vetra --remote-drive https://switchboard.phd/d/vetra
```

### **AI-Assisted Package Development** (Model Context Protocol)

Build document models interactively using Claude Code through the Model Context Protocol (MCP) server.

**What is reactor-mcp?**

The reactor-mcp server exposes Powerhouse's document model system to AI assistants like Claude Code, enabling:

- Accessing and interacting with documents available on a Switchboard instance
- Interactive document model creation through conversation
- State schema design assistance
- Operation and reducer implementation
- Document editor UI implementation
- Real-time validation and feedback

**Available MCP Tools:**

Document Operations:

- `createDocument` - Create a new document
- `getDocument` - Retrieve a document by ID
- `getDocuments` - List documents in a drive
- `deleteDocument` - Delete a document
- `addActions` - Add actions to a document

Drive Operations:

- `getDrives` - List all drives
- `addDrive` - Create a new drive
- `getDrive` - Get a specific drive
- `deleteDrive` - Delete a drive
- `addRemoteDrive` - Connect to a remote drive

Document Model Operations:

- `getDocumentModels` - Get list of available document models
- `getDocumentModelSchema` - Get the schema of a specific document model

**Getting Started:**

1. Projects are generated with Claude Code pre-configured:

```bash
ph init
```

2. Start Vetra to start the MCP:

```bash
ph vetra
```

3. Ask Claude to help build your document model:

```
"Create a document model for tracking project milestones with completion status, deadlines, and dependencies"
```

4. Claude will guide you through:
   - Requirements gathering
   - State schema design
   - Operation definition
   - Reducer implementation
   - Code generation

**Workflow:**

1. Describe your requirements to Claude
2. Review and approve the proposed design
3. Claude creates the model using MCP tools
4. Code is generated automatically
5. Test and iterate in Vetra environment

## BREAKING CHANGES

### **New Hooks-Based State Management System**

The most significant change in v5.0.0 is the introduction of a comprehensive hooks-based state management system. This fundamentally changes how editors should be implemented.

**What Changed:**

- State management has been moved to reactor-browser hooks
- New hooks for accessing documents, drives, folders, and UI state
- Event-based updates replace direct state manipulation
- Simplified editor implementation patterns

**Impact on Editors:**

- Document and Drive editors need to adopt the new hook patterns from `@powerhousedao/reactor-browser`
- Navigation and selection state is now managed through hooks instead of props

**Learn More:** Complete hooks documentation and examples are available at https://staging.powerhouse.academy/academy/APIReferences/ReactHooks

**Migration Required:** Existing editors will need to be refactored to use the new hooks API. See Migration Guide below.

### **React 19 Upgrade**

This release upgrades to React 19, which includes breaking changes.

**What You Need to Know:**

- Review the official React 19 upgrade guide: https://react.dev/blog/2024/04/25/react-19-upgrade-guide
- Most React 18 code will continue to work, but deprecated patterns should be updated
- New React 19 features are now available

### **DocumentToolbar Component**

A new `DocumentToolbar` component is now available for editors to provide standard document operations UI. This replaces the previous config-based approach with a more flexible component-based implementation.

**What Changed:**

Previously, the document toolbar was configured using editor config parameters:

```typescript
// Old approach (v4.x)
{
  disableExternalControls: true,
  documentToolbarEnabled: true,
  showSwitchboardLink: true,
  timelineEnabled: true,
}
```

Now, you import and use the `DocumentToolbar` component directly in your editor:

```typescript
// New approach (v5.0)
import { DocumentToolbar } from "@powerhousedao/design-system";

<DocumentToolbar
  enabledControls={["undo", "redo", "export", "history"]}
/>
```

**Key Features:**

- **Flexible Control Configuration**: Choose which controls to display with `enabledControls` prop
- **Undo/Redo Operations**: Built-in support for document undo and redo
- **Export Functionality**: Document export with customizable handler
- **Revision History**: Access to document revision history
- **Switchboard Integration**: Automatic link generation for remote drives
- **Customizable Handlers**: Override default behaviors with custom callbacks

**Available Controls:**

- `undo` - Undo last operation
- `redo` - Redo last undone operation
- `export` - Export document
- `history` - Show revision history

**Migration Steps:**

1. Remove old config parameters from your editor configuration
2. Import `DocumentToolbar` from `@powerhousedao/design-system`
3. Add the component to your editor JSX with desired props
4. Customize behavior with optional callbacks (`onClose`, `onExport`, `onSwitchboardLinkClick`)

### **`ProcessorFactory` Signature Change**

The `ProcessorFactory` now takes a `PHDocumentHeader` instead of a `driveId`.

**Before (v4.x):**

```typescript
export type ProcessorFactory = (
  driveId: string,
) => ProcessorRecord[] | Promise<ProcessorRecord[]>;
```

**After (v5.0):**

```typescript
export type ProcessorFactory = (
  driveHeader: PHDocumentHeader,
) => ProcessorRecord[] | Promise<ProcessorRecord[]>;
```

**Migration Steps:**

1. Update your processor factories to take a `PHDocumentHeader` instead of a `driveId`
2. If necessary, regenerate your processor with `ph generate` to get the latest changes

### **Type Parameters Removed**

The `Action` type parameters have been removed, `Operation` type parameters have been removed, and the last `PHDocument` type parameter has been removed.

**Before (v4.x):**

```typescript
const action: Action<MyDocModelActionType, unknown> = {
  type: "my-action",
  input: {
    name: "John Doe",
  },
};
```

**After (v5.0):**

```typescript
const action: Action<unknown> = {
  type: "my-action",
  input: {
    name: "John Doe",
  },
};
```

### **`OperationScope` Removed**

Previously, an enum existed called `OperationScope` that was used to define the scope of an operation. This has been removed and replaced with a string type.

**Before (v4.x):**

```typescript
const operation: Operation = {
  scope: OperationScope.Global,
};
```

**After (v5.0):**

```typescript
const operation: Operation = {
  scope: "global",
};
```

### **`PHBaseState` Changes**

The `PHBaseState` type has a number of changes:

- It no longer has a type parameter
- `document` and `auth` scopes are now required

### **`Action` and `Operation` Changes**

The `Action` and `Operation` types have a number of changes:

- `Operation` no longer extends `Action`, it _has_ one
- Some fields have been renamed or removed

### **`ExtendedState` Removed**

This includes `createExtendedState`, `ExtendedStateFromDocument`, and `CreateExtendedState` functions.

## IMPROVEMENTS

### **Improved Connect Build System**

The `ph connect build` and `ph connect preview` commands have been completely reimplemented.

**Key improvements:**

- More reliable production builds
- Better handling of external packages
- Improved build performance
- Cleaner build output

### **Hot Module Replacement (HMR) for External Packages**

Development experience has been significantly improved with HMR support for external packages.

**What this means:**

- Changes to external document models and editors update instantly during development
- Faster iteration cycles when building custom packages
- No more full page reloads when editing external code

### **Relational Database Processors with Namespacing**

Operational processors now support namespace isolation per drive.

**Key features:**

- Each drive gets its own database namespace
- Prevents data conflicts between processors
- Better data organization and querying
- Schema generation with `ph generate schema` command

## MIGRATION GUIDE

This release includes several breaking changes. Here's what you need to update:

1. **Project Structure** - Significant changes require creating a new project or applying manual updates
2. **Document Models** - Must be regenerated with new templates
3. **Editors** - Must adopt new hooks-based API
4. **DocumentToolbar** - Config-based approach replaced with component
5. **ProcessorFactory** - Signature change requires updates
6. **Document Creation** - New pattern for creating documents
7. **Server Interface** - Simplified method signatures

### **Update your project**

There are significant breaking changes in the project structure. It is recommended to create a new project from scratch and migrate your code to it.
If you wish to migrate manually then follow these steps:

1. Update to the latest version with `ph update`
2. Apply these changes: https://github.com/powerhouse-inc/document-model-boilerplate/pull/42/files

### **Regenerate Document Models**

Run `ph generate` to regenerate your document models with updated templates.

**Note:**
It's still possible to generate from zip files, but due to breaking changes in the document structure, zips exported from older versions no longer work.
Instead: use `ph generate document-models/<yourdocument>/<yourdocument>.json`

### **Migrate editors to use the new hooks**

The new hooks-based state management system is the primary breaking change affecting editor implementations.
Editors no longer receive `document` and `dispatch` as props and must use the new hooks instead.

**Replace state access patterns on editors**

```typescript
// Before
function Editor(props) {
  const { document, dispatch } = props;
}

// After
function Editor() {
  const [document, dispatch] = useSelectedDocument();
}
```

### **React 19 Migration**

Refer to the official guide: https://react.dev/blog/2024/04/25/react-19-upgrade-guide

### **New Document Creation Pattern**

**Breaking Change**: Documents are no longer created using `ADD_FILE` operations. Instead, documents now exist independently and are created using the new `addDocument` method.

**Before (v4.x):**

```typescript
// Old pattern: Documents were created via ADD_FILE operations
await server.addDriveAction(driveId, {
  type: "ADD_FILE",
  input: {
    id: documentId,
    name: "My Document",
    documentType: "my-document-type",
    document: documentData,
    synchronizationUnits: [...]
  }
});
```

**After (v5.0):**

```typescript
// New pattern: Documents exist independently
await server.addDocument(document, meta);
// Then optionally add to drive if needed
await server.addAction(driveId, {
  type: "ADD_FILE",
  input: {
    id: documentId,
    name: "My Document",
    documentType: "my-document-type",
  },
});
```

**Key Changes:**

- **`addDocument`** - New method for creating documents
- `ADD_FILE` operation no longer takes the document state and synchronization units as input
- Documents can exist without being part of any drive
- Cleaner separation between document creation and drive organization

**Migration Steps:**

1. Update `ADD_FILE` operations and add `addDocument()` calls

### **IBaseDocumentDriveServer Interface Simplification**

The `IBaseDocumentDriveServer` interface has been simplified to remove the need for passing `driveId` parameters when interacting with documents. This change improves the API by removing redundant parameters and aligning with the new document-centric approach.

#### **Method Signature Changes**

The following methods have had their signatures simplified by removing the `driveId` parameter:

- `addOperation(driveId, documentId, operation, options)` → `addOperation(documentId, operation, options)`
- `addOperations(driveId, documentId, operations, options)` → `addOperations(documentId, operations, options)`
- `queueOperation(driveId, documentId, operation, options)` → `queueOperation(documentId, operation, options)`
- `queueOperations(driveId, documentId, operations, options)` → `queueOperations(documentId, operations, options)`
- `queueAction(driveId, documentId, action, options)` → `queueAction(documentId, action, options)`
- `queueActions(driveId, documentId, actions, options)` → `queueActions(documentId, actions, options)`
- `getDocument(driveId, documentId, options)` → `getDocument(documentId, options)`
- `addAction(driveId, documentId, action, options)` → `addAction(documentId, action, options)`
- `addActions(driveId, documentId, actions, options)` → `addActions(documentId, actions, options)`

#### **Migration Guide**

**Before (v4.x):**

```typescript
// Old method signatures requiring driveId
await server.addOperation(driveId, documentId, operation, options);
await server.queueActions(driveId, documentId, actions, options);
await server.getDocument(driveId, documentId, options);
```

**After (v5.0):**

```typescript
// New simplified method signatures
await server.addOperation(documentId, operation, options);
await server.queueActions(documentId, actions, options);
await server.getDocument(documentId, options);
```

#### **Backward Compatibility**

**Legacy support is maintained** - the old method signatures with `driveId` parameters are still supported but marked as `@deprecated`. They will be removed in a future release.

When using the old signatures, you'll see deprecation warnings guiding you to the new method signatures. This allows for gradual migration without breaking existing code.

**Migration Steps:**

1. Update your code to use the new method signatures without `driveId`
2. Test your application to ensure all functionality works correctly
3. Remove any unused `driveId` variables from your codebase

#### **Deprecated Drive-Specific Methods**

The following drive-specific methods are also deprecated in favor of the standard document methods:

- `addDriveOperation` → use `addOperation`
- `addDriveOperations` → use `addOperations`
- `queueDriveOperation` → use `queueOperation`
- `queueDriveOperations` → use `queueOperations`
- `queueDriveAction` → use `queueAction`
- `queueDriveActions` → use `queueActions`
- `addDriveAction` → use `addAction`
- `addDriveActions` → use `addActions`

## 🚀 **v4.0.0**

## BREAKING CHANGES

⚠️ For both the Dspot team & BAI team pull requests have been created that support with the breaking changes ⚠️

BAI team:[Contributor Billing Pull Request](https://github.com/powerhouse-inc/contributor-billing/pull/3)
Dspot Team: [Effective-Octo-Adventure](https://github.com/powerhouse-inc/effective-octo-adventure/pull/162)

### **Significant `PHDocument` refactor**

- Consolidating header information into the `header` field of the document. See the [PHDocument spec](./packages/reactor/docs/planning/PHDocument/index.md#header).
- Introducing signed and unsigned documents with Ed25519 keys . See the [PHDocument signing spec](./packages/reactor/docs/planning/PHDocument/signing.md).

### **Processor generator updates**

- The analytics processor template now includes a namespace and batch inserts by default.
- Analytics factories are now in their own files, allowing for multiple factories to be generated.

### Additional Migration Guide has been create to help you navigate the breaking change of other packages

- `PHDocument` changes:
  - **This version requires that document models be regenerated**. This means that you will need to run `ph generate` to regenerate the `gen` folder for document models.
  - Document metadata fields (like `id`, `slug`, `documentType`, `created`, `lastModified`, etc) have been moved to a `header` field of the document. Thus, `document.id` is now `document.header.id`.
  - `created` and `lastModified` have been renamed to `createdAtUtcIso` and `lastModifiedUtcIso` respectively.
- Processor generator updates:
  - A root processor factory is now generated in the `processors` folder. This will aggregate the collection of all processor factories. It is highly recommended to use this root factory to register all processors. Generating a new processor will put this root factory in place.

✨ **Highlights of this release**

New features for managing, querying, and analyzing information in real-time.
This release focuses on improving data accessibility, enhancing performance, and providing a foundation for advanced analytical insights.

Introducing the **Relational Database & Operational Processor System**, a new architecture designed to enhance data handling, querying, and synchronization across the host-apps.

### 2. Relational Database & Operational Processor System

**New Operational Processor Architecture with Namespacing**: This introduces a flexible and scalable way to process document operations and transform them into a relational database format. Namespacing ensures conflict avoidance and better organization of data.
**Database Schema Generation and Migration Support**: The system now automatically generates database schemas and supports migrations, simplifying database management and ensuring data consistency. It leverages Kysely for type-safe query construction.
**Enhanced Analytics Capabilities with Operational Queries**: By transforming document data into a relational store, we can now perform complex analytical queries that were previously challenging. This enables more robust reporting and data analysis.
**Processor Factory System and Root Processor Aggregation**: This provides a standardized way to create and manage different types of processors, including those for relational databases, and allows for efficient aggregation of processed data.

✅ **What to try:**

- Experiment with generating a new operational database processor using the `ph generate` command and specify different document types to see how the schema and files are created.
- Define a custom database schema and implement an `onStrands` method in your processor to index document states into the relational store.
- Run tests for your new processor, leveraging the in-memory PGlite instance, to validate the stored state with database queries.
- Generate a GraphQL subgraph to expose your processed data, then try running various GraphQL queries to access and filter your transformed data.

### 3. Enhanced Analytics & Performance Monitoring

**Drive and Document Analytics Processors**: New processors are in place to specifically handle and prepare data for analytics related to drives and documents, enabling targeted performance monitoring and insights.
**Real-Time Relational Query**: Leveraging PGlite's live query feature, the system now supports real-time queries. This means that as underlying data changes, the results of these queries are updated instantly without requiring a refresh.
**Performance Improvements in Connect Apps**: The integration of the new operational database and live query capabilities directly within the Connect UI significantly improves the performance of data retrieval and display, offering a more responsive user experience for applications built on Connect.

✅ **What to try:**

- Observe the real-time data synchronization by making changes to documents in Connect and simultaneously viewing the updates through a GraphQL interface.
- Implement search functionality within your Connect UI using the `createProcessorQuery` hook to leverage the new database schema for type-safe queries.
- Create or modify documents in Connect and watch how the changes are immediately reflected in your Connect application's display, demonstrating the live query feature.
- Explore building more complex analytical queries that span multiple documents, taking advantage of the relational store's capabilities.

### Updates for [www.staging.academy.powerhouse](https://staging.powerhouse.academy/)

#### Documentation & Guides:

- **New:** PHDocument Migration Guide - Comprehensive guide to navigate the breaking changes in v4.0.0, including step-by-step migration instructions for the document header restructuring and property access patterns.
- 🔗 https://staging.powerhouse.academy/academy/APIReferences/PHDocumentMigrationGuide
- **New:** Drive Analytics Documentation and Examples - Complete documentation for the new analytics system with practical examples showing how to implement and use drive and document analytics processors.
- 🔗 https://staging.powerhouse.academy/academy/MasteryTrack/WorkWithData/drive-analytics
- **New:** Relational Database & Operational Processor System - Educational content explaining the new architecture for data handling, querying, and synchronization
- 🔗 https://staging.powerhouse.academy/academy/APIReferences/RelationalDatabase
- **New:** Todo-List Processor Tutorial - Try to add a processor to your todo-list demo project
- 🔗 https://staging.powerhouse.academy/academy/MasteryTrack/WorkWithData/RelationalDbProcessor

#### Enhanced Learning Content:

- **Updated:** GraphQL at Powerhouse - Documentation updates reflecting the new operational processor architecture and relational database integration.
- **Updated:** Document Model Creation guides - Updated to reflect the new PHDocument structure and processor generation changes.
- **Updated:** API References - Updated CLI command documentation (automatically generated) reflecting the new ph generate schema command and other v4.0.0 changes.

🔍 See [CHANGELOG.md](./CHANGELOG.md) for the complete technical changelog with all commits and detailed changes.
Thank you 💙 Core-dev Team

## 🚀 **v3.2.0**

✨ **Highlights**

### **Drive Analytics System**

- Introducing an analytics system for drives and documents with dedicated processors for tracking operations, changes, and usage patterns.
- Analytics data is automatically collected and stored in dedicated tables, providing insights into document lifecycle and drive activity.
- New analytics query subscriptions enable real-time monitoring of the data in your drive.

✅ **What to try:** Explore the new Drive Analytics documentation in the Academy to understand how analytics processors work and how to leverage analytics data in your applications. It currently happens though an initial analytics modal with the Sky-Atlas use case. This will later be adapted to the to-do list demo project.

### **Update of Front-end Architecture & Performance**

- Feature Preview: A new set of hooks were implemented to manage state on a more granular way and avoid unnecessary rerenders.

✅ **What to try:** Initial documentation about the hooks can be found [here](https://github.com/powerhouse-inc/powerhouse/blob/main/packages/common/state/README.md)

**Feature preview:** The new hooks are not fully integrated into Connect yet, however, they can be used in custom drive editors by wrapping the editor component with the new provider:

```diff
+import { AtomStoreProvider } from "@powerhousedao/common";

export default function Editor(props: IProps) {
  return (
+    <AtomStoreProvider reactor={props.context.reactor}>
      <DriveContextProvider value={props.context}>
        <WagmiContext>
          <BaseEditor {...props} />
        </WagmiContext>
      </DriveContextProvider>
+    </AtomStoreProvider>
  );
}
```

### 🐞 **Bug Fixes**

- Fixed drag and drop functionality in the generic drive explorer
- Improved document storage with better id/slug resolution
- Enhanced build process with better Prisma handling and external package management
- Reduced unnecessary logging and improved subscription performance with debounced refetches
- Added safer validation for document properties to prevent runtime errors
- Reimplemented the Switchboard button to open the document model subgraph

### Updates for [www.staging.academy.powerhouse](https://staging.powerhouse.academy/)

- **New:** Comprehensive Drive Analytics documentation and tutorial with practical examples
- Update of the Get Started chapter
- Update of the Mastery Track - Document Creation Chapter
- Update of the Mastery Track - Work with Data - Read & Write with the API chapter
- Update of the Mastery Track - Work with Data - Analytics Processor

## 🚀 **v3.1.0**

This release brings improvements to the **Cloud Environment Setup Flow,** a Connect build, updated PH commands

### `Ph service setup` command

- We have a simplified and optimized script to guide a builder through the setup of his cloud environment with connect & switchboard services.

✅ **What to try:** Try to run the `ph service setup` flow on a cloud instance on AWS or digital ocean and install a @powerhousedao/todo-demo-package.

[https://staging.powerhouse.academy/academy/MasteryTrack/Launch/SetupEnvironment](https://staging.powerhouse.academy/academy/MasteryTrack/Launch/SetupEnvironment)

### `ph connect build` command

- We have implemented `ph connect build` which bundles the connect app with the packages installed by the user in production mode.

---

### Configure an Allowlist and add Authorization for Switchboard

- Read how to add Authorization to your drive
  - [https://staging.powerhouse.academy/academy/MasteryTrack/BuildingUserExperiences/Authorization/Authorization](https://staging.powerhouse.academy/academy/MasteryTrack/BuildingUserExperiences/Authorization/Authorization)
- Or try to configure your environment
  - [https://staging.powerhouse.academy/academy/MasteryTrack/Launch/ConfigureEnvironment](https://staging.powerhouse.academy/academy/MasteryTrack/Launch/ConfigureEnvironment)
  ### It’s now possible to disable the Create New Drive button in Connect.
  - We have introduced PH_CONNECT_DISABLE_ADD_DRIVE=true/false env var in connect.
    configure your environment [https://staging.powerhouse.academy/academy/MasteryTrack/Launch/ConfigureEnvironment](https://staging.powerhouse.academy/academy/MasteryTrack/Launch/ConfigureEnvironment)
  ***
  ### Find your document scalars in the stand-alone Document-Engineering
  - [https://staging.powerhouse.academy/academy/ComponentLibrary/DocumentEngineering](https://staging.powerhouse.academy/academy/ComponentLibrary/DocumentEngineering)
    ✅ **What to try: Visit the updated** [https://storybook.powerhouse.academy](https://storybook.powerhouse.academy/?path=/docs/getting-started--readme) to see the latest scalar implementations by Dspot.
  ***
  ### Performance improvements in Connect
  - We’ve optimised the way components render & avoid rerenders which results in a faster, snappier app.
  - Optimized the initial loading of Connect for an improved UX
  ***
  ### Updates on [www.staging.academy.powerhouse](https://staging.powerhouse.academy/)
  - Academy moved to the monorepo! So you have more access to code context when writing documentation. 👌
  - We’ve updated the landing page getting you directly to the ‘Get started’ section & Tutorial
  - Still confused how to create a drive via mutations?
    ‘Configure a drive’ is now available to help you out. [https://staging.powerhouse.academy/academy/MasteryTrack/BuildingUserExperiences/ConfiguringDrives](https://staging.powerhouse.academy/academy/MasteryTrack/BuildingUserExperiences/ConfiguringDrives)
  - New educational content is present inside the ‘Mastery track’ guiding you through the advanced ToDoList Demo. [https://staging.powerhouse.academy/academy/MasteryTrack/DocumentModelCreation/WhatIsADocumentModel](https://staging.powerhouse.academy/academy/MasteryTrack/DocumentModelCreation/WhatIsADocumentModel)
  - The first page inside our API references chapter is now automatically updated with all the latest available commands for the Powerhouse CLI
    [https://staging.powerhouse.academy/academy/APIReferences/PowerhouseCLI](https://staging.powerhouse.academy/academy/APIReferences/PowerhouseCLI)

---

## 🚀 **v1.0.22 ⇒ v1.1.0**

[https://connect.phd/](https://staging.connect.phd/)

This release brings improvements that make it easier to **work with the Powerhouse CLI, understand available commands, and develop with greater confidence.**

✨ **Highlights**

### **Better CLI Documentation & Help**

- You’ll notice clearer help messages when you run `ph help` or `ph {command} --help` (e.g. `ph init --help`). We’ve redesigned the help output to be **more readable and useful right from your terminal.**
- Running `ph --version` now shows **additional context about your CLI installation** to help debug or verify your setup.

👉 **View the latest commands documentation here: [COMMANDS.md on GitHub](./clis/ph-cli/COMMANDS.md)
(Soon on academy too)**

✅ **What to try:** Run `ph help` or `ph init --help` and see the improved help output. Check out the online docs if you prefer reading in markdown!

---

### **Improved Project Initialization & Dependency Management**

- `ph init`, `ph setup-globals`, `ph update`, and `ph use` have **improved error handling and clearer messages** to guide you through project setup and environment switching.
- We’ll continue making these commands more interactive with the help of the `interactive-commander` library soon.
- Dependency updates to latest versions of `vite`, `vitest`, `tailwindcss` and more keep your projects aligned with latest versions.

✅ **What to try:** Run `ph update` in your project to pull in the latest compatible Powerhouse dependencies.

---

### **Improved Document Model Editing & Validation**

- We’ve made the SDL parsing and schema validation **safer and more reliable**, reducing cryptic GraphQL errors in the editor, to make document model definition a bit more reliable.
- A drive editor refactor for `DriveEditorContainer` and `DriveExplorer` inside Drive Explorer nowsupport dynamic document model and editor module injection. Giving you a smoother custom drive editor experience.

✅ **What to try:** Open a document in Studio mode and test schema edits or validation—error handling should feel more predictable/not brick your document model.

---

### **Cleaner Drive Deletion Across Storages**

- Removing a drive from your local storage, filesystem, or browser storage is now **more consistent and reliable.** You now have unified drive deletion behavior across `BrowserStorage`, `FilesystemStorage`, and `MemoryStorage` to ensure consistent data cleanup.
- You can now delete a drive and **immediately recreate a new one with the same ID and slug without issues.**

✅ **What to try:** Delete a drive and re-add it with the same ID to confirm a clean reset.

### 🐞 **Bug Fixes**

- Resolved an issue where `ph add` didn’t properly clean up installed packages.
- Fixed missing type imports and inconsistencies in CLI command modules.
- Addressed redundant drive deletion logic across storage layers.

**Complete Changelog & published package version can be found here:**

- An overview of the complete changelog of the past weeks can be found here!: https://github.com/powerhouse-inc/powerhouse/commit/e665c1e53dbcbbf7a7a701266522152b9c767f95. (There might be an opportunity here for the other teams to start communicating about their releases too as we are slowly gaining momentum !)

---

**Several updates for:** [https://staging.academy.powerhouse/](https://staging.academy.powerhouse/) 📖

- Added page: Setup environment & deployment guide
- Added page: Working with the Supergraph
- Added WIP page: Reusable component & Design System
- Added ph recipes: Editor creation, Supergraphs vs Subgraphs
- Updated Page: Publish packages & Run on cloud server
- Updated Page: Editor & Drive explorer creation
- Starting general spellcheck & consistency in terminology!

Thank you <3

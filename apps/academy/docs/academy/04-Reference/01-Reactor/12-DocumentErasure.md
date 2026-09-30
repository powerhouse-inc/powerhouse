---
toc_max_heading_level: 3
---

# Document erasure

A Switchboard with the privacy add-on answers GDPR access and erasure requests. Access lists every document an address or app key appears in. Erasure removes whole documents: the reactor deletes every row it holds about the document and leaves one signed `PURGE_DOCUMENT` operation, the **marker**, in its place. The marker syncs like any other operation, so every peer that held the document deletes its copy too.

Erasure works on documents, not on people. An address that signed operations in a document you keep stays in that document. To erase a person, erase the documents that hold them.

:::info[Off by default]
The add-on runs only when `PH_PRIVACY_ENABLED=true`. With it off, nothing on this page is mounted or scheduled.
:::

## Turning it on

```bash
AUTH_ENABLED=true
ADMINS="0x123...,0x456..."
PH_PRIVACY_ENABLED=true
# At least 32 bytes. Keys the hashes in the subject index and the audit log.
PH_PRIVACY_DEPLOYMENT_SECRET=<random string of 32+ bytes>
```

Switchboard refuses to boot with the add-on on when:

- the authorization policy is `OPEN`. Under `OPEN` every caller, anonymous included, is a supreme admin, so anyone could read disclosures and order erasures. `REQUIRE_AUTHENTICATED_CALLER` does not change this; turn on `AUTH_ENABLED` with `ADMINS`.
- the reactor has no signer. Switchboard signs markers with its Renown identity, the keypair `ph login` created (`ph switchboard --use-identity`, or `--keypair-path <path>`); without one, every receiver refuses the markers.
- `PH_PRIVACY_DEPLOYMENT_SECRET` is missing or shorter than 32 bytes.

Keep the deployment secret. The index and the audit log store `HMAC-SHA256(secret, lower(identifier))`, never the identifier. Rotating the secret means rebuilding the index; losing it means old audit rows can no longer be matched to an address.

Optional tuning:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PH_PRIVACY_DEADLINE_DAYS` | `30` | Days from the request after which a purge runs whether or not peers have caught up (GDPR Art. 12(3) allows one month) |
| `PH_PRIVACY_MARKER_GRACE_DAYS` | `7` | Days after a purge that remotes and permission rows are kept while peers receive the marker |
| `PH_PRIVACY_INTERVAL_MS` | `60000` | How often the scheduler runs. A finished purge also starts a run, so purges run back to back |
| `PH_PRIVACY_PURGE_TIMEOUT_MINUTES` | `15` | Minutes a purge may run without committing before it is enqueued again |

One Switchboard process per database. The scheduler, the queue and the sync mailboxes are in-process.

## Signer and Renown binding

A peer admits a marker through the same signature check as any operation. When the receiver runs with `REACTOR_AUTH_ENFORCEMENT`, its trust policy is Renown: it accepts the marker's key only if a Renown credential binds the signer's user address to that key. A Switchboard whose identity is not bound in Renown produces markers every enforcing peer refuses. Check the binding before the first request.

Pooled executor workers (`REACTOR_WORKERS`) sign with the same identity, loaded from the same keypair file.

## The admin API

The add-on mounts a `privacy` subgraph on `/graphql`. Every field requires a caller whose address is in `ADMINS`; anyone else gets `FORBIDDEN`.

```graphql
query {
  disclose(identifier: "0xabc...") {
    subjectHash
    documents { documentId role firstOrdinal lastOrdinal }
    boundSyncRemotes { name collectionId channelType }
    peerManifests { remoteName appKey }
    permissions { table column documentId detail }
    notCovered
  }
}
```

`disclose` matches addresses case-insensitively. Roles are `signer`, `app-key`, `creator`, `header-key` and `named` (a grant principal, a condition literal or a group member). `notCovered` lists what the response cannot see, such as personal data inside document-model state.

To erase:

```graphql
query {
  erasurePlan(ids: ["drive-id"]) {
    maxPurgeOperations
    items { documentId expandedFrom live operationCount groupReferencers }
  }
}

mutation {
  requestErasure(ids: ["drive-id"]) { requestId status deadline items { documentId status } }
}

query {
  erasureRequest(requestId: "...") { status items { documentId status markerOrdinal lastError } }
}
```

- **`erasurePlan`** is read-only. A drive expands to every document that was ever in it and has no open membership in another drive. For each document it reports the operation count against the cap and any surviving document whose auth history names it as a group. A group named that way cannot be purged; erase the referencing documents too.
- **`requestErasure`** records the request and returns at once. It refuses the whole request, with `DocumentNotDeletedError` naming the ids, if any document is still live. Delete the documents first (a drive with cascade), then request again. `deadline` is an ISO 8601 timestamp; it defaults to now plus `PH_PRIVACY_DEADLINE_DAYS`.
- **`erasureRequest`** reports progress.

## What the scheduler does

Each item moves `waiting` → `purging` → `purged` → `erased`, or to `failed`. At most one item is `purging` at a time across all requests, and a drive waits until its members are purged. When a purge finishes, the scheduler runs again at once and starts the next one, so a large request is not limited to one purge per interval.

| State | Moves on when |
| --- | --- |
| `waiting` | every remote owed the document's `DELETE_DOCUMENT` has acknowledged it, or the deadline has passed (recorded as `deadline-passed`). The purge job is enqueued. |
| `purging` | the `document_purges` row for the document exists. A job that fails terminally moves the item to `failed` with the error name. A purge with no row after `PH_PRIVACY_PURGE_TIMEOUT_MINUTES` is enqueued again; a document is never purged twice. |
| `purged` | every remote owed the marker has acknowledged it (`marker-converged`), or `markerGrace` has passed (`marker-undelivered`). The scheduler then removes the sync remotes bound to a purged drive and deletes the document's `DocumentPermission`, `OperationUserPermission` and `DocumentProtection` rows. A step that fails is retried on the next run. |

A request becomes `complete` when every item is `erased` and `failed` when any item fails. The other items of a failed request still run.

A job can fail while its purge still commits, for example when it times out. Each run checks `failed` items against `document_purges`: one whose row has appeared moves to `purged` and continues, and its request is `reopened` once none of its items is `failed`. After a failed or abandoned purge, the next purge waits until that purge's transaction has ended.

Remotes and permission rows wait for the marker because removing either stops it: a removed remote never polls again, and an erased permission row can hide the document from a poller. A remote that is still owed the marker at `markerGrace` is removed anyway. The document's memberships stay open, so a peer that reconnects later still receives the marker.

A remote is judged from its stored row, not only from the remotes that are running. A remote whose channel failed to start, for example because its host was unreachable at boot, counts as pending with the state `unknown` and never as delivered. If it is bound to a purged drive, it is deleted from storage at `markerGrace`, since nothing is running that could remove it.

If this Switchboard has remotes but no sync manager to ask, the check fails closed and the deadline decides. At `markerGrace` the stored remotes bound to a purged drive are deleted the same way.

### The audit log

`reactor.erasure_audit` is append-only (an `UPDATE` raises). Each row has the request, the document, an event and a `detail` column. Events: `requested`, `expanded`, `waiting` (the pending remotes, written each time the list changes), `deadline-passed`, `purged` (the marker ordinal and row counts), `marker-converged`, `marker-undelivered`, `remotes-removed`, `permissions-erased`, `failed`, `reopened` and `complete`. `detail` holds remote names, counts and error text. Any address or `did:key` in it, including one embedded in an error message, is replaced by its keyed hash. `requestedBy` is stored hashed.

The audit log is not a document and never syncs. Give it a retention period of its own.

## Large documents

A purge is one database transaction, and while it runs every read model's cursor, every catch-up sweep and every outbox stops advancing: settlement waits for the oldest open transaction. The executor refuses a document with more than `maxPurgeOperations` operations (default 200,000, about 1.6 s on a local Postgres) with `PurgeTooLargeError`, which fails the item.

To erase a larger document, name it in `requestErasure(..., allowLarge: ["id"])` and accept the stall. The purge must also finish inside the executor's `jobTimeoutMs` (default 30 s). Past it the job is marked failed and so is the item; if the purge commits afterwards, the next run moves the item to `purged`. Switchboard does not expose `jobTimeoutMs`; a host that builds its own reactor sets it with `ReactorBuilder.withExecutorConfig({ jobTimeoutMs })`.

## Peers

**Peers without erasure.** A peer on a build that does not announce the `document-purge` protocol cannot apply the marker. Its remote holds the marker instead (`waiting` reports it as `held`) and delivers it when the peer upgrades. Until then the peer keeps the document. At `markerGrace` its remote is removed; it receives the marker if it reconnects after upgrading. A relay without erasure blocks the peers behind it.

**Refused markers.** A peer whose trust policy rejects this Switchboard's key refuses the marker and keeps the document. The scheduler records that remote as `marker-undelivered` even though its cursor moves past the marker. A refusal counts whichever way the marker travelled: a marker this Switchboard pushed is reported back on the next poll, and a client that polled the marker reports its refusal on its next poll. Each refusal is stored in `reactor.sync_purge_refusals` (remote, document, branch and time, no error text), so one reported while the scheduler is stopped still counts.

A client on a build before marker refusal reporting does not report its refusal. Such a remote reads as converged once its cursor passes the marker. A client of this build holds its report for a Switchboard of an older build until that Switchboard announces the `marker-refusal` feature.

**Pushed markers.** A marker can also arrive from a client that pushes it. Under `DOCUMENT_PERMISSIONS`, a pushed `PURGE_DOCUMENT` requires a document admin: a supreme admin, the document's owner, or an `ADMIN` grant on that document. `OperationUserPermission` rows cannot widen this. Under `OPEN` every caller passes, so an open Switchboard lets anyone who can write a document purge it, and with `REACTOR_AUTH_ENFORCEMENT` off any key that verifies is trusted. Do not run an open Switchboard that syncs documents you care about.

**Groups across peers.** The purging Switchboard checks group references against the documents it holds. A peer holding a document that names the group, which this Switchboard never received, re-judges that document without the group, and its access decisions there can differ from its peers'.

## Read models on another database

Models on the reactor's database are fenced: a purge waits for them and they wait for a purge, so no row survives it. Models whose rows live on another database handle (the attachment reference index, third-party relational processors) skip purged ids but can still write a row from a batch fetched just before the purge committed. Repair one by rescanning it from just below the marker, from `packages/reactor` of the monorepo:

```bash
pnpm catchup rescan --pg <url> --from <markerOrdinal - 1> --consumer <read-model-id>
```

`markerOrdinal` is on the item (`erasureRequest`) and in the `purged` audit row.

## Outside the reactor

Erasure does not reach:

- database backups, WAL archives and point-in-time recovery. Expire them on a schedule that matches your deadline.
- Connect's IndexedDB copies and browser backups.
- attachment bytes still referenced by another document.
- processors that ignore deletions.

# Plan: Peer protocol agreement

Date: 2026-09-25
Status: built on feat/peer-protocol-agreement; one open question (see Open)

## Overview

Reactors sync documents without knowing what their peers can run. A
document's `protocolVersions` make every reactor that runs it apply it the same
way, but nothing tells a sender whether the receiver implements those
versions, and nothing tells a creator which versions its peers share. A
reactor built before a protocol version reads a document at that version as an
older one and writes rows that corrupt it. Base-reducer 3 is the first such
version; signature schemes, new protocol keys, sync behaviours and base
actions will follow.

This plan adds peer protocol agreement: every two connected reactors exchange
what they support, and the sync layer uses that to choose versions for new
documents and to hold documents back from a peer that cannot run them.

From a high level: a `PeerCapability` registry with `base-reducer` and
`signature` registered; a `PeerManifest` per reactor, ordered by a start
sequence, exchanged through `touchChannel` and stored on `sync_remotes`;
revisions named in both directions on every poll and on every push;
`selectProtocolVersions` behind `IReactorClient.getCreateProtocolVersions`; an
outbox gate that records `SyncHold` rows and releases them when a peer's
manifest widens; and a run check that makes a stored document at a version this
reactor does not run read-only, refused on every job and on receipt as a
non-quarantining `UNSUPPORTED_PROTOCOL`.

## Current behaviour

```
Document protocol
  set        header construction: protocolVersionsFor(policy, base) via withSignaturePolicy,
             in ReactorClient.createEmpty, DriveClient, reactor-browser drive creation and copy
  default    { "base-reducer": 2, signature: 2 } (v2-required), { "base-reducer": 2 } (legacy)
  fixed      CREATE_DOCUMENT input; deriveDocumentId preimage; immutable afterwards
  read       CachedDocumentMeta.protocolVersions; baseReducerVersion(header) compared as >= 2
  admission  no value check: base-reducer 7 runs as 2; unknown keys pass

Sync
  Remote     { meta: RemoteMeta, channel } per (name, DriveCollectionId); persisted in sync_remotes
  outbox     deriveOutbox: operation index by ordinal, excludeSourceRemote, sinceTimestampUtcMs,
             RemoteFilter, quarantinedDocumentIds; filtered rows are skipped as the ordinal advances
  client     GqlRequestChannel.init -> touchChannel, then pollSyncEnvelopes / pushSyncEnvelopes
  server     touchChannel resolver: syncManager.add a polling remote, or return early if it exists
  test       TestChannel, in-process, envelope send function
  skew       DECISION_FIELDS: a poll naming a field an older server lacks is retried without it
  hold       pollSyncEnvelopes skips read-gated items without touching their counters
  refusal    dead letter; quarantinesDocument true for every type but AUTH_TIMESTAMP_NOT_MONOTONIC;
             poll returns dead letters with errorType and the puller mirrors the quarantine

Identity     a channel is bound to an authenticated address (boundAddress);
             the signer carries an app key (did:key) when configured; no reactor id is exchanged
Capabilities ReactorFeatureFlags via resolveFeatureFlags, crossing to pooled workers as a partial set;
             document models registered per reactor; none of it is sent to peers

Topologies   Connect (reactor in a SharedWorker; tabs call IReactorClient over RPC) -> switchboard
             switchboard -> switchboard, the downstream acting as GqlRequestChannel client
             switchboard executor workers under one host sync manager
```

No part of the sync path knows what the peer can run.

## Design

### Capabilities

A capability is either a document protocol, named by its `protocolVersions`
key, or a feature that changes what a peer sends or expects on the wire. The
registry is static code in shared, and a reactor's local support is a pure
function of its resolved feature flags, so the host and its pooled workers
compute the same answer.

```ts
export type ProtocolCapability = {
  kind: "protocol";
  name: string;                                           // a protocolVersions key
  /** What a peer that announces nothing is assumed to support. */
  baseline: readonly number[];
  supported(flags: ReactorFeatureFlags): readonly number[];
  /** The version new documents take when peers agree. Absent: not negotiated. */
  preferred?(flags: ReactorFeatureFlags): number;
  /** A header may omit the key. */
  optional: boolean;
};

export type FeatureCapability = {
  kind: "feature";
  name: string;                                           // e.g. "sync.anti-entropy"
  baseline: readonly number[];                            // usually []
  supported(flags: ReactorFeatureFlags): readonly number[];
};

export type PeerCapability = ProtocolCapability | FeatureCapability;

export const PEER_CAPABILITIES: readonly PeerCapability[] = [
  {
    kind: "protocol",
    name: "base-reducer",
    baseline: [1, 2],
    supported: () => [1, 2],
    preferred: () => 2,
    optional: false,
  },
  {
    kind: "protocol",
    name: "signature",
    baseline: [2],
    supported: () => [2],
    optional: true,                                       // absent = legacy
  },
];
```

Baselines are frozen at what the last release without this feature does:
every such reactor creates and runs base-reducer 1 and 2 and `signature: 2`.
A capability added later has baseline `[]` for any value it introduces.

`ReactorBuilder.withPeerCapabilities(extra)` adds capabilities for tests and
for hosts that ship their own.

### Manifest

```ts
export const PEER_MANIFEST_FORMAT = 1;

export type Supports = {
  protocols: { [protocol: string]: readonly number[] };
  features: { [feature: string]: readonly number[] };
};

export type PeerManifest = Supports & {
  format: 1;
  appKey?: string;            // the signer's did:key, when configured; informational
  sequence: number;           // the sync manager's start time (ms); grows with every start
  revision: string;           // base64url(sha256(canonicalJson(Supports & { sequence })))
};

export function localPeerManifest(
  capabilities: readonly PeerCapability[],
  flags: ReactorFeatureFlags,
  appKey?: string,
  sequence?: number,          // SyncManager: LocalPeer.sequence ?? Date.now()
): PeerManifest;

/** Ignored by applyPeerManifest (server) and hearPeer (client). Silence carries no sequence. */
export function isOlderManifest(next: PeerManifest | null, held: PeerManifest | null | undefined): boolean {
  return next !== null && held != null && next.sequence < held.sequence;
}
```

```json
{
  "format": 1,
  "appKey": "did:key:zDn…",
  "sequence": 1790426339472,
  "revision": "q3Vd…",
  "protocols": { "base-reducer": [1, 2, 3], "signature": [2] },
  "features": { "sync.anti-entropy": [1] }
}
```

A manifest lists every capability the reactor registers. A registered name
missing from a peer's manifest means the peer supports none of its values. A
peer with no manifest gets the baselines.

```ts
export function legacySupports(capabilities: readonly PeerCapability[]): Supports;

export function peerSupports(
  manifest: PeerManifest | null,
  capabilities: readonly PeerCapability[],
): Supports {
  return manifest ?? legacySupports(capabilities);
}
```

A manifest with a `format` the reader does not know is read as its `protocols`
and `features` maps only; formats only add fields.

### Transport

Manifests travel on the channel handshake, between the two reactors the
channel connects and no further. Every poll names the client's revision and its
result names both, and every push names the server revision it was gated
under, so either side's change reaches the other within one poll interval and
a rollback on either side is noticed before data flows. The client drives both
directions by touching again.

```graphql
type Query {
  pollSyncEnvelopes(
    channelId: String!
    outboxAck: Int!
    outboxLatest: Int!
    manifestRevision: String            # the client's manifest; absent from a client without this feature
    refusals: [SyncRefusalInput!]       # documents the client refused as UNSUPPORTED_PROTOCOL
  ): PollSyncEnvelopesResult!
}

type Mutation {
  pushSyncEnvelopes(
    envelopes: [SyncEnvelopeInput!]!
    peerManifestRevision: String        # the server's manifest the push was gated under
  ): Boolean!
}

input SyncRefusalInput {
  documentId: String!
  branch: String!
}

input TouchChannelInput {
  id: String!
  name: String!
  collectionId: String!
  filter: RemoteFilterInput!
  sinceTimestampUtcMs: String!
  manifest: JSONObject                  # absent from a client without this feature
}

type TouchChannelResult {
  success: Boolean!
  ackOrdinal: Int!
  manifest: JSONObject                  # the server's manifest
}

type PollSyncEnvelopesResult {
  envelopes: [SyncEnvelope!]!
  ackOrdinal: Int!
  deadLetters: [DeadLetterInfo!]!
  hasMore: Boolean!
  manifestRevision: String              # the server's current manifest
  peerManifestRevision: String          # the client's manifest as the server holds it
}
```

```ts
// GqlRequestChannel
const AGREEMENT_FIELDS = [
  "manifest", "manifestRevision", "peerManifestRevision", "refusals", "SyncRefusalInput",
] as const;
private peerServesAgreement = true;
// Poll and push name AGREEMENT_FIELDS while peerServesAgreement. A validation error that
// names one clears it and reports the server as silent (null); the request is retried
// without them only after stopAgreement() resolves, i.e. after the sync manager has moved
// unsent items above the baselines to holds.

// every poll, before its rows reach the inbox
if (
  this.peerServesAgreement &&
  (result.manifestRevision !== this.peerManifest?.revision ||
    result.peerManifestRevision !== this.localManifest().revision)
) {
  await this.touchRemoteChannel();      // idempotent; refreshes both records
  // on failure the rows are not admitted; unacked, they are served again
}
// the inbox awaits queued manifest updates before judging a row

// push rejected for peerManifestRevision by a server rolled back below this feature
await this.stopAgreement(syncOps);      // the rejected items count as unsent
resend(syncOps.filter((op) => this.outbox.items.includes(op)));   // without the field

// refusals: inbox dead letters with errorType UNSUPPORTED_PROTOCOL, sent once on the next poll

// re-probe: every touch asks for agreement first and sets peerServesAgreement on success;
// while it is cleared, the poll touches again every 5 minutes

// touchChannel resolver
//   new remote:      syncManager.add(..., options, id, input.manifest ?? null)
//   existing remote: syncManager.setPeerManifest(id, input.manifest ?? null)
//   both:            return { success, ackOrdinal, manifest: syncManager.localManifest() }
// A re-touch without a manifest is a client that no longer has the feature: silent.

// pollSyncEnvelopes resolver, after the drive and binding checks, before the gate snapshot
holdPollRefusals(syncManager, channelId, refusals);    // each becomes a hold, as a push refusal does
if (manifestRevision == null && remote.meta.peer?.manifest) {
  await syncManager.setPeerManifest(channelId, null);  // silent; narrowing runs before serving
}
```

```ts
interface IChannel {
  /** Read on every touch. */
  setLocalManifest(provider: () => PeerManifest): void;
  /** Fires when the peer's manifest changes; null for a silent peer. */
  onPeerManifest(callback: PeerManifestListener): () => void;
}

/** `undelivered`: items the channel sent that never arrived. The channel awaits the listener. */
type PeerManifestListener = (
  manifest: PeerManifest | null,
  undelivered?: readonly SyncOperation[],
) => void | Promise<void>;

interface ISyncManager {
  add(name, collectionId, channelConfig, filter?, options?, id?, peer?: PeerManifest | null): Promise<Remote>;
  setPeerManifest(id: string, manifest: PeerManifest | null): Promise<void>;
  localManifest(): PeerManifest;
}

type RemoteMeta = {
  // existing fields
  peer: { manifest: PeerManifest | null; receivedAtUtcMs: number } | undefined; // undefined: not yet heard
};
```

`TestChannel` takes the peer's `setLocalManifest` provider through its wiring
helper and exposes `reannounce()` so tests can model an upgrade.

```sql
-- add_sync_remote_peer (numbered at merge)
alter table "sync_remotes" add column "peer_manifest" text null;           -- canonical JSON; null: silent
alter table "sync_remotes" add column "peer_manifest_at_utc_ms" bigint null; -- null with it: not yet heard
```

The peer's manifest is written to the remote record before the first backfill,
so the initial outbox derivation is already gated. A remote whose channel fails
to start (offline) keeps its record and its last manifest.

### Agreement

Agreement is computed from persisted remote records, live or not.

```ts
interface IPeerAgreement {
  local(): PeerManifest;
  /** What `remoteName`'s peer supports, from its manifest or the baselines. */
  peer(remoteName: string): Supports;
  /** The direct peers of the remotes in `collectionIds`, by remote name. */
  members(collectionIds: readonly string[]): Map<string, Supports>;
  /** Why a protocol value is not agreed in a collection: the remotes whose peers lack it. */
  limitedBy(collectionId: string, protocol: string): string[];
}
```

### Selection

```ts
export function selectProtocolVersions(input: {
  capabilities: readonly PeerCapability[];
  flags: ReactorFeatureFlags;
  members: Iterable<Supports>;             // empty: the local preference
  requested?: ProtocolVersions;
}): ProtocolVersions {
  const selected: ProtocolVersions = {};
  for (const capability of input.capabilities) {
    if (capability.kind !== "protocol" || !capability.preferred) continue;
    const preferred = capability.preferred(input.flags);
    let agreed = capability.supported(input.flags).filter((v) => v <= preferred);
    for (const member of input.members) {
      const theirs = member.protocols[capability.name] ?? [];
      agreed = agreed.filter((v) => theirs.includes(v));
    }
    selected[capability.name] =
      agreed.length > 0 ? Math.max(...agreed) : Math.min(...capability.supported(input.flags));
  }
  return { ...selected, ...input.requested };
}
```

```ts
interface IReactorClient {
  /** protocolVersions for a new document under `parentIdentifier`, before the signature policy. */
  getCreateProtocolVersions(parentIdentifier?: string, signal?: AbortSignal): Promise<ProtocolVersions>;
}

// ReactorClient.createEmpty, createDocumentInDrive, DriveClient, reactor-browser createDrive and copy
const base = await client.getCreateProtocolVersions(parentIdentifier);
const document = withSignaturePolicy(module.utils.createDocument(), policy, {
  protocolVersions: { ...base, ...options?.protocolVersions },
});

// collections of a parent: getCollectionsForDocuments([parent]) plus the parent's own
// DriveCollectionId when it is a drive; no parent: no members
```

- Explicit `protocolVersions` from the caller win. An import keeps its header.
- `signature` has no `preferred`; the signature policy alone decides it.
- A document with no parent takes the local preference. The gate holds it
  from any peer that cannot run it.
- `create` never refuses for lack of agreement. The gate holds instead.
- With today's registry every path selects `{ "base-reducer": 2 }`, as now.

### Gate and holds

The gate runs where the outbox is derived, which covers both the pushing
client and the polled server.

```ts
export type HoldReason = { protocol: string; version: number; peerSupports: readonly number[] };

export function holdReason(
  peer: Supports,
  versions: ProtocolVersions,
  capabilities: readonly PeerCapability[],
): HoldReason | undefined {
  for (const capability of capabilities) {
    if (capability.kind !== "protocol") continue;
    const version = versions[capability.name];
    if (version === undefined) continue;                 // absent key: nothing to agree on
    const supported = peer.protocols[capability.name] ?? [];
    if (!supported.includes(version)) {
      return { protocol: capability.name, version, peerSupports: supported };
    }
  }
  return undefined;                                      // keys this reactor does not register pass
}

// deriveOutbox, after RemoteFilter and the quarantine filter
operations = await this.gate.filter(remote, operations);
// per document: versions from a CREATE_DOCUMENT in the page, else documentMetaCache;
// held -> drop the rows, upsert a SyncHold, emit SYNC_HELD once per (remote, document, branch)
```

```sql
-- create_sync_holds (numbered at merge)
create table "sync_holds" (
  "remote_name" text not null references "sync_remotes"("name") on delete cascade,
  "document_id" text not null,
  "branch" text not null,
  "protocol" text not null,
  "version" integer not null,
  "held_at_utc_ms" bigint not null,
  primary key ("remote_name", "document_id", "branch")
);
```

```ts
// SyncManager, when a remote's peer manifest changes
async onPeerManifest(remote: Remote, next: PeerManifest | null): Promise<void> {
  await this.persistPeer(remote, next);
  const support = peerSupports(next, this.capabilities);

  // narrowed: unsent outbox items for now-unsupported documents become holds
  for (const item of remote.channel.outbox.items) {
    const reason = holdReason(support, await this.versionsOf(item.documentId), this.capabilities);
    if (reason) { remote.channel.outbox.remove(item); await this.hold(remote, item, reason); }
  }

  // widened: released documents are backfilled whole
  for (const held of await this.holds.list(remote.meta.name)) {
    if (!holdReason(support, await this.versionsOf(held.documentId), this.capabilities)) {
      await this.holds.remove(held);
      await this.backfillDocument(remote, held.documentId, held.branch);   // SYNC_RELEASED
    }
  }
}

// backfillDocument: operationIndex.get(documentId) within the remote's collection and RemoteFilter,
// excludeSourceRemote = remote.meta.name, sinceTimestampUtcMs not applied; the receiver dedups by action id.
```

### Receipt

Two refusals, both before `reactor.load` and both non-quarantining, for every
sync operation, not only creations.

```ts
// SyncManager inbox, per sync operation, after the remote's queued manifest updates
const versions = createInputIn(batch)?.protocolVersions ?? (await this.versionsOf(documentId));
if (holdReason(local, versions, capabilities))      -> dead letter UNSUPPORTED_PROTOCOL
if (holdReason(peer(remote), versions, capabilities)) -> dead letter PEER_PROTOCOL_UNSUPPORTED

// executor, for every registered protocol key:
//   CREATE_DOCUMENT input, on execute and load
//   every execute, load and reevaluation job into a stored document: its stored protocolVersions,
//   read from the meta cache, or from the write cache's document scope with documentDecisions
// A stored document at a version this reactor does not run is read-only on it.
export class UnsupportedProtocolVersionError extends Error {
  readonly name = "UnsupportedProtocolVersionError";
  constructor(readonly documentId: string, readonly protocol: string, readonly version: number) {
    super(`Document ${documentId} requires ${protocol} ${version}, which this reactor does not support`);
  }
}
// classifyJobFailure("UnsupportedProtocolVersionError") -> "UNSUPPORTED_PROTOCOL"

type SyncOperationErrorType = /* existing */ | "UNSUPPORTED_PROTOCOL" | "PEER_PROTOCOL_UNSUPPORTED";
NON_QUARANTINING_ERROR_TYPES = new Set([
  "AUTH_TIMESTAMP_NOT_MONOTONIC", "UNSUPPORTED_PROTOCOL", "PEER_PROTOCOL_UNSUPPORTED",
]);

// GqlRequestChannel.handleRemoteDeadLetters: an UNSUPPORTED_PROTOCOL dead letter from the
// server becomes a SyncHold for that remote, not a local dead letter.
```

### Startup

A reactor does not start below a version its store holds.

```ts
// migration 023: one entry per document created with protocolVersions
CREATE INDEX idx_operation_created_protocol_versions ON "Operation"
  (md5((action->'input'->'protocolVersions')::text))
  WHERE scope = 'document' AND "index" = 0 AND action->'input'->'protocolVersions' IS NOT NULL;

// ReactorBuilder.buildModule, after migrations, before the executors start (PGlite, Postgres,
// the Connect SharedWorker and REACTOR_WORKERS all build here)
storedProtocolVersions(db)   // recursive CTE: one index probe per distinct value
unsupported = registered keys whose stored version the local set lacks
if (unsupported) {
  "refuse" (default): throw new UnsupportedStoredProtocolError(versions, documents)
  "read-only":        warn; the run check keeps those documents read-only
}
ReactorBuilder.withUnsupportedStoredDocuments(mode: "refuse" | "read-only")

// A pre-feature build: its migrator finds 021_add_sync_remote_peer executed and missing
// ("corrupted migrations"), and buildModule throws "Database migration failed".
```

### Observability

```ts
interface ISyncManager {
  listHolds(filter?: { remoteName?: string; documentId?: string }): Promise<SyncHold[]>;
  agreement(): IPeerAgreement;
}

type SyncHold = {
  remoteName: string;
  documentId: string;
  branch: string;
  reason: HoldReason;
  heldAtUtcMs: number;
};

SyncEventTypes.SYNC_HELD = 20006;       // { remoteName, documentId, branch, reason }
SyncEventTypes.SYNC_RELEASED = 20007;   // { remoteName, documentId, branch }
```

```graphql
# reactor-api, supreme admin or the channel's bound address
type Query {
  syncHolds(remoteName: String, documentId: String): [SyncHold!]!
  peerAgreement(collectionId: String!): PeerAgreement!   # local manifest, members, limitedBy per protocol
}
```

`SyncStatus` is unchanged. Connect's inspector lists each remote's
manifest (or "silent, baseline") and its holds.

## Behaviour

### Old peers

```
client        server        result
new           new           manifests both ways; gate and selection use them
new           old           touch fails validation on `manifest`; retried without; server silent;
                            re-probed on every touch and every 5 minutes
old           new           touch has no manifest and polls name no revision; client silent
old           old           unchanged

rollbacks while connected
server -> old               the next push fails on `peerManifestRevision` (or the next poll on
                            `manifestRevision`); unsent items above the baselines become holds,
                            then the rest is resent without the field
client -> old               its next poll names no revision; the server records it silent and
                            holds what it cannot run before serving that poll
back to new                 the new start sequence changes the revision; the poll mismatch
                            re-touches, both records refresh, and holds are re-checked
```

A silent peer supports exactly the baselines, which is everything existing
documents use, so no existing traffic is held.

### Relays

Each hop gates on its own peer, so a document never reaches a reactor that
cannot run it, however long the chain. A creator sees only its direct peers.

```
Star: A(1,2,3) -> S(1,2,3) <- B(1,2)
  A selects 3 from its direct peer S
  S holds the document for B: SyncHold { protocol: "base-reducer", version: 3, peerSupports: [1, 2] }
  B upgrades: S's next touch from B carries [1,2,3]; S releases and backfills the document to B

Hub behind: A(1,2,3) -> S(1,2)
  A selects 2
```

A document created at a version a downstream peer lacks stays held at the
relay until that peer upgrades. The relay's `syncHolds` shows it.

### Offline and local-first

```
create offline     members from the persisted manifests of the parent's remotes
never-heard peer   remote added but never reached: silent, baselines
reconnect          touch refreshes both manifests before the backfill
peer narrowed      documents created at the wider set are held for that peer, reason recorded
```

### Downgrades and joins

```
peer narrows                 re-touch with the smaller manifest (or none); unsent items become holds;
                             later writes are gated; its writes into those documents are refused
                             (PEER_PROTOCOL_UNSUPPORTED)
peer drops below a version   refuses to start (UnsupportedStoredProtocolError, naming the versions
it stores                    and document count), e.g. undoV3 turned off over base-reducer 3
                             documents; with withUnsupportedStoredDocuments("read-only") it starts and
                             what it stores stays read-only: every job into it and every received row
                             is refused (UnsupportedProtocolVersionError, UNSUPPORTED_PROTOCOL)
refused by a peer that       push: the server's dead letter becomes a hold; poll: the client reports
announced the version        the refusal on its next poll and the server holds; released when the
                             peer's next manifest (a new start sequence) supports it
peer drops below this        refuses to start over a store this build migrated, whatever it stores:
feature                      its migrator finds migrations it does not know. Over a fresh store it is
                             silent to its peers, which gate correctly
restart, either side         the start sequence changes the revision, so the other side re-touches
                             without waiting for a handshake; a delayed older manifest is ignored
new peer joins a collection  initial backfill holds documents it cannot run; new documents created
                             at that reactor take the narrower set
widening                     holds released and backfilled whole
```

Safety does not depend on a handshake completing before data flows: poll
revisions, the push field and the run check keep a stale record from
delivering or admitting a document either side cannot run.

### Trust

Manifests are unsigned in this plan and bound to the authenticated channel
that carries them.

```
claims less      its collections select lower versions; documents are held from it. No corruption.
claims more      it receives documents it cannot run; damage is limited to its own replica, and
                 its rows reach others through the same admission as any peer's.
```

## Stages

One PR per stage. Each is neutral for existing traffic: every registered value
in use is in every baseline.

1. **Registry and admission.** `PeerCapability`, `PEER_CAPABILITIES`
   (`base-reducer` [1, 2], `signature` [2]), `localPeerManifest`,
   `legacySupports`, `withPeerCapabilities`.
   `UnsupportedProtocolVersionError` on CREATE_DOCUMENT execute and load, and
   on every job into a stored document, for registered keys;
   `classifyJobFailure` maps it to `UNSUPPORTED_PROTOCOL`, non-quarantining.
   `UnsupportedStoredProtocolError` at startup, migration 023,
   `withUnsupportedStoredDocuments`.
   Tests: base-reducer 7 refused on execute and on load; startup refused over
   a store above the local set, normal within it, read-only when told; a
   pre-feature migrator refuses the store; writes and loads into a stored
   document refused after the registry narrows, with and without
   `documentDecisions`; unregistered key admitted and logged; the error name
   survives the queue to `JobInfo.error` and the dead letter's `errorType`;
   worker-pool parity for the refusal; manifest revision stable for the same
   flags and start sequence.
2. **Transport.** `sync_remotes.peer_manifest`, `TouchChannelInput` and
   result fields, poll revisions both ways, the push field, poll refusals,
   start sequences, `AGREEMENT_FIELDS` fallback with hold-before-retry and
   re-probe, resolver update on re-touch and on an unversioned poll, `IChannel`
   manifest methods, `RemoteMeta.peer`, `TestChannel` support. Nothing gates.
   Tests: new with new; new client against a server schema without the fields;
   old client (no manifest) against a new server, including re-touch clearing
   an earlier manifest; an unversioned poll silences a client and holds before
   serving; revision change on either side triggers one re-touch, before the
   polled rows reach the inbox; a push to a rolled-back server holds what it
   cannot run and resends the rest; a refusal reported on a poll becomes a
   hold; an older manifest is ignored; a silent server is re-probed; manifest
   persisted and read after a restart with the channel offline.
3. **Gate, holds and receipt.** `holdReason`, the derive-time gate,
   `sync_holds`, narrowing and release in `onPeerManifest`,
   `backfillDocument`, `PEER_PROTOCOL_UNSUPPORTED`, dead-letter-to-hold
   conversion, `listHolds`, `SYNC_HELD`/`SYNC_RELEASED`, `syncHolds`,
   `peerAgreement`.
   Tests, with a test capability `test-protocol` ([1] baseline, local [1, 2]):
   a version 2 document is held from a silent peer and from one announcing
   [1]; released and delivered whole when the peer announces [1, 2], bypassing
   `sinceTimestampUtcMs`; narrowing moves unsent items to holds; receipt
   refusals leave the document unquarantined; the held document keeps syncing
   to other remotes; a hold survives a restart; a relay holds for its older
   peer and releases on upgrade.
4. **Selection.** `selectProtocolVersions`,
   `IReactorClient.getCreateProtocolVersions`, wiring in `ReactorClient`,
   `DriveClient`, reactor-browser drive creation and copy, the RPC proxy.
   Tests: every create path produces the same `protocolVersions` as before
   with the default registry; with `test-protocol` preferred 2, a collection
   with a [1] member selects 1, then 2 after it upgrades; explicit
   `protocolVersions` win; offline selection uses persisted manifests;
   unparented documents take the local preference.
5. **Inspector.** Connect's inspector shows manifests, `limitedBy` and holds
   per remote.
   Tests: component tests over a fixed `IPeerAgreement`.

Stage 1 must precede any consumer's version gate; stages 1 to 4 must ship
before any consumer creates documents at a version outside the baselines.

## Consumers

### Base-reducer 3 (undo v3)

Undo v3 planned an ad hoc `baseReducerVersions` field on `RemoteMeta`, a
`peerSupports` check in `protocolVersionsFor` and an outbox hold. All three
come from this plan instead. Undo v3 contributes one capability change:

```ts
{
  kind: "protocol",
  name: "base-reducer",
  baseline: [1, 2],
  supported: (flags) => (flags.undoV3 ? [1, 2, 3] : [1, 2]),
  preferred: (flags) => (flags.undoV3 ? 3 : 2),
  optional: false,
}
```

```
its sync capability     the base-reducer capability above; selection, gate and receipt are generic
its version-gate stage  depends on stage 1 here; adds undoV3 to the capability's inputs;
                        UnsupportedProtocolVersionError comes from stage 1
its default-on stage    depends on stages 1-4 here; undoV3 on makes the capability announce 3 and
                        prefer 3; selectProtocolVersions picks 3 where every member supports it
its mixed-fleet cases   a peer without 3 is held from base-reducer 3 documents; a peer that
                        announces 3 but refuses one returns UNSUPPORTED_PROTOCOL, a hold at the sender
```

### Anti-entropy resend

The lost-operation resend track exchanges per-stream digests. It is a wire
behaviour, not a document protocol, so it is a feature.

```ts
{ kind: "feature", name: "sync.anti-entropy", baseline: [], supported: () => [1] }

// sender, per remote
if (agreement.peer(remote.meta.name).features["sync.anti-entropy"]?.includes(1)) {
  sendDigests(remote);
}
// otherwise the channel behaves as today; a peer whose manifest drops it stops receiving digests
```

## Test strategy

- **Unit, shared.** `holdReason` and `selectProtocolVersions` over table
  cases, including empty agreement, no members, optional keys, unregistered
  keys and format-2 manifests.
- **Channel compatibility.** reactor-api tests of `touchChannel` and
  `pollSyncEnvelopes` with and without the new fields, and a
  `GqlRequestChannel` against a server built from the previous schema.
- **Mixed fleets, in-process.** Reactors over `TestChannel` with
  `withPeerCapabilities` and a silent mode, covering each row of the Behaviour
  section: old peers, relay hold and release, offline create, narrowing, join,
  widening, receipt refusal.
- **Neutrality.** The whole existing suite unchanged at every stage, plus an
  assertion that every create path's `protocolVersions` equal the pre-feature
  values under the default registry.
- **Worker modes.** Admission refusal under `REACTOR_WORKERS` and in the
  Connect SharedWorker; `getCreateProtocolVersions` over the RPC proxy.

## Decisions

1. **Agreement is pairwise.** A manifest describes a reactor and travels
   between the two reactors a channel connects. Creation reads the direct
   peers of a document's collections and gating reads one peer, both from the
   same per-remote records.
2. **The handshake carries manifests; polls carry revisions.** A separate
   endpoint would need its own auth and binding. Envelope fields on every
   poll would resend the manifest constantly. Revisions on the poll result
   detect a change in either direction, and a re-touch, which the client
   already performs on recovery, refreshes both.
3. **Supported sets only.** The creator's preference is local policy. A peer's
   preference does not affect correctness, and letting peers vote on it would
   let any peer steer creation for a collection.
4. **Baselines equal the last release without the feature.** A silent peer is
   treated as doing what it does today, so the feature changes nothing for
   existing traffic and needs no flag.
5. **Gate at outbox derivation with a hold table.** Holding items inside a
   mailbox would collide with ack trimming by ordinal and with the outbox
   bound. Skipping rows as quarantine does, and recording the hold, makes
   release an explicit per-document backfill.
6. **Holds are not dead letters.** A dead letter means a failure and
   quarantines the document; mirrored quarantine would stop the document for
   every peer. A hold is expected and releases itself.
7. **Only keys the sender registers are gated.** A reactor cannot judge a key
   it does not know. Newer reactors register newer keys, so a newer sender
   gates correctly towards an older peer.
8. **Selection is advisory.** Headers are built before `create`, and the id
   is derived from them. Imports, copies and explicit requests keep their
   versions; the gate keeps the fleet safe.
9. **`signature` is gated, not negotiated.** The signature policy is a
   security choice and must not be lowered by what peers announce.
10. **No relayed agreement.** Each hop's gate is enough for safety: no
    reactor receives a document it cannot run, however long the chain.
    Relaying what peers behind a relay support would only let a creator avoid
    versions they lack, at the cost of relayed state, staleness on cycles and
    a hop bound. A document created at a version a downstream peer lacks is
    held at the relay, visibly, until that peer upgrades.
11. **Refusals on receipt do not quarantine and become holds at the sender.**
    Quarantine is global to the document; a protocol refusal concerns one
    peer.
12. **Refuse writes from a peer that does not support the document.** Only a
    downgraded peer sends them, and they are written by a reactor that runs
    the document under other rules.
13. **Release ignores `sinceTimestampUtcMs`.** The peer never received the
    held document from this remote.
14. **Unsigned manifests.** A lying peer can lower agreement or harm its own
    replica, and any peer with write access can already write rows. The
    manifest is bound to the authenticated channel that carries it. Signing
    is added when a capability's safety depends on it.
15. **No reactor id.** With pairwise agreement a manifest is keyed by the
    remote that carries it, so nothing needs a replica identity.
16. **Document models are not a capability.** Connect loads models on demand,
    so a registered set understates what a peer can run. We revisit this if a
    peer lacking a model causes real problems.
17. **Unregistered keys are admitted and logged.** Apps or stored documents
    may carry custom `protocolVersions` keys, and refusing them would stop
    those documents syncing.
18. **A document with no parent takes the local preference.** It has no
    collection to agree with, and the gate holds it from any peer that cannot
    run it once it joins one.
19. **A reactor does not start below a version it stores.** A build with the
    feature but a narrower set refuses at startup, naming the versions and
    document count. The run check alone would make those documents read-only
    without anyone choosing it; an operator who accepts that passes
    `withUnsupportedStoredDocuments("read-only")`. The check is one index
    probe per distinct creation set, not a pass over documents. A pre-feature
    build cannot run new code, so enforcement comes from its migrator, which
    refuses a store with migrations it does not know. That refuses the
    rollback even with nothing above the baselines stored, which the rule
    allows; every schema migration already does the same to a rollback, so
    we accept it. A host that runs migrations itself (`"manual"`, `"none"`)
    must stop on their error; that stays an operator rule.
20. **The run check covers every job and every received row.** Refusing only
    creations let a reactor whose registry narrowed keep writing into a
    stored document it reads as an older version; the model found misread
    rows in three steps, and admitted in five while the sender's record
    covered the local set. The stored document becomes read-only on that
    reactor.
21. **Polls name the client's revision; an unversioned poll silences.** A
    server back from a legacy build trusted its persisted record of a client
    that rolled back meanwhile and served it documents it cannot run (eight
    steps). The server records such a client silent and holds before serving.
22. **The client refreshes a stale record before admitting polled rows.**
    Comparing revisions after `inbox.add` judged the rows against the old
    record (five steps).
23. **Pushes name the server revision they were gated under, and hold before
    resending.** A pre-feature server accepted a v3 push, because nothing in
    it failed validation (four steps). Resending the same envelopes after the
    rejection keeps the leak, so the rejected items are held first.
24. **A client reports its refusals of polled rows.** Only a push refusal
    reached the sender, so a poll refusal was counted as delivered and the
    document never resent (ten steps). Reported refusals become holds, as
    decision 11 intends.
25. **Manifests carry a start sequence, and older ones are ignored.** A
    content hash does not change after a narrow and a re-widen, so nothing
    re-touched and a hold stayed stuck (five steps), and a delayed manifest
    could overwrite a newer record. The sequence is the sync manager's start
    time: a restart always moves it forward, only one reactor's own sequences
    are compared, and a clock that steps back across a restart costs only
    liveness, because the run check still refuses. A persisted counter would
    need a migration for no safety gain. Silence carries no sequence, so a
    manifest after silence always applies.
26. **Agreement is re-probed.** A client that saw a pre-feature server kept
    it silent for the channel's lifetime and never learned of its upgrade.
    Every touch asks again, and a silent channel touches every 5 minutes.
27. **No handshake-first assumption.** With poll revisions and the push field
    the model keeps safety when data flows before a restarted peer's
    manifests are exchanged.

## Open

- **Legitimate rows refused as `PEER_PROTOCOL_UNSUPPORTED`.** After a peer
  narrows, rows it wrote while it still ran the version are refused with
  the rows it writes afterwards; nothing resends them once it widens again.
  The model's `noLostRows` fails with every fix in place.

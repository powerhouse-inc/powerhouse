# Plan: Peer protocol agreement

Date: 2026-09-25
Status: proposal, questions resolved, not started

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

From a high level, we propose a `PeerCapability` registry with `base-reducer`
and `signature` registered, a versioned `PeerManifest` per reactor exchanged
through `touchChannel`, revision-checked on `pollSyncEnvelopes` and stored on
`sync_remotes`, `selectProtocolVersions`
behind `IReactorClient.getCreateProtocolVersions`, an outbox gate that records
`SyncHold` rows and releases them when a peer's manifest widens, and
`UnsupportedProtocolVersionError` with a non-quarantining
`UNSUPPORTED_PROTOCOL` refusal on receipt.

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
  revision: string;           // base64url(sha256(canonicalJson(Supports)))
};

export function localPeerManifest(
  capabilities: readonly PeerCapability[],
  flags: ReactorFeatureFlags,
  appKey?: string,
): PeerManifest;
```

```json
{
  "format": 1,
  "appKey": "did:key:zDn…",
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
channel connects and no further. Poll results carry revisions, so either
side's change reaches the other within one poll interval. The client drives
both directions by touching again.

```graphql
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
const AGREEMENT_FIELDS = ["manifest", "manifestRevision", "peerManifestRevision"] as const;
private peerServesAgreement = true;
// touch and poll name AGREEMENT_FIELDS while peerServesAgreement. A validation error that
// names one clears it, retries without, and reports the server as silent (null).

// after every successful poll
if (
  this.peerServesAgreement &&
  (result.manifestRevision !== this.peerManifest?.revision ||
    result.peerManifestRevision !== this.localManifest().revision)
) {
  void this.touchRemoteChannel();       // idempotent; refreshes both manifests
}

// touchChannel resolver
//   new remote:      syncManager.add(..., options, id, input.manifest ?? null)
//   existing remote: syncManager.setPeerManifest(id, input.manifest ?? null)
//   both:            return { success, ackOrdinal, manifest: syncManager.localManifest() }
// A re-touch without a manifest is a client that no longer has the feature: silent.
```

```ts
interface IChannel {
  /** Read on every touch. */
  setLocalManifest(provider: () => PeerManifest): void;
  /** Fires when the peer's manifest changes; null for a silent peer. */
  onPeerManifest(callback: (manifest: PeerManifest | null) => void): () => void;
}

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

Two refusals, both before `reactor.load` and both non-quarantining.

```ts
// SyncManager inbox, per document in a batch
const versions = createInputIn(batch)?.protocolVersions ?? (await this.versionsOf(documentId));
if (holdReason(local, versions, capabilities))      -> dead letter UNSUPPORTED_PROTOCOL
if (holdReason(peer(remote), versions, capabilities)) -> dead letter PEER_PROTOCOL_UNSUPPORTED

// executor, CREATE_DOCUMENT on execute and load, for every registered protocol key
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
new           old           touch fails validation on `manifest`; retried without; server silent
old           new           touch has no manifest; client silent
old           old           unchanged
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
peer drops below a version   what it already stores stays there; it refuses to run it
it stores                    (UnsupportedProtocolVersionError) from the release that registers the version
peer drops below this        not supported once it stores documents above the baselines: it is silent
feature                      to its peers, which gate correctly, but it runs its stored documents under
                             its old rules
new peer joins a collection  initial backfill holds documents it cannot run; new documents created
                             at that reactor take the narrower set
widening                     holds released and backfilled whole
```

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
   `UnsupportedProtocolVersionError` on CREATE_DOCUMENT execute and load for
   registered keys; `classifyJobFailure` maps it to `UNSUPPORTED_PROTOCOL`,
   non-quarantining.
   Tests: base-reducer 7 refused on execute and on load; unregistered key
   admitted and logged; the error name survives the queue to `JobInfo.error`
   and the dead letter's `errorType`; worker-pool parity for the refusal;
   manifest revision stable across restarts with the same flags.
2. **Transport.** `sync_remotes.peer_manifest`, `TouchChannelInput` and
   result fields, poll revisions, `AGREEMENT_FIELDS` fallback, resolver update
   on re-touch, `IChannel` manifest methods, `RemoteMeta.peer`, `TestChannel`
   support. Nothing gates.
   Tests: new with new; new client against a server schema without the fields;
   old client (no manifest) against a new server, including re-touch clearing
   an earlier manifest; revision change on either side triggers one re-touch;
   manifest persisted and read after a restart with the channel offline.
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
19. **Downgrading below this feature is unsupported once newer versions are
    in use.** Such a peer is silent, so its peers gate correctly towards it,
    but it runs the documents it already stores under its old rules. We
    document this rather than enforce a minimum build.

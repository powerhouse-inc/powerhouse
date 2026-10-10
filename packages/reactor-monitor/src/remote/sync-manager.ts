import {
  DriveCollectionId,
  type ChannelConfig,
  type ConnectionStateChangeCallback,
  type ConnectionStateSnapshot,
  type DeadLetterPage,
  type IChannel,
  type InspectableSyncManager,
  type IPeerAgreement,
  type Remote,
  type RemoteMeta,
  type RemoteSyncInspection,
  type ShutdownStatus,
  type SyncHold,
  type SyncStatus,
  type WireChannelConfig,
  type WireRemoteMeta,
} from "@powerhousedao/reactor";
import {
  DEFAULT_CONNECTION_SNAPSHOT,
  NOOP_MAILBOX,
} from "@powerhousedao/reactor-browser/rpc";
import type { PeerManifest } from "@powerhousedao/shared/document-model";
import type {
  RemoteInspectionRemote,
  RemoteInspectorClient,
} from "./client.js";

/**
 * The inert mailbox and the pre-connection snapshot are `SyncManagerProxy`'s
 * own (`@powerhousedao/reactor-browser/rpc`), not copies of them.
 *
 * Both exist for a reason that is not specific to either transport:
 * `Remote.channel` is part of the `ISyncManager` contract, and a transport that
 * cannot carry a live channel still has to produce one. The live sync
 * operations of a remote reactor's channel never leave that process, and what a
 * holder can see of them -- the depths -- is a first-class field of
 * `RemoteSyncInspection` instead, so the mailbox reports empty rather than
 * guessing.
 */

const DEFAULT_FILTER: RemoteMeta["filter"] = {
  documentId: [],
  scope: [],
  branch: "main",
};

const UNKNOWN_CHANNEL: ChannelConfig = { type: "unknown", parameters: {} };

/**
 * Rebuilds a `ChannelConfig` from the wire.
 *
 * Both halves are guarded, not just the config's presence: `parameters` is
 * dereferenced downstream (`makeChannel` reads `parameters.url`), and a server
 * that served a remote's configuration through a JSON scalar can deliver a
 * config with a type and no parameters -- or either half of the wrong
 * shape -- without anything in between noticing. The whole point of
 * {@link WireRemoteMeta} being optional-everywhere is that this is untrusted
 * wire data; a `TypeError` here would take the entire remotes list down with
 * it.
 */
function rehydrateChannelConfig(
  config: WireChannelConfig | undefined,
): ChannelConfig {
  // Read through an unknown-valued view of the record. The wire type states
  // what the contract SAYS arrives; this function exists because a server can
  // send something else, so neither field is taken on its declared type.
  const wire: { type?: unknown; parameters?: unknown } = config ?? {};
  return {
    type: typeof wire.type === "string" ? wire.type : UNKNOWN_CHANNEL.type,
    parameters:
      typeof wire.parameters === "object" && wire.parameters !== null
        ? (wire.parameters as Record<string, unknown>)
        : {},
  };
}

/**
 * Rebuilds a `RemoteMeta` from what the wire delivered (see
 * {@link WireRemoteMeta}): `DriveCollectionId` gets its prototype back, and a
 * remote the server could only identify is filled in rather than handed to a
 * UI with holes in it.
 */
function rehydrateMeta(meta: WireRemoteMeta, fallbackName: string): RemoteMeta {
  return {
    id: meta.id,
    name: meta.name ?? fallbackName,
    collectionId: DriveCollectionId.forDrive(
      meta.collectionId?.driveId ?? "",
      meta.collectionId?.branch ?? "main",
    ),
    channelConfig: rehydrateChannelConfig(meta.channelConfig),
    filter: meta.filter ?? DEFAULT_FILTER,
    options: meta.options ?? {},
    ...(meta.peer === undefined ? {} : { peer: meta.peer }),
  };
}

function notServed(what: string, endpoint: string): Error {
  return new Error(
    `${what} is not served over the remote inspection surface at ${endpoint}: it changes which peers the remote reactor syncs with, which is that reactor's own configuration (multi-reactor W3.2 is inspection-only)`,
  );
}

/**
 * The sync manager of a REMOTE reactor, as far as a monitor can see it.
 *
 * `InspectableSyncManager` in full, so every monitor tab reads a remote
 * reactor through the same handle field it reads a worker or in-process one
 * through -- but the two halves of that interface are served very differently,
 * and deliberately:
 *
 * - the INSPECTION half (`ISyncInspector`, plus `list`/`getByName`/`listHolds`)
 *   is real, answered by the remote reactor's own sync manager over the
 *   inspection subgraph.
 * - the ORCHESTRATION half that would reconfigure the far side -- `add`,
 *   `remove`, `bindRemote`, `setPeerManifest`, `agreement` -- refuses by name.
 *   Which peers a Switchboard syncs with is that deployment's configuration,
 *   not something a monitor attaching for observation should be able to
 *   rewrite; the inspection subgraph therefore does not serve it, and these
 *   methods say so rather than failing obscurely at the wire.
 *
 * `list()` is synchronous by contract, so it answers from a cache that
 * `startup()` seeds and every `inspectRemotes()` refreshes -- the same
 * cache-backed-reads shape `SyncManagerProxy` uses across the worker boundary.
 */
export class RemoteSyncManagerClient implements InspectableSyncManager {
  private readonly client: RemoteInspectorClient;
  private remotes: Remote[] = [];
  private readonly connectionStates = new Map<
    string,
    ConnectionStateSnapshot
  >();

  constructor(client: RemoteInspectorClient) {
    this.client = client;
  }

  async startup(): Promise<void> {
    await this.refresh();
  }

  shutdown(): ShutdownStatus {
    // Nothing of the remote reactor's is ours to stop; this handle just stops
    // asking.
    return { isShutdown: true, completed: Promise.resolve() };
  }

  list(): Remote[] {
    return [...this.remotes];
  }

  getByName(name: string): Remote {
    const remote = this.remotes.find((it) => it.meta.name === name);
    if (!remote) {
      throw new Error(`Unknown remote: ${name}`);
    }
    return remote;
  }

  getById(id: string): Remote {
    const remote = this.remotes.find((it) => it.meta.id === id);
    if (!remote) {
      throw new Error(`Unknown remote id: ${id}`);
    }
    return remote;
  }

  add(): Promise<Remote> {
    return Promise.reject(notServed("Adding a remote", this.client.endpoint));
  }

  remove(): Promise<void> {
    return Promise.reject(notServed("Removing a remote", this.client.endpoint));
  }

  bindRemote(): Promise<void> {
    return Promise.reject(notServed("Binding a remote", this.client.endpoint));
  }

  setPeerManifest(): Promise<void> {
    return Promise.reject(
      notServed("Setting a peer manifest", this.client.endpoint),
    );
  }

  localManifest(): PeerManifest {
    throw notServed("The local peer manifest", this.client.endpoint);
  }

  agreement(): IPeerAgreement {
    throw notServed("Peer agreement", this.client.endpoint);
  }

  waitForSync(): Promise<never> {
    return Promise.reject(
      notServed("Waiting for a job's sync", this.client.endpoint),
    );
  }

  getSyncStatus(): SyncStatus | undefined {
    // Per-document sync status is a push signal on the remote reactor's event
    // bus, which this surface does not forward.
    return undefined;
  }

  onSyncStatusChange(): () => void {
    return () => {};
  }

  listHolds(filter?: {
    remoteName?: string;
    documentId?: string;
  }): Promise<SyncHold[]> {
    return this.client.listHolds(filter);
  }

  triggerPull(name: string): void {
    this.client.triggerPull(name).catch((error: unknown) => {
      console.error(
        `[reactor-monitor] triggerPull failed for remote "${name}":`,
        error,
      );
    });
  }

  inspectRemote(remoteName: string): Promise<RemoteSyncInspection> {
    return this.client.inspectRemote(remoteName);
  }

  async inspectRemotes(): Promise<RemoteSyncInspection[]> {
    // One request answers both halves: the inspection the caller asked for and
    // the remote list `list()` serves synchronously.
    const inspected = await this.refresh();
    return inspected.map(({ meta: _meta, ...inspection }) => inspection);
  }

  listDeadLetters(
    remoteName: string,
    cursor?: string,
    limit?: number,
  ): Promise<DeadLetterPage> {
    return this.client.listDeadLetters(remoteName, cursor, limit);
  }

  rewindInboxCursor(remoteName: string, toOrdinal: number): Promise<void> {
    return this.client.rewindInboxCursor(remoteName, toOrdinal);
  }

  resetChannel(remoteName: string): Promise<void> {
    return this.client.resetChannel(remoteName);
  }

  requeueDeadLetter(remoteName: string, id: string): Promise<void> {
    return this.client.requeueDeadLetter(remoteName, id);
  }

  clearDeadLetter(remoteName: string, id: string): Promise<void> {
    return this.client.clearDeadLetter(remoteName, id);
  }

  private async refresh(): Promise<RemoteInspectionRemote[]> {
    const inspected = await this.client.inspectRemotesWithMeta();
    const names = new Set<string>();
    this.remotes = inspected.map((entry) => {
      const meta = rehydrateMeta(entry.meta, entry.remoteName);
      names.add(meta.name);
      this.connectionStates.set(meta.name, entry.connection.snapshot);
      return { meta, channel: this.makeChannel(meta.name, meta.channelConfig) };
    });
    for (const name of [...this.connectionStates.keys()]) {
      if (!names.has(name)) {
        this.connectionStates.delete(name);
      }
    }
    return inspected;
  }

  /**
   * A channel shaped like the contract but carrying none of the live state: the
   * connection snapshot is the one the last inspection reported, the mailboxes
   * are empty, and every lifecycle call is inert. The real state is in
   * `inspectRemote(s)`, which is what every monitor view reads.
   */
  private makeChannel(remoteName: string, config: ChannelConfig): IChannel {
    // Safe to dereference: `rehydrateMeta` guarantees `parameters` is an
    // object, whatever the wire delivered.
    const url = config.parameters.url;
    const channel: IChannel & { config: { url?: string } } = {
      inbox: NOOP_MAILBOX,
      outbox: NOOP_MAILBOX,
      deadLetter: NOOP_MAILBOX,
      init: () => Promise.resolve(),
      shutdown: () => Promise.resolve(),
      getConnectionState: () =>
        this.connectionStates.get(remoteName) ?? DEFAULT_CONNECTION_SNAPSHOT,
      onConnectionStateChange:
        (_callback: ConnectionStateChangeCallback) =>
        // Nothing pushes from the far side: the monitor polls.
        () => {},
      triggerPull: () => this.triggerPull(remoteName),
      notePoll: () => {},
      lastHolderPollUtcMs: () => undefined,
      setLocalManifest: () => {},
      onPeerManifest: () => () => {},
      config: { ...(typeof url === "string" ? { url } : {}) },
    };
    return channel;
  }
}

import {
  DriveCollectionId,
  type ChannelConfig,
  type ConnectionStateChangeCallback,
  type ConnectionStateSnapshot,
  type DeadLetterPage,
  type IChannel,
  type IMailbox,
  type InspectableSyncManager,
  type IPeerAgreement,
  type Remote,
  type RemoteMeta,
  type RemoteSyncInspection,
  type ShutdownStatus,
  type SyncHold,
  type SyncOperation,
  type SyncStatus,
} from "@powerhousedao/reactor";
import type { PeerManifest } from "@powerhousedao/shared/document-model";
import type {
  RemoteInspectionRemote,
  RemoteInspectorClient,
  WireRemoteMeta,
} from "./client.js";

/**
 * A mailbox that carries nothing. The live sync operations of a remote
 * reactor's channel never leave that process; what a holder can see of them --
 * the depths -- is a first-class field of `RemoteSyncInspection` instead, so
 * this stub reports empty rather than guessing.
 *
 * The same shape `SyncManagerProxy` uses for a worker reactor, and for the
 * same reason: `Remote.channel` is part of the `ISyncManager` contract, and a
 * transport that cannot carry a live channel still has to produce one.
 */
class EmptyMailbox implements IMailbox {
  get items(): readonly SyncOperation[] {
    return [];
  }
  get ackOrdinal(): number {
    return 0;
  }
  get latestOrdinal(): number {
    return 0;
  }
  init(): void {}
  advanceOrdinal(): void {}
  get(): undefined {
    return undefined;
  }
  add(): void {}
  remove(): void {}
  onAdded(): void {}
  onRemoved(): void {}
  pause(): void {}
  resume(): void {}
  flush(): void {}
  isPaused(): boolean {
    return false;
  }
}

const EMPTY_MAILBOX = new EmptyMailbox();

const DEFAULT_SNAPSHOT: ConnectionStateSnapshot = {
  state: "connecting",
  failureCount: 0,
  lastSuccessUtcMs: 0,
  lastFailureUtcMs: 0,
  pushBlocked: false,
  pushFailureCount: 0,
  receivingPages: false,
  requiresAuth: false,
};

const DEFAULT_FILTER: RemoteMeta["filter"] = {
  documentId: [],
  scope: [],
  branch: "main",
};

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
    channelConfig: meta.channelConfig ?? { type: "unknown", parameters: {} },
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
    const url = config.parameters.url;
    const channel: IChannel & { config: { url?: string } } = {
      inbox: EMPTY_MAILBOX,
      outbox: EMPTY_MAILBOX,
      deadLetter: EMPTY_MAILBOX,
      init: () => Promise.resolve(),
      shutdown: () => Promise.resolve(),
      getConnectionState: () =>
        this.connectionStates.get(remoteName) ?? DEFAULT_SNAPSHOT,
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

import type { PeerManifest } from "@powerhousedao/shared/document-model";
import {
  createPeerAgreement,
  DriveCollectionId,
  SyncEventTypes,
  type ChannelConfig,
  type ConnectionStateChangeCallback,
  type ConnectionStateChangedEvent,
  type ConnectionStateSnapshot,
  type DeadLetterPage,
  type IChannel,
  type IEventBus,
  type IMailbox,
  type IPeerAgreement,
  type ISyncInspector,
  type PeerAgreementBasis,
  type ISyncManager,
  type Remote,
  type RemoteFilter,
  type RemoteMeta,
  type RemoteOptions,
  type RemotePeer,
  type RemoteSyncInspection,
  type ShutdownStatus,
  type SyncHold,
  type SyncOperation,
  type SyncStatus,
  type SyncStatusChangeCallback,
} from "@powerhousedao/reactor";
import {
  KeyedListeners,
  Listeners,
  type MessageRouter,
} from "@powerhousedao/reactor/rpc";
import { opChannel, type IOpChannel } from "./op-channel.js";
import { SYNC_OPS } from "./sync-ops.js";

// Synthetic bus channel id for sync-status deltas (not a reactor IEventBus type).
export const SYNC_STATUS_CHANGED_EVENT = 90001;

export type SyncStatusChangedBusEvent = {
  documentId: string;
  status: SyncStatus;
};

const SEED_MAX_ATTEMPTS = 3;
const SEED_RETRY_DELAY_MS = 500;

// Wire shapes: DriveCollectionId arrives prototype-less over postMessage.
type WireDriveCollectionId = { driveId: string; branch: string };
type WireRemoteMeta = {
  id: string;
  name: string;
  collectionId: WireDriveCollectionId;
  channelConfig: ChannelConfig;
  filter: RemoteFilter;
  options: RemoteOptions;
  peer?: RemotePeer;
};
type WireRemote = {
  meta: WireRemoteMeta;
  connectionState: ConnectionStateSnapshot;
};

/**
 * What a channel's connection state reads as before anything has been heard
 * about it: connecting, never succeeded, never failed.
 *
 * Exported because it is not specific to this transport. Any proxy of a remote
 * reactor's sync manager owes `IChannel.getConnectionState()` an answer before
 * its first inspection lands, and two of them inventing the same record
 * separately is how the two drift (multi-reactor W3.2: reactor-monitor's
 * remote sync client reads it from here).
 */
export const DEFAULT_CONNECTION_SNAPSHOT: ConnectionStateSnapshot = {
  state: "connecting",
  failureCount: 0,
  lastSuccessUtcMs: 0,
  lastFailureUtcMs: 0,
  pushBlocked: false,
  pushFailureCount: 0,
  receivingPages: false,
  requiresAuth: false,
};

// Inert mailbox: a proxy remote carries no live sync operations tab-side.
class NoopMailbox implements IMailbox {
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

/**
 * The one inert mailbox every proxied remote's channel shares.
 *
 * Exported for the same reason as {@link DEFAULT_CONNECTION_SNAPSHOT}:
 * `Remote.channel` is part of the `ISyncManager` contract, a transport that
 * cannot carry live sync operations still has to produce a channel, and what a
 * holder can actually see of those operations is the mailbox DEPTHS on
 * `RemoteSyncInspection`. Stateless, so one instance serves every remote.
 */
export const NOOP_MAILBOX = new NoopMailbox();

function rehydrateMeta(wire: WireRemoteMeta): RemoteMeta {
  return {
    id: wire.id,
    name: wire.name,
    collectionId: DriveCollectionId.forDrive(
      wire.collectionId.driveId,
      wire.collectionId.branch,
    ),
    channelConfig: wire.channelConfig,
    filter: wire.filter,
    options: wire.options,
    peer: wire.peer,
  };
}

function channelUrl(meta: RemoteMeta): string | undefined {
  const url = meta.channelConfig.parameters.url;
  return typeof url === "string" ? url : undefined;
}

// Tab-side ISyncManager: cache-backed reads fed by the bus, ops over sync-op RPC.
export class SyncManagerProxy implements ISyncManager, ISyncInspector {
  private readonly ops: IOpChannel;
  private readonly connectionStates = new Map<
    string,
    ConnectionStateSnapshot
  >();
  private readonly connectionListeners = new KeyedListeners<string>();
  private readonly syncStatuses = new Map<string, SyncStatus>();
  private readonly syncStatusListeners = new Listeners<[string, SyncStatus]>();
  private remotes: Remote[] = [];
  private basis: PeerAgreementBasis | undefined;
  private seedPromise: Promise<void> | null = null;

  constructor(router: MessageRouter, busProxy: IEventBus) {
    this.ops = opChannel(router, "sync-op");

    busProxy.subscribe(
      SyncEventTypes.CONNECTION_STATE_CHANGED,
      (_type, event) => {
        const e = event as ConnectionStateChangedEvent;
        this.connectionStates.set(e.remoteName, e.snapshot);
        this.notifyConnection(e.remoteName);
      },
    );

    busProxy.subscribe(SYNC_STATUS_CHANGED_EVENT, (_type, event) => {
      const e = event as SyncStatusChangedBusEvent;
      this.syncStatuses.set(e.documentId, e.status);
      this.syncStatusListeners.emit(e.documentId, e.status);
    });

    void this.ensureSeeded();
  }

  async startup(): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < SEED_MAX_ATTEMPTS; attempt++) {
      try {
        await this.ensureSeeded();
        return;
      } catch (error) {
        lastError = error;
        if (attempt < SEED_MAX_ATTEMPTS - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, SEED_RETRY_DELAY_MS),
          );
        }
      }
    }
    throw lastError;
  }

  shutdown(): ShutdownStatus {
    return { isShutdown: true, completed: Promise.resolve() };
  }

  getByName(name: string): Remote {
    const remote = this.remotes.find((r) => r.meta.name === name);
    if (!remote) {
      throw new Error(`Unknown remote: ${name}`);
    }
    return remote;
  }

  getById(id: string): Remote {
    const remote = this.remotes.find((r) => r.meta.id === id);
    if (!remote) {
      throw new Error(`Unknown remote id: ${id}`);
    }
    return remote;
  }

  async add(
    name: string,
    collectionId: DriveCollectionId,
    channelConfig: ChannelConfig,
    filter?: RemoteFilter,
    options?: RemoteOptions,
  ): Promise<Remote> {
    await this.callSyncOp("add", [
      name,
      collectionId.key,
      channelConfig,
      filter,
      options,
    ]);
    await this.refreshRemotes();
    return this.getByName(name);
  }

  async setPeerManifest(
    id: string,
    manifest: PeerManifest | null,
  ): Promise<void> {
    await this.callSyncOp("setPeerManifest", [id, manifest]);
    await this.refreshRemotes();
  }

  /** Fetched once; the worker's flags do not change at runtime. */
  localManifest(): PeerManifest {
    return this.agreementBasis().local;
  }

  async listHolds(filter?: {
    remoteName?: string;
    documentId?: string;
  }): Promise<SyncHold[]> {
    return (await this.callSyncOp("listHolds", [filter])) as SyncHold[];
  }

  agreement(): IPeerAgreement {
    return createPeerAgreement(
      this.agreementBasis(),
      this.remotes.map((remote) => remote.meta),
    );
  }

  private agreementBasis(): PeerAgreementBasis {
    if (!this.basis) {
      throw new Error(
        "Peer agreement has not been fetched from the worker yet",
      );
    }
    return this.basis;
  }

  async bindRemote(id: string, boundAddress: string): Promise<void> {
    await this.callSyncOp("bindRemote", [id, boundAddress]);
    await this.refreshRemotes();
  }

  triggerPull(name: string): void {
    this.callSyncOp("triggerPull", [name]).catch((error: unknown) => {
      console.error(`triggerPull failed for remote "${name}":`, error);
    });
  }

  async remove(name: string): Promise<void> {
    await this.callSyncOp("remove", [name]);
    await this.refreshRemotes();
  }

  list(): Remote[] {
    return [...this.remotes];
  }

  waitForSync(): Promise<never> {
    return Promise.reject(
      new Error("waitForSync is not supported over the worker RPC boundary"),
    );
  }

  getSyncStatus(documentId: string): SyncStatus | undefined {
    return this.syncStatuses.get(documentId);
  }

  onSyncStatusChange(callback: SyncStatusChangeCallback): () => void {
    return this.syncStatusListeners.add(callback);
  }

  /**
   * Real cursors, mailbox depths and connection health for one remote, read
   * from the worker's live sync manager. This is the state the tab-side
   * `NoopMailbox` used to zero out: the stub channels still carry no live sync
   * operations, so the inspection surface crosses the boundary over RPC instead.
   */
  inspectRemote(remoteName: string): Promise<RemoteSyncInspection> {
    return this.callSyncOp(SYNC_OPS.inspectRemote, [
      remoteName,
    ]) as Promise<RemoteSyncInspection>;
  }

  inspectRemotes(): Promise<RemoteSyncInspection[]> {
    return this.callSyncOp(SYNC_OPS.inspectRemotes, []) as Promise<
      RemoteSyncInspection[]
    >;
  }

  listDeadLetters(
    remoteName: string,
    cursor?: string,
    limit?: number,
  ): Promise<DeadLetterPage> {
    return this.callSyncOp(SYNC_OPS.listDeadLetters, [
      remoteName,
      cursor,
      limit,
    ]) as Promise<DeadLetterPage>;
  }

  async rewindInboxCursor(
    remoteName: string,
    toOrdinal: number,
  ): Promise<void> {
    await this.callSyncOp(SYNC_OPS.rewindInboxCursor, [remoteName, toOrdinal]);
  }

  async resetChannel(remoteName: string): Promise<void> {
    await this.callSyncOp(SYNC_OPS.resetChannel, [remoteName]);
    await this.refreshRemotes();
  }

  async requeueDeadLetter(remoteName: string, id: string): Promise<void> {
    await this.callSyncOp(SYNC_OPS.requeueDeadLetter, [remoteName, id]);
  }

  async clearDeadLetter(remoteName: string, id: string): Promise<void> {
    await this.callSyncOp(SYNC_OPS.clearDeadLetter, [remoteName, id]);
  }

  private callSyncOp(method: string, args: unknown[]): Promise<unknown> {
    return this.ops.call(method, args);
  }

  private notifyConnection(remoteName?: string): void {
    if (remoteName !== undefined) {
      this.connectionListeners.emit(remoteName);
      return;
    }
    this.connectionListeners.emitAll();
  }

  private makeChannel(remoteName: string, url: string | undefined): IChannel {
    const channel: IChannel & { config: { url?: string } } = {
      inbox: NOOP_MAILBOX,
      outbox: NOOP_MAILBOX,
      deadLetter: NOOP_MAILBOX,
      init: () => Promise.resolve(),
      shutdown: () => Promise.resolve(),
      getConnectionState: () =>
        this.connectionStates.get(remoteName) ?? DEFAULT_CONNECTION_SNAPSHOT,
      onConnectionStateChange: (callback: ConnectionStateChangeCallback) => {
        const listener = () =>
          callback(
            this.connectionStates.get(remoteName) ??
              DEFAULT_CONNECTION_SNAPSHOT,
          );
        return this.connectionListeners.add(remoteName, listener);
      },

      triggerPull: () => {
        this.callSyncOp("triggerPull", [remoteName]).catch((error: unknown) => {
          console.error(
            `triggerPull failed for remote "${remoteName}":`,
            error,
          );
        });
      },
      notePoll: () => {},
      lastHolderPollUtcMs: () => undefined,
      setLocalManifest: () => {},
      onPeerManifest: () => () => {},
      config: { url },
    };
    return channel;
  }

  private async refreshRemotes(): Promise<void> {
    const wire = (await this.callSyncOp("list", [])) as WireRemote[];
    const names = new Set<string>();
    this.remotes = wire.map((w) => {
      const meta = rehydrateMeta(w.meta);
      names.add(meta.name);
      if (!this.connectionStates.has(meta.name)) {
        this.connectionStates.set(meta.name, w.connectionState);
      }
      return { meta, channel: this.makeChannel(meta.name, channelUrl(meta)) };
    });
    for (const name of [...this.connectionStates.keys()]) {
      if (!names.has(name)) {
        this.connectionStates.delete(name);
      }
    }
    this.notifyConnection();
  }

  // Shared in-flight seed so the eager kick-off and startup() share one list RPC.
  private ensureSeeded(): Promise<void> {
    if (!this.basis) {
      this.callSyncOp("peerAgreementBasis", [])
        .then((basis) => {
          this.basis = basis as PeerAgreementBasis;
        })
        .catch(() => {});
    }
    if (!this.seedPromise) {
      const pending = this.refreshRemotes();
      this.seedPromise = pending;

      pending.catch(() => {
        if (this.seedPromise === pending) {
          this.seedPromise = null;
        }
      });
    }
    return this.seedPromise;
  }
}

export function createSyncManagerProxy(
  router: MessageRouter,
  busProxy: IEventBus,
): ISyncManager & ISyncInspector {
  return new SyncManagerProxy(router, busProxy);
}

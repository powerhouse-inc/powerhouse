import {
  DriveCollectionId,
  SyncEventTypes,
  type ChannelConfig,
  type ConnectionStateChangeCallback,
  type ConnectionStateChangedEvent,
  type ConnectionStateSnapshot,
  type IChannel,
  type IMailbox,
  type ISyncManager,
  type Remote,
  type RemoteFilter,
  type RemoteMeta,
  type RemoteOptions,
  type ShutdownStatus,
  type SyncOperation,
  type SyncStatus,
  type SyncStatusChangeCallback,
} from "@powerhousedao/reactor";
import { fromErrorInfo } from "./error-info.js";
import type { ReactorEventBusProxy } from "./event-bus-proxy.js";
import type { CorrelationId, OwnerMessage } from "./protocol.js";
import type { IRpcTransport } from "./transport.js";

// Synthetic bus channel id for sync-status deltas (not a reactor IEventBus type).
export const SYNC_STATUS_CHANGED_EVENT = 90001;

export type SyncStatusChangedBusEvent = {
  documentId: string;
  status: SyncStatus;
};

// Wire shapes: DriveCollectionId arrives prototype-less over postMessage.
type WireDriveCollectionId = { driveId: string; branch: string };
type WireRemoteMeta = {
  id: string;
  name: string;
  collectionId: WireDriveCollectionId;
  channelConfig: ChannelConfig;
  filter: RemoteFilter;
  options: RemoteOptions;
};
type WireRemote = {
  meta: WireRemoteMeta;
  connectionState: ConnectionStateSnapshot;
};

type PendingCall = {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

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

const NOOP_MAILBOX = new NoopMailbox();

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
  };
}

function channelUrl(meta: RemoteMeta): string | undefined {
  const url = meta.channelConfig.parameters.url;
  return typeof url === "string" ? url : undefined;
}

// Tab-side ISyncManager: cache-backed reads fed by the bus, ops over sync-op RPC.
export class SyncManagerProxy implements ISyncManager {
  private readonly transport: IRpcTransport;
  private counter = 0;
  private readonly pending = new Map<CorrelationId, PendingCall>();
  private readonly connectionStates = new Map<
    string,
    ConnectionStateSnapshot
  >();
  private readonly connectionListeners = new Set<() => void>();
  private readonly syncStatuses = new Map<string, SyncStatus>();
  private readonly syncStatusListeners = new Set<SyncStatusChangeCallback>();
  private remotes: Remote[] = [];
  private seedPromise: Promise<void> | null = null;

  constructor(transport: IRpcTransport, busProxy: ReactorEventBusProxy) {
    this.transport = transport;

    transport.onMessage((message) => {
      const msg = message as OwnerMessage;
      if (msg.k !== "res" && msg.k !== "err") {
        return;
      }
      const entry = this.pending.get(msg.id);
      if (!entry) {
        return;
      }
      this.pending.delete(msg.id);
      if (msg.k === "res") {
        entry.resolve(msg.value);
      } else {
        entry.reject(fromErrorInfo(msg.error));
      }
    });

    busProxy.on(SyncEventTypes.CONNECTION_STATE_CHANGED, (event) => {
      const e = event as ConnectionStateChangedEvent;
      this.connectionStates.set(e.remoteName, e.snapshot);
      this.notifyConnection();
    });

    busProxy.on(SYNC_STATUS_CHANGED_EVENT, (event) => {
      const e = event as SyncStatusChangedBusEvent;
      this.syncStatuses.set(e.documentId, e.status);
      for (const listener of [...this.syncStatusListeners]) {
        listener(e.documentId, e.status);
      }
    });

    void this.ensureSeeded();
  }

  startup(): Promise<void> {
    return this.ensureSeeded();
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

  triggerPull(name: string): void {
    void this.callSyncOp("triggerPull", [name]);
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
    this.syncStatusListeners.add(callback);
    return () => {
      this.syncStatusListeners.delete(callback);
    };
  }

  private nextId(): CorrelationId {
    return `s${++this.counter}`;
  }

  private callSyncOp(method: string, args: unknown[]): Promise<unknown> {
    const id = this.nextId();
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.transport.post({ k: "sync-op", id, method, args });
    return promise;
  }

  private notifyConnection(): void {
    for (const listener of [...this.connectionListeners]) {
      listener();
    }
  }

  private makeChannel(remoteName: string, url: string | undefined): IChannel {
    const channel: IChannel & { config: { url?: string } } = {
      inbox: NOOP_MAILBOX,
      outbox: NOOP_MAILBOX,
      deadLetter: NOOP_MAILBOX,
      init: () => Promise.resolve(),
      shutdown: () => Promise.resolve(),
      getConnectionState: () =>
        this.connectionStates.get(remoteName) ?? DEFAULT_SNAPSHOT,
      onConnectionStateChange: (callback: ConnectionStateChangeCallback) => {
        const listener = () =>
          callback(this.connectionStates.get(remoteName) ?? DEFAULT_SNAPSHOT);
        this.connectionListeners.add(listener);
        return () => {
          this.connectionListeners.delete(listener);
        };
      },
      triggerPull: () => {
        void this.callSyncOp("triggerPull", [remoteName]);
      },
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
    if (!this.seedPromise) {
      this.seedPromise = this.refreshRemotes();
    }
    return this.seedPromise;
  }
}

export function createSyncManagerProxy(
  transport: IRpcTransport,
  busProxy: ReactorEventBusProxy,
): ISyncManager {
  return new SyncManagerProxy(transport, busProxy);
}

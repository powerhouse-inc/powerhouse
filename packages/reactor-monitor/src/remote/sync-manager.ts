import {
  DriveCollectionId,
  type ChannelConfig,
  type ConnectionStateChangeCallback,
  type ConnectionStateSnapshot,
  type IChannel,
  type IMailbox,
  type IPeerAgreement,
  type Remote,
  type RemoteMeta,
  type RemoteSyncInspection,
  type ShutdownStatus,
  type SyncHold,
  type SyncOperation,
  type SyncStatus,
  type WireChannelConfig,
  type WireDeadLetterPage,
  type WireRemoteMeta,
} from "@powerhousedao/reactor";
import type { PeerManifest } from "@powerhousedao/shared/document-model";
import type { MonitorSyncManager } from "../types.js";
import type {
  RemoteInspectionRemote,
  RemoteInspectorClient,
} from "./client.js";

// Copied from reactor-browser's SyncManagerProxy, which does not export them.
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

const DEFAULT_FILTER: RemoteMeta["filter"] = {
  documentId: [],
  scope: [],
  branch: "main",
};

const UNKNOWN_CHANNEL: ChannelConfig = { type: "unknown", parameters: {} };

// Remote meta rides a JSON scalar, so neither field is trusted to its type.
function rehydrateChannelConfig(
  config: WireChannelConfig | undefined,
): ChannelConfig {
  const wire: { type?: unknown; parameters?: unknown } = config ?? {};
  return {
    type: typeof wire.type === "string" ? wire.type : UNKNOWN_CHANNEL.type,
    parameters:
      typeof wire.parameters === "object" && wire.parameters !== null
        ? (wire.parameters as Record<string, unknown>)
        : {},
  };
}

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
    `${what} is not served by the read-only inspection subgraph at ${endpoint}`,
  );
}

/** Serves the inspection reads; anything that would change the far side refuses by name. */
export class RemoteSyncManagerClient implements MonitorSyncManager {
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

  listHolds(): Promise<SyncHold[]> {
    return Promise.reject(notServed("Sync holds", this.client.endpoint));
  }

  triggerPull(name: string): void {
    throw notServed(`Pulling remote "${name}"`, this.client.endpoint);
  }

  // Sync status is pushed on the remote's event bus, which is not served.
  getSyncStatus(): SyncStatus | undefined {
    return undefined;
  }

  onSyncStatusChange(): () => void {
    return () => {};
  }

  inspectRemote(remoteName: string): Promise<RemoteSyncInspection> {
    return this.client.inspectRemote(remoteName);
  }

  async inspectRemotes(): Promise<RemoteSyncInspection[]> {
    const inspected = await this.refresh();
    return inspected.map(({ meta: _meta, ...inspection }) => inspection);
  }

  listDeadLetters(
    remoteName: string,
    cursor?: string,
    limit?: number,
  ): Promise<WireDeadLetterPage> {
    return this.client.listDeadLetters(remoteName, cursor, limit);
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

  // Inert apart from the last inspected connection state.
  private makeChannel(remoteName: string, config: ChannelConfig): IChannel {
    const url = config.parameters.url;
    const channel: IChannel & { config: { url?: string } } = {
      inbox: NOOP_MAILBOX,
      outbox: NOOP_MAILBOX,
      deadLetter: NOOP_MAILBOX,
      init: () => Promise.resolve(),
      shutdown: () => Promise.resolve(),
      getConnectionState: () =>
        this.connectionStates.get(remoteName) ?? DEFAULT_SNAPSHOT,
      onConnectionStateChange:
        (_callback: ConnectionStateChangeCallback) => () => {},
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

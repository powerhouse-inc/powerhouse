import { ConsoleLogger, type ILogger } from "document-model";
import { DriveCollectionId } from "../../cache/operation-index-types.js";
import type { ISyncManager, Remote } from "../interfaces.js";
import type { ChannelConfig, RemoteFilter, RemoteOptions } from "../types.js";
import { RemotePersistence } from "../types.js";
import { LOCAL_CHANNEL_TYPE } from "./local-channel-factory.js";
import type {
  LocalChannelPort,
  LocalChannelTransportProvider,
} from "./local-channel-transport.js";

const DEFAULT_MAX_QUEUED_FRAMES = 1024;

/**
 * The port a channel sees. It holds the registry's one listener on the raw port
 * for the whole registration, so a frame that arrives between two channels
 * (a reset) is queued and replayed to the next one instead of lost.
 */
class RegisteredPort implements LocalChannelPort {
  private subscriber: ((data: unknown) => void) | undefined;
  private readonly queued: unknown[] = [];
  private droppedSinceAttach = 0;
  private readonly detachRaw: () => void;

  constructor(
    private readonly raw: LocalChannelPort,
    private readonly label: string,
    private readonly logger: ILogger,
    private readonly maxQueuedFrames: number,
  ) {
    this.detachRaw = raw.onMessage((data) => this.dispatch(data));
  }

  postMessage(data: unknown): void {
    this.raw.postMessage(data);
  }

  /** One channel at a time; a newer attach supersedes an older one. */
  onMessage(callback: (data: unknown) => void): () => void {
    this.subscriber = callback;
    this.droppedSinceAttach = 0;
    while (this.queued.length > 0 && this.subscriber === callback) {
      callback(this.queued.shift());
    }
    return () => {
      if (this.subscriber === callback) this.subscriber = undefined;
    };
  }

  /** The registry closes the raw port on unregister; a channel cannot. */
  close(): void {}

  release(): void {
    this.subscriber = undefined;
    this.queued.length = 0;
    this.detachRaw();
    this.raw.close();
  }

  private dispatch(data: unknown): void {
    if (this.subscriber) {
      this.subscriber(data);
      return;
    }
    this.queued.push(data);
    if (this.queued.length <= this.maxQueuedFrames) return;
    this.queued.shift();
    if (this.droppedSinceAttach++ === 0) {
      this.logger.warn(
        "Local sync port @Label queued more than @Max frames with no channel attached; dropping the oldest",
        this.label,
        this.maxQueuedFrames,
      );
    }
  }
}

export type LocalChannelPortRegistryOptions = {
  logger?: ILogger;
  /** Frames held for a detached port before the oldest is dropped. */
  maxQueuedFrames?: number;
};

/** Brokered local-sync ports by (peerId, channelName); owns closing them. */
export class LocalChannelPortRegistry {
  private readonly ports = new Map<string, RegisteredPort>();
  private readonly closedKeys = new Set<string>();
  private readonly logger: ILogger;
  private readonly maxQueuedFrames: number;

  constructor(options: LocalChannelPortRegistryOptions = {}) {
    this.logger = options.logger ?? new ConsoleLogger(["local-sync"]);
    this.maxQueuedFrames = options.maxQueuedFrames ?? DEFAULT_MAX_QUEUED_FRAMES;
  }

  /** Hand this to the {@link LocalChannelFactory}. */
  readonly provider: LocalChannelTransportProvider = (peerId, channelName) => {
    const key = this.key(peerId, channelName);
    const port = this.ports.get(key);
    if (port) {
      return port;
    }
    if (this.closedKeys.has(key)) {
      throw new Error(
        `Local sync port for peer '${peerId}' channel '${channelName}' has been closed; the link is severed and must be brokered again`,
      );
    }
    return undefined;
  };

  /** Refuses a live key; a closed key may be registered again (a re-link). */
  register(peerId: string, channelName: string, port: LocalChannelPort): void {
    const key = this.key(peerId, channelName);
    if (this.ports.has(key)) {
      throw new Error(
        `A local sync port is already registered for peer '${peerId}' channel '${channelName}'; unlink the existing link before brokering another`,
      );
    }
    this.closedKeys.delete(key);
    this.ports.set(
      key,
      new RegisteredPort(port, key, this.logger, this.maxQueuedFrames),
    );
  }

  has(peerId: string, channelName: string): boolean {
    return this.ports.has(this.key(peerId, channelName));
  }

  isClosed(peerId: string, channelName: string): boolean {
    return this.closedKeys.has(this.key(peerId, channelName));
  }

  /** Detaches the registry's listener and closes the port. */
  unregister(peerId: string, channelName: string): void {
    const key = this.key(peerId, channelName);
    const port = this.ports.get(key);
    this.ports.delete(key);
    this.closedKeys.add(key);
    port?.release();
  }

  private key(peerId: string, channelName: string): string {
    return JSON.stringify([peerId, channelName]);
  }
}

/** `branch: ""` matches every branch. */
export const DEFAULT_LOCAL_FILTER: RemoteFilter = {
  documentId: [],
  scope: [],
  branch: "",
};

/** Session-scoped: no later boot can rebuild a brokered port. */
export const LOCAL_REMOTE_OPTIONS: RemoteOptions = {
  sinceTimestampUtcMs: "0",
  persistence: RemotePersistence.Session,
};

export function localChannelConfig(
  peerId: string,
  channelName: string,
): ChannelConfig {
  return { type: LOCAL_CHANNEL_TYPE, parameters: { peerId, channelName } };
}

/** `fromKey` splits on the last dot, so neither part may hold one. */
export function assertCollectionIdParts(driveId: string, branch: string): void {
  if (driveId.includes(".")) {
    throw new Error(
      `Drive id ${JSON.stringify(driveId)} contains a "." which the collection id format cannot carry; local sync needs a dot-free drive id`,
    );
  }
  if (branch.includes(".")) {
    throw new Error(
      `Branch ${JSON.stringify(branch)} contains a "." which the collection id format cannot carry; local sync needs a dot-free branch`,
    );
  }
}

/** A dotted drive id parses as a dotted branch, so that is refused here. */
export function collectionIdFromKey(key: string): DriveCollectionId {
  const collectionId = DriveCollectionId.fromKey(key);
  assertCollectionIdParts(collectionId.driveId, collectionId.branch);
  return collectionId;
}

export type LocalRemoteSpec = {
  peerId: string;
  channelName: string;
  collectionId: DriveCollectionId;
  remoteName: string;
  filter: RemoteFilter;
};

export type LocalRemoveSpec = {
  remoteName: string;
  peerId: string;
  channelName: string;
};

export type LocalPeerSyncManager = Pick<
  ISyncManager,
  "list" | "add" | "remove"
>;

/** Registers before `add`, because `add` resolves the port through the factory. */
export async function registerLocalPeer(
  syncManager: LocalPeerSyncManager,
  registry: LocalChannelPortRegistry,
  spec: LocalRemoteSpec,
  port: LocalChannelPort,
): Promise<Remote> {
  if (registry.has(spec.peerId, spec.channelName)) {
    throw new Error(
      `This reactor already holds a local sync port for peer '${spec.peerId}' channel '${spec.channelName}'; unlink the existing link first`,
    );
  }
  if (
    syncManager.list().some((remote) => remote.meta.name === spec.remoteName)
  ) {
    throw new Error(
      `This reactor already has a remote named '${spec.remoteName}'; unlink the existing link first`,
    );
  }

  registry.register(spec.peerId, spec.channelName, port);

  try {
    return await syncManager.add(
      spec.remoteName,
      spec.collectionId,
      localChannelConfig(spec.peerId, spec.channelName),
      spec.filter,
      LOCAL_REMOTE_OPTIONS,
    );
  } catch (error) {
    registry.unregister(spec.peerId, spec.channelName);
    throw error;
  }
}

/** Unregisters even when `remove` throws, so the peer can be adopted again. */
export async function removeLocalPeer(
  syncManager: LocalPeerSyncManager,
  registry: LocalChannelPortRegistry,
  spec: LocalRemoveSpec,
): Promise<void> {
  try {
    await syncManager.remove(spec.remoteName);
  } finally {
    registry.unregister(spec.peerId, spec.channelName);
  }
}

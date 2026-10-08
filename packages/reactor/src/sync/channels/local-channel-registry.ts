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

function frameKind(data: unknown): unknown {
  return typeof data === "object" && data !== null
    ? (data as { kind?: unknown }).kind
    : undefined;
}

/**
 * The port a channel sees. It holds the registry's one listener on the raw port
 * for the whole registration, so a frame that arrives between two channels
 * (a reset) is queued and replayed to the next one instead of lost.
 *
 * Past the bound, every queued push is discarded, and so is every later one
 * until a channel attaches: the inbox ack is the highest applied ordinal, so
 * replaying pushes after a gap would ack past the missing ones. The peer still
 * holds them unacked and re-pushes them on the fresh channel's hello.
 */
class RegisteredPort implements LocalChannelPort {
  private subscriber: ((data: unknown) => void) | undefined;
  private queued: unknown[] = [];
  private discardingPushes = false;
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
    this.discardingPushes = false;
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
    if (this.discardingPushes && frameKind(data) === "push") return;
    this.queued.push(data);
    if (this.queued.length <= this.maxQueuedFrames) return;
    if (!this.discardingPushes) {
      this.logger.warn(
        "Local sync port @Label queued more than @Max frames with no channel attached; discarding queued pushes for the peer to re-push",
        this.label,
        this.maxQueuedFrames,
      );
    }
    this.discardingPushes = true;
    this.compact();
  }

  /** Keeps only the latest hello or resend and the latest ack, in order. */
  private compact(): void {
    const handshake = this.queued.findLast((frame) => {
      const kind = frameKind(frame);
      return kind === "hello" || kind === "resend";
    });
    const ack = this.queued.findLast((frame) => frameKind(frame) === "ack");
    this.queued = this.queued.filter(
      (frame) => frame === handshake || frame === ack,
    );
  }
}

export type LocalChannelPortRegistryOptions = {
  logger?: ILogger;
  /** Frames held for a detached port before its queued pushes are discarded. */
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
  "list" | "add" | "remove" | "resetSettled"
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

/**
 * Waits out a running reset, then removes. The port is closed only once the
 * remote is gone, so a failed remove (a reset that started meanwhile) leaves
 * the link intact for a retry.
 */
export async function removeLocalPeer(
  syncManager: LocalPeerSyncManager,
  registry: LocalChannelPortRegistry,
  spec: LocalRemoveSpec,
): Promise<void> {
  await syncManager.resetSettled?.(spec.remoteName);
  try {
    await syncManager.remove(spec.remoteName);
  } catch (error) {
    if (
      !syncManager.list().some((remote) => remote.meta.name === spec.remoteName)
    ) {
      registry.unregister(spec.peerId, spec.channelName);
    }
    throw error;
  }
  registry.unregister(spec.peerId, spec.channelName);
}

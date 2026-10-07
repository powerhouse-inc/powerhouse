import { DriveCollectionId } from "../../cache/operation-index-types.js";
import type { ISyncManager, Remote } from "../interfaces.js";
import type { ChannelConfig, RemoteFilter, RemoteOptions } from "../types.js";
import { RemotePersistence } from "../types.js";
import { LOCAL_CHANNEL_TYPE } from "./local-channel-factory.js";
import type {
  LocalChannelPort,
  LocalChannelTransportProvider,
} from "./local-channel-transport.js";

/** Brokered local-sync ports by (peerId, channelName); closing one forgets it. */
export class LocalChannelPortRegistry {
  private readonly ports = new Map<string, LocalChannelPort>();
  private readonly closedKeys = new Set<string>();

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
    this.ports.set(key, this.selfForgetting(key, port));
  }

  has(peerId: string, channelName: string): boolean {
    return this.ports.has(this.key(peerId, channelName));
  }

  isClosed(peerId: string, channelName: string): boolean {
    return this.closedKeys.has(this.key(peerId, channelName));
  }

  unregister(peerId: string, channelName: string): void {
    this.forget(this.key(peerId, channelName));
  }

  private key(peerId: string, channelName: string): string {
    return JSON.stringify([peerId, channelName]);
  }

  private forget(key: string): void {
    this.ports.delete(key);
    this.closedKeys.add(key);
  }

  private selfForgetting(
    key: string,
    port: LocalChannelPort,
  ): LocalChannelPort {
    return {
      postMessage: (data: unknown) => port.postMessage(data),
      onMessage: (callback: (data: unknown) => void) =>
        port.onMessage(callback),
      close: () => {
        this.forget(key);
        port.close();
      },
    };
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
    port.close();
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

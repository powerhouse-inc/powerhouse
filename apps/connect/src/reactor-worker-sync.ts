/**
 * Connect's local-channel brokering seam (multi-reactor stage 4, WP-B/C).
 *
 * Mirrors `@powerhousedao/reactor-monitor`'s `sync/local-channel-registry.ts`
 * and `sync/adopt-sync-peer.ts`. The monitor is a browser lab-bench package
 * Connect must not depend on, and these helpers depend only on
 * `@powerhousedao/reactor`, so the registry and the adopt-peer wiring are
 * mirrored here rather than imported. Keep the two copies in step; the shape of
 * the seam (a `LocalChannelPortRegistry` whose `provider` a `LocalChannelFactory`
 * holds, and a `registerLocalPeer` that registers a transferred port before it
 * adds the remote) is load-bearing for the composite channel factory.
 */
import {
  DriveCollectionId,
  LOCAL_CHANNEL_TYPE,
  RemotePersistence,
  type ChannelConfig,
  type ISyncManager,
  type LocalChannelPort,
  type LocalChannelTransportProvider,
  type Remote,
  type RemoteFilter,
  type RemoteOptions,
} from "@powerhousedao/reactor";

/**
 * A reactor's live registry of brokered local-sync ports.
 *
 * `LocalChannelFactory` resolves a port from a {@link LocalChannelTransportProvider}
 * keyed by the `(peerId, channelName)` a remote's `ChannelConfig` names -- a
 * `MessagePort` is not clone-safe config, so it cannot ride in `parameters`.
 * This is the mutable side of that seam: a broker hands this reactor one end of
 * a `MessageChannel` via the adopt-sync-peer op, the reactor registers it here,
 * and {@link provider} is what the factory holds. Inert until a port is
 * registered: an empty registry answers every lookup with `undefined`, so the
 * composite factory routes only the gql scheme.
 */
export class LocalChannelPortRegistry {
  private readonly ports = new Map<string, LocalChannelPort>();
  private readonly closedKeys = new Set<string>();

  /** The transport provider a {@link LocalChannelFactory} is constructed with. */
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

  /**
   * Keeps `port` under `(peerId, channelName)`. Refuses to replace a live entry:
   * the entry IS the link, so overwriting one would strand a connected channel's
   * transport. A key that was closed is re-registerable -- that is a re-link.
   */
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

  /** Whether this key names a link whose port this registry saw close. */
  isClosed(peerId: string, channelName: string): boolean {
    return this.closedKeys.has(this.key(peerId, channelName));
  }

  /** Forgets the entry so a later factory lookup fails loudly rather than reusing a dead port. */
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

  /**
   * Wraps `port` so closing it also drops its registry entry. The channel owns
   * the port once the factory resolves it, and the channel is what closes it --
   * on `shutdown()`, which `syncManager.remove()` and the reset path both run.
   */
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

/**
 * Syncs everything in the collection, on every branch. `branch: ""` is match-all
 * and is exactly what `SyncManager.add` defaults to.
 */
export const DEFAULT_LOCAL_FILTER: RemoteFilter = {
  documentId: [],
  scope: [],
  branch: "",
};

/**
 * A brokered local remote is session-scoped: its transport is one end of a
 * `MessageChannel` this session owns, which dies with the page or worker.
 * Persisting it would leave a record no later boot could rebuild a transport for.
 */
export const LOCAL_REMOTE_OPTIONS: RemoteOptions = {
  sinceTimestampUtcMs: "0",
  persistence: RemotePersistence.Session,
};

/** The `ChannelConfig` a {@link LocalChannelFactory} resolves a brokered port from. */
export function localChannelConfig(
  peerId: string,
  channelName: string,
): ChannelConfig {
  return { type: LOCAL_CHANNEL_TYPE, parameters: { peerId, channelName } };
}

/**
 * Rejects a drive id or branch the collection-id key format cannot carry.
 * `DriveCollectionId`'s key is `drive.${branch}.${driveId}` and `fromKey` splits
 * on the LAST dot, so a dotted drive id does not survive the round trip.
 */
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

/**
 * Rehydrates a collection id from its wire key, refusing one the format cannot
 * have carried faithfully. A dotted drive id is undetectable from the key alone,
 * but a dotted BRANCH is -- and since {@link assertCollectionIdParts} refuses a
 * dotted branch at every sending boundary, a dotted branch arriving here means
 * the sender's drive id carried a dot.
 */
export function collectionIdFromKey(key: string): DriveCollectionId {
  const collectionId = DriveCollectionId.fromKey(key);
  assertCollectionIdParts(collectionId.driveId, collectionId.branch);
  return collectionId;
}

/** Everything one side of a brokered link needs to adopt the other as a remote. */
export type LocalRemoteSpec = {
  /** The peer reactor's identity; the first half of the transport-provider key. */
  peerId: string;
  /** Channel label the broker derived; the second half of that key. */
  channelName: string;
  collectionId: DriveCollectionId;
  /** Unique remote name on this reactor. */
  remoteName: string;
  filter: RemoteFilter;
};

/**
 * The reactor side of the adopt-sync-peer op: registers `port` under the spec's
 * `(peerId, channelName)` so this reactor's `LocalChannelFactory` can resolve it,
 * then adds the local remote so the `LocalChannel` handshake runs over it. The
 * port must be registered before `add`, because `add` builds the channel through
 * the factory, which resolves the port from the registry; the failure path
 * unregisters and closes so a failed add leaves nothing behind.
 */
export async function registerLocalPeer(
  syncManager: ISyncManager,
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

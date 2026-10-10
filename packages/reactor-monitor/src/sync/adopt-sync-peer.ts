import {
  DriveCollectionId,
  LOCAL_CHANNEL_TYPE,
  RemotePersistence,
  type ChannelConfig,
  type ISyncManager,
  type LocalChannelPort,
  type Remote,
  type RemoteFilter,
  type RemoteOptions,
} from "@powerhousedao/reactor";
import type { LocalChannelPortRegistry } from "./local-channel-registry.js";

/**
 * Syncs everything in the collection, on every branch.
 *
 * `branch: ""` is match-all and is exactly what `SyncManager.add` defaults to,
 * so a brokered local link filters no differently from any other remote unless
 * the caller asks it to. It previously pinned `"main"`, which silently dropped
 * every other branch from a link whose whole point is "sync this collection".
 */
export const DEFAULT_LOCAL_FILTER: RemoteFilter = {
  documentId: [],
  scope: [],
  branch: "",
};

/**
 * A brokered local remote is session-scoped: its transport is one end of a
 * `MessageChannel` this monitor session owns, which dies with the page or
 * worker. Persisting it would leave a record no later boot could rebuild a
 * transport for. See `RemotePersistence`.
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
 *
 * `DriveCollectionId`'s key is `drive.${branch}.${driveId}` and `fromKey`
 * splits on the LAST dot, so a dotted drive id does not survive the round trip
 * -- the worker would rehydrate a different collection than the one the monitor
 * named, and the two reactors would sync nothing while reporting a healthy
 * link. The key format is the storage representation of existing rows and
 * cannot change, so the dot is refused here, at the boundary where a drive id
 * enters from a UI field or an RPC payload.
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
 * have carried faithfully.
 *
 * A dotted drive id is undetectable from the key alone: `drive.main.drive.one`
 * re-serialises byte-for-byte whether it came from drive `drive.one` on branch
 * `main` or from drive `one` on branch `main.drive`. What IS detectable is that
 * the parse produced a dotted BRANCH -- and since `assertCollectionIdParts`
 * refuses a dotted branch at every sending boundary, a dotted branch arriving
 * here means the sender's drive id carried a dot and this side would otherwise
 * sync a collection the sender never named. So the parsed parts are checked,
 * not the key.
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
 * The worker/in-process side of the adopt-sync-peer op: registers `port` under
 * the spec's `(peerId, channelName)` so this reactor's `LocalChannelFactory`
 * can resolve it, then adds the local remote so the `LocalChannel` handshake
 * runs over it. Realm-agnostic -- the caller wraps a real (transferred)
 * MessagePort or an in-memory port into a {@link LocalChannelPort} first -- so
 * it is unit-testable with a fake port. Multi-reactor W1.2.
 *
 * This is the authoritative duplicate check for a link, because it is the only
 * code that runs in the realm that owns both the registry and the remotes. Both
 * are read BEFORE anything is mutated, so adopting a peer that is already
 * adopted is a clean error rather than a clobbered registry entry over a live
 * channel.
 *
 * The port must be registered before `add`, not after: `add` builds the channel
 * through `LocalChannelFactory`, which resolves the port from the registry, so
 * an unregistered port makes `add` fail. That is why the failure path here
 * unregisters and closes rather than simply never registering -- and why the
 * remote is session-scoped, so a failed add leaves nothing durable either.
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
    // The registration exists only to serve this add. Leaving it behind would
    // leave a live port keyed for a remote that does not exist.
    registry.unregister(spec.peerId, spec.channelName);
    port.close();
    throw error;
  }
}

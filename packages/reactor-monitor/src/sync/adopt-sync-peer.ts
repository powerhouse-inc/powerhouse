import { LOCAL_CHANNEL_TYPE } from "@powerhousedao/reactor";
import type {
  ChannelConfig,
  DriveCollectionId,
  ISyncManager,
  LocalChannelPort,
  Remote,
  RemoteFilter,
} from "@powerhousedao/reactor";
import type { LocalChannelPortRegistry } from "./local-channel-registry.js";

/** Syncs everything in the collection on the main branch. */
export const DEFAULT_LOCAL_FILTER: RemoteFilter = {
  documentId: [],
  scope: [],
  branch: "main",
};

/** The `ChannelConfig` a {@link LocalChannelFactory} resolves a brokered port from. */
export function localChannelConfig(
  peerId: string,
  channelName: string,
): ChannelConfig {
  return { type: LOCAL_CHANNEL_TYPE, parameters: { peerId, channelName } };
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
 */
export async function registerLocalPeer(
  syncManager: ISyncManager,
  registry: LocalChannelPortRegistry,
  spec: LocalRemoteSpec,
  port: LocalChannelPort,
): Promise<Remote> {
  registry.register(spec.peerId, spec.channelName, port);
  return syncManager.add(
    spec.remoteName,
    spec.collectionId,
    localChannelConfig(spec.peerId, spec.channelName),
    spec.filter,
  );
}

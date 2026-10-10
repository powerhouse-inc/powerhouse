import type {
  DriveCollectionId,
  MessagePortLike,
  RemoteFilter,
} from "@powerhousedao/reactor";

/**
 * One end of a monitor-brokered local-sync link, handed to a reactor so it
 * adopts the peer. `port` is one end of the broker's `MessageChannel`: a worker
 * reactor transfers it across the RPC boundary, an in-process reactor wraps it
 * directly. Multi-reactor W1.2.
 */
export type AdoptLocalSyncPeerLink = {
  /** The peer reactor's identity; the registry/config key's first half. */
  peerId: string;
  /** Channel label the broker derived; the key's second half. */
  channelName: string;
  collectionId: DriveCollectionId;
  /** Unique remote name on the adopting reactor. */
  remoteName: string;
  filter: RemoteFilter;
  port: MessagePortLike;
};

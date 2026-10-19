import type { RemoteFilter } from "@powerhousedao/reactor";
import type { MessageRouter } from "@powerhousedao/reactor/rpc";
import { toVoid } from "./op-channel.js";

export type AdoptSyncPeerParams = {
  peerId: string;
  channelName: string;
  /** `DriveCollectionId.key`; the class does not survive structured clone. */
  collectionIdKey: string;
  remoteName: string;
  filter: RemoteFilter;
};

export type RemoveSyncPeerParams = {
  peerId: string;
  channelName: string;
  remoteName: string;
};

/** Moves `port` to the host, which adopts the peer as a local remote over it. */
export function sendAdoptSyncPeer(
  router: MessageRouter,
  params: AdoptSyncPeerParams,
  port: MessagePort,
): Promise<void> {
  return toVoid(
    router.request(
      (id) => ({
        k: "adopt-sync-peer",
        id,
        peerId: params.peerId,
        channelName: params.channelName,
        collectionIdKey: params.collectionIdKey,
        remoteName: params.remoteName,
        filter: params.filter,
        port,
      }),
      { transfer: [port] },
    ),
  );
}

/** Removes the peer's remote and closes its port in the host's registry. */
export function sendRemoveSyncPeer(
  router: MessageRouter,
  params: RemoveSyncPeerParams,
): Promise<void> {
  return toVoid(
    router.request((id) => ({
      k: "remove-sync-peer",
      id,
      peerId: params.peerId,
      channelName: params.channelName,
      remoteName: params.remoteName,
    })),
  );
}

import type { RemoteFilter } from "@powerhousedao/reactor";
import type { MessageRouter } from "./message-router.js";
import { toVoid } from "./op-channel.js";

/**
 * What a worker needs to adopt a monitor-brokered local-sync peer: the
 * registry key (`peerId`/`channelName`) the `LocalChannelFactory` resolves the
 * port under, and the remote to add for `collectionIdKey`/`filter`. The live
 * {@link MessagePort} travels beside this, in the message's transfer list.
 *
 * `collectionIdKey` rather than a `DriveCollectionId`: the id degrades to a
 * prototype-less object over `postMessage`, so its stable string key crosses
 * the wire and the worker rehydrates it with `DriveCollectionId.fromKey`.
 */
export type AdoptSyncPeerParams = {
  peerId: string;
  channelName: string;
  collectionIdKey: string;
  remoteName: string;
  filter: RemoteFilter;
};

/**
 * Sends the adopt-sync-peer op to a worker reactor, transferring `port` (moved,
 * not cloned) so the worker owns the live end of the broker's channel. Resolves
 * when the worker has registered the port and added the local remote. Multi-
 * reactor W1.2 -- see docs/plans/2026-10-03-multi-reactor.md.
 */
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

/**
 * Which brokered local-sync peer to release: the remote to remove, and the
 * registry key whose port must be forgotten with it.
 */
export type RemoveSyncPeerParams = {
  peerId: string;
  channelName: string;
  remoteName: string;
};

/**
 * Sends the remove-sync-peer op to a worker reactor. Resolves once the worker
 * has removed the local remote and unregistered its port, so the key is free to
 * be linked again. The twin of {@link sendAdoptSyncPeer}; removing the remote
 * over the plain sync-op channel would leave the worker's port registry holding
 * a dead entry.
 */
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

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

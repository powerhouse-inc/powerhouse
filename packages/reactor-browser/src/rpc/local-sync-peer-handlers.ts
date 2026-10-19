import {
  collectionIdFromKey,
  messagePortTransport,
  registerLocalPeer,
  removeLocalPeer,
  type LocalChannelPortRegistry,
  type LocalPeerSyncManager,
} from "@powerhousedao/reactor";
import type {
  AdoptSyncPeerParams,
  RemoveSyncPeerParams,
} from "./adopt-sync-peer.js";
import type { ReactorHostOptions } from "./reactor-host.js";

/** The host's adopt/remove handlers over the reactor's local peer registry. */
export function localSyncPeerHandlers(
  syncManager: LocalPeerSyncManager,
  registry: LocalChannelPortRegistry,
): Required<Pick<ReactorHostOptions, "onAdoptSyncPeer" | "onRemoveSyncPeer">> {
  return {
    onAdoptSyncPeer: async (params: AdoptSyncPeerParams, port: MessagePort) => {
      await registerLocalPeer(
        syncManager,
        registry,
        {
          peerId: params.peerId,
          channelName: params.channelName,
          collectionId: collectionIdFromKey(params.collectionIdKey),
          remoteName: params.remoteName,
          filter: params.filter,
        },
        messagePortTransport(port),
      );
    },
    onRemoveSyncPeer: (params: RemoveSyncPeerParams) =>
      removeLocalPeer(syncManager, registry, params),
  };
}

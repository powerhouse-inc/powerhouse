import {
  LocalChannelFactory,
  LocalChannelPortRegistry,
  type IChannelFactory,
  type LocalPeerSyncManager,
} from "@powerhousedao/reactor";
import {
  localSyncPeerHandlers,
  type AdoptSyncPeerParams,
  type RemoveSyncPeerParams,
} from "@powerhousedao/reactor-browser/rpc";
import type { ILogger } from "document-model";

type PeerHandlers = {
  onAdoptSyncPeer: (
    params: AdoptSyncPeerParams,
    port: MessagePort,
  ) => Promise<void>;
  onRemoveSyncPeer: (params: RemoveSyncPeerParams) => Promise<void>;
};

export type WorkerLocalPeers = PeerHandlers & {
  /** The factory a flag-on build composes; its registry starts empty. */
  createChannelFactory(): IChannelFactory;
  /** Serves adopt/remove once the reactor that owns the registry is built. */
  attach(syncManager: LocalPeerSyncManager): void;
  /** Closes every brokered port once `retire` settles. */
  retiring(
    retire: (reason: string) => Promise<void>,
  ): (reason: string) => Promise<void>;
};

/** Without an attached reactor the host answers as if it had no handlers. */
export function createWorkerLocalPeers(logger: ILogger): WorkerLocalPeers {
  let registry: LocalChannelPortRegistry | undefined;
  let handlers: PeerHandlers | undefined;

  const release = () => {
    handlers = undefined;
    registry?.close();
    registry = undefined;
  };

  return {
    createChannelFactory: () => {
      release();
      registry = new LocalChannelPortRegistry({ logger });
      return new LocalChannelFactory(logger, registry.provider);
    },
    attach: (syncManager) => {
      handlers = registry
        ? localSyncPeerHandlers(syncManager, registry)
        : undefined;
    },
    retiring: (retire) => async (reason) => {
      try {
        await retire(reason);
      } finally {
        release();
      }
    },
    onAdoptSyncPeer: async (params, port) => {
      if (!handlers) {
        throw new Error("ReactorHost has no adopt-sync-peer handler");
      }
      return handlers.onAdoptSyncPeer(params, port);
    },
    onRemoveSyncPeer: async (params) => {
      if (!handlers) {
        throw new Error("ReactorHost has no remove-sync-peer handler");
      }
      return handlers.onRemoveSyncPeer(params);
    },
  };
}

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

export type WorkerLocalPeers = {
  /** Set from each build's construct, before its first await. */
  serve(multiReactor: boolean): void;
  /** The factory a flag-on build composes; its registry starts empty. */
  createChannelFactory(): IChannelFactory;
  /** Serves adopt/remove once the reactor that owns the registry is built. */
  attach(syncManager: LocalPeerSyncManager): void;
  /** Closes every brokered port once `retire` settles. */
  retiring(
    retire: (reason: string) => Promise<void>,
  ): (reason: string) => Promise<void>;
  /** Undefined unless the flag is on, so the host refuses before any build. */
  adoptHandler(): PeerHandlers["onAdoptSyncPeer"] | undefined;
  removeHandler(): PeerHandlers["onRemoveSyncPeer"] | undefined;
};

export function createWorkerLocalPeers(logger: ILogger): WorkerLocalPeers {
  let enabled = false;
  let registry: LocalChannelPortRegistry | undefined;
  let handlers: PeerHandlers | undefined;

  const peerHandlers: PeerHandlers = {
    onAdoptSyncPeer: async (params, port) => {
      if (!handlers) {
        throw new Error("The reactor is not ready for local sync peers");
      }
      return handlers.onAdoptSyncPeer(params, port);
    },
    onRemoveSyncPeer: async (params) => {
      if (!handlers) {
        throw new Error("The reactor is not ready for local sync peers");
      }
      return handlers.onRemoveSyncPeer(params);
    },
  };

  const release = () => {
    handlers = undefined;
    registry?.close();
    registry = undefined;
  };

  return {
    serve: (multiReactor) => {
      enabled = multiReactor;
    },
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
    adoptHandler: () => (enabled ? peerHandlers.onAdoptSyncPeer : undefined),
    removeHandler: () => (enabled ? peerHandlers.onRemoveSyncPeer : undefined),
  };
}

import {
  messagePortTransport,
  type IReactorClient,
  type IReactorDbQuery,
} from "@powerhousedao/reactor";
import {
  dispatchInspectorOp,
  FORWARDED_EVENT_TYPES,
  ReactorHost,
  SYNC_STATUS_CHANGED_EVENT,
} from "@powerhousedao/reactor-browser/rpc";
import {
  collectionIdFromKey,
  registerLocalPeer,
} from "../sync/adopt-sync-peer.js";
import {
  buildWorkerReactor,
  type BuiltWorkerReactor,
  type WorkerPackageImporters,
} from "./build-worker-reactor.js";
import { dispatchSyncOp } from "./sync-ops.js";

export type MonitorWorkerHost = {
  host: ReactorHost;
  /** The built reactor, once a tab's hello has booted it. */
  current: () => BuiltWorkerReactor | undefined;
  /** Shuts the reactor down and forgets it; the next hello rebuilds. */
  release: () => Promise<void>;
};

export type MonitorWorkerHostOptions = {
  /** The SharedWorker's own name, reported by `adminInfo()`. */
  workerName?: string;
  importers?: WorkerPackageImporters;
  /** Swapped in tests; defaults to {@link buildWorkerReactor}. */
  build?: (
    construct: unknown,
    importers?: WorkerPackageImporters,
  ) => Promise<BuiltWorkerReactor>;
};

/**
 * Wires a `ReactorHost` over one monitor reactor.
 *
 * Separated from the worker entry so the whole host — build, inspector
 * dispatch, sync ops, db ops, event forwarding, admin — can be driven over a
 * `MessageChannel` in a unit test. The entry adds only `self.onconnect`.
 */
export function createMonitorWorkerHost(
  options: MonitorWorkerHostOptions = {},
): MonitorWorkerHost {
  const build = options.build ?? buildWorkerReactor;
  let built: BuiltWorkerReactor | undefined;

  // Every op resolves the reactor per call rather than closing over it: the
  // store is reopened across boots, and an op can arrive before the first
  // hello has built anything.
  function requireBuilt(): BuiltWorkerReactor {
    if (!built) {
      throw new Error("Reactor not built");
    }
    return built;
  }

  const db: IReactorDbQuery = {
    queryDb: (sql, params) => requireBuilt().dbQuery.queryDb(sql, params),
  };

  const host = new ReactorHost({
    namespace: options.workerName ?? "",
    build: async (raw): Promise<IReactorClient> => {
      let phase = "building reactor";
      try {
        const next = await build(raw, options.importers);
        built = next;
        phase = "forwarding events";
        for (const type of FORWARDED_EVENT_TYPES) {
          next.module.eventBus.subscribe(type, (forwardedType, event) =>
            host.broadcastBusEvent(forwardedType, event),
          );
        }
        next.module.reactorModule?.syncModule?.syncManager.onSyncStatusChange(
          (documentId, status) =>
            host.broadcastBusEvent(SYNC_STATUS_CHANGED_EVENT, {
              documentId,
              status,
            }),
        );
        return next.module.client;
      } catch (error) {
        console.error(
          `[reactor-monitor.worker] boot failed at phase "${phase}":`,
          error,
        );
        // The next hello rebuilds, which reopens the store.
        const partial = built;
        built = undefined;
        await partial?.shutdown().catch(() => undefined);
        throw error;
      }
    },
    registerPackages: async (specs, sources) => {
      await requireBuilt().registerPackages(specs, sources);
    },
    onSyncOp: (method, args) => {
      const syncManager =
        requireBuilt().module.reactorModule?.syncModule?.syncManager;
      if (!syncManager) {
        return Promise.reject(new Error("SyncManager not available"));
      }
      return dispatchSyncOp(syncManager, method, args);
    },
    onInspectorOp: (method, args) =>
      dispatchInspectorOp(requireBuilt().inspector, db, method, args),
    onAdoptSyncPeer: async (params, port) => {
      const current = requireBuilt();
      const syncManager = current.module.reactorModule?.syncModule?.syncManager;
      const registry = current.localChannelPorts;
      if (!syncManager || !registry) {
        throw new Error(
          "Worker reactor has no local sync module; provision it with sync.local",
        );
      }
      // Rehydrated through the round-trip check: a dotted drive id would parse
      // back as a different collection, and this side would then sync the wrong
      // one while reporting a healthy link.
      const collectionId = collectionIdFromKey(params.collectionIdKey);
      // The transferred MessagePort is this realm's own now; wrap it as a
      // LocalChannelPort and register it so LocalChannelFactory resolves it.
      await registerLocalPeer(
        syncManager,
        registry,
        {
          peerId: params.peerId,
          channelName: params.channelName,
          collectionId,
          remoteName: params.remoteName,
          filter: params.filter,
        },
        messagePortTransport(port),
      );
    },
    // The in-process twin of this is one function that removes the remote and
    // unregisters the port; both halves have to happen in the realm that owns
    // the registry, which is why removing the remote over the sync-op channel
    // was not enough.
    onRemoveSyncPeer: async (params) => {
      const current = requireBuilt();
      const syncManager = current.module.reactorModule?.syncModule?.syncManager;
      const registry = current.localChannelPorts;
      if (!syncManager || !registry) {
        throw new Error(
          "Worker reactor has no local sync module; provision it with sync.local",
        );
      }
      await syncManager.remove(params.remoteName);
      registry.unregister(params.peerId, params.channelName);
    },
    onAdminRestart: () =>
      host.broadcastReload("admin restart", crypto.randomUUID()),
  });

  const release = async (): Promise<void> => {
    const current = built;
    built = undefined;
    await current?.shutdown();
  };

  return { host, current: () => built, release };
}

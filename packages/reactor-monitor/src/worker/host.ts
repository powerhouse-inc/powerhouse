import {
  DriveCollectionId,
  type ChannelConfig,
  messagePortTransport,
  type InspectorAccess,
  type IReactorClient,
  type IReactorDbQuery,
  type Remote,
  type RemoteFilter,
  type RemoteOptions,
} from "@powerhousedao/reactor";
import {
  dispatchInspectorOp,
  dispatchSyncInspectionOp,
  FORWARDED_EVENT_TYPES,
  isSyncInspectionOp,
  ReactorHost,
  SYNC_STATUS_CHANGED_EVENT,
} from "@powerhousedao/reactor-browser/rpc";
import type { PeerManifest } from "@powerhousedao/shared/document-model";
import {
  collectionIdFromKey,
  registerLocalPeer,
} from "../sync/adopt-sync-peer.js";
import {
  buildWorkerReactor,
  type BuildWorkerReactorOptions,
  type BuiltWorkerReactor,
  type WorkerPackageImporters,
} from "./build-worker-reactor.js";

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
    options?: BuildWorkerReactorOptions,
  ) => Promise<BuiltWorkerReactor>;
};

const ACCESS: InspectorAccess = { admin: true, sql: true };

/** Cloneable: meta (carries the channel config) and the connection snapshot. */
function toWireRemote(remote: Remote) {
  return {
    meta: remote.meta,
    connectionState: remote.channel.getConnectionState(),
  };
}

/** A `ReactorHost` over one monitor reactor; the worker entry adds `onconnect`. */
export function createMonitorWorkerHost(
  options: MonitorWorkerHostOptions = {},
): MonitorWorkerHost {
  const build = options.build ?? buildWorkerReactor;
  let built: BuiltWorkerReactor | undefined;

  // Per call: an op can arrive before the first hello has built anything.
  function requireBuilt(): BuiltWorkerReactor {
    if (!built) {
      throw new Error("Reactor not built");
    }
    return built;
  }

  function requireSync() {
    const current = requireBuilt();
    const syncModule = current.module.reactorModule?.syncModule;
    if (!syncModule) {
      throw new Error("SyncManager not available");
    }
    return { current, syncModule };
  }

  function requireLocalPeers() {
    const { current, syncModule } = requireSync();
    if (!current.localChannelPorts) {
      throw new Error(
        "Worker reactor has no local sync ports to adopt a peer into",
      );
    }
    return {
      syncManager: syncModule.syncManager,
      registry: current.localChannelPorts,
    };
  }

  const db: IReactorDbQuery = {
    queryDb: (sql, params) => requireBuilt().dbQuery.queryDb(sql, params),
  };

  const host = new ReactorHost({
    namespace: options.workerName ?? "",
    build: async (raw): Promise<IReactorClient> => {
      let phase = "building reactor";
      try {
        const next = await build(raw, options.importers, {
          onUnrecoverable: () =>
            host.broadcastReload("reactor store poisoned", crypto.randomUUID()),
        });
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
        const partial = built;
        built = undefined;
        await partial?.shutdown().catch(() => undefined);
        throw error;
      }
    },
    registerPackages: async (specs, sources) => {
      await requireBuilt().registerPackages(specs, sources);
    },
    onSyncOp: async (method, args) => {
      const { syncModule } = requireSync();
      if (isSyncInspectionOp(method)) {
        return dispatchSyncInspectionOp(
          { inspector: syncModule.syncInspector, admin: syncModule.syncAdmin },
          ACCESS,
          method,
          args,
        );
      }
      const syncManager = syncModule.syncManager;
      switch (method) {
        case "list":
          return syncManager.list().map(toWireRemote);
        case "add": {
          const [name, collectionIdKey, channelConfig, filter, remoteOptions] =
            args as [
              string,
              string,
              ChannelConfig,
              RemoteFilter | undefined,
              RemoteOptions | undefined,
            ];
          const remote = await syncManager.add(
            name,
            DriveCollectionId.fromKey(collectionIdKey),
            channelConfig,
            filter,
            remoteOptions,
          );
          return toWireRemote(remote);
        }
        case "bindRemote":
          await syncManager.bindRemote(args[0] as string, args[1] as string);
          return undefined;
        case "setPeerManifest":
          await syncManager.setPeerManifest(
            args[0] as string,
            args[1] as PeerManifest | null,
          );
          return undefined;
        case "peerAgreementBasis":
          return syncManager.agreement().basis();
        case "listHolds":
          return syncManager.listHolds(
            args[0] as { remoteName?: string; documentId?: string } | undefined,
          );
        case "remove":
          await syncManager.remove(args[0] as string);
          return undefined;
        case "triggerPull":
          syncManager.triggerPull(args[0] as string);
          return undefined;
        default:
          throw new Error(`Unknown sync op: ${method}`);
      }
    },
    onInspectorOp: (method, args) =>
      dispatchInspectorOp(
        { inspector: requireBuilt().inspector, dbQuery: db },
        ACCESS,
        method,
        args,
      ),
    onAdoptSyncPeer: async (params, port) => {
      const { syncManager, registry } = requireLocalPeers();
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
    onRemoveSyncPeer: async (params) => {
      const { syncManager, registry } = requireLocalPeers();
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

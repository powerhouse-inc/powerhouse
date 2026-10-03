import type { IReactorClient, IReactorDbQuery } from "@powerhousedao/reactor";
import {
  dispatchInspectorOp,
  FORWARDED_EVENT_TYPES,
  ReactorHost,
  SYNC_STATUS_CHANGED_EVENT,
} from "@powerhousedao/reactor-browser/rpc";
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

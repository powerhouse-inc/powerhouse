import { buildMonitorReactor } from "./build-reactor.js";
import { reactorStorageNamespace } from "./naming.js";
import type {
  ManagedInProcessReactor,
  MonitorInProcessClientModule,
  ReactorDescriptor,
} from "./types.js";

/**
 * Provisions a reactor on the current thread.
 *
 * The no-worker fallback (plan stage 2) and the path the library's own tests
 * exercise: the whole graph is reachable directly, so the inspector is a
 * `ReactorInspector` over live components rather than an RPC proxy, and
 * `dbQuery` goes straight at the PGlite handle.
 *
 * `descriptor.packages` is ignored — package loading is the worker path's
 * mechanism; in-process callers pass modules in `documentModelModules`.
 */
export async function provisionInProcess(
  descriptor: ReactorDescriptor,
): Promise<ManagedInProcessReactor> {
  const namespace = reactorStorageNamespace(descriptor.name);
  const built = await buildMonitorReactor({
    namespace,
    storage: descriptor.storage,
    documentModelModules: descriptor.documentModelModules,
    upgradeManifests: descriptor.upgradeManifests,
    featureFlags: descriptor.featureFlags,
    channelScheme: descriptor.sync?.channelScheme,
    jwtHandler: descriptor.sync?.jwtHandler,
    signer: descriptor.signer,
  });

  const reactorModule = built.module.reactorModule;
  const module: MonitorInProcessClientModule = {
    ...built.module,
    kind: "in-process",
    reactorModule: reactorModule
      ? { ...reactorModule, pg: built.pg }
      : undefined,
  };

  return {
    name: descriptor.name,
    kind: "in-process",
    client: built.module.client,
    inspector: built.inspector,
    dbQuery: built.dbQuery,
    syncManager: reactorModule?.syncModule?.syncManager,
    events: built.module.eventBus,
    module,
    kill: built.shutdown,
    isShutdown: built.isShutdown,
  };
}

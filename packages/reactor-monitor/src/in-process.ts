import { messagePortTransport } from "@powerhousedao/reactor";
import { buildMonitorReactor } from "./build-reactor.js";
import { reactorCapabilities } from "./capabilities.js";
import { reactorStorageNamespace } from "./naming.js";
import {
  assertCollectionIdParts,
  registerLocalPeer,
} from "./sync/adopt-sync-peer.js";
import type { AdoptLocalSyncPeerLink } from "./sync/types.js";
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
    localSync: descriptor.sync?.local,
    jwtHandler: descriptor.sync?.jwtHandler,
    signer: descriptor.signer,
  });

  const reactorModule = built.module.reactorModule;
  const syncManager = reactorModule?.syncModule?.syncManager;
  const localChannelPorts = built.localChannelPorts;
  // Present only when local sync is wired and a sync manager exists; the broker
  // (linkLocalSync) hands this reactor one end of the channel directly, so an
  // in-process adopt needs no transfer -- the node/browser port is wrapped and
  // registered, then the local remote is added.
  const localSync =
    localChannelPorts && syncManager
      ? {
          adoptLocalSyncPeer: async (
            link: AdoptLocalSyncPeerLink,
          ): Promise<void> => {
            // Checked here too, not only in linkLocalSync: adoptLocalSyncPeer
            // is a public handle method, so a caller can reach it directly.
            assertCollectionIdParts(
              link.collectionId.driveId,
              link.collectionId.branch,
            );
            await registerLocalPeer(
              syncManager,
              localChannelPorts,
              {
                peerId: link.peerId,
                channelName: link.channelName,
                collectionId: link.collectionId,
                remoteName: link.remoteName,
                filter: link.filter,
              },
              messagePortTransport(link.port),
            );
          },
          removeLocalSyncPeer: async (
            remoteName: string,
            peerId: string,
            channelName: string,
          ): Promise<void> => {
            await syncManager.remove(remoteName);
            localChannelPorts.unregister(peerId, channelName);
          },
        }
      : undefined;
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
    capabilities: reactorCapabilities(descriptor, {
      canSelfHeal: built.canSelfHeal,
    }),
    client: built.module.client,
    inspector: built.inspector,
    dbQuery: built.dbQuery,
    syncManager,
    events: built.module.eventBus,
    module,
    ...(localSync ?? {}),
    kill: built.shutdown,
    isShutdown: built.isShutdown,
  };
}

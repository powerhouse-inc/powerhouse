import {
  assertCollectionIdParts,
  LOCAL_CHANNEL_TYPE,
  messagePortTransport,
  registerLocalPeer,
  removeLocalPeer,
} from "@powerhousedao/reactor";
import { buildMonitorReactor } from "./build-reactor.js";
import {
  toMonitorInspector,
  toMonitorSyncManager,
} from "./monitor-inspector.js";
import { reactorStorageNamespace } from "./naming.js";
import type { AdoptLocalSyncPeerLink } from "./sync/types.js";
import type {
  ManagedInProcessReactor,
  MonitorInProcessClientModule,
  ReactorDescriptor,
} from "./types.js";

export type ProvisionInProcessOptions = {
  /** The reactor's store was poisoned; the handle is dead and should be killed. */
  onUnrecoverable?: (cause: Error) => void;
};

/** Ignores `descriptor.packages`; pass modules in `documentModelModules`. */
export async function provisionInProcess(
  descriptor: ReactorDescriptor,
  options: ProvisionInProcessOptions = {},
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
    attachments: descriptor.attachments,
    ...(options.onUnrecoverable
      ? { onUnrecoverable: options.onUnrecoverable }
      : {}),
  });

  let info;
  try {
    info = await built.inspector.info();
  } catch (error) {
    await built.shutdown();
    throw error;
  }

  const reactorModule = built.module.reactorModule;
  const syncModule = reactorModule?.syncModule;
  const syncManager = syncModule?.syncManager;
  const syncInspector = syncModule?.syncInspector;
  const syncAdmin = syncModule?.syncAdmin;
  const localChannelPorts = built.localChannelPorts;
  const localSync =
    localChannelPorts &&
    syncManager &&
    info.syncChannels.includes(LOCAL_CHANNEL_TYPE)
      ? {
          adoptLocalSyncPeer: async (
            link: AdoptLocalSyncPeerLink,
          ): Promise<void> => {
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
          ): Promise<void> =>
            removeLocalPeer(syncManager, localChannelPorts, {
              remoteName,
              peerId,
              channelName,
            }),
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
    reach: { hosting: "in-process", inspection: "direct" },
    info,
    client: built.module.client,
    inspector: toMonitorInspector(built.inspector),
    admin: built.inspector,
    processorLevers: built.inspector,
    keyframeLevers: built.inspector,
    dbQuery: built.dbQuery,
    syncManager:
      syncManager && syncInspector
        ? toMonitorSyncManager(syncManager, syncInspector)
        : undefined,
    ...(syncAdmin ? { syncAdmin } : {}),
    events: built.module.eventBus,
    module,
    ...(built.attachments ? { attachments: built.attachments.managed } : {}),
    ...(localSync ?? {}),
    kill: built.shutdown,
    isShutdown: built.isShutdown,
  };
}

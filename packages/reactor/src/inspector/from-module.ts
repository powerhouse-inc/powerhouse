import { DocumentIntegrityService } from "../admin/document-integrity-service.js";
import type { InProcessReactorModule } from "../core/types.js";
import { InMemoryQueue } from "../queue/queue.js";
import { channelFactoryTypes } from "../sync/channels/channel-factory-types.js";
import { DriveInspection } from "./drive-inspection.js";
import { ReactorInspector } from "./reactor-inspector.js";
import type {
  IInspectableAttachmentStore,
  InspectorAccess,
  IStorageHealthProvider,
} from "./types.js";

export type ReactorInspectorOptions = {
  /** Absent: health reports `tracked: false`. */
  storageHealth?: IStorageHealthProvider;
  attachmentStore?: IInspectableAttachmentStore;
  /** The tiers the host serves beyond reads; defaults to reads only. */
  access?: InspectorAccess;
  /** Set later through `setWorkflows` when the runtime is composed after build. */
  workflows?: boolean;
};

/** The in-process inspector over a built module; drive reads run as the host. */
export function createReactorInspector(
  module: InProcessReactorModule,
  options: ReactorInspectorOptions = {},
): ReactorInspector {
  return new ReactorInspector({
    queue: module.queue instanceof InMemoryQueue ? module.queue : undefined,
    processorManager: module.processorManager,
    catchUp: module.catchUp,
    integrity: new DocumentIntegrityService(
      module.keyframeStore,
      module.operationStore,
      module.writeCache,
      module.documentView,
      module.documentModelRegistry,
    ),
    storageHealth: options.storageHealth,
    documentModelRegistry: module.documentModelRegistry,
    drives: new DriveInspection(module.reactor, module.documentModelRegistry),
    attachmentStore: options.attachmentStore,
    facts: {
      storage: module.storageFacts,
      syncChannels: module.syncModule
        ? channelFactoryTypes(module.syncModule.channelFactory)
        : [],
      access: options.access,
      workflows: options.workflows,
    },
  });
}

import {
  createReactorInspector,
  READ_ONLY_ACCESS,
  type IDocumentModelRegistry,
  type IInspectableAttachmentStore,
  type IInspector,
  type IInspectorAdmin,
  type InProcessReactorModule,
  type IReactorFactsSink,
  type IInspectorStorageHealthProvider,
  type ISyncInspector,
} from "@powerhousedao/reactor";
import {
  InspectionThrottle,
  type InspectionThrottleConfig,
} from "./throttle.js";

/** What the inspection subgraph serves. Only reads cross GraphQL. */
export interface IReactorInspectionSource {
  /** Reads as the host; drive and document reads are re-made as the caller. */
  readonly inspector: IInspector;
  readonly syncInspector: ISyncInspector | undefined;
  readonly documentModelRegistry: IDocumentModelRegistry;
  /** Facts the host learns after boot, e.g. a composed workflow runtime. */
  readonly facts: IReactorFactsSink;
  readonly throttle: InspectionThrottle;
  /** Present when the host serves `inspection-admin`; only listed admins reach it. */
  readonly admin: IInspectorAdmin | undefined;
}

export type ReactorInspectionOptions = {
  /** Absent: a group-commit store's own health, else `tracked: false`. */
  storageHealth?: IInspectorStorageHealthProvider;
  attachmentStore?: IInspectableAttachmentStore;
  workflows?: boolean;
  throttle?: Partial<InspectionThrottleConfig>;
  /** Serve the `inspection-admin` levers to listed admins. Off by default. */
  admin?: boolean;
};

export function createReactorInspectionSource(
  module: InProcessReactorModule,
  options: ReactorInspectionOptions = {},
): IReactorInspectionSource {
  // Levers are not served over GraphQL, so the transport reports reads only.
  const inspector = createReactorInspector(module, {
    storageHealth: options.storageHealth,
    attachmentStore: options.attachmentStore,
    workflows: options.workflows,
    access: READ_ONLY_ACCESS,
  });
  return {
    inspector,
    syncInspector: module.syncModule?.syncInspector,
    documentModelRegistry: module.documentModelRegistry,
    facts: inspector,
    throttle: new InspectionThrottle(options.throttle),
    admin: options.admin ? inspector : undefined,
  };
}

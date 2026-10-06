import {
  createReactorInspector,
  READ_ONLY_ACCESS,
  type IDocumentModelRegistry,
  type IInspectableAttachmentStore,
  type IInspector,
  type InProcessReactorModule,
  type IReactorFactsSink,
  type IStorageHealthProvider,
  type ISyncInspector,
} from "@powerhousedao/reactor";

/** What the inspection subgraph serves. Only reads cross GraphQL. */
export interface IReactorInspectionSource {
  /** Reads as the host; drive and document reads are re-made as the caller. */
  readonly inspector: IInspector;
  readonly syncInspector: ISyncInspector | undefined;
  readonly documentModelRegistry: IDocumentModelRegistry;
  /** Facts the host learns after boot, e.g. a composed workflow runtime. */
  readonly facts: IReactorFactsSink;
}

export type ReactorInspectionOptions = {
  /** Absent: storage health reports `tracked: false`. */
  storageHealth?: IStorageHealthProvider;
  attachmentStore?: IInspectableAttachmentStore;
  workflows?: boolean;
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
  };
}

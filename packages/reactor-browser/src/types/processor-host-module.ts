import type {
  IProcessorHostModuleBase,
  IReactorClient,
  ProcessorFactory,
  ReactorReadModels,
} from "@powerhousedao/reactor";
import type { IAttachmentClient } from "@powerhousedao/reactor-attachments/client";

/**
 * Module hosts pass to processor factories. Declared here (not in shared)
 * because shared cannot depend on reactor or reactor-attachments.
 * Keep in sync with `IProcessorHostModule` in @powerhousedao/reactor-api.
 */
export interface IProcessorHostModule extends IProcessorHostModuleBase {
  client: IReactorClient;
  attachments: IAttachmentClient;
  /**
   * Retrieves a registered read model by name.
   *
   * Reactor-registered names are typed via `ReactorReadModels` — hover a key
   * there for what each model holds:
   * - `"document-view"` (materialized document state, `IDocumentView`)
   * - `"document-indexer"` (document relationship graph, `IDocumentIndexer`).
   *
   * Other names return the caller-supplied type.
   * Throws if no read model with that name is registered.
   */
  getReadModel<K extends keyof ReactorReadModels>(
    name: K,
  ): ReactorReadModels[K];
  getReadModel<T>(name: string): T;
}

/** @deprecated Use `IProcessorHostModule`. */
export type IReactorProcessorHostModule = IProcessorHostModule;

/** Takes the host module and builds processor factories using its context. */
export type ProcessorFactoryBuilder = (
  module: IProcessorHostModule,
) => Promise<ProcessorFactory> | ProcessorFactory;

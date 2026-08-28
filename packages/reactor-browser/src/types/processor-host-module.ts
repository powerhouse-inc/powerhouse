import type {
  IProcessorHostModuleBase,
  IReactorClient,
  ProcessorFactory,
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
}

/** @deprecated Use `IProcessorHostModule`. */
export type IReactorProcessorHostModule = IProcessorHostModule;

/** Takes the host module and builds processor factories using its context. */
export type ProcessorFactoryBuilder = (
  module: IProcessorHostModule,
) => Promise<ProcessorFactory> | ProcessorFactory;

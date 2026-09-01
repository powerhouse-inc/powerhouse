import type {
  IReactorProcessorHostModuleBase,
  ProcessorFactoryBuilder as BaseProcessorFactoryBuilder,
} from "@powerhousedao/reactor";
import type { IAttachmentClient } from "@powerhousedao/reactor-attachments/client";

/**
 * Module hosts pass to processor factories: the reactor-level module plus the
 * attachment client, which shared and reactor cannot name.
 */
export interface IProcessorHostModule extends IReactorProcessorHostModuleBase {
  attachments: IAttachmentClient;
}

/** @deprecated Use `IProcessorHostModule`. */
export type IReactorProcessorHostModule = IProcessorHostModule;

/** Takes the host module and builds processor factories using its context. */
export type ProcessorFactoryBuilder =
  BaseProcessorFactoryBuilder<IProcessorHostModule>;

import type {
  IProcessorHostModule,
  IReactorClient,
} from "@powerhousedao/reactor";
import type { IAttachmentClient } from "@powerhousedao/reactor-attachments/client";

/**
 * Processor host module enriched with the reactor client and attachment client.
 * Defined here rather than in shared because shared cannot depend on reactor or
 * reactor-attachments without creating a circular package reference.
 */
export interface IReactorProcessorHostModule extends IProcessorHostModule {
  client: IReactorClient;
  attachments: IAttachmentClient;
}

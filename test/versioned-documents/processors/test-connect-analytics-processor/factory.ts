import type {
  IProcessorHostModule,
  ProcessorApp,
  ProcessorFactoryBuilder,
} from "@powerhousedao/reactor-browser";
import { type PHDocumentHeader } from "document-model";
import { TestConnectAnalyticsProcessorProcessor } from "./processor.js";

export const testConnectAnalyticsProcessorProcessorFactory: ProcessorFactoryBuilder =

    (module: IProcessorHostModule) =>
    (driveHeader: PHDocumentHeader, processorApp?: ProcessorApp) => {
      return [
        {
          processor: new TestConnectAnalyticsProcessorProcessor(
            module.analyticsStore,
          ),
          filter: {
            branch: ["main"],
            documentId: ["*"],
            scope: ["*"],
            documentType: ["*"],
          },
        },
      ];
    };

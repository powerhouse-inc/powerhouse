import type {
  ProcessorRecord,
  IProcessorHostModule,
} from "@powerhousedao/reactor-browser";
import { type PHDocumentHeader } from "document-model";
import type { ProcessorApp } from "@powerhousedao/common";
import { TestConnectAnalyticsProcessorProcessor } from "./index.js";

export const testConnectAnalyticsProcessorProcessorFactory =
  (module: IProcessorHostModule) =>
  (
    driveHeader: PHDocumentHeader,
    processorApp?: ProcessorApp,
  ): ProcessorRecord[] => {
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

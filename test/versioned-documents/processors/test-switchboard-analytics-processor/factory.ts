import type {
  IProcessorHostModule,
  ProcessorApp,
  ProcessorRecord,
} from "@powerhousedao/reactor";
import { type PHDocumentHeader } from "document-model";
import { TestSwitchboardAnalyticsProcessorProcessor } from "./index.js";

export const testSwitchboardAnalyticsProcessorProcessorFactory =
  (module: IProcessorHostModule) =>
  (
    driveHeader: PHDocumentHeader,
    processorApp?: ProcessorApp,
  ): ProcessorRecord[] => {
    return [
      {
        processor: new TestSwitchboardAnalyticsProcessorProcessor(
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

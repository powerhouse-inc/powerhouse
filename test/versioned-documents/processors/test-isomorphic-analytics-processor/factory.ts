import type {
    IProcessorHostModule,
    ProcessorApp,
    ProcessorRecord,
} from "@powerhousedao/reactor-browser";
import { type PHDocumentHeader } from "document-model";
import { TestIsomorphicAnalyticsProcessorProcessor } from "./index.js";

export const testIsomorphicAnalyticsProcessorProcessorFactory =
  (module: IProcessorHostModule) =>
  (
    driveHeader: PHDocumentHeader,
    processorApp?: ProcessorApp,
  ): ProcessorRecord[] => {
    return [
      {
        processor: new TestIsomorphicAnalyticsProcessorProcessor(
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

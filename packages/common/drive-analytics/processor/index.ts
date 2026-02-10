import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type { ProcessorRecordLegacy } from "document-drive";
import type { PHDocumentHeader } from "document-model";
import { DocumentAnalyticsProcessor } from "./document-processor.js";
import { DriveAnalyticsProcessor } from "./drive-processor.js";

export const processorFactory =
  (module: { analyticsStore: IAnalyticsStore }) =>
  (driveHeader: PHDocumentHeader): ProcessorRecordLegacy[] => {
    return [
      {
        processor: new DriveAnalyticsProcessor(module.analyticsStore),
        filter: {
          branch: ["main"],
          documentId: ["*"],
          scope: ["*"],
          documentType: ["powerhouse/document-drive"],
        },
      },
      {
        processor: new DocumentAnalyticsProcessor(module.analyticsStore),
        filter: {
          branch: ["main"],
          documentId: ["*"],
          scope: ["*"],
          documentType: ["*"],
        },
      },
    ];
  };

export * from "./document-processor.js";
export * from "./drive-processor.js";
export * from "./types.js";

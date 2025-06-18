import { type IAnalyticsStore } from "@powerhousedao/reactor-api";
import { type ProcessorRecord } from "document-drive/processors/types";

import { DriveAnalyticsProcessor } from "./processor.js";

export const processorFactory =
  (module: { analyticsStore: IAnalyticsStore }) =>
  (driveId: string): ProcessorRecord[] => {
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
    ];
  };

export * from "./processor.js";

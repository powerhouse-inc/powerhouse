import type { IAnalyticsStore } from "../../analytics/types.js";
import type { PHDocumentHeader } from "../../document-model/documents.js";
import type { ProcessorRecord } from "../types.js";
import { DocumentAnalyticsProcessor } from "./document-processor.js";
import { DriveAnalyticsProcessor } from "./drive-processor.js";

export const processorFactory =
  (module: { analyticsStore: IAnalyticsStore }) =>
  (driveHeader: PHDocumentHeader): ProcessorRecord[] => {
    // Omitted filter fields match every value. Only `documentId` honours "*",
    // so "*" in `scope`/`documentType`/`branch` would match nothing at all.
    return [
      {
        processor: new DriveAnalyticsProcessor(module.analyticsStore),
        filter: {
          branch: ["main"],
          documentId: ["*"],
          documentType: ["powerhouse/document-drive"],
        },
      },
      {
        processor: new DocumentAnalyticsProcessor(module.analyticsStore),
        filter: {
          branch: ["main"],
          documentId: ["*"],
        },
      },
    ];
  };

export * from "./document-processor.js";
export * from "./drive-processor.js";
export * from "./types.js";

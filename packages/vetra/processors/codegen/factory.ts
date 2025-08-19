import {
  type IProcessorHostModule,
  type ProcessorRecord,
} from "document-drive/processors/types";
import { CodegenProcessor } from "./index.js";

export const codegenProcessorFactory =
  (module: IProcessorHostModule) =>
  (driveId: string): ProcessorRecord[] => {
    // Create the processor
    if (driveId !== "vetra") {
      return [];
    }

    const processor = new CodegenProcessor();
    return [
      {
        processor,
        filter: {
          branch: ["main"],
          documentId: ["*"],
          documentType: [
            "powerhouse/document-model",
            "powerhouse/package",
            "powerhouse/document-editor",
            "powerhouse/subgraph",
            "powerhouse/processor",
            "powerhouse/app",
          ],
          scope: ["global"],
        },
      },
    ];
  };

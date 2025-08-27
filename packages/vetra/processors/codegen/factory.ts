import {
  type IProcessorHostModule,
  type ProcessorRecord,
} from "document-drive";
import { type PHDocumentHeader } from "document-model";
import { CodegenProcessor } from "./index.js";

export const codegenProcessorFactory =
  (module: IProcessorHostModule) =>
  (driveHeader: PHDocumentHeader): ProcessorRecord[] => {
    // Create the processor
    if (driveHeader.slug !== "vetra") {
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

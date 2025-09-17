import {
  VETRA_PROCESSOR_CONFIG_KEY,
  type VetraProcessorConfigType,
} from "@powerhousedao/config/powerhouse";
import type {
  IProcessorHostModule,
  ProcessorRecord,
} from "document-drive/processors/types";
import type { PHDocumentHeader } from "document-model";
import { CodegenProcessor } from "./index.js";

export const codegenProcessorFactory =
  (module: IProcessorHostModule) =>
  (driveHeader: PHDocumentHeader): ProcessorRecord[] => {
    // Create the processor
    const processorsConfig = module.config ?? new Map<string, unknown>();
    const vetraConfig = processorsConfig.get(VETRA_PROCESSOR_CONFIG_KEY) as
      | VetraProcessorConfigType
      | undefined;

    const vetraDriveId = vetraConfig?.driveId ?? "vetra";

    if (driveHeader.slug !== vetraDriveId && driveHeader.id !== vetraDriveId) {
      return [];
    }

    const processor = new CodegenProcessor(vetraConfig?.interactive);
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

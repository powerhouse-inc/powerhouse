import {
  type IProcessorHostModule,
  type ProcessorRecord,
  type RelationalDbProcessorFilter,
} from "document-drive";
import { type PHDocumentHeader } from "document-model";
import { VetraReadModelProcessor } from "./index.js";

export const vetraReadModelProcessorFactory =
  (module: IProcessorHostModule) =>
  async (driveHeader: PHDocumentHeader): Promise<ProcessorRecord[]> => {
    // Create a namespace for the processor and the provided drive id
    const namespace = VetraReadModelProcessor.getNamespace(driveHeader.id);

    // Create a namespaced db for the processor
    const store =
      await module.relationalDb.createNamespace<VetraReadModelProcessor>(
        namespace,
      );

    // Create a filter for the processor
    const filter: RelationalDbProcessorFilter = {
      branch: ["main"],
      documentId: ["*"],
      documentType: ["powerhouse/package"],
      scope: ["global"],
    };

    // Create the processor
    const processor = new VetraReadModelProcessor(namespace, filter, store);
    return [
      {
        processor,
        filter,
      },
    ];
  };

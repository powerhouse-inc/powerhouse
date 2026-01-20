import {
  type IProcessorHostModule,
  type ProcessorRecord,
  type RelationalDbProcessorFilter,
} from "document-drive";
import { type PHDocumentHeader } from "document-model";
import { VetraReadModelProcessorLegacy } from "./index.legacy.js";

export const vetraReadModelProcessorFactoryLegacy =
  (module: IProcessorHostModule) =>
  async (driveHeader: PHDocumentHeader): Promise<ProcessorRecord[]> => {
    // Create a namespace for the processor and the provided drive id
    const namespace = VetraReadModelProcessorLegacy.getNamespace(
      driveHeader.id,
    );

    // Create a namespaced db for the processor
    const store =
      await module.relationalDb.createNamespace<VetraReadModelProcessorLegacy>(
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
    const processor = new VetraReadModelProcessorLegacy(
      namespace,
      filter,
      store,
    );
    return [
      {
        processor,
        filter,
      },
    ];
  };

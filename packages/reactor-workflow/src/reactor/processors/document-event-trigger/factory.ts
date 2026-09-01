import type {
  IProcessorHostModule,
  ProcessorApp,
  ProcessorFactoryBuilder,
  ProcessorFilter,
} from "@powerhousedao/reactor-browser";
import type { PHDocumentHeader } from "document-model";
import { DocumentEventTrigger } from "./processor.js";

export const documentEventTriggerFactoryBuilder: ProcessorFactoryBuilder =
  (module: IProcessorHostModule) =>
  async (driveHeader: PHDocumentHeader, _processorApp?: ProcessorApp) => {
    // Create a namespace for the processor and the provided drive id
    const namespace = DocumentEventTrigger.getNamespace(driveHeader.id);

    // Create a namespaced db for the processor
    const store =
      await module.relationalDb.createNamespace<DocumentEventTrigger>(
        namespace,
      );

    // Create a filter for the processor. An omitted field matches every value.
    // Only `documentId` honours "*", so "*" elsewhere would match nothing.
    // documentType omitted: an omitted field matches every value.
    const filter: ProcessorFilter = {
      branch: ["main"],
      documentId: ["*"],
      scope: ["global"],
    };

    // Create the processor
    const processor = new DocumentEventTrigger(namespace, filter, store);

    // Run the processor's migrations. Nothing in the runtime calls this, so
    // without it the first write hits a database with no tables.
    await processor.initAndUpgrade();

    return [
      {
        processor,
        filter,
      },
    ];
  };

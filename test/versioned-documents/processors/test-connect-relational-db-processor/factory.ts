import type {
    IProcessorHostModule,
    ProcessorApp,
    ProcessorFilter,
    ProcessorRecord,
} from "@powerhousedao/reactor-browser";
import type { PHDocumentHeader } from "document-model";
import { TestConnectRelationalDbProcessorProcessor } from "./index.js";

export const testConnectRelationalDbProcessorProcessorFactory =
  (module: IProcessorHostModule) =>
  async (
    driveHeader: PHDocumentHeader,
    processorApp?: ProcessorApp,
  ): Promise<ProcessorRecord[]> => {
    // Create a namespace for the processor and the provided drive id
    const namespace = TestConnectRelationalDbProcessorProcessor.getNamespace(
      driveHeader.id,
    );

    // Create a namespaced db for the processor
    const store =
      await module.relationalDb.createNamespace<TestConnectRelationalDbProcessorProcessor>(
        namespace,
      );

    // Create a filter for the processor
    const filter: ProcessorFilter = {
      branch: ["main"],
      documentId: ["*"],
      documentType: ["*"],
      scope: ["global"],
    };

    // Create the processor
    const processor = new TestConnectRelationalDbProcessorProcessor(
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

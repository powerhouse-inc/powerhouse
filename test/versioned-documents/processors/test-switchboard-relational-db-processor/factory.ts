import type {
  IProcessorHostModule,
  ProcessorApp,
  ProcessorFilter,
  ProcessorRecord,
} from "@powerhousedao/reactor";
import type { PHDocumentHeader } from "document-model";
import { TestSwitchboardRelationalDbProcessorProcessor } from "./processor.js";

export const testSwitchboardRelationalDbProcessorProcessorFactory =
  (module: IProcessorHostModule) =>
  async (
    driveHeader: PHDocumentHeader,
    processorApp?: ProcessorApp,
  ): Promise<ProcessorRecord[]> => {
    // Create a namespace for the processor and the provided drive id
    const namespace =
      TestSwitchboardRelationalDbProcessorProcessor.getNamespace(
        driveHeader.id,
      );

    // Create a namespaced db for the processor
    const store =
      await module.relationalDb.createNamespace<TestSwitchboardRelationalDbProcessorProcessor>(
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
    const processor = new TestSwitchboardRelationalDbProcessorProcessor(
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

import type {
  IProcessorHostModule,
  ProcessorApp,
  ProcessorFilter,
  ProcessorRecord,
} from "@powerhousedao/reactor";
import type { PHDocumentHeader } from "document-model";
import { TestIsomorphicRelationalDbProcessorProcessor } from "./index.js";

export const testIsomorphicRelationalDbProcessorProcessorFactory =
  (module: IProcessorHostModule) =>
  async (
    driveHeader: PHDocumentHeader,
    processorApp?: ProcessorApp,
  ): Promise<ProcessorRecord[]> => {
    // Create a namespace for the processor and the provided drive id
    const namespace = TestIsomorphicRelationalDbProcessorProcessor.getNamespace(
      driveHeader.id,
    );

    // Create a namespaced db for the processor
    const store =
      await module.relationalDb.createNamespace<TestIsomorphicRelationalDbProcessorProcessor>(
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
    const processor = new TestIsomorphicRelationalDbProcessorProcessor(
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

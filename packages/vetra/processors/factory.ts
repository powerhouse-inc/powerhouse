import type { ProcessorFactory, ProcessorRecord } from "@powerhousedao/reactor";
import type { IProcessorHostModule } from "document-drive";
import type { PHDocumentHeader } from "document-model";
import { codegenProcessorFactory } from "./codegen/factory.js";
import { vetraReadModelProcessorFactory } from "./vetra-read-model/factory.js";

/**
 * This file aggregates all processor factories for the new reactor
 */

export const processorFactory = (module: IProcessorHostModule) => {
  // Initialize all processor factories once with the module
  const factories: Array<ProcessorFactory> = [];

  // Add all processor factories
  factories.push(vetraReadModelProcessorFactory(module));
  factories.push(codegenProcessorFactory(module));

  // Return the inner function that will be called for each drive
  return async (driveHeader: PHDocumentHeader) => {
    const processors: ProcessorRecord[] = [];

    // Call each cached factory with the driveHeader
    for (const factory of factories) {
      processors.push(...(await factory(driveHeader)));
    }

    return processors;
  };
};

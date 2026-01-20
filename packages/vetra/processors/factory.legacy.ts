import { vetraReadModelProcessorFactoryLegacy } from "./vetra-read-model/factory.legacy.js";
/**
 * This file aggregates all legacy processor factories
 */

import type {
  IProcessorHostModule,
  ProcessorFactory,
  ProcessorRecord,
} from "document-drive";
import type { PHDocumentHeader } from "document-model";

// Import other processor factories here as they are generated
import { codegenProcessorFactoryLegacy } from "./codegen/factory.legacy.js";

export const processorFactoryLegacy = (module: IProcessorHostModule) => {
  // Initialize all processor factories once with the module
  const factories: Array<ProcessorFactory> = [];

  // Add all processor factories
  factories.push(vetraReadModelProcessorFactoryLegacy(module));

  // Add other processors here as they are generated
  factories.push(codegenProcessorFactoryLegacy(module));

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

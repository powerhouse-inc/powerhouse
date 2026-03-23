import { vetraReadModelProcessorFactoryLegacy } from "./vetra-read-model/factory.legacy.js";
/**
 * This file aggregates all legacy processor factories
 */

import type {
  IProcessorHostModuleLegacy,
  ProcessorFactoryLegacy,
  ProcessorRecordLegacy,
} from "document-drive";
import type { PHDocumentHeader } from "@powerhousedao/shared/document-model";

export const processorFactoryLegacy = (module: IProcessorHostModuleLegacy) => {
  // Initialize all processor factories once with the module
  const factories: Array<ProcessorFactoryLegacy> = [];

  // Add all processor factories
  factories.push(vetraReadModelProcessorFactoryLegacy(module));

  // Return the inner function that will be called for each drive
  return async (driveHeader: PHDocumentHeader) => {
    const processors: ProcessorRecordLegacy[] = [];

    // Call each cached factory with the driveHeader
    for (const factory of factories) {
      processors.push(...(await factory(driveHeader)));
    }

    return processors;
  };
};

/**
 * Processors Index
 *
 * This file exports all processors and aggregates them into a single factory
 */
import type {
  IProcessorHostModule,
  ProcessorFactory,
  ProcessorRecord,
} from "document-drive";
import type { PHDocumentHeader } from "document-model";
import { todoListProcessorFactory } from "./todo-list/index.js";

// Export individual processor  
export * as TodoListProcessor from "./todo-list/index.js";
export { todoListProcessorFactory } from "./todo-list/index.js";

// Aggregated processor factory (combines all processors)
export const processorFactory = (module: IProcessorHostModule) => {
  const factories: Array<ProcessorFactory> = [];

  // Add all processor factories
  factories.push(todoListProcessorFactory(module));

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

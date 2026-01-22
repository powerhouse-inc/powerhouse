import {
  type ProcessorRecord,
  type IProcessorHostModule,
} from "document-drive/processors/types";
import { type RelationalDbProcessorFilter } from "document-drive";
import { TodoListProcessor } from "./processor.js";

/**
 * TodoList Processor Factory
 * Following the exact pattern from the RelationalDbProcessor documentation
 */
export const todoListProcessorFactory =
  (module: IProcessorHostModule) =>
  async (driveId: string): Promise<ProcessorRecord[]> => {
    // Create a namespace for the processor and the provided drive id
    // Namespaces prevent data collisions between different drives
    const namespace = TodoListProcessor.getNamespace(driveId);

    // Create a namespaced db for the processor
    // This ensures each drive gets its own isolated database tables
    const store =
      await module.relationalDb.createNamespace<TodoListProcessor>(
        namespace,
      );

    // Create a filter for the processor
    // This determines which document changes trigger the processor
    const filter: RelationalDbProcessorFilter = {
      branch: ["main"], // Only process changes from the "main" branch
      documentId: ["*"], // Process changes from any document ID (* = wildcard)
      documentType: ["powerhouse/todo-list"], // Only process todo-list documents
      scope: ["global"], // Process global changes (not user-specific)
    };

    // Create the processor instance
    const processor = new TodoListProcessor(namespace, filter, store);
    return [
      {
        processor,
        filter,
      },
    ];
  };

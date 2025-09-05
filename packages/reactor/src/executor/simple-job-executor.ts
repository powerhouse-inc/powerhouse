import type { IDocumentOperationStorage, IDocumentStorage } from "document-drive/storage/types";
import type { DocumentModelModule, PHDocument } from "document-model";
import type { Job } from "../queue/types.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import type { IJobExecutor } from "./interfaces.js";
import type { JobResult } from "./types.js";

/**
 * Simple job executor that processes a job by applying actions through document model reducers.
 */
export class SimpleJobExecutor implements IJobExecutor {
  constructor(
    private registry: IDocumentModelRegistry,
    private documentStorage: IDocumentStorage,
    private operationStorage: IDocumentOperationStorage,
  ) {}

  /**
   * Execute a single job by applying its action through the appropriate reducer.
   */
  async executeJob(job: Job): Promise<JobResult> {
    const startTime = Date.now();

    let document: PHDocument;
    try {
      document = await this.documentStorage.get(job.documentId);
    } catch (error) {
      return {
        job,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        duration: Date.now() - startTime,
      };
    }

    let module: DocumentModelModule;
    try {
      module = this.registry.getModule(document.header.documentType);
    } catch (error) {
      return {
        job,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        duration: Date.now() - startTime,
      };
    }

    const updatedDocument = module.reducer(
      document as PHDocument,
      job.operation.action,
    );

    const scope = job.scope || "global";
    const operations = updatedDocument.operations[scope];
    if (operations.length === 0) {
      throw new Error("No operation generated from action");
    }

    const newOperation = operations[operations.length - 1];

    // Write the operation to legacy storage
    try {
      await this.operationStorage.addDocumentOperations(
        job.documentId,
        [newOperation],
        updatedDocument,
      );
    } catch (error) {
      return {
        job,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        duration: Date.now() - startTime,
      };
    }

    return {
      job,
      success: true,
      operation: newOperation,
      duration: Date.now() - startTime,
    };
  }
}

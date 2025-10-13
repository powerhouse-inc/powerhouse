import type {
  IDocumentOperationStorage,
  IDocumentStorage,
} from "document-drive";
import type {
  DeleteDocumentActionInput,
  DocumentModelModule,
  PHDocument,
} from "document-model";
import type { Job } from "../queue/types.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import type { IOperationStore } from "../storage/interfaces.js";
import type { IJobExecutor } from "./interfaces.js";
import type { JobResult } from "./types.js";

/**
 * Input type for CREATE_DOCUMENT system actions in the reactor.
 * This is a simplified version that just wraps the complete document.
 */
type CreateDocumentInput = {
  document: PHDocument;
};

/**
 * Simple job executor that processes a job by applying actions through document model reducers.
 */
export class SimpleJobExecutor implements IJobExecutor {
  constructor(
    private registry: IDocumentModelRegistry,
    private documentStorage: IDocumentStorage,
    private operationStorage: IDocumentOperationStorage,
    private operationStore: IOperationStore,
  ) {}

  /**
   * Execute a single job by applying its action through the appropriate reducer.
   */
  async executeJob(job: Job): Promise<JobResult> {
    const startTime = Date.now();

    // Handle system actions specially (CREATE_DOCUMENT, DELETE_DOCUMENT, etc.)
    if (job.operation.action.type === "CREATE_DOCUMENT") {
      return this.executeCreateDocument(job, startTime);
    }

    if (job.operation.action.type === "DELETE_DOCUMENT") {
      return this.executeDeleteDocument(job, startTime);
    }

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

    // Write the operation to new IOperationStore (dual-writing)
    try {
      await this.operationStore.apply(
        job.documentId,
        document.header.documentType,
        scope,
        job.branch,
        newOperation.index,
        (txn) => {
          txn.addOperations(newOperation);
        },
      );
    } catch (error) {
      return {
        job,
        success: false,
        error: new Error(
          `Failed to write operation to IOperationStore: ${error instanceof Error ? error.message : String(error)}`,
        ),
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

  /**
   * Execute a CREATE_DOCUMENT system action.
   * This creates a new document in storage along with its initial operations.
   */
  private async executeCreateDocument(
    job: Job,
    startTime: number,
  ): Promise<JobResult> {
    const action = job.operation.action;
    const input = action.input as CreateDocumentInput;
    const document = input.document;

    // Store the document in storage
    try {
      await this.documentStorage.create(document);
    } catch (error) {
      return {
        job,
        success: false,
        error: new Error(
          `Failed to create document in storage: ${error instanceof Error ? error.message : String(error)}`,
        ),
        duration: Date.now() - startTime,
      };
    }

    // Create the operation from the job
    const operation = job.operation;

    // Write the CREATE_DOCUMENT operation to legacy storage
    try {
      await this.operationStorage.addDocumentOperations(
        document.header.id,
        [operation],
        document,
      );
    } catch (error) {
      return {
        job,
        success: false,
        error: new Error(
          `Failed to write CREATE_DOCUMENT operation to legacy storage: ${error instanceof Error ? error.message : String(error)}`,
        ),
        duration: Date.now() - startTime,
      };
    }

    // Write the operation to new IOperationStore (dual-writing)
    try {
      await this.operationStore.apply(
        document.header.id,
        document.header.documentType,
        job.scope || "global",
        job.branch,
        operation.index,
        (txn) => {
          txn.addOperations(operation);
        },
      );
    } catch (error) {
      return {
        job,
        success: false,
        error: new Error(
          `Failed to write CREATE_DOCUMENT operation to IOperationStore: ${error instanceof Error ? error.message : String(error)}`,
        ),
        duration: Date.now() - startTime,
      };
    }

    return {
      job,
      success: true,
      operation,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Execute a DELETE_DOCUMENT system action.
   * This deletes a document from legacy storage and writes the operation to IOperationStore.
   */
  private async executeDeleteDocument(
    job: Job,
    startTime: number,
  ): Promise<JobResult> {
    const action = job.operation.action;
    const input = action.input as DeleteDocumentActionInput;

    if (!input.documentId) {
      return {
        job,
        success: false,
        error: new Error(
          "DELETE_DOCUMENT action requires a documentId in input",
        ),
        duration: Date.now() - startTime,
      };
    }

    const documentId = input.documentId;

    let document: PHDocument;
    try {
      document = await this.documentStorage.get(documentId);
    } catch (error) {
      return {
        job,
        success: false,
        error: new Error(
          `Failed to fetch document before deletion: ${error instanceof Error ? error.message : String(error)}`,
        ),
        duration: Date.now() - startTime,
      };
    }

    try {
      await this.documentStorage.delete(documentId);
    } catch (error) {
      return {
        job,
        success: false,
        error: new Error(
          `Failed to delete document from legacy storage: ${error instanceof Error ? error.message : String(error)}`,
        ),
        duration: Date.now() - startTime,
      };
    }

    const operation = job.operation;

    // Write the DELETE_DOCUMENT operation to IOperationStore
    try {
      await this.operationStore.apply(
        documentId,
        document.header.documentType,
        job.scope || "document",
        job.branch,
        operation.index,
        (txn) => {
          txn.addOperations(operation);
        },
      );
    } catch (error) {
      return {
        job,
        success: false,
        error: new Error(
          `Failed to write DELETE_DOCUMENT operation to IOperationStore: ${error instanceof Error ? error.message : String(error)}`,
        ),
        duration: Date.now() - startTime,
      };
    }

    return {
      job,
      success: true,
      operation,
      duration: Date.now() - startTime,
    };
  }
}

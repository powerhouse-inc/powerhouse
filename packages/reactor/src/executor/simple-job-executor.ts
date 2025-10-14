import type {
  IDocumentOperationStorage,
  IDocumentStorage,
} from "document-drive";
import type {
  CreateDocumentActionInput,
  DeleteDocumentActionInput,
  DocumentModelModule,
  PHBaseState,
  PHDocument,
} from "document-model";
import { createPresignedHeader, defaultBaseState } from "document-model/core";
import type { IEventBus } from "../events/interfaces.js";
import { OperationEventTypes } from "../events/types.js";
import type { Job } from "../queue/types.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import { DocumentDeletedError } from "../shared/errors.js";
import type { IOperationStore } from "../storage/interfaces.js";
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
    private operationStore: IOperationStore,
    private eventBus: IEventBus,
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

    // Check if document is deleted
    const documentState = document.state.document;
    if (documentState.isDeleted) {
      return {
        job,
        success: false,
        error: new DocumentDeletedError(
          job.documentId,
          documentState.deletedAtUtcIso,
        ),
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

    const scope = job.scope;
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

    // Emit event for read models - fire and forget, don't block
    // Read model indexing happens asynchronously
    this.eventBus
      .emit(OperationEventTypes.OPERATION_WRITTEN, {
        operations: [
          {
            operation: newOperation,
            context: {
              documentId: job.documentId,
              scope,
              branch: job.branch,
              documentType: document.header.documentType,
            },
          },
        ],
      })
      .catch((error) => {
        // Log error but don't fail the job - read models are eventually consistent
        console.error("Failed to emit operation event for read models:", error);
      });

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
    const input = action.input as CreateDocumentActionInput;

    // Reconstruct the document from CreateDocumentActionInput
    const header = createPresignedHeader();
    header.id = input.documentId;
    header.documentType = input.model;

    // If signing info is present, populate the header signature fields
    if (input.signing) {
      header.createdAtUtcIso = input.signing.createdAtUtcIso;
      header.lastModifiedAtUtcIso = input.signing.createdAtUtcIso;
      header.sig = {
        publicKey: input.signing.publicKey,
        nonce: input.signing.nonce,
      };
    }

    // Populate optional mutable header fields
    if (input.slug !== undefined) {
      header.slug = input.slug;
    }
    // Default slug to document ID if empty (matching legacy behavior)
    if (!header.slug) {
      header.slug = input.documentId;
    }
    if (input.name !== undefined) {
      header.name = input.name;
    }
    if (input.branch !== undefined) {
      header.branch = input.branch;
    }
    if (input.meta !== undefined) {
      header.meta = input.meta;
    }

    // Construct the document with default base state (UPGRADE_DOCUMENT will set the full state)
    const baseState = defaultBaseState();
    const document: PHDocument = {
      header,
      operations: {},
      state: baseState,
      initialState: baseState,
      clipboard: [],
    };

    // Legacy: Store the document in storage
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

    // Legacy: Write the CREATE_DOCUMENT operation to legacy storage
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
        job.scope,
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

    // Emit event for read models - fire and forget
    this.eventBus
      .emit(OperationEventTypes.OPERATION_WRITTEN, {
        operations: [
          {
            operation,
            context: {
              documentId: document.header.id,
              scope: job.scope,
              branch: job.branch,
              documentType: document.header.documentType,
            },
          },
        ],
      })
      .catch((error) => {
        // Log error but don't fail the job - read models are eventually consistent
        console.error("Failed to emit operation event for read models:", error);
      });

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

    // Check if document is already deleted
    const documentState = document.state.document;
    if (documentState.isDeleted) {
      return {
        job,
        success: false,
        error: new DocumentDeletedError(
          documentId,
          documentState.deletedAtUtcIso,
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
        job.scope,
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

    // Emit event for read models - fire and forget
    this.eventBus
      .emit(OperationEventTypes.OPERATION_WRITTEN, {
        operations: [
          {
            operation,
            context: {
              documentId,
              scope: job.scope,
              branch: job.branch,
              documentType: document.header.documentType,
            },
          },
        ],
      })
      .catch((error) => {
        // Log error but don't fail the job - read models are eventually consistent
        console.error("Failed to emit operation event for read models:", error);
      });

    return {
      job,
      success: true,
      operation,
      duration: Date.now() - startTime,
    };
  }
}

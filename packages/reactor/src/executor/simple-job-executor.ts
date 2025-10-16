import type {
  IDocumentOperationStorage,
  IDocumentStorage,
} from "document-drive";
import type {
  CreateDocumentActionInput,
  DeleteDocumentActionInput,
  DocumentModelModule,
  Operation,
  PHDocument,
  UpgradeDocumentActionInput,
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
   * Execute a single job by applying all its operations through the appropriate reducers.
   * Operations are processed sequentially in order.
   */
  async executeJob(job: Job): Promise<JobResult> {
    const startTime = Date.now();
    const generatedOperations: Operation[] = [];
    const operationsWithContext: Array<{
      operation: Operation;
      context: {
        documentId: string;
        scope: string;
        branch: string;
        documentType: string;
      };
    }> = [];

    // Process each operation in the job sequentially
    for (const operation of job.operations) {
      // Handle system actions specially (CREATE_DOCUMENT, DELETE_DOCUMENT, etc.)
      if (operation.action.type === "CREATE_DOCUMENT") {
        const result = await this.executeCreateDocumentOperation(
          job,
          operation,
          startTime,
        );
        if (!result.success) {
          return result;
        }
        if (result.operations && result.operations.length > 0) {
          generatedOperations.push(...result.operations);
        }
        if (result.operationsWithContext) {
          operationsWithContext.push(...result.operationsWithContext);
        }
        continue;
      }

      if (operation.action.type === "DELETE_DOCUMENT") {
        const result = await this.executeDeleteDocumentOperation(
          job,
          operation,
          startTime,
        );
        if (!result.success) {
          return result;
        }
        if (result.operations && result.operations.length > 0) {
          generatedOperations.push(...result.operations);
        }
        if (result.operationsWithContext) {
          operationsWithContext.push(...result.operationsWithContext);
        }
        continue;
      }

      if (operation.action.type === "UPGRADE_DOCUMENT") {
        const result = await this.executeUpgradeDocumentOperation(
          job,
          operation,
          startTime,
        );
        if (!result.success) {
          return result;
        }
        if (result.operations && result.operations.length > 0) {
          generatedOperations.push(...result.operations);
        }
        if (result.operationsWithContext) {
          operationsWithContext.push(...result.operationsWithContext);
        }
        continue;
      }

      // For regular actions, load the document and apply through reducer
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
        operation.action,
      );

      const scope = job.scope;
      const operations = updatedDocument.operations[scope];
      if (operations.length === 0) {
        throw new Error("No operation generated from action");
      }

      const newOperation = operations[operations.length - 1];
      generatedOperations.push(newOperation);

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

      // save the whole state
      newOperation.resultingState = JSON.stringify(updatedDocument.state);

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

      operationsWithContext.push({
        operation: newOperation,
        context: {
          documentId: job.documentId,
          scope,
          branch: job.branch,
          documentType: document.header.documentType,
        },
      });
    }

    // Emit event for read models with all operations - fire and forget, don't block
    // Read model indexing happens asynchronously
    if (operationsWithContext.length > 0) {
      this.eventBus
        .emit(OperationEventTypes.OPERATION_WRITTEN, {
          operations: operationsWithContext,
        })
        .catch(() => {
          // Swallow error - read models are eventually consistent
        });
    }

    return {
      job,
      success: true,
      operations: generatedOperations,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Execute a CREATE_DOCUMENT system action for a single operation.
   * This creates a new document in storage along with its initial operations.
   */
  private async executeCreateDocumentOperation(
    job: Job,
    operation: Operation,
    startTime: number,
  ): Promise<
    JobResult & {
      operationsWithContext?: Array<{
        operation: Operation;
        context: {
          documentId: string;
          scope: string;
          branch: string;
          documentType: string;
        };
      }>;
    }
  > {
    const action = operation.action;
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

    // Populate resultingState with the document's state for read model indexing
    // Include header and all scopes present in the document state (auth, document, etc.)
    // but not global/local which aren't initialized by CREATE_DOCUMENT
    const resultingState: Record<string, unknown> = {
      header: document.header,
      ...document.state,
    };
    operation.resultingState = JSON.stringify(resultingState);

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

    return {
      job,
      success: true,
      operations: [operation],
      operationsWithContext: [
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
      duration: Date.now() - startTime,
    };
  }

  /**
   * Execute a DELETE_DOCUMENT system action for a single operation.
   * This deletes a document from legacy storage and writes the operation to IOperationStore.
   */
  private async executeDeleteDocumentOperation(
    job: Job,
    operation: Operation,
    startTime: number,
  ): Promise<
    JobResult & {
      operationsWithContext?: Array<{
        operation: Operation;
        context: {
          documentId: string;
          scope: string;
          branch: string;
          documentType: string;
        };
      }>;
    }
  > {
    const action = operation.action;
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

    // Mark the document as deleted in the state for read model indexing
    const deletedAt = new Date().toISOString();
    const updatedState = {
      ...document.state,
      document: {
        ...document.state.document,
        isDeleted: true,
        deletedAtUtcIso: deletedAt,
      },
    };

    // Populate resultingState with the deleted document state
    // DELETE_DOCUMENT only affects header and document scopes
    const resultingState: Record<string, unknown> = {
      header: document.header,
      document: updatedState.document,
    };
    operation.resultingState = JSON.stringify(resultingState);

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

    return {
      job,
      success: true,
      operations: [operation],
      operationsWithContext: [
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
      duration: Date.now() - startTime,
    };
  }

  /**
   * Execute an UPGRADE_DOCUMENT system action for a single operation.
   * This sets the document's initial state from the upgrade action.
   */
  private async executeUpgradeDocumentOperation(
    job: Job,
    operation: Operation,
    startTime: number,
  ): Promise<
    JobResult & {
      operationsWithContext?: Array<{
        operation: Operation;
        context: {
          documentId: string;
          scope: string;
          branch: string;
          documentType: string;
        };
      }>;
    }
  > {
    const action = operation.action;
    const input = action.input as UpgradeDocumentActionInput;

    if (!input.documentId) {
      return {
        job,
        success: false,
        error: new Error(
          "UPGRADE_DOCUMENT action requires a documentId in input",
        ),
        duration: Date.now() - startTime,
      };
    }

    const documentId = input.documentId;

    // Load the document from storage
    let document: PHDocument;
    try {
      document = await this.documentStorage.get(documentId);
    } catch (error) {
      return {
        job,
        success: false,
        error: new Error(
          `Failed to fetch document for upgrade: ${error instanceof Error ? error.message : String(error)}`,
        ),
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
          documentId,
          documentState.deletedAtUtcIso,
        ),
        duration: Date.now() - startTime,
      };
    }

    // Apply the initialState from the upgrade action
    // The initialState from UPGRADE_DOCUMENT should be merged with the existing base state
    // to preserve auth and document scopes while adding model-specific scopes (global, local, etc.)
    if (input.initialState) {
      document.state = {
        ...document.state,
        ...input.initialState,
      };
      document.initialState = document.state;
    }

    // Write the updated document to legacy storage
    try {
      await this.operationStorage.addDocumentOperations(
        documentId,
        [operation],
        document,
      );
    } catch (error) {
      return {
        job,
        success: false,
        error: new Error(
          `Failed to write UPGRADE_DOCUMENT operation to legacy storage: ${error instanceof Error ? error.message : String(error)}`,
        ),
        duration: Date.now() - startTime,
      };
    }

    // Populate resultingState with the full document state for read model indexing
    const resultingState: Record<string, unknown> = {
      header: document.header,
      ...document.state,
    };
    operation.resultingState = JSON.stringify(resultingState);

    // Write the operation to new IOperationStore (dual-writing)
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
          `Failed to write UPGRADE_DOCUMENT operation to IOperationStore: ${error instanceof Error ? error.message : String(error)}`,
        ),
        duration: Date.now() - startTime,
      };
    }

    return {
      job,
      success: true,
      operations: [operation],
      operationsWithContext: [
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
      duration: Date.now() - startTime,
    };
  }
}

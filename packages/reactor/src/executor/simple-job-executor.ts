import type {
  IDocumentOperationStorage,
  IDocumentStorage,
} from "document-drive";
import type {
  Action,
  AddRelationshipActionInput,
  CreateDocumentAction,
  DeleteDocumentActionInput,
  DocumentModelModule,
  Operation,
  PHDocument,
  RemoveRelationshipActionInput,
  UpgradeDocumentActionInput,
} from "document-model";
import type { IDocumentMetaCache } from "../cache/document-meta-cache-types.js";
import type {
  IOperationIndex,
  IOperationIndexTxn,
} from "../cache/operation-index-types.js";
import { driveCollectionId } from "../cache/operation-index-types.js";
import type { IWriteCache } from "../cache/write/interfaces.js";
import type { IEventBus } from "../events/interfaces.js";
import {
  OperationEventTypes,
  type OperationWrittenEvent,
} from "../events/types.js";
import type { Job } from "../queue/types.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import {
  DocumentDeletedError,
  InvalidSignatureError,
} from "../shared/errors.js";
import type {
  IOperationStore,
  OperationWithContext,
} from "../storage/interfaces.js";
import { reshuffleByTimestampAndIndex } from "../utils/reshuffle.js";
import type { SignatureVerificationHandler } from "../signer/types.js";
import type { IJobExecutor } from "./interfaces.js";
import type { JobExecutorConfig, JobResult } from "./types.js";
import {
  applyDeleteDocumentAction,
  applyUpgradeDocumentAction,
  createDocumentFromAction,
  getNextIndexForScope,
} from "./util.js";

const MAX_SKIP_THRESHOLD = 100;

/**
 * Simple job executor that processes a job by applying actions through document model reducers.
 *
 * @see docs/planning/Storage/IOperationStore.md for storage schema
 * @see docs/planning/Operations/index.md for operation structure
 * @see docs/planning/Jobs/reshuffle.md for skip mechanism details
 */
export class SimpleJobExecutor implements IJobExecutor {
  private config: Required<JobExecutorConfig>;

  constructor(
    private registry: IDocumentModelRegistry,
    private documentStorage: IDocumentStorage,
    private operationStorage: IDocumentOperationStorage,
    private operationStore: IOperationStore,
    private eventBus: IEventBus,
    private writeCache: IWriteCache,
    private operationIndex: IOperationIndex,
    private documentMetaCache: IDocumentMetaCache,
    config: JobExecutorConfig,
    private signatureVerifier?: SignatureVerificationHandler,
  ) {
    this.config = {
      maxConcurrency: config.maxConcurrency ?? 1,
      jobTimeoutMs: config.jobTimeoutMs ?? 30000,
      retryBaseDelayMs: config.retryBaseDelayMs ?? 100,
      retryMaxDelayMs: config.retryMaxDelayMs ?? 5000,
      legacyStorageEnabled: config.legacyStorageEnabled ?? true,
    };
  }

  /**
   * Execute a single job by applying all its actions through the appropriate reducers.
   * Actions are processed sequentially in order.
   */
  async executeJob(job: Job): Promise<JobResult> {
    const startTime = Date.now();
    const indexTxn = this.operationIndex.start();

    if (job.kind === "load") {
      const result = await this.executeLoadJob(job, startTime, indexTxn);
      if (result.success && result.operationsWithContext) {
        const ordinals = await this.operationIndex.commit(indexTxn);
        for (let i = 0; i < result.operationsWithContext.length; i++) {
          result.operationsWithContext[i].context.ordinal = ordinals[i];
        }
        if (result.operationsWithContext.length > 0) {
          const event: OperationWrittenEvent = {
            jobId: job.id,
            operations: result.operationsWithContext,
          };
          this.eventBus
            .emit(OperationEventTypes.OPERATION_WRITTEN, event)
            .catch(() => {
              // TODO: Log error
            });
        }
      }
      return result;
    }

    const result = await this.processActions(
      job,
      job.actions,
      startTime,
      indexTxn,
    );

    if (!result.success) {
      return {
        job,
        success: false,
        error: result.error,
        duration: Date.now() - startTime,
      };
    }

    const ordinals = await this.operationIndex.commit(indexTxn);

    if (result.operationsWithContext.length > 0) {
      for (let i = 0; i < result.operationsWithContext.length; i++) {
        result.operationsWithContext[i].context.ordinal = ordinals[i];
      }
      const event: OperationWrittenEvent = {
        jobId: job.id,
        operations: result.operationsWithContext,
      };
      this.eventBus
        .emit(OperationEventTypes.OPERATION_WRITTEN, event)
        .catch(() => {
          // TODO: Log error
        });
    }

    return {
      job,
      success: true,
      operations: result.generatedOperations,
      operationsWithContext: result.operationsWithContext,
      duration: Date.now() - startTime,
    };
  }

  private async processActions(
    job: Job,
    actions: Action[],
    startTime: number,
    indexTxn: IOperationIndexTxn,
    skipValues?: number[],
  ): Promise<{
    success: boolean;
    generatedOperations: Operation[];
    operationsWithContext: OperationWithContext[];
    error?: Error;
  }> {
    const generatedOperations: Operation[] = [];
    const operationsWithContext: OperationWithContext[] = [];

    try {
      await this.verifyActionSignatures(job, actions);
    } catch (error) {
      return {
        success: false,
        generatedOperations,
        operationsWithContext,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }

    let actionIndex = 0;

    for (const action of actions) {
      if (action.type === "CREATE_DOCUMENT") {
        const result = await this.executeCreateDocumentAction(
          job,
          action,
          startTime,
          indexTxn,
          skipValues?.[actionIndex],
        );
        const error = this.accumulateResultOrReturnError(
          result,
          generatedOperations,
          operationsWithContext,
        );
        if (error !== null) {
          return {
            success: false,
            generatedOperations,
            operationsWithContext,
            error: error.error,
          };
        }
        actionIndex++;
        continue;
      }

      if (action.type === "DELETE_DOCUMENT") {
        const result = await this.executeDeleteDocumentAction(
          job,
          action,
          startTime,
          indexTxn,
        );
        const error = this.accumulateResultOrReturnError(
          result,
          generatedOperations,
          operationsWithContext,
        );
        if (error !== null) {
          return {
            success: false,
            generatedOperations,
            operationsWithContext,
            error: error.error,
          };
        }
        actionIndex++;
        continue;
      }

      if (action.type === "UPGRADE_DOCUMENT") {
        const result = await this.executeUpgradeDocumentAction(
          job,
          action,
          startTime,
          indexTxn,
          skipValues?.[actionIndex],
        );
        const error = this.accumulateResultOrReturnError(
          result,
          generatedOperations,
          operationsWithContext,
        );
        if (error !== null) {
          return {
            success: false,
            generatedOperations,
            operationsWithContext,
            error: error.error,
          };
        }
        actionIndex++;
        continue;
      }

      if (action.type === "ADD_RELATIONSHIP") {
        const result = await this.executeAddRelationshipAction(
          job,
          action,
          startTime,
          indexTxn,
        );
        const error = this.accumulateResultOrReturnError(
          result,
          generatedOperations,
          operationsWithContext,
        );
        if (error !== null) {
          return {
            success: false,
            generatedOperations,
            operationsWithContext,
            error: error.error,
          };
        }
        actionIndex++;
        continue;
      }

      if (action.type === "REMOVE_RELATIONSHIP") {
        const result = await this.executeRemoveRelationshipAction(
          job,
          action,
          startTime,
          indexTxn,
        );
        const error = this.accumulateResultOrReturnError(
          result,
          generatedOperations,
          operationsWithContext,
        );
        if (error !== null) {
          return {
            success: false,
            generatedOperations,
            operationsWithContext,
            error: error.error,
          };
        }
        actionIndex++;
        continue;
      }

      let docMeta;
      try {
        docMeta = await this.documentMetaCache.getDocumentMeta(
          job.documentId,
          job.branch,
        );
      } catch (error) {
        return {
          success: false,
          generatedOperations,
          operationsWithContext,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }

      if (docMeta.state.isDeleted) {
        return {
          success: false,
          generatedOperations,
          operationsWithContext,
          error: new DocumentDeletedError(
            job.documentId,
            docMeta.state.deletedAtUtcIso,
          ),
        };
      }

      let document: PHDocument;
      try {
        document = await this.writeCache.getState(
          job.documentId,
          job.scope,
          job.branch,
        );
      } catch (error) {
        return {
          success: false,
          generatedOperations,
          operationsWithContext,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }

      let module: DocumentModelModule;
      try {
        module = this.registry.getModule(document.header.documentType);
      } catch (error) {
        return {
          success: false,
          generatedOperations,
          operationsWithContext,
          error: error instanceof Error ? error : new Error(String(error)),
        };
      }

      let updatedDocument: PHDocument;
      try {
        updatedDocument = module.reducer(document as PHDocument, action);
      } catch (error) {
        const contextMessage = `Failed to apply action to document:\n  Action type: ${action.type}\n  Document ID: ${job.documentId}\n  Document type: ${document.header.documentType}\n  Scope: ${job.scope}\n  Original error: ${error instanceof Error ? error.message : String(error)}`;
        const enhancedError = new Error(contextMessage);
        if (error instanceof Error && error.stack) {
          enhancedError.stack = `${contextMessage}\n\nOriginal stack trace:\n${error.stack}`;
        }
        return {
          success: false,
          generatedOperations,
          operationsWithContext,
          error: enhancedError,
        };
      }

      const scope = job.scope;
      const operations = updatedDocument.operations[scope];
      if (operations.length === 0) {
        return {
          success: false,
          generatedOperations,
          operationsWithContext,
          error: new Error("No operation generated from action"),
        };
      }

      const newOperation = operations[operations.length - 1];
      if (skipValues && actionIndex < skipValues.length) {
        newOperation.skip = skipValues[actionIndex];
      }
      generatedOperations.push(newOperation);

      if (this.config.legacyStorageEnabled) {
        try {
          await this.operationStorage.addDocumentOperations(
            job.documentId,
            [newOperation],
            updatedDocument,
          );
        } catch (error) {
          return {
            success: false,
            generatedOperations,
            operationsWithContext,
            error: error instanceof Error ? error : new Error(String(error)),
          };
        }
      }

      const resultingState = JSON.stringify(updatedDocument.state);

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
          success: false,
          generatedOperations,
          operationsWithContext,
          error: new Error(
            `Failed to write operation to IOperationStore: ${error instanceof Error ? error.message : String(error)}`,
          ),
        };
      }

      updatedDocument.header.revision = {
        ...updatedDocument.header.revision,
        [scope]: newOperation.index + 1,
      };

      this.writeCache.putState(
        job.documentId,
        scope,
        job.branch,
        newOperation.index,
        updatedDocument,
      );

      indexTxn.write([
        {
          ...newOperation,
          documentId: job.documentId,
          documentType: document.header.documentType,
          branch: job.branch,
          scope,
        },
      ]);

      operationsWithContext.push({
        operation: newOperation,
        context: {
          documentId: job.documentId,
          scope,
          branch: job.branch,
          documentType: document.header.documentType,
          resultingState,
          ordinal: 0,
        },
      });

      actionIndex++;
    }

    return {
      success: true,
      generatedOperations,
      operationsWithContext,
    };
  }

  /**
   * Execute a CREATE_DOCUMENT system action.
   * This creates a new document in storage along with its initial operation.
   * For a new document, the operation index is always 0.
   */
  private async executeCreateDocumentAction(
    job: Job,
    action: Action,
    startTime: number,
    indexTxn: IOperationIndexTxn,
    skip: number = 0,
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
    if (job.scope !== "document") {
      return {
        job,
        success: false,
        error: new Error(
          `CREATE_DOCUMENT must be in "document" scope, got "${job.scope}"`,
        ),
        duration: Date.now() - startTime,
      };
    }

    const document = createDocumentFromAction(action as CreateDocumentAction);

    // Legacy: Store the document in storage
    if (this.config.legacyStorageEnabled) {
      try {
        await this.documentStorage.create(document);
      } catch (error) {
        return this.buildErrorResult(
          job,
          new Error(
            `Failed to create document in storage: ${error instanceof Error ? error.message : String(error)}`,
          ),
          startTime,
        );
      }
    }

    const operation = this.createOperation(action, 0, skip);

    // Legacy: Write the CREATE_DOCUMENT operation to legacy storage
    if (this.config.legacyStorageEnabled) {
      try {
        await this.operationStorage.addDocumentOperations(
          document.header.id,
          [operation],
          document,
        );
      } catch (error) {
        return this.buildErrorResult(
          job,
          new Error(
            `Failed to write CREATE_DOCUMENT operation to legacy storage: ${error instanceof Error ? error.message : String(error)}`,
          ),
          startTime,
        );
      }
    }

    // Compute resultingState for passing via context (not persisted)
    // Include header and all scopes present in the document state (auth, document, etc.)
    // but not global/local which aren't initialized by CREATE_DOCUMENT
    const resultingStateObj: Record<string, unknown> = {
      header: document.header,
      ...document.state,
    };
    const resultingState = JSON.stringify(resultingStateObj);

    const writeError = await this.writeOperationToStore(
      document.header.id,
      document.header.documentType,
      job.scope,
      job.branch,
      operation,
      job,
      startTime,
    );
    if (writeError !== null) {
      return writeError;
    }

    this.updateDocumentRevision(document, job.scope, operation.index);

    this.writeCacheState(
      document.header.id,
      job.scope,
      job.branch,
      operation.index,
      document,
    );

    indexTxn.write([
      {
        ...operation,
        documentId: document.header.id,
        documentType: document.header.documentType,
        branch: job.branch,
        scope: job.scope,
      },
    ]);

    // collection membership has to be _after_ the write, as it requires the
    // ordinal of the operation to be set
    if (document.header.documentType === "powerhouse/document-drive") {
      const collectionId = driveCollectionId(job.branch, document.header.id);
      indexTxn.createCollection(collectionId);
      indexTxn.addToCollection(collectionId, document.header.id);
    }

    this.documentMetaCache.putDocumentMeta(document.header.id, job.branch, {
      state: document.state.document,
      documentType: document.header.documentType,
      documentScopeRevision: 1,
    });

    return this.buildSuccessResult(
      job,
      operation,
      document.header.id,
      document.header.documentType,
      resultingState,
      startTime,
    );
  }

  /**
   * Execute a DELETE_DOCUMENT system action.
   * This deletes a document from legacy storage and writes the operation to IOperationStore.
   * The operation index is determined from the document's current operation count.
   */
  private async executeDeleteDocumentAction(
    job: Job,
    action: Action,
    startTime: number,
    indexTxn: IOperationIndexTxn,
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
    const input = action.input as DeleteDocumentActionInput;

    if (!input.documentId) {
      return this.buildErrorResult(
        job,
        new Error("DELETE_DOCUMENT action requires a documentId in input"),
        startTime,
      );
    }

    const documentId = input.documentId;

    let document: PHDocument;
    try {
      document = await this.writeCache.getState(
        documentId,
        job.scope,
        job.branch,
      );
    } catch (error) {
      return this.buildErrorResult(
        job,
        new Error(
          `Failed to fetch document before deletion: ${error instanceof Error ? error.message : String(error)}`,
        ),
        startTime,
      );
    }

    // Check if document is already deleted
    const documentState = document.state.document;
    if (documentState.isDeleted) {
      return this.buildErrorResult(
        job,
        new DocumentDeletedError(documentId, documentState.deletedAtUtcIso),
        startTime,
      );
    }

    const nextIndex = getNextIndexForScope(document, job.scope);

    const operation = this.createOperation(action, nextIndex);

    if (this.config.legacyStorageEnabled) {
      try {
        await this.documentStorage.delete(documentId);
      } catch (error) {
        return this.buildErrorResult(
          job,
          new Error(
            `Failed to delete document from legacy storage: ${error instanceof Error ? error.message : String(error)}`,
          ),
          startTime,
        );
      }
    }

    // Mark the document as deleted in the state for read model indexing
    applyDeleteDocumentAction(document, action as never);

    // Compute resultingState for passing via context (not persisted)
    // DELETE_DOCUMENT only affects header and document scopes
    const resultingStateObj: Record<string, unknown> = {
      header: document.header,
      document: document.state.document,
    };
    const resultingState = JSON.stringify(resultingStateObj);

    const writeError = await this.writeOperationToStore(
      documentId,
      document.header.documentType,
      job.scope,
      job.branch,
      operation,
      job,
      startTime,
    );
    if (writeError !== null) {
      return writeError;
    }

    indexTxn.write([
      {
        ...operation,
        documentId: documentId,
        documentType: document.header.documentType,
        branch: job.branch,
        scope: job.scope,
      },
    ]);

    this.documentMetaCache.putDocumentMeta(documentId, job.branch, {
      state: document.state.document,
      documentType: document.header.documentType,
      documentScopeRevision: operation.index + 1,
    });

    return this.buildSuccessResult(
      job,
      operation,
      documentId,
      document.header.documentType,
      resultingState,
      startTime,
    );
  }

  /**
   * Execute an UPGRADE_DOCUMENT system action.
   * This sets the document's initial state from the upgrade action.
   * The operation index is determined from the document's current operation count.
   */
  private async executeUpgradeDocumentAction(
    job: Job,
    action: Action,
    startTime: number,
    indexTxn: IOperationIndexTxn,
    skip: number = 0,
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
    const input = action.input as UpgradeDocumentActionInput;

    if (!input.documentId) {
      return this.buildErrorResult(
        job,
        new Error("UPGRADE_DOCUMENT action requires a documentId in input"),
        startTime,
      );
    }

    const documentId = input.documentId;

    let document: PHDocument;
    try {
      document = await this.writeCache.getState(
        documentId,
        job.scope,
        job.branch,
      );
    } catch (error) {
      return this.buildErrorResult(
        job,
        new Error(
          `Failed to fetch document for upgrade: ${error instanceof Error ? error.message : String(error)}`,
        ),
        startTime,
      );
    }

    const documentState = document.state.document;
    if (documentState.isDeleted) {
      return this.buildErrorResult(
        job,
        new DocumentDeletedError(documentId, documentState.deletedAtUtcIso),
        startTime,
      );
    }

    const nextIndex = getNextIndexForScope(document, job.scope);

    applyUpgradeDocumentAction(document, action as never);

    const operation = this.createOperation(action, nextIndex, skip);

    // Write the updated document to legacy storage
    if (this.config.legacyStorageEnabled) {
      try {
        await this.operationStorage.addDocumentOperations(
          documentId,
          [operation],
          document,
        );
      } catch (error) {
        return this.buildErrorResult(
          job,
          new Error(
            `Failed to write UPGRADE_DOCUMENT operation to legacy storage: ${error instanceof Error ? error.message : String(error)}`,
          ),
          startTime,
        );
      }
    }

    // Compute resultingState for passing via context (not persisted)
    const resultingStateObj: Record<string, unknown> = {
      header: document.header,
      ...document.state,
    };
    const resultingState = JSON.stringify(resultingStateObj);

    const writeError = await this.writeOperationToStore(
      documentId,
      document.header.documentType,
      job.scope,
      job.branch,
      operation,
      job,
      startTime,
    );
    if (writeError !== null) {
      return writeError;
    }

    this.updateDocumentRevision(document, job.scope, operation.index);

    this.writeCacheState(
      documentId,
      job.scope,
      job.branch,
      operation.index,
      document,
    );

    indexTxn.write([
      {
        ...operation,
        documentId: documentId,
        documentType: document.header.documentType,
        branch: job.branch,
        scope: job.scope,
      },
    ]);

    this.documentMetaCache.putDocumentMeta(documentId, job.branch, {
      state: document.state.document,
      documentType: document.header.documentType,
      documentScopeRevision: operation.index + 1,
    });

    return this.buildSuccessResult(
      job,
      operation,
      documentId,
      document.header.documentType,
      resultingState,
      startTime,
    );
  }

  private async executeAddRelationshipAction(
    job: Job,
    action: Action,
    startTime: number,
    indexTxn: IOperationIndexTxn,
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
    if (job.scope !== "document") {
      return this.buildErrorResult(
        job,
        new Error(
          `ADD_RELATIONSHIP must be in "document" scope, got "${job.scope}"`,
        ),
        startTime,
      );
    }

    const input = action.input as AddRelationshipActionInput;

    if (!input.sourceId || !input.targetId || !input.relationshipType) {
      return this.buildErrorResult(
        job,
        new Error(
          "ADD_RELATIONSHIP action requires sourceId, targetId, and relationshipType in input",
        ),
        startTime,
      );
    }

    if (input.sourceId === input.targetId) {
      return this.buildErrorResult(
        job,
        new Error(
          "ADD_RELATIONSHIP: sourceId and targetId cannot be the same (self-relationships not allowed)",
        ),
        startTime,
      );
    }

    let sourceDoc: PHDocument;
    try {
      sourceDoc = await this.writeCache.getState(
        input.sourceId,
        "document",
        job.branch,
      );
    } catch (error) {
      return this.buildErrorResult(
        job,
        new Error(
          `ADD_RELATIONSHIP: source document ${input.sourceId} not found: ${error instanceof Error ? error.message : String(error)}`,
        ),
        startTime,
      );
    }

    let targetDoc: PHDocument;
    try {
      targetDoc = await this.writeCache.getState(
        input.targetId,
        "document",
        job.branch,
      );
    } catch (error) {
      return this.buildErrorResult(
        job,
        new Error(
          `ADD_RELATIONSHIP: target document ${input.targetId} not found: ${error instanceof Error ? error.message : String(error)}`,
        ),
        startTime,
      );
    }

    const targetDocState = targetDoc.state.document;
    if (targetDocState.isDeleted) {
      return this.buildErrorResult(
        job,
        new Error(
          `ADD_RELATIONSHIP: target document ${input.targetId} is deleted`,
        ),
        startTime,
      );
    }

    const nextIndex = getNextIndexForScope(sourceDoc, job.scope);

    const operation = this.createOperation(action, nextIndex);

    const writeError = await this.writeOperationToStore(
      input.sourceId,
      sourceDoc.header.documentType,
      job.scope,
      job.branch,
      operation,
      job,
      startTime,
    );
    if (writeError !== null) {
      return writeError;
    }

    sourceDoc.header.lastModifiedAtUtcIso =
      operation.timestampUtcMs || new Date().toISOString();

    this.updateDocumentRevision(sourceDoc, job.scope, operation.index);

    sourceDoc.operations = {
      ...sourceDoc.operations,
      [job.scope]: [...(sourceDoc.operations[job.scope] ?? []), operation],
    };

    const scopeState = (sourceDoc.state as Record<string, unknown>)[job.scope];
    const resultingStateObj: Record<string, unknown> = {
      header: structuredClone(sourceDoc.header),
      [job.scope]: scopeState === undefined ? {} : structuredClone(scopeState),
    };
    const resultingState = JSON.stringify(resultingStateObj);

    this.writeCacheState(
      input.sourceId,
      job.scope,
      job.branch,
      operation.index,
      sourceDoc,
    );

    indexTxn.write([
      {
        ...operation,
        documentId: input.sourceId,
        documentType: sourceDoc.header.documentType,
        branch: job.branch,
        scope: job.scope,
      },
    ]);

    // collection membership has to be _after_ the write, as it requires the
    // ordinal of the operation to be set
    if (sourceDoc.header.documentType === "powerhouse/document-drive") {
      const collectionId = driveCollectionId(job.branch, input.sourceId);
      indexTxn.addToCollection(collectionId, input.targetId);
    }

    return this.buildSuccessResult(
      job,
      operation,
      input.sourceId,
      sourceDoc.header.documentType,
      resultingState,
      startTime,
    );
  }

  private async executeRemoveRelationshipAction(
    job: Job,
    action: Action,
    startTime: number,
    indexTxn: IOperationIndexTxn,
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
    if (job.scope !== "document") {
      return this.buildErrorResult(
        job,
        new Error(
          `REMOVE_RELATIONSHIP must be in "document" scope, got "${job.scope}"`,
        ),
        startTime,
      );
    }

    const input = action.input as RemoveRelationshipActionInput;

    if (!input.sourceId || !input.targetId || !input.relationshipType) {
      return this.buildErrorResult(
        job,
        new Error(
          "REMOVE_RELATIONSHIP action requires sourceId, targetId, and relationshipType in input",
        ),
        startTime,
      );
    }

    let sourceDoc: PHDocument;
    try {
      sourceDoc = await this.writeCache.getState(
        input.sourceId,
        "document",
        job.branch,
      );
    } catch (error) {
      return this.buildErrorResult(
        job,
        new Error(
          `REMOVE_RELATIONSHIP: source document ${input.sourceId} not found: ${error instanceof Error ? error.message : String(error)}`,
        ),
        startTime,
      );
    }

    const nextIndex = getNextIndexForScope(sourceDoc, job.scope);

    const operation = this.createOperation(action, nextIndex);

    const writeError = await this.writeOperationToStore(
      input.sourceId,
      sourceDoc.header.documentType,
      job.scope,
      job.branch,
      operation,
      job,
      startTime,
    );
    if (writeError !== null) {
      return writeError;
    }

    sourceDoc.header.lastModifiedAtUtcIso =
      operation.timestampUtcMs || new Date().toISOString();

    this.updateDocumentRevision(sourceDoc, job.scope, operation.index);

    sourceDoc.operations = {
      ...sourceDoc.operations,
      [job.scope]: [...(sourceDoc.operations[job.scope] ?? []), operation],
    };

    const scopeState = (sourceDoc.state as Record<string, unknown>)[job.scope];
    const resultingStateObj: Record<string, unknown> = {
      header: structuredClone(sourceDoc.header),
      [job.scope]: scopeState === undefined ? {} : structuredClone(scopeState),
    };
    const resultingState = JSON.stringify(resultingStateObj);

    this.writeCacheState(
      input.sourceId,
      job.scope,
      job.branch,
      operation.index,
      sourceDoc,
    );

    indexTxn.write([
      {
        ...operation,
        documentId: input.sourceId,
        documentType: sourceDoc.header.documentType,
        branch: job.branch,
        scope: job.scope,
      },
    ]);

    // collection membership has to be _after_ the write, as it requires the
    // ordinal of the operation to be set
    if (sourceDoc.header.documentType === "powerhouse/document-drive") {
      const collectionId = driveCollectionId(job.branch, input.sourceId);
      indexTxn.removeFromCollection(collectionId, input.targetId);
    }

    return this.buildSuccessResult(
      job,
      operation,
      input.sourceId,
      sourceDoc.header.documentType,
      resultingState,
      startTime,
    );
  }

  private createOperation(
    action: Action,
    index: number,
    skip: number = 0,
  ): Operation {
    return {
      index: index,
      timestampUtcMs: action.timestampUtcMs || new Date().toISOString(),
      hash: "",
      skip: skip,
      action: action,
    };
  }

  private async executeLoadJob(
    job: Job,
    startTime: number,
    indexTxn: IOperationIndexTxn,
  ): Promise<JobResult> {
    if (job.operations.length === 0) {
      return this.buildErrorResult(
        job,
        new Error("Load job must include at least one operation"),
        startTime,
      );
    }

    const scope = job.scope;

    let latestRevision = 0;
    try {
      const revisions = await this.operationStore.getRevisions(
        job.documentId,
        job.branch,
      );
      latestRevision = revisions.revision[scope] ?? 0;
    } catch {
      latestRevision = 0;
    }

    const minIncomingIndex = job.operations.reduce(
      (min, operation) => Math.min(min, operation.index),
      Number.POSITIVE_INFINITY,
    );

    const skipCount =
      minIncomingIndex === Number.POSITIVE_INFINITY
        ? 0
        : Math.max(0, latestRevision - minIncomingIndex);

    if (skipCount > MAX_SKIP_THRESHOLD) {
      return {
        job,
        success: false,
        error: new Error(
          `Excessive reshuffle detected: skip count of ${skipCount} exceeds threshold of ${MAX_SKIP_THRESHOLD}. ` +
            `This indicates an attempt to insert an operation at index ${minIncomingIndex} when the latest revision is ${latestRevision}.`,
        ),
        duration: Date.now() - startTime,
      };
    }

    const reshuffledOperations = reshuffleByTimestampAndIndex(
      {
        index: latestRevision,
        skip: skipCount,
      },
      [],
      job.operations.map((operation) => ({
        ...operation,
        id: operation.id,
      })),
    );

    const actions = reshuffledOperations.map((operation) => operation.action);
    const skipValues = reshuffledOperations.map((operation) => operation.skip);

    const result = await this.processActions(
      job,
      actions,
      startTime,
      indexTxn,
      skipValues,
    );

    if (!result.success) {
      return {
        job,
        success: false,
        error: result.error,
        duration: Date.now() - startTime,
      };
    }

    this.writeCache.invalidate(job.documentId, scope, job.branch);

    if (scope === "document") {
      this.documentMetaCache.invalidate(job.documentId, job.branch);
    }

    return {
      job,
      success: true,
      operations: result.generatedOperations,
      operationsWithContext: result.operationsWithContext,
      duration: Date.now() - startTime,
    };
  }

  private async writeOperationToStore(
    documentId: string,
    documentType: string,
    scope: string,
    branch: string,
    operation: Operation,
    job: Job,
    startTime: number,
  ): Promise<JobResult | null> {
    try {
      await this.operationStore.apply(
        documentId,
        documentType,
        scope,
        branch,
        operation.index,
        (txn) => {
          txn.addOperations(operation);
        },
      );
      return null;
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
  }

  private updateDocumentRevision(
    document: PHDocument,
    scope: string,
    operationIndex: number,
  ): void {
    document.header.revision = {
      ...document.header.revision,
      [scope]: operationIndex + 1,
    };
  }

  private writeCacheState(
    documentId: string,
    scope: string,
    branch: string,
    operationIndex: number,
    document: PHDocument,
  ): void {
    this.writeCache.putState(
      documentId,
      scope,
      branch,
      operationIndex,
      document,
    );
  }

  private buildSuccessResult(
    job: Job,
    operation: Operation,
    documentId: string,
    documentType: string,
    resultingState: string,
    startTime: number,
  ): JobResult {
    return {
      job,
      success: true,
      operations: [operation],
      operationsWithContext: [
        {
          operation,
          context: {
            documentId: documentId,
            scope: job.scope,
            branch: job.branch,
            documentType: documentType,
            resultingState,
            ordinal: 0,
          },
        },
      ],
      duration: Date.now() - startTime,
    };
  }

  private buildErrorResult(
    job: Job,
    error: Error,
    startTime: number,
  ): JobResult {
    return {
      job,
      success: false,
      error: error,
      duration: Date.now() - startTime,
    };
  }

  private async verifyOperationSignatures(
    job: Job,
    operations: Operation[],
  ): Promise<void> {
    if (!this.signatureVerifier) {
      return;
    }

    for (let i = 0; i < operations.length; i++) {
      const operation = operations[i];
      const signer = operation.action.context?.signer;

      if (!signer) {
        continue;
      }

      if (signer.signatures.length === 0) {
        throw new InvalidSignatureError(
          job.documentId,
          `Operation ${operation.id ?? "unknown"} at index ${operation.index} has signer but no signatures`,
        );
      }

      const publicKey = signer.app.key;
      let isValid = false;

      try {
        isValid = await this.signatureVerifier(operation, publicKey);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        throw new InvalidSignatureError(
          job.documentId,
          `Operation ${operation.id ?? "unknown"} at index ${operation.index} verification failed: ${errorMessage}`,
        );
      }

      if (!isValid) {
        throw new InvalidSignatureError(
          job.documentId,
          `Operation ${operation.id ?? "unknown"} at index ${operation.index} signature verification returned false`,
        );
      }
    }
  }

  private async verifyActionSignatures(
    job: Job,
    actions: Action[],
  ): Promise<void> {
    if (!this.signatureVerifier) {
      return;
    }

    for (const action of actions) {
      const signer = action.context?.signer;

      if (!signer) {
        continue;
      }

      if (signer.signatures.length === 0) {
        throw new InvalidSignatureError(
          job.documentId,
          `Action ${action.id} has signer but no signatures`,
        );
      }

      const publicKey = signer.app.key;
      let isValid = false;

      try {
        const tempOperation: Operation = {
          index: 0,
          timestampUtcMs: action.timestampUtcMs || new Date().toISOString(),
          hash: "",
          skip: 0,
          action: action,
        };

        isValid = await this.signatureVerifier(tempOperation, publicKey);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        throw new InvalidSignatureError(
          job.documentId,
          `Action ${action.id} verification failed: ${errorMessage}`,
        );
      }

      if (!isValid) {
        throw new InvalidSignatureError(
          job.documentId,
          `Action ${action.id} signature verification returned false`,
        );
      }
    }
  }

  private accumulateResultOrReturnError(
    result: JobResult,
    generatedOperations: Operation[],
    operationsWithContext: OperationWithContext[],
  ): JobResult | null {
    if (!result.success) {
      return result;
    }
    if (result.operations && result.operations.length > 0) {
      generatedOperations.push(...result.operations);
    }
    if (result.operationsWithContext) {
      operationsWithContext.push(...result.operationsWithContext);
    }
    return null;
  }
}

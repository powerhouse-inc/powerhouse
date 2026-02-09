import type {
  Action,
  AddRelationshipActionInput,
  CreateDocumentAction,
  DeleteDocumentActionInput,
  Operation,
  PHDocument,
  RemoveRelationshipActionInput,
  UpgradeDocumentAction,
  UpgradeDocumentActionInput,
  UpgradeTransition,
} from "document-model";
import type { ICollectionMembershipCache } from "../cache/collection-membership-cache.js";
import type { IDocumentMetaCache } from "../cache/document-meta-cache-types.js";
import type { IOperationIndexTxn } from "../cache/operation-index-types.js";
import { driveCollectionId } from "../cache/operation-index-types.js";
import type { IWriteCache } from "../cache/write/interfaces.js";
import type { ILogger } from "../logging/types.js";
import type { Job } from "../queue/types.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import { DocumentDeletedError } from "../shared/errors.js";
import type { IOperationStore } from "../storage/interfaces.js";
import type { JobResult } from "./types.js";
import {
  applyDeleteDocumentAction,
  applyUpgradeDocumentAction,
  buildErrorResult,
  buildSuccessResult,
  createDocumentFromAction,
  createOperation,
  getNextIndexForScope,
  updateDocumentRevision,
} from "./util.js";

export class DocumentActionHandler {
  constructor(
    private writeCache: IWriteCache,
    private operationStore: IOperationStore,
    private documentMetaCache: IDocumentMetaCache,
    private collectionMembershipCache: ICollectionMembershipCache,
    private registry: IDocumentModelRegistry,
    private logger: ILogger,
  ) {}

  async execute(
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
    switch (action.type) {
      case "CREATE_DOCUMENT":
        return this.executeCreate(job, action, startTime, indexTxn, skip);
      case "DELETE_DOCUMENT":
        return this.executeDelete(job, action, startTime, indexTxn);
      case "UPGRADE_DOCUMENT":
        return this.executeUpgrade(job, action, startTime, indexTxn, skip);
      case "ADD_RELATIONSHIP":
        return this.executeAddRelationship(job, action, startTime, indexTxn);
      case "REMOVE_RELATIONSHIP":
        return this.executeRemoveRelationship(job, action, startTime, indexTxn);
      default:
        return buildErrorResult(
          job,
          new Error(`Unknown document action type: ${action.type}`),
          startTime,
        );
    }
  }

  private async executeCreate(
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

    const operation = createOperation(action, 0, skip, {
      documentId: document.header.id,
      scope: job.scope,
      branch: job.branch,
    });

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

    updateDocumentRevision(document, job.scope, operation.index);

    this.writeCache.putState(
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

    return buildSuccessResult(
      job,
      operation,
      document.header.id,
      document.header.documentType,
      resultingState,
      startTime,
    );
  }

  private async executeDelete(
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
      return buildErrorResult(
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
      return buildErrorResult(
        job,
        new Error(
          `Failed to fetch document before deletion: ${error instanceof Error ? error.message : String(error)}`,
        ),
        startTime,
      );
    }

    const documentState = document.state.document;
    if (documentState.isDeleted) {
      return buildErrorResult(
        job,
        new DocumentDeletedError(documentId, documentState.deletedAtUtcIso),
        startTime,
      );
    }

    const nextIndex = getNextIndexForScope(document, job.scope);

    const operation = createOperation(action, nextIndex, 0, {
      documentId,
      scope: job.scope,
      branch: job.branch,
    });

    applyDeleteDocumentAction(document, action as never);

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

    return buildSuccessResult(
      job,
      operation,
      documentId,
      document.header.documentType,
      resultingState,
      startTime,
    );
  }

  private async executeUpgrade(
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
      return buildErrorResult(
        job,
        new Error("UPGRADE_DOCUMENT action requires a documentId in input"),
        startTime,
      );
    }

    const documentId = input.documentId;

    const fromVersion = input.fromVersion;
    const toVersion = input.toVersion;

    let document: PHDocument;
    try {
      document = await this.writeCache.getState(
        documentId,
        job.scope,
        job.branch,
      );
    } catch (error) {
      return buildErrorResult(
        job,
        new Error(
          `Failed to fetch document for upgrade: ${error instanceof Error ? error.message : String(error)}`,
        ),
        startTime,
      );
    }

    const documentState = document.state.document;
    if (documentState.isDeleted) {
      return buildErrorResult(
        job,
        new DocumentDeletedError(documentId, documentState.deletedAtUtcIso),
        startTime,
      );
    }

    const nextIndex = getNextIndexForScope(document, job.scope);

    let upgradePath: UpgradeTransition[] | undefined;
    if (fromVersion > 0 && fromVersion < toVersion) {
      try {
        upgradePath = this.registry.computeUpgradePath(
          document.header.documentType,
          fromVersion,
          toVersion,
        );
      } catch (error) {
        return buildErrorResult(
          job,
          error instanceof Error ? error : new Error(String(error)),
          startTime,
        );
      }
    }

    if (fromVersion === toVersion && fromVersion > 0) {
      return {
        job,
        success: true,
        operations: [],
        operationsWithContext: [],
        duration: Date.now() - startTime,
      };
    }

    try {
      document = applyUpgradeDocumentAction(
        document,
        action as UpgradeDocumentAction,
        upgradePath,
      );
    } catch (error) {
      return buildErrorResult(
        job,
        error instanceof Error ? error : new Error(String(error)),
        startTime,
      );
    }

    const operation = createOperation(action, nextIndex, skip, {
      documentId,
      scope: job.scope,
      branch: job.branch,
    });

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

    updateDocumentRevision(document, job.scope, operation.index);

    this.writeCache.putState(
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

    return buildSuccessResult(
      job,
      operation,
      documentId,
      document.header.documentType,
      resultingState,
      startTime,
    );
  }

  private async executeAddRelationship(
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
      return buildErrorResult(
        job,
        new Error(
          `ADD_RELATIONSHIP must be in "document" scope, got "${job.scope}"`,
        ),
        startTime,
      );
    }

    const input = action.input as AddRelationshipActionInput;

    if (!input.sourceId || !input.targetId || !input.relationshipType) {
      return buildErrorResult(
        job,
        new Error(
          "ADD_RELATIONSHIP action requires sourceId, targetId, and relationshipType in input",
        ),
        startTime,
      );
    }

    if (input.sourceId === input.targetId) {
      return buildErrorResult(
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
      return buildErrorResult(
        job,
        new Error(
          `ADD_RELATIONSHIP: source document ${input.sourceId} not found: ${error instanceof Error ? error.message : String(error)}`,
        ),
        startTime,
      );
    }

    const nextIndex = getNextIndexForScope(sourceDoc, job.scope);

    const operation = createOperation(action, nextIndex, 0, {
      documentId: input.sourceId,
      scope: job.scope,
      branch: job.branch,
    });

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

    updateDocumentRevision(sourceDoc, job.scope, operation.index);

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

    this.writeCache.putState(
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

    if (sourceDoc.header.documentType === "powerhouse/document-drive") {
      const collectionId = driveCollectionId(job.branch, input.sourceId);
      indexTxn.addToCollection(collectionId, input.targetId);
      this.collectionMembershipCache.invalidate(input.targetId);
    }

    this.documentMetaCache.putDocumentMeta(input.sourceId, job.branch, {
      state: sourceDoc.state.document,
      documentType: sourceDoc.header.documentType,
      documentScopeRevision: operation.index + 1,
    });

    return buildSuccessResult(
      job,
      operation,
      input.sourceId,
      sourceDoc.header.documentType,
      resultingState,
      startTime,
    );
  }

  private async executeRemoveRelationship(
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
      return buildErrorResult(
        job,
        new Error(
          `REMOVE_RELATIONSHIP must be in "document" scope, got "${job.scope}"`,
        ),
        startTime,
      );
    }

    const input = action.input as RemoveRelationshipActionInput;

    if (!input.sourceId || !input.targetId || !input.relationshipType) {
      return buildErrorResult(
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
      return buildErrorResult(
        job,
        new Error(
          `REMOVE_RELATIONSHIP: source document ${input.sourceId} not found: ${error instanceof Error ? error.message : String(error)}`,
        ),
        startTime,
      );
    }

    const nextIndex = getNextIndexForScope(sourceDoc, job.scope);

    const operation = createOperation(action, nextIndex, 0, {
      documentId: input.sourceId,
      scope: job.scope,
      branch: job.branch,
    });

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

    updateDocumentRevision(sourceDoc, job.scope, operation.index);

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

    this.writeCache.putState(
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

    if (sourceDoc.header.documentType === "powerhouse/document-drive") {
      const collectionId = driveCollectionId(job.branch, input.sourceId);
      indexTxn.removeFromCollection(collectionId, input.targetId);
      this.collectionMembershipCache.invalidate(input.targetId);
    }

    this.documentMetaCache.putDocumentMeta(input.sourceId, job.branch, {
      state: sourceDoc.state.document,
      documentType: sourceDoc.header.documentType,
      documentScopeRevision: operation.index + 1,
    });

    return buildSuccessResult(
      job,
      operation,
      input.sourceId,
      sourceDoc.header.documentType,
      resultingState,
      startTime,
    );
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
      this.logger.error(
        "Error writing @Operation to IOperationStore: @Error",
        operation,
        error,
      );

      this.writeCache.invalidate(documentId, scope, branch);

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
}

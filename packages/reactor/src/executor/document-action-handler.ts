import type {
  CreateDocumentAction,
  DeleteDocumentActionInput,
  Operation,
  PHDocument,
  UpgradeDocumentAction,
  UpgradeDocumentActionInput,
  UpgradeTransition,
} from "@powerhousedao/shared/document-model";

interface RelationshipActionShape {
  sourceId: string;
  targetId: string;
  relationshipType: string;
}

type RelationshipJobResult = JobResult & {
  operationsWithContext?: Array<{
    operation: Operation;
    context: {
      documentId: string;
      scope: string;
      branch: string;
      documentType: string;
    };
  }>;
};

/** The stream an operation is written to. */
type WriteTarget = {
  documentId: string;
  documentType: string;
  scope: string;
  branch: string;
};

interface RelationshipPostWriteArgs {
  indexTxn: IOperationIndexTxn;
  stores: ExecutionStores;
  sourceDoc: PHDocument;
  input: RelationshipActionShape;
  job: Job;
}
import { hashDocumentStateForScope } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import type { IOperationIndexTxn } from "../cache/operation-index-types.js";
import { DriveCollectionId } from "../cache/operation-index-types.js";
import type { Job } from "../queue/types.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import { DocumentDeletedError } from "../shared/errors.js";
import { AppendConditionFailedError } from "../storage/interfaces.js";
import type { ExecutionStores } from "./execution-scope.js";
import type {
  ExecutingJob,
  JobResult,
  PendingWrite,
  ReactorFeatureFlags,
} from "./types.js";
import type { RegisteredDecisionModel } from "../decision/registered-model.js";
import { decideAtHead } from "../decision/registered-model.js";
import {
  applyDeleteDocumentAction,
  applyUpgradeDocumentAction,
  buildErrorResult,
  buildSuccessResult,
  createDocumentFromAction,
  createOperation,
  GATED_DOCUMENT_ACTIONS,
  getNextIndexForScope,
  refusalError,
  updateDocumentRevision,
} from "./util.js";
import { SnapshotPosition } from "../cache/write-cache-types.js";

export class DocumentActionHandler {
  constructor(
    private registry: IDocumentModelRegistry,
    private logger: ILogger,
    private driveContainerTypes: ReadonlySet<string>,
    private featureFlags: ReactorFeatureFlags,
    private decisionModel: RegisteredDecisionModel,
  ) {}

  /** Whether the write arrives with its evaluation already decided. */
  private alreadyEvaluated(executing: ExecutingJob): boolean {
    return (
      this.featureFlags.documentDecisions &&
      (executing.replayingAcceptedHistory || executing.evaluatedByPosition)
    );
  }

  async execute(
    write: PendingWrite,
    executing: ExecutingJob,
  ): Promise<RelationshipJobResult> {
    const { action } = write;

    if (write.deniedReason !== undefined) {
      return this.writeDenied(write, executing);
    }

    const refusal = await this.refuseIfPolicyDenies(write, executing);
    if (refusal) {
      return refusal;
    }

    switch (action.type) {
      case "CREATE_DOCUMENT":
        return this.executeCreate(write, executing);
      case "DELETE_DOCUMENT":
        return this.executeDelete(write, executing);
      case "UPGRADE_DOCUMENT":
        return this.executeUpgrade(write, executing);
      case "ADD_RELATIONSHIP":
        return this.executeAddRelationship(write, executing);
      case "REMOVE_RELATIONSHIP":
        return this.executeRemoveRelationship(write, executing);
      case "UPDATE_RELATIONSHIP":
        return this.executeUpdateRelationship(write, executing);
      default:
        return buildErrorResult(
          executing.job,
          new Error(`Unknown document action type: ${action.type}`),
          executing.startTime,
        );
    }
  }

  /**
   * Refuses a document-scope write the policy denies, or undefined to proceed.
   * Without this an `execute`-on-`document` grant is unenforceable.
   */
  private async refuseIfPolicyDenies(
    write: PendingWrite,
    executing: ExecutingJob,
  ): Promise<RelationshipJobResult | undefined> {
    const { action } = write;
    const { job, startTime, stores, signal } = executing;

    if (
      !this.featureFlags.documentDecisions ||
      !this.featureFlags.authEnforcement ||
      this.alreadyEvaluated(executing) ||
      !GATED_DOCUMENT_ACTIONS.has(action.type)
    ) {
      return undefined;
    }

    // Unlike processWrite, the decision's appendCondition is deliberately
    // dropped: a later-timestamped auth operation cannot retroactively deny
    // this write, and a backdated one triggers reevaluateIfNeeded, so the
    // repair path exists without conditioning on the auth head.
    let admission;
    try {
      admission = await decideAtHead(
        this.decisionModel,
        stores.writeCache,
        { documentId: job.documentId, branch: job.branch },
        {
          address: action.context?.signer?.user.address,
          key: action.context?.signer?.app.key,
        },
        { verb: "execute", scope: action.scope, operation: action.type },
        signal,
      );
    } catch (error) {
      return buildErrorResult(
        job,
        error instanceof Error ? error : new Error(String(error)),
        startTime,
      );
    }

    if (admission.evaluation.decision === "allow") {
      return undefined;
    }

    return buildErrorResult(
      job,
      refusalError(
        admission.evaluation.reason,
        job.documentId,
        admission.deletedAtUtcIso,
        action,
      ),
      startTime,
    );
  }

  /** A refused operation holds a position in the stream but changes nothing. */
  private async writeDenied(
    write: PendingWrite,
    executing: ExecutingJob,
  ): Promise<RelationshipJobResult> {
    const { action, skip, sourceRemote, deniedReason } = write;
    const { job, startTime, indexTxn, stores, signal } = executing;

    let document: PHDocument;
    try {
      document = await stores.writeCache.getState(
        job.documentId,
        job.scope,
        job.branch,
        undefined,
        signal,
      );
    } catch (error) {
      return buildErrorResult(
        job,
        error instanceof Error ? error : new Error(String(error)),
        startTime,
      );
    }

    const index = getNextIndexForScope(document, job.scope);

    // A denied operation records the state that still stands. With a retraction
    // skip the head includes what it supersedes, so read back past the skip.
    let standing = document;
    if (skip > 0) {
      try {
        standing = await stores.writeCache.getState(
          job.documentId,
          job.scope,
          job.branch,
          index - skip - 1,
          signal,
        );
      } catch (error) {
        return buildErrorResult(
          job,
          error instanceof Error ? error : new Error(String(error)),
          startTime,
        );
      }
    }

    let operation = createOperation(action, index, skip, {
      documentId: job.documentId,
      scope: job.scope,
      branch: job.branch,
    });
    operation.deniedReason = deniedReason;
    operation.hash = hashDocumentStateForScope(standing, job.scope);

    const writeResult = await this.writeOperationToStore(
      {
        documentId: job.documentId,
        documentType: document.header.documentType,
        scope: job.scope,
        branch: job.branch,
      },
      operation,
      executing,
    );
    if (!Array.isArray(writeResult)) {
      return writeResult;
    }
    operation = writeResult[0];

    updateDocumentRevision(standing, job.scope, operation.index);

    standing.operations = {
      ...standing.operations,
      [job.scope]: [...(standing.operations[job.scope] ?? []), operation],
    };

    stores.writeCache.putState(
      job.documentId,
      job.scope,
      job.branch,
      operation.index,
      standing,
      SnapshotPosition.Head,
    );

    indexTxn.write([
      {
        ...operation,
        documentId: job.documentId,
        documentType: document.header.documentType,
        branch: job.branch,
        scope: job.scope,
        sourceRemote,
      },
    ]);

    stores.documentMetaCache.putDocumentMeta(job.documentId, job.branch, {
      state: standing.state.document,
      documentType: standing.header.documentType,
      documentScopeRevision: operation.index + 1,
    });

    return buildSuccessResult(
      job,
      operation,
      job.documentId,
      standing.header.documentType,
      JSON.stringify({
        header: standing.header,
        document: standing.state.document,
      }),
      startTime,
    );
  }

  private async executeCreate(
    write: PendingWrite,
    executing: ExecutingJob,
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
    const { action, skip, sourceRemote } = write;
    const { job, startTime, indexTxn, stores, signal } = executing;

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

    let operation = createOperation(action, 0, skip, {
      documentId: document.header.id,
      scope: job.scope,
      branch: job.branch,
    });

    const resultingStateObj: Record<string, unknown> = {
      header: document.header,
      ...document.state,
    };
    const resultingState = JSON.stringify(resultingStateObj);

    const writeResult = await this.writeOperationToStore(
      {
        documentId: document.header.id,
        documentType: document.header.documentType,
        scope: job.scope,
        branch: job.branch,
      },
      operation,
      executing,
    );
    if (!Array.isArray(writeResult)) {
      return writeResult;
    }
    operation = writeResult[0];

    updateDocumentRevision(document, job.scope, operation.index);

    document.operations = {
      ...document.operations,
      [job.scope]: [...(document.operations[job.scope] ?? []), operation],
    };

    stores.writeCache.putState(
      document.header.id,
      job.scope,
      job.branch,
      operation.index,
      document,
      SnapshotPosition.Head,
    );

    indexTxn.write([
      {
        ...operation,
        documentId: document.header.id,
        documentType: document.header.documentType,
        branch: job.branch,
        scope: job.scope,
        sourceRemote,
      },
    ]);

    if (this.driveContainerTypes.has(document.header.documentType)) {
      const collectionId = DriveCollectionId.forDrive(
        document.header.id,
        job.branch,
      ).key;
      indexTxn.createCollection(collectionId);
      indexTxn.addToCollection(collectionId, document.header.id);
    }

    stores.documentMetaCache.putDocumentMeta(document.header.id, job.branch, {
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
    write: PendingWrite,
    executing: ExecutingJob,
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
    const { action, skip, sourceRemote } = write;
    const { job, startTime, indexTxn, stores, signal } = executing;

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
      document = await stores.writeCache.getState(
        documentId,
        job.scope,
        job.branch,
        undefined,
        signal,
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

    // DCB allows positional deletion, so we may have already determined the
    // evaluation
    const documentState = document.state.document;
    if (documentState.isDeleted && !this.alreadyEvaluated(executing)) {
      return buildErrorResult(
        job,
        new DocumentDeletedError(documentId, documentState.deletedAtUtcIso),
        startTime,
      );
    }

    const nextIndex = getNextIndexForScope(document, job.scope);

    let operation = createOperation(action, nextIndex, skip, {
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

    const writeResult = await this.writeOperationToStore(
      {
        documentId: documentId,
        documentType: document.header.documentType,
        scope: job.scope,
        branch: job.branch,
      },
      operation,
      executing,
    );
    if (!Array.isArray(writeResult)) {
      return writeResult;
    }
    operation = writeResult[0];

    updateDocumentRevision(document, job.scope, operation.index);

    document.operations = {
      ...document.operations,
      [job.scope]: [...(document.operations[job.scope] ?? []), operation],
    };

    stores.writeCache.putState(
      documentId,
      job.scope,
      job.branch,
      operation.index,
      document,
      SnapshotPosition.Head,
    );

    indexTxn.write([
      {
        ...operation,
        documentId: documentId,
        documentType: document.header.documentType,
        branch: job.branch,
        scope: job.scope,
        sourceRemote,
      },
    ]);

    stores.documentMetaCache.putDocumentMeta(documentId, job.branch, {
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
    write: PendingWrite,
    executing: ExecutingJob,
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
    const { action, skip, sourceRemote } = write;
    const { job, startTime, indexTxn, stores, signal } = executing;

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
      document = await stores.writeCache.getState(
        documentId,
        job.scope,
        job.branch,
        undefined,
        signal,
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

    // DCB allows for positional deletion, so the evaluation may have already been
    // decided
    const documentState = document.state.document;
    if (documentState.isDeleted && !this.alreadyEvaluated(executing)) {
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

    let operation = createOperation(action, nextIndex, skip, {
      documentId,
      scope: job.scope,
      branch: job.branch,
    });

    const resultingStateObj: Record<string, unknown> = {
      header: document.header,
      ...document.state,
    };
    const resultingState = JSON.stringify(resultingStateObj);

    const writeResult = await this.writeOperationToStore(
      {
        documentId: documentId,
        documentType: document.header.documentType,
        scope: job.scope,
        branch: job.branch,
      },
      operation,
      executing,
    );
    if (!Array.isArray(writeResult)) {
      return writeResult;
    }
    operation = writeResult[0];

    updateDocumentRevision(document, job.scope, operation.index);

    document.operations = {
      ...document.operations,
      [job.scope]: [...(document.operations[job.scope] ?? []), operation],
    };

    stores.writeCache.putState(
      documentId,
      job.scope,
      job.branch,
      operation.index,
      document,
      SnapshotPosition.Head,
    );

    indexTxn.write([
      {
        ...operation,
        documentId: documentId,
        documentType: document.header.documentType,
        branch: job.branch,
        scope: job.scope,
        sourceRemote,
      },
    ]);

    stores.documentMetaCache.putDocumentMeta(documentId, job.branch, {
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

  private executeAddRelationship(
    write: PendingWrite,
    executing: ExecutingJob,
  ): Promise<RelationshipJobResult> {
    return this.withRelationshipAction(
      "ADD_RELATIONSHIP",
      write,
      executing,
      (input) =>
        input.sourceId === input.targetId
          ? new Error(
              "ADD_RELATIONSHIP: sourceId and targetId cannot be the same (self-relationships not allowed)",
            )
          : null,
      ({ indexTxn: txn, stores: s, sourceDoc, input, job: j }) => {
        if (this.driveContainerTypes.has(sourceDoc.header.documentType)) {
          const collectionId = DriveCollectionId.forDrive(
            input.sourceId,
            j.branch,
          ).key;
          txn.addToCollection(collectionId, input.targetId);
          s.collectionMembershipCache.invalidate(input.targetId);
        }
      },
    );
  }

  private executeRemoveRelationship(
    write: PendingWrite,
    executing: ExecutingJob,
  ): Promise<RelationshipJobResult> {
    return this.withRelationshipAction(
      "REMOVE_RELATIONSHIP",
      write,
      executing,
      null,
      ({ indexTxn: txn, stores: s, sourceDoc, input, job: j }) => {
        if (this.driveContainerTypes.has(sourceDoc.header.documentType)) {
          const collectionId = DriveCollectionId.forDrive(
            input.sourceId,
            j.branch,
          ).key;
          txn.removeFromCollection(collectionId, input.targetId);
          s.collectionMembershipCache.invalidate(input.targetId);
        }
      },
    );
  }

  private executeUpdateRelationship(
    write: PendingWrite,
    executing: ExecutingJob,
  ): Promise<RelationshipJobResult> {
    return this.withRelationshipAction(
      "UPDATE_RELATIONSHIP",
      write,
      executing,
      null,
      null,
    );
  }

  private async withRelationshipAction(
    actionTypeName: string,
    write: PendingWrite,
    executing: ExecutingJob,
    preValidate: ((input: RelationshipActionShape) => Error | null) | null,
    postWrite: ((args: RelationshipPostWriteArgs) => void) | null,
  ): Promise<RelationshipJobResult> {
    const { action, skip, sourceRemote } = write;
    const { job, startTime, indexTxn, stores, signal } = executing;

    if (job.scope !== "document") {
      return buildErrorResult(
        job,
        new Error(
          `${actionTypeName} must be in "document" scope, got "${job.scope}"`,
        ),
        startTime,
      );
    }

    const input = action.input as RelationshipActionShape;

    if (!input.sourceId || !input.targetId || !input.relationshipType) {
      return buildErrorResult(
        job,
        new Error(
          `${actionTypeName} action requires sourceId, targetId, and relationshipType in input`,
        ),
        startTime,
      );
    }

    if (preValidate !== null) {
      const validationError = preValidate(input);
      if (validationError !== null) {
        return buildErrorResult(job, validationError, startTime);
      }
    }

    let sourceDoc: PHDocument;
    try {
      sourceDoc = await stores.writeCache.getState(
        input.sourceId,
        "document",
        job.branch,
        undefined,
        signal,
      );
    } catch (error) {
      return buildErrorResult(
        job,
        new Error(
          `${actionTypeName}: source document ${input.sourceId} not found: ${error instanceof Error ? error.message : String(error)}`,
        ),
        startTime,
      );
    }

    const nextIndex = getNextIndexForScope(sourceDoc, job.scope);
    let operation = createOperation(action, nextIndex, skip, {
      documentId: input.sourceId,
      scope: job.scope,
      branch: job.branch,
    });

    const writeResult = await this.writeOperationToStore(
      {
        documentId: input.sourceId,
        documentType: sourceDoc.header.documentType,
        scope: job.scope,
        branch: job.branch,
      },
      operation,
      executing,
    );
    if (!Array.isArray(writeResult)) {
      return writeResult;
    }
    operation = writeResult[0];

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

    stores.writeCache.putState(
      input.sourceId,
      job.scope,
      job.branch,
      operation.index,
      sourceDoc,
      SnapshotPosition.Head,
    );

    indexTxn.write([
      {
        ...operation,
        documentId: input.sourceId,
        documentType: sourceDoc.header.documentType,
        branch: job.branch,
        scope: job.scope,
        sourceRemote,
      },
    ]);

    if (postWrite !== null) {
      postWrite({ indexTxn, stores, sourceDoc, input, job });
    }

    stores.documentMetaCache.putDocumentMeta(input.sourceId, job.branch, {
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
    target: WriteTarget,
    operation: Operation,
    executing: ExecutingJob,
  ): Promise<Operation[] | JobResult> {
    const { documentId, documentType, scope, branch } = target;
    const { job, startTime, stores, signal } = executing;

    let storedOperations: Operation[];

    try {
      storedOperations = await stores.operationStore.apply(
        documentId,
        documentType,
        scope,
        branch,
        operation.index,
        (txn) => {
          txn.addOperations(operation);
        },
        signal,
      );
    } catch (error) {
      this.logger.error(
        "Error writing @Operation to IOperationStore: @Error",
        operation,
        error,
      );

      stores.writeCache.invalidate(documentId, scope, branch);

      // read-set streams must also leave the cache, or a retry rebuilds the
      // same stale condition
      if (AppendConditionFailedError.isError(error)) {
        for (const stream of error.condition.streams) {
          stores.writeCache.invalidate(
            stream.documentId,
            stream.scope,
            stream.branch,
          );
        }
      }

      return {
        job,
        success: false,
        error: AppendConditionFailedError.isError(error)
          ? error
          : new Error(
              `Failed to write operation to IOperationStore: ${error instanceof Error ? error.message : String(error)}`,
            ),
        duration: Date.now() - startTime,
      };
    }

    return storedOperations;
  }
}

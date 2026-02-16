import type {
  Action,
  DocumentModelModule,
  Operation,
  OperationWithContext,
  PHDocument,
} from "document-model";
import { isUndoRedo } from "document-model/core";
import type { ICollectionMembershipCache } from "../cache/collection-membership-cache.js";
import type { IDocumentMetaCache } from "../cache/document-meta-cache-types.js";
import type {
  IOperationIndex,
  IOperationIndexTxn,
} from "../cache/operation-index-types.js";
import type { IWriteCache } from "../cache/write/interfaces.js";
import type { IEventBus } from "../events/interfaces.js";
import { ReactorEventTypes, type JobWriteReadyEvent } from "../events/types.js";
import type { ILogger } from "../logging/types.js";
import type { Job } from "../queue/types.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import { DocumentDeletedError } from "../shared/errors.js";
import type { SignatureVerificationHandler } from "../signer/types.js";
import type { IOperationStore } from "../storage/interfaces.js";
import { reshuffleByTimestamp } from "../utils/reshuffle.js";
import { DocumentActionHandler } from "./document-action-handler.js";
import type { IJobExecutor } from "./interfaces.js";
import { SignatureVerifier } from "./signature-verifier.js";
import type { JobExecutorConfig, JobResult } from "./types.js";
import { buildErrorResult } from "./util.js";

const MAX_SKIP_THRESHOLD = 1000;

type ProcessActionsResult = {
  success: boolean;
  generatedOperations: Operation[];
  operationsWithContext: OperationWithContext[];
  error?: Error;
};

const documentScopeActions = [
  "CREATE_DOCUMENT",
  "DELETE_DOCUMENT",
  "UPGRADE_DOCUMENT",
  "ADD_RELATIONSHIP",
  "REMOVE_RELATIONSHIP",
];

/**
 * Simple job executor that processes a job by applying actions through document model reducers.
 */
export class SimpleJobExecutor implements IJobExecutor {
  private config: Required<JobExecutorConfig>;
  private signatureVerifierModule: SignatureVerifier;
  private documentActionHandler: DocumentActionHandler;

  constructor(
    private logger: ILogger,
    private registry: IDocumentModelRegistry,
    private operationStore: IOperationStore,
    private eventBus: IEventBus,
    private writeCache: IWriteCache,
    private operationIndex: IOperationIndex,
    private documentMetaCache: IDocumentMetaCache,
    private collectionMembershipCache: ICollectionMembershipCache,
    config: JobExecutorConfig,
    signatureVerifier?: SignatureVerificationHandler,
  ) {
    this.config = {
      maxSkipThreshold: config.maxSkipThreshold ?? MAX_SKIP_THRESHOLD,
      maxConcurrency: config.maxConcurrency ?? 1,
      jobTimeoutMs: config.jobTimeoutMs ?? 30000,
      retryBaseDelayMs: config.retryBaseDelayMs ?? 100,
      retryMaxDelayMs: config.retryMaxDelayMs ?? 5000,
    };
    this.signatureVerifierModule = new SignatureVerifier(signatureVerifier);
    this.documentActionHandler = new DocumentActionHandler(
      writeCache,
      operationStore,
      documentMetaCache,
      collectionMembershipCache,
      registry,
      logger,
    );
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
        const collectionMemberships =
          result.operationsWithContext.length > 0
            ? await this.getCollectionMembershipsForOperations(
                result.operationsWithContext,
              )
            : {};
        const event: JobWriteReadyEvent = {
          jobId: job.id,
          operations: result.operationsWithContext,
          jobMeta: job.meta,
          collectionMemberships,
        };
        this.eventBus
          .emit(ReactorEventTypes.JOB_WRITE_READY, event)
          .catch(() => {
            // TODO: Log error
          });
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
      const collectionMemberships =
        await this.getCollectionMembershipsForOperations(
          result.operationsWithContext,
        );
      const event: JobWriteReadyEvent = {
        jobId: job.id,
        operations: result.operationsWithContext,
        jobMeta: job.meta,
        collectionMemberships,
      };
      this.eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, event).catch(() => {
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

  private async getCollectionMembershipsForOperations(
    operations: OperationWithContext[],
  ): Promise<Record<string, string[]>> {
    const documentIds = [
      ...new Set(operations.map((op) => op.context.documentId)),
    ];
    return this.collectionMembershipCache.getCollectionsForDocuments(
      documentIds,
    );
  }

  private async processActions(
    job: Job,
    actions: Action[],
    startTime: number,
    indexTxn: IOperationIndexTxn,
    skipValues?: number[],
    sourceOperations?: (Operation | undefined)[],
    sourceRemote: string = "",
  ): Promise<ProcessActionsResult> {
    const generatedOperations: Operation[] = [];
    const operationsWithContext: OperationWithContext[] = [];

    try {
      await this.signatureVerifierModule.verifyActions(
        job.documentId,
        job.branch,
        actions,
      );
    } catch (error) {
      return {
        success: false,
        generatedOperations,
        operationsWithContext,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }

    for (let actionIndex = 0; actionIndex < actions.length; actionIndex++) {
      const action = actions[actionIndex];
      const skip = skipValues?.[actionIndex] ?? 0;
      const sourceOperation = sourceOperations?.[actionIndex];

      const isDocumentAction = documentScopeActions.includes(action.type);
      const result = isDocumentAction
        ? await this.documentActionHandler.execute(
            job,
            action,
            startTime,
            indexTxn,
            skip,
            sourceRemote,
          )
        : await this.executeRegularAction(
            job,
            action,
            startTime,
            indexTxn,
            skip,
            sourceOperation,
            sourceRemote,
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
    }

    return {
      success: true,
      generatedOperations,
      operationsWithContext,
    };
  }

  private async executeRegularAction(
    job: Job,
    action: Action,
    startTime: number,
    indexTxn: IOperationIndexTxn,
    skip: number = 0,
    sourceOperation?: Operation,
    sourceRemote: string = "",
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
    let docMeta;
    try {
      docMeta = await this.documentMetaCache.getDocumentMeta(
        job.documentId,
        job.branch,
      );
    } catch (error) {
      return buildErrorResult(
        job,
        error instanceof Error ? error : new Error(String(error)),
        startTime,
      );
    }

    if (docMeta.state.isDeleted) {
      return buildErrorResult(
        job,
        new DocumentDeletedError(job.documentId, docMeta.state.deletedAtUtcIso),
        startTime,
      );
    }

    let document: PHDocument;
    try {
      document = await this.writeCache.getState(
        job.documentId,
        job.scope,
        job.branch,
      );
    } catch (error) {
      return buildErrorResult(
        job,
        error instanceof Error ? error : new Error(String(error)),
        startTime,
      );
    }

    let module: DocumentModelModule;
    try {
      const moduleVersion =
        docMeta.state.version === 0 ? undefined : docMeta.state.version;
      module = this.registry.getModule(
        document.header.documentType,
        moduleVersion,
      );
    } catch (error) {
      return buildErrorResult(
        job,
        error instanceof Error ? error : new Error(String(error)),
        startTime,
      );
    }

    let updatedDocument: PHDocument;
    try {
      const protocolVersion =
        document.header.protocolVersions?.["base-reducer"] ?? 1;
      const reducerOptions = sourceOperation
        ? {
            skip,
            branch: job.branch,
            replayOptions: { operation: sourceOperation },
            protocolVersion,
          }
        : { skip, branch: job.branch, protocolVersion };
      updatedDocument = module.reducer(
        document as PHDocument,
        action,
        undefined,
        reducerOptions,
      );
    } catch (error) {
      const contextMessage = `Failed to apply action to document:\n  Action type: ${action.type}\n  Document ID: ${job.documentId}\n  Document type: ${document.header.documentType}\n  Scope: ${job.scope}\n  Original error: ${error instanceof Error ? error.message : String(error)}`;
      const enhancedError = new Error(contextMessage);
      if (error instanceof Error && error.stack) {
        enhancedError.stack = `${contextMessage}\n\nOriginal stack trace:\n${error.stack}`;
      }
      return buildErrorResult(job, enhancedError, startTime);
    }

    const scope = job.scope;
    const operations = updatedDocument.operations[scope];

    if (operations.length === 0) {
      return buildErrorResult(
        job,
        new Error("No operation generated from action"),
        startTime,
      );
    }

    const newOperation = operations[operations.length - 1];

    if (!isUndoRedo(action)) {
      newOperation.skip = skip;
    }

    const resultingState = JSON.stringify({
      ...updatedDocument.state,
      header: updatedDocument.header,
    });

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
      this.logger.error(
        "Error writing @Operation to IOperationStore: @Error",
        newOperation,
        error,
      );

      this.writeCache.invalidate(job.documentId, scope, job.branch);

      return {
        job,
        success: false,
        error: new Error(
          `Failed to write operation to IOperationStore: ${error instanceof Error ? error.message : String(error)}`,
        ),
        duration: Date.now() - startTime,
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
        sourceRemote,
      },
    ]);

    return {
      job,
      success: true,
      operations: [newOperation],
      operationsWithContext: [
        {
          operation: newOperation,
          context: {
            documentId: job.documentId,
            scope,
            branch: job.branch,
            documentType: document.header.documentType,
            resultingState,
            ordinal: 0,
          },
        },
      ],
      duration: Date.now() - startTime,
    };
  }

  private async executeLoadJob(
    job: Job,
    startTime: number,
    indexTxn: IOperationIndexTxn,
  ): Promise<JobResult> {
    if (job.operations.length === 0) {
      return buildErrorResult(
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

    let minIncomingIndex = Number.POSITIVE_INFINITY;
    let minIncomingTimestamp = job.operations[0]?.timestampUtcMs || "";
    for (const operation of job.operations) {
      minIncomingIndex = Math.min(minIncomingIndex, operation.index);
      const ts = operation.timestampUtcMs || "";
      if (ts < minIncomingTimestamp) {
        minIncomingTimestamp = ts;
      }
    }

    let conflictingOps: Operation[] = [];
    try {
      const conflictingResult = await this.operationStore.getConflicting(
        job.documentId,
        scope,
        job.branch,
        minIncomingTimestamp,
        { cursor: "0", limit: this.config.maxSkipThreshold + 1 },
      );

      if (conflictingResult.nextCursor !== undefined) {
        return {
          job,
          success: false,
          error: new Error(
            `Excessive reshuffle detected: more than ${this.config.maxSkipThreshold} conflicting operations found. ` +
              `This indicates a significant divergence between local and incoming operations.`,
          ),
          duration: Date.now() - startTime,
        };
      }

      conflictingOps = conflictingResult.results;
    } catch {
      conflictingOps = [];
    }

    let allOpsFromMinConflictingIndex: Operation[] = conflictingOps;
    if (conflictingOps.length > 0) {
      const minConflictingIndex = Math.min(
        ...conflictingOps.map((op) => op.index),
      );
      try {
        const allOpsResult = await this.operationStore.getSince(
          job.documentId,
          scope,
          job.branch,
          minConflictingIndex - 1,
          undefined,
          { cursor: "0", limit: this.config.maxSkipThreshold * 2 },
        );
        allOpsFromMinConflictingIndex = allOpsResult.results;
      } catch {
        allOpsFromMinConflictingIndex = conflictingOps;
      }
    }

    const nonSupersededOps = conflictingOps.filter((op) => {
      for (const laterOp of allOpsFromMinConflictingIndex) {
        if (laterOp.index > op.index && laterOp.skip > 0) {
          const logicalIndex = laterOp.index - laterOp.skip;
          if (logicalIndex <= op.index) {
            return false;
          }
        }
      }
      return true;
    });

    const existingOpsToReshuffle = nonSupersededOps;

    const skipCount = existingOpsToReshuffle.length;

    if (skipCount > this.config.maxSkipThreshold) {
      return {
        job,
        success: false,
        error: new Error(
          `Excessive reshuffle detected: skip count of ${skipCount} exceeds threshold of ${this.config.maxSkipThreshold}. ` +
            `This indicates a significant divergence between local and incoming operations.`,
        ),
        duration: Date.now() - startTime,
      };
    }

    const existingActionIds = new Set(
      nonSupersededOps.map((op) => op.action.id),
    );
    const seenIncomingActionIds = new Set<string>();
    const incomingOpsToApply = job.operations.filter((op) => {
      if (existingActionIds.has(op.action.id)) return false;
      if (seenIncomingActionIds.has(op.action.id)) return false;
      seenIncomingActionIds.add(op.action.id);
      return true;
    });

    if (incomingOpsToApply.length === 0) {
      return {
        job,
        success: true,
        operations: [],
        operationsWithContext: [],
        duration: Date.now() - startTime,
      };
    }

    const reshuffledOperations = reshuffleByTimestamp(
      {
        index: latestRevision,
        skip: skipCount,
      },
      existingOpsToReshuffle,
      incomingOpsToApply.map((operation) => ({
        ...operation,
        id: operation.id,
      })),
    );

    for (const operation of reshuffledOperations) {
      if (operation.action.type === "NOOP") {
        operation.skip = 1;
      }
    }

    const actions = reshuffledOperations.map((operation) => operation.action);
    const skipValues = reshuffledOperations.map((operation) => operation.skip);

    const effectiveSourceRemote =
      skipCount > 0
        ? "" // reshuffle: send to all remotes including source
        : (job.meta.sourceRemote as string) || ""; // trivial append: suppress echo to source

    const result = await this.processActions(
      job,
      actions,
      startTime,
      indexTxn,
      skipValues,
      reshuffledOperations,
      effectiveSourceRemote,
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

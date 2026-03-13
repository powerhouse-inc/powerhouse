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
import type { ExecutionStores, IExecutionScope } from "./execution-scope.js";
import { DefaultExecutionScope } from "./execution-scope.js";
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
  private executionScope: IExecutionScope;

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
    executionScope?: IExecutionScope,
  ) {
    this.config = {
      maxSkipThreshold: config.maxSkipThreshold ?? MAX_SKIP_THRESHOLD,
      maxConcurrency: config.maxConcurrency ?? 1,
      jobTimeoutMs: config.jobTimeoutMs ?? 30000,
      retryBaseDelayMs: config.retryBaseDelayMs ?? 100,
      retryMaxDelayMs: config.retryMaxDelayMs ?? 5000,
    };
    this.signatureVerifierModule = new SignatureVerifier(signatureVerifier);
    this.documentActionHandler = new DocumentActionHandler(registry, logger);
    this.executionScope =
      executionScope ??
      new DefaultExecutionScope(
        operationStore,
        operationIndex,
        writeCache,
        documentMetaCache,
        collectionMembershipCache,
      );
  }

  /**
   * Execute a single job by applying all its actions through the appropriate reducers.
   * Actions are processed sequentially in order.
   */
  async executeJob(job: Job): Promise<JobResult> {
    const startTime = Date.now();

    // Track document IDs touched during execution for cache invalidation on rollback
    const touchedCacheEntries: Array<{
      documentId: string;
      scope: string;
      branch: string;
    }> = [];

    let pendingEvent: JobWriteReadyEvent | undefined;
    let result: JobResult;
    try {
      result = await this.executionScope.run(async (stores) => {
        const indexTxn = stores.operationIndex.start();

        if (job.kind === "load") {
          const loadResult = await this.executeLoadJob(
            job,
            startTime,
            indexTxn,
            stores,
          );
          if (loadResult.success && loadResult.operationsWithContext) {
            for (const owc of loadResult.operationsWithContext) {
              touchedCacheEntries.push({
                documentId: owc.context.documentId,
                scope: owc.context.scope,
                branch: owc.context.branch,
              });
            }

            const ordinals = await stores.operationIndex.commit(indexTxn);

            for (let i = 0; i < loadResult.operationsWithContext.length; i++) {
              loadResult.operationsWithContext[i].context.ordinal = ordinals[i];
            }
            const collectionMemberships =
              loadResult.operationsWithContext.length > 0
                ? await this.getCollectionMembershipsForOperations(
                    loadResult.operationsWithContext,
                    stores,
                  )
                : {};
            pendingEvent = {
              jobId: job.id,
              operations: loadResult.operationsWithContext,
              jobMeta: job.meta,
              collectionMemberships,
            };
          }
          return loadResult;
        }

        const actionResult = await this.processActions(
          job,
          job.actions,
          startTime,
          indexTxn,
          stores,
        );

        if (!actionResult.success) {
          return {
            job,
            success: false as const,
            error: actionResult.error,
            duration: Date.now() - startTime,
          };
        }

        if (actionResult.operationsWithContext.length > 0) {
          for (const owc of actionResult.operationsWithContext) {
            touchedCacheEntries.push({
              documentId: owc.context.documentId,
              scope: owc.context.scope,
              branch: owc.context.branch,
            });
          }
        }

        const ordinals = await stores.operationIndex.commit(indexTxn);

        if (actionResult.operationsWithContext.length > 0) {
          for (let i = 0; i < actionResult.operationsWithContext.length; i++) {
            actionResult.operationsWithContext[i].context.ordinal = ordinals[i];
          }
          const collectionMemberships =
            await this.getCollectionMembershipsForOperations(
              actionResult.operationsWithContext,
              stores,
            );
          pendingEvent = {
            jobId: job.id,
            operations: actionResult.operationsWithContext,
            jobMeta: job.meta,
            collectionMemberships,
          };
        }

        return {
          job,
          success: true as const,
          operations: actionResult.generatedOperations,
          operationsWithContext: actionResult.operationsWithContext,
          duration: Date.now() - startTime,
        };
      });
    } catch (error) {
      for (const entry of touchedCacheEntries) {
        this.writeCache.invalidate(entry.documentId, entry.scope, entry.branch);
        this.documentMetaCache.invalidate(entry.documentId, entry.branch);
      }
      throw error;
    }

    if (pendingEvent) {
      this.eventBus
        .emit(ReactorEventTypes.JOB_WRITE_READY, pendingEvent)
        .catch((error) => {
          this.logger.error(
            "Failed to emit JOB_WRITE_READY event: @Event : @Error",
            pendingEvent,
            error,
          );
        });
    }

    return result;
  }

  private async getCollectionMembershipsForOperations(
    operations: OperationWithContext[],
    stores: ExecutionStores,
  ): Promise<Record<string, string[]>> {
    const documentIds = [
      ...new Set(operations.map((op) => op.context.documentId)),
    ];
    return stores.collectionMembershipCache.getCollectionsForDocuments(
      documentIds,
    );
  }

  private async processActions(
    job: Job,
    actions: Action[],
    startTime: number,
    indexTxn: IOperationIndexTxn,
    stores: ExecutionStores,
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
            stores,
            skip,
            sourceRemote,
          )
        : await this.executeRegularAction(
            job,
            action,
            startTime,
            indexTxn,
            stores,
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
    stores: ExecutionStores,
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
      docMeta = await stores.documentMetaCache.getDocumentMeta(
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

    // UNDO, REDO, PRUNE, and NOOP+skip need the full operation history to
    // replay state correctly. The write cache stores sliced documents (last
    // op per scope only), so invalidate before loading to force a cold-miss
    // rebuild. NOOP+skip arises in executeLoadJob when sync reshuffling
    // converts conflicting local ops to NOOPs.
    if (
      isUndoRedo(action) ||
      action.type === "PRUNE" ||
      (action.type === "NOOP" && skip > 0)
    ) {
      stores.writeCache.invalidate(job.documentId, job.scope, job.branch);
    }

    let document: PHDocument;
    try {
      document = await stores.writeCache.getState(
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
      await stores.operationStore.apply(
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

      stores.writeCache.invalidate(job.documentId, scope, job.branch);

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

    stores.writeCache.putState(
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
    stores: ExecutionStores,
  ): Promise<JobResult> {
    if (job.operations.length === 0) {
      return buildErrorResult(
        job,
        new Error("Load job must include at least one operation"),
        startTime,
      );
    }

    let docMeta;
    try {
      docMeta = await stores.documentMetaCache.getDocumentMeta(
        job.documentId,
        job.branch,
      );
    } catch {
      // Document meta not found -- continue with load (may be a new document)
    }

    if (docMeta?.state.isDeleted) {
      return buildErrorResult(
        job,
        new DocumentDeletedError(job.documentId, docMeta.state.deletedAtUtcIso),
        startTime,
      );
    }

    const scope = job.scope;

    let latestRevision = 0;
    try {
      const revisions = await stores.operationStore.getRevisions(
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
      const conflictingResult = await stores.operationStore.getConflicting(
        job.documentId,
        scope,
        job.branch,
        minIncomingTimestamp,
      );

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
        const allOpsResult = await stores.operationStore.getSince(
          job.documentId,
          scope,
          job.branch,
          minConflictingIndex - 1,
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
      stores,
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

    stores.writeCache.invalidate(job.documentId, scope, job.branch);

    if (scope === "document") {
      stores.documentMetaCache.invalidate(job.documentId, job.branch);
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

import type {
  Action,
  DocumentModelModule,
  Operation,
  OperationWithContext,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  baseReducerVersion,
  decide,
  garbageCollect,
  hashDocumentStateForScope,
  isUndoRedo,
  sortOperations,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import type { ICollectionMembershipCache } from "../cache/collection-membership-cache.js";
import type { IDocumentMetaCache } from "../cache/document-meta-cache-types.js";
import type {
  IOperationIndex,
  IOperationIndexTxn,
} from "../cache/operation-index-types.js";
import type { IWriteCache } from "../cache/write/interfaces.js";
import type { IEventBus } from "../events/interfaces.js";
import { ReactorEventTypes, type JobWriteReadyEvent } from "../events/types.js";
import type { Job } from "../queue/types.js";
import type { IDocumentModelRegistry } from "../registry/interfaces.js";
import {
  AuthorizationDeniedError,
  DocumentDeletedError,
} from "../shared/errors.js";
import { yieldToMain } from "../shared/utils.js";
import type { SignatureVerificationHandler } from "../signer/types.js";
import {
  AppendConditionFailedError,
  type AppendCondition,
  type IOperationStore,
} from "../storage/interfaces.js";
import { reshuffleByTimestamp } from "../utils/reshuffle.js";
import { buildDecisionModel } from "../decision/build-decision-model.js";
import { documentDecisionModel } from "../decision/document-decision-model.js";
import { evaluateDeletionsByPosition } from "../decision/deletion-evaluation.js";
import { staticReadSet } from "../decision/build-decision-model.js";
import { retractionSkip } from "../decision/merged-order.js";
import { DocumentActionHandler } from "./document-action-handler.js";
import type { ExecutionStores, IExecutionScope } from "./execution-scope.js";
import { DefaultExecutionScope } from "./execution-scope.js";
import type { IJobExecutor } from "./interfaces.js";
import { SignatureVerifier } from "./signature-verifier.js";
import type {
  JobExecutorConfig,
  JobResult,
  ReactorFeatureFlags,
} from "./types.js";
import {
  buildErrorResult,
  createOperation,
  getNextIndexForScope,
} from "./util.js";
import { SnapshotPosition } from "../cache/write-cache-types.js";

const MAX_SKIP_THRESHOLD = 1000;

const ISO_TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function isValidISOTimestamp(value: string): boolean {
  if (!ISO_TIMESTAMP_REGEX.test(value)) {
    return false;
  }
  return !isNaN(new Date(value).getTime());
}

type ProcessActionsResult = {
  success: boolean;
  generatedOperations: Operation[];
  operationsWithContext: OperationWithContext[];
  error?: Error;
};

/**
 * A write that just committed, tested to decide whether earlier evaluations
 * still hold. The operations all belong to `scope` of the job's document.
 */
type EvaluationCriteria = {
  scope: string;
  operations: Operation[];
};

/** The job in flight and what a re-evaluation writes its operations through. */
type ExecutingJob = {
  job: Job;
  startTime: number;
  indexTxn: IOperationIndexTxn;
  stores: ExecutionStores;
  signal?: AbortSignal;
};

const documentScopeActions = [
  "CREATE_DOCUMENT",
  "DELETE_DOCUMENT",
  "UPGRADE_DOCUMENT",
  "ADD_RELATIONSHIP",
  "REMOVE_RELATIONSHIP",
  "UPDATE_RELATIONSHIP",
];

/**
 * Simple job executor that processes a job by applying actions through document model reducers.
 */
export class SimpleJobExecutor implements IJobExecutor {
  private config: Required<JobExecutorConfig>;
  private featureFlags: ReactorFeatureFlags;
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
    private driveContainerTypes: ReadonlySet<string>,
    config: JobExecutorConfig,
    signatureVerifier?: SignatureVerificationHandler,
    executionScope?: IExecutionScope,
  ) {
    this.config = {
      featureFlags: config.featureFlags ?? {},
      maxSkipThreshold: config.maxSkipThreshold ?? MAX_SKIP_THRESHOLD,
      maxConcurrency: config.maxConcurrency ?? 1,
      jobTimeoutMs: config.jobTimeoutMs ?? 30000,
      retryBaseDelayMs: config.retryBaseDelayMs ?? 100,
      retryMaxDelayMs: config.retryMaxDelayMs ?? 5000,
      yieldDeadlineMs: config.yieldDeadlineMs ?? 50,
    };

    // Resolved separately so reads are plain booleans; the config keeps what
    // the caller passed, because that is what crosses to a pooled worker.
    this.featureFlags = {
      documentDecisions: config.featureFlags?.documentDecisions ?? false,
    };
    this.signatureVerifierModule = new SignatureVerifier(signatureVerifier);
    this.documentActionHandler = new DocumentActionHandler(
      registry,
      logger,
      driveContainerTypes,
    );
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
  async executeJob(job: Job, signal?: AbortSignal): Promise<JobResult> {
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
            signal,
          );
          if (loadResult.success && loadResult.operationsWithContext) {
            for (const owc of loadResult.operationsWithContext) {
              touchedCacheEntries.push({
                documentId: owc.context.documentId,
                scope: owc.context.scope,
                branch: owc.context.branch,
              });
            }

            const ordinals = await stores.operationIndex.commit(
              indexTxn,
              signal,
            );

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
          undefined,
          undefined,
          "",
          signal,
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

        // Put here because a re-eval pass writes through the same db db
        // transaction.
        const reevaluationError = await this.reevaluateIfCriteriaMet(
          { scope: job.scope, operations: actionResult.generatedOperations },
          { job, startTime, indexTxn, stores, signal },
        );
        if (reevaluationError) {
          return {
            job,
            success: false as const,
            error: reevaluationError,
            duration: Date.now() - startTime,
          };
        }

        const ordinals = await stores.operationIndex.commit(indexTxn, signal);

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
      }, signal);
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
    signal?: AbortSignal,
    deniedReasons?: Array<string | undefined>,
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

    for (const action of actions) {
      if (
        action.timestampUtcMs &&
        !isValidISOTimestamp(action.timestampUtcMs)
      ) {
        return {
          success: false,
          generatedOperations,
          operationsWithContext,
          error: new Error(
            `Invalid timestamp "${action.timestampUtcMs}" on action ${action.type} (id: ${action.id})`,
          ),
        };
      }
    }

    let lastYield = performance.now();

    // A load's operations were accepted at their own positions, and so were the
    // operations a re-evaluation pass hands back.
    const replayingAcceptedHistory =
      job.kind === "load" || deniedReasons !== undefined;

    for (let actionIndex = 0; actionIndex < actions.length; actionIndex++) {
      const action = actions[actionIndex];
      const skip = skipValues?.[actionIndex] ?? 0;
      const sourceOperation = sourceOperations?.[actionIndex];
      const deniedReason = deniedReasons?.[actionIndex];

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
            signal,
            this.featureFlags.documentDecisions && replayingAcceptedHistory,
            deniedReason,
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
            signal,
            deniedReason,
            replayingAcceptedHistory,
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

      if (performance.now() - lastYield > this.config.yieldDeadlineMs) {
        await yieldToMain();
        lastYield = performance.now();

        if (signal?.aborted) {
          return {
            success: false,
            generatedOperations,
            operationsWithContext,
            error: new Error("Aborted"),
          };
        }
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
    signal?: AbortSignal,
    deniedReason?: string,
    replayingAcceptedHistory = false,
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
    // append conditions are used iff the decision model flag is on
    let appendCondition: AppendCondition | undefined;
    let documentVersion: number | undefined;

    const alreadyEvaluated =
      this.featureFlags.documentDecisions && replayingAcceptedHistory;

    if (this.featureFlags.documentDecisions && !alreadyEvaluated) {
      const target = { documentId: job.documentId, branch: job.branch };
      const definition = documentDecisionModel(target);

      let built;
      try {
        built = await buildDecisionModel(
          stores.writeCache,
          () => definition,
          target,
          signal,
        );
      } catch (error) {
        return buildErrorResult(
          job,
          error instanceof Error ? error : new Error(String(error)),
          startTime,
        );
      }

      const decision = definition.decide(
        built.model,
        {
          address: action.context?.signer?.user.address,
          key: action.context?.signer?.app.key,
        },
        { verb: "execute", scope: action.scope, operation: action.type },
        { scopeState: undefined },
      );

      if (decision === "deny") {
        return buildErrorResult(
          job,
          new DocumentDeletedError(
            job.documentId,
            built.model.document.deletedAtUtcIso,
          ),
          startTime,
        );
      }

      appendCondition = built.appendCondition;
      documentVersion = built.model.document.version;
    } else if (alreadyEvaluated) {
      const documentScope = await stores.writeCache.getState(
        job.documentId,
        "document",
        job.branch,
        undefined,
        signal,
      );
      documentVersion = documentScope.state.document.version;
    } else {
      let docMeta;
      try {
        docMeta = await stores.documentMetaCache.getDocumentMeta(
          job.documentId,
          job.branch,
          signal,
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
          new DocumentDeletedError(
            job.documentId,
            docMeta.state.deletedAtUtcIso,
          ),
          startTime,
        );
      }

      documentVersion = docMeta.state.version;
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

    // An auth decision should be made iff this set of operations have not
    // already been evaluated. Re-evaluating could drop operations and diverge
    // replicas.
    if (!replayingAcceptedHistory) {
      const subject = {
        address: action.context?.signer?.user.address,
        key: action.context?.signer?.app.key,
      };
      const decision = decide(document.state.auth, subject, {
        verb: "execute",
        scope: action.scope,
        operation: action.type,
      });
      if (decision === "deny") {
        return buildErrorResult(
          job,
          new AuthorizationDeniedError(
            job.documentId,
            action.scope,
            action.type,
            subject.address,
          ),
          startTime,
        );
      }
    }

    let module: DocumentModelModule;
    try {
      const moduleVersion = documentVersion === 0 ? undefined : documentVersion;
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

    if (deniedReason !== undefined) {
      // A denied operation holds only a position but does not change state.
      const index = getNextIndexForScope(document, job.scope);
      const denied = createOperation(action, index, skip, {
        documentId: job.documentId,
        scope: job.scope,
        branch: job.branch,
      });
      denied.deniedReason = deniedReason;

      // A denied operation does not change state, so it records the previous
      // state. We need to add skip to get the actual previous state.
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

      denied.hash = hashDocumentStateForScope(standing, job.scope);

      updatedDocument = {
        ...standing,
        operations: {
          ...standing.operations,
          [job.scope]: [...(standing.operations[job.scope] ?? []), denied],
        },
      };
    } else {
      try {
        const protocolVersion = baseReducerVersion(document.header);
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

    let storedOperations: Operation[];
    try {
      storedOperations = await stores.operationStore.apply(
        job.documentId,
        document.header.documentType,
        scope,
        job.branch,
        newOperation.index,
        (txn) => {
          txn.addOperations(newOperation);
        },
        signal,
        // Undefined unless a decision was made, so the store's guard is only
        // enforced for a write a decision stands behind.
        appendCondition,
      );
    } catch (error) {
      this.logger.error(
        "Error writing @Operation to IOperationStore: @Error",
        newOperation,
        error,
      );

      stores.writeCache.invalidate(job.documentId, scope, job.branch);

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

    const storedOperation = storedOperations[0];

    updatedDocument.header.revision = {
      ...updatedDocument.header.revision,
      [scope]: storedOperation.index + 1,
    };

    stores.writeCache.putState(
      job.documentId,
      scope,
      job.branch,
      storedOperation.index,
      updatedDocument,
      SnapshotPosition.Head,
    );

    indexTxn.write([
      {
        ...storedOperation,
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
      operations: [storedOperation],
      operationsWithContext: [
        {
          operation: storedOperation,
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

  /**
   * Re-evaluates the document when a write meets both criteria: it was written
   * to a stream the model reads, and it is timestamped before an operation
   * already stored. The caller supplies the timestamp and the reactor does not replace
   * it, so a mutation job can write such an operation just as a load job can,
   * which is why both executeJob and executeLoadJob call this.
   */
  private async reevaluateIfCriteriaMet(
    criteria: EvaluationCriteria,
    executing: ExecutingJob,
  ): Promise<Error | undefined> {
    if (!this.featureFlags.documentDecisions) {
      return undefined;
    }

    const { job, stores, signal } = executing;

    const definition = documentDecisionModel({
      documentId: job.documentId,
      branch: job.branch,
    });
    const inReadSet = staticReadSet(definition).some(
      (stream) =>
        stream.query.documentId === job.documentId &&
        stream.query.scope === criteria.scope &&
        stream.query.branch === job.branch,
    );
    if (!inReadSet) {
      return undefined;
    }

    const revisions = await stores.operationStore.getRevisions(
      job.documentId,
      job.branch,
      signal,
    );
    const latest = Date.parse(revisions.latestTimestamp);

    const backdated = criteria.operations.some(
      (operation) => Date.parse(operation.timestampUtcMs) < latest,
    );
    if (!backdated) {
      return undefined;
    }

    return this.reevaluateDocument(executing);
  }

  /**
   * Re-evaluates every scope the model evaluates. Where an operation's
   * evaluation differs from what is stored, the tail from that operation is
   * re-appended, carrying a skip that spans the indices it supersedes.
   */
  private async reevaluateDocument(
    executing: ExecutingJob,
  ): Promise<Error | undefined> {
    const { job, startTime, indexTxn, stores, signal } = executing;

    const definition = documentDecisionModel({
      documentId: job.documentId,
      branch: job.branch,
    });

    const revisions = await stores.operationStore.getRevisions(
      job.documentId,
      job.branch,
      signal,
    );

    for (const scope of Object.keys(revisions.revision)) {
      if (!definition.evaluatesScope(scope)) {
        continue;
      }

      const stored = (
        await stores.operationStore.getSince(
          job.documentId,
          scope,
          job.branch,
          -1,
          undefined,
          undefined,
          signal,
        )
      ).results;

      const effective = garbageCollect(sortOperations([...stored]));
      if (effective.length === 0) {
        continue;
      }

      const reevaluated = await evaluateDeletionsByPosition(
        job.documentId,
        scope,
        job.branch,
        effective,
        stores.writeCache,
        stores.operationStore,
        signal,
      );

      const firstChange = effective.findIndex(
        (operation, i) => operation.deniedReason !== reevaluated[i],
      );
      if (firstChange === -1) {
        continue;
      }

      const tail = effective.slice(firstChange);
      const nextIndex = revisions.revision[scope];

      stores.writeCache.invalidate(job.documentId, scope, job.branch);

      const result = await this.processActions(
        { ...job, scope },
        tail.map((operation) => operation.action),
        startTime,
        indexTxn,
        stores,
        tail.map((_, i) =>
          i === 0 ? retractionSkip(nextIndex, tail[0].index) : 0,
        ),
        undefined,
        "",
        signal,
        reevaluated.slice(firstChange),
      );

      if (!result.success) {
        return (
          result.error ??
          new Error(`Re-evaluation of ${job.documentId} ${scope} failed`)
        );
      }
    }

    return undefined;
  }

  private async executeLoadJob(
    job: Job,
    startTime: number,
    indexTxn: IOperationIndexTxn,
    stores: ExecutionStores,
    signal?: AbortSignal,
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
        signal,
      );
    } catch {
      // Document meta not found -- continue with load (may be a new document)
    }

    // Without DCB, we reject entire load jobs. With DCB we are able to
    // accept/deny individual operations.
    if (docMeta?.state.isDeleted && !this.featureFlags.documentDecisions) {
      return buildErrorResult(
        job,
        new DocumentDeletedError(job.documentId, docMeta.state.deletedAtUtcIso),
        startTime,
      );
    }

    const scope = job.scope;

    let latestRevision: number;
    try {
      const revisions = await stores.operationStore.getRevisions(
        job.documentId,
        job.branch,
        signal,
      );
      latestRevision = revisions.revision[scope] ?? 0;
    } catch {
      latestRevision = 0;
    }

    for (const operation of job.operations) {
      if (
        operation.timestampUtcMs &&
        !isValidISOTimestamp(operation.timestampUtcMs)
      ) {
        return {
          job,
          success: false,
          error: new Error(
            `Invalid timestamp "${operation.timestampUtcMs}" on operation (index: ${operation.index})`,
          ),
          duration: Date.now() - startTime,
        };
      }
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

    let conflictingOps: Operation[];
    try {
      const conflictingResult = await stores.operationStore.getConflicting(
        job.documentId,
        scope,
        job.branch,
        minIncomingTimestamp,
        undefined,
        signal,
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
          undefined,
          undefined,
          signal,
        );
        allOpsFromMinConflictingIndex = allOpsResult.results;
      } catch {
        allOpsFromMinConflictingIndex = conflictingOps;
      }
    }

    const incomingActionIds = new Set(job.operations.map((op) => op.action.id));

    const nonSupersededOps = conflictingOps.filter((op) => {
      // A local op at an index below the incoming batch's lowest index with no
      // overlapping action.id is a predecessor of the incoming ops, not a
      // concurrent conflict. Including it would force a reshuffle that
      // re-inserts identical history at new indices, which cascades when many
      // ops share timestamps (bulk imports). Local ops whose action.id matches
      // an incoming op are kept so dedup + reshuffle can remap them correctly
      // (e.g. cross-reactor reshuffle rebroadcast).
      if (op.index < minIncomingIndex && !incomingActionIds.has(op.action.id)) {
        return false;
      }
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

    if (existingOpsToReshuffle.length > this.config.maxSkipThreshold) {
      return {
        job,
        success: false,
        error: new Error(
          `Excessive reshuffle detected: existing op count of ${existingOpsToReshuffle.length} exceeds threshold of ${this.config.maxSkipThreshold}. ` +
            `This indicates a significant divergence between local and incoming operations.`,
        ),
        duration: Date.now() - startTime,
      };
    }

    let skipCount = existingOpsToReshuffle.length;
    if (existingOpsToReshuffle.length > 0) {
      let minLogicalIndex = Number.POSITIVE_INFINITY;
      for (const op of existingOpsToReshuffle) {
        const logical = op.index - op.skip;
        if (logical < minLogicalIndex) minLogicalIndex = logical;
      }
      const logicalSkip = latestRevision - minLogicalIndex;
      if (logicalSkip > skipCount) skipCount = logicalSkip;
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

    const reshuffledOperations =
      existingOpsToReshuffle.length === 0 && skipCount === 0
        ? incomingOpsToApply
            .slice()
            .sort((a, b) => a.index - b.index)
            .map((operation, i) => ({
              ...operation,
              index: latestRevision + i,
            }))
        : reshuffleByTimestamp(
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

    // A deletion refuses the operations that sort after it and leaves the
    // earlier ones alone.
    let deniedReasons: Array<string | undefined> | undefined;
    if (this.featureFlags.documentDecisions) {
      try {
        deniedReasons = await evaluateDeletionsByPosition(
          job.documentId,
          scope,
          job.branch,
          reshuffledOperations,
          stores.writeCache,
          stores.operationStore,
          signal,
        );
      } catch (error) {
        return {
          job,
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
          duration: Date.now() - startTime,
        };
      }
    }

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
      signal,
      deniedReasons,
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

    const reevaluationError = await this.reevaluateIfCriteriaMet(
      { scope, operations: result.generatedOperations },
      { job, startTime, indexTxn, stores, signal },
    );
    if (reevaluationError) {
      return {
        job,
        success: false,
        error: reevaluationError,
        duration: Date.now() - startTime,
      };
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

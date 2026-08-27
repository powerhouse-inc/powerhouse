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
  mentionedGroupIds,
  normalizeDocumentModelVersion,
  sortOperations,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import type { ICollectionMembershipCache } from "../cache/collection-membership-cache.js";
import { resolveFeatureFlags } from "../core/feature-flags.js";
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
  AuthTimestampNotMonotonicError,
  DocumentDeletedError,
  ExcessiveReshuffleError,
  InvalidOperationTimestampError,
} from "../shared/errors.js";
import { yieldToMain } from "../shared/utils.js";
import type { SignatureVerificationHandler } from "../signer/types.js";
import {
  AppendConditionFailedError,
  type AppendCondition,
  type IOperationStore,
} from "../storage/interfaces.js";
import { reshuffleByTimestamp } from "../utils/reshuffle.js";
import type { RegisteredDecisionModel } from "../decision/registered-model.js";
import {
  decideAtHead,
  selectDecisionModel,
} from "../decision/registered-model.js";
import { staticReadSet } from "../decision/build-decision-model.js";
import { evaluateByPosition } from "../decision/evaluation.js";
import { retractionSkip } from "../decision/merged-order.js";
import { DocumentActionHandler } from "./document-action-handler.js";
import type { ExecutionStores, IExecutionScope } from "./execution-scope.js";
import { DefaultExecutionScope } from "./execution-scope.js";
import type { IJobExecutor } from "./interfaces.js";
import { SignatureVerifier } from "./signature-verifier.js";
import { DEFAULT_DEFERRED_JOB_TTL_MS } from "./types.js";
import type {
  ExecutingJob,
  JobExecutorConfig,
  JobResult,
  PendingWrite,
  PositionedWrites,
  ReactorFeatureFlags,
  TouchedStream,
} from "./types.js";
import {
  buildErrorResult,
  createOperation,
  DOCUMENT_SCOPE_ACTIONS,
  getNextIndexForScope,
  isGenesisOperation,
  refusalError,
  TouchedStreams,
} from "./util.js";

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

/**
 * Simple job executor that processes a job by applying actions through document model reducers.
 */
/**
 * A write that has been decided and reduced but not yet persisted.
 *
 * Exists so a single write and a batch of them can share one copy of the
 * decide-and-reduce logic while differing only in how many operations reach
 * the store per transaction.
 */
type PreparedWrite = {
  action: Action;
  sourceRemote: string;
  scope: string;
  /** State the action was reduced against, for its document type. */
  document: PHDocument;
  updatedDocument: PHDocument;
  operation: Operation;
  resultingState: string;
  appendCondition?: AppendCondition;
  denied: boolean;
};

/** What a job produced inside the execution scope, before anything is durable. */
type ScopeOutcome = {
  result: JobResult;
  pendingEvent?: JobWriteReadyEvent;
};

/**
 * Carries a failed job out of the execution scope so its transaction rolls
 * back. A scope callback that returns commits, whatever result it returns, so
 * a returned failure would leave the writes the job made before it failed
 * standing. Never escapes executeJob: the failure goes back to being a
 * returned JobResult there, which is what the queue, the worker protocol and
 * every test expect a failed job to look like.
 */
class JobRollbackSignal extends Error {
  constructor(readonly result: JobResult) {
    super("job rolled back");
    this.name = "JobRollbackSignal";
  }
}

export class SimpleJobExecutor implements IJobExecutor {
  private config: Required<JobExecutorConfig>;
  private featureFlags: ReactorFeatureFlags;
  private decisionModel: RegisteredDecisionModel;
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
      // Held by the executor manager, not the executor; carried so a pooled
      // worker's config round-trips unchanged.
      deferredJobTtlMs: config.deferredJobTtlMs ?? DEFAULT_DEFERRED_JOB_TTL_MS,
      retryBaseDelayMs: config.retryBaseDelayMs ?? 100,
      retryMaxDelayMs: config.retryMaxDelayMs ?? 5000,
      yieldDeadlineMs: config.yieldDeadlineMs ?? 50,
      batchApplies: config.batchApplies ?? true,
    };

    // Resolved separately so reads are plain booleans; the config keeps what
    // the caller passed, because that is what crosses to a pooled worker. The
    // builder validates too, but a pooled worker is constructed directly from
    // the flags that crossed the boundary.
    this.featureFlags = resolveFeatureFlags(config.featureFlags);
    this.decisionModel = selectDecisionModel(this.featureFlags, registry);
    this.signatureVerifierModule = new SignatureVerifier(signatureVerifier);
    this.documentActionHandler = new DocumentActionHandler(
      registry,
      logger,
      driveContainerTypes,
      this.featureFlags,
      this.decisionModel,
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
   *
   * The whole job runs inside one execution scope, and a scope callback that
   * returns commits. A failed job must therefore leave the scope by throwing,
   * or the writes it made before it failed would be durable: JobRollbackSignal
   * carries the failure out through the transaction and this method turns it
   * back into the returned JobResult every caller expects. A job either fully
   * applies or leaves nothing behind.
   */
  async executeJob(job: Job, signal?: AbortSignal): Promise<JobResult> {
    const startTime = Date.now();

    // Streams the job wrote, to evict when its transaction does not commit
    const touchedStreams = new TouchedStreams();

    // Entries handlers request invalidated only after the transaction commits
    const postCommitInvalidations: TouchedStream[] = [];

    let outcome: ScopeOutcome;
    try {
      outcome = await this.executionScope.run(async (stores) => {
        const scoped = await this.executeInScope({
          job,
          startTime,
          stores,
          signal,
          touchedStreams,
          postCommitInvalidations,
        });

        if (!scoped.result.success) {
          throw new JobRollbackSignal(scoped.result);
        }

        return scoped;
      }, signal);
    } catch (error) {
      // The caches are shared with the copies the scope hands the job, so the
      // rollback that just happened undid none of what the job put in them.
      for (const entry of touchedStreams) {
        this.writeCache.invalidate(entry.documentId, entry.scope, entry.branch);
        this.documentMetaCache.invalidate(entry.documentId, entry.branch);
        this.collectionMembershipCache.invalidate(entry.documentId);
      }

      if (error instanceof JobRollbackSignal) {
        return error.result;
      }

      throw error;
    }

    for (const entry of postCommitInvalidations) {
      this.writeCache.invalidate(entry.documentId, entry.scope, entry.branch);
    }

    const { pendingEvent } = outcome;
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

    return outcome.result;
  }

  /**
   * The body of a job, run inside the execution scope's transaction.
   *
   * The stores and caches it works through are the copies scoped to that
   * transaction, so nothing it does is durable until the scope commits. The
   * write-ready event is handed back rather than emitted, because a job that
   * has not committed yet has nothing to announce.
   */
  private async executeInScope(params: {
    job: Job;
    startTime: number;
    stores: ExecutionStores;
    signal?: AbortSignal;
    touchedStreams: TouchedStreams;
    postCommitInvalidations: TouchedStream[];
  }): Promise<ScopeOutcome> {
    const {
      job,
      startTime,
      stores,
      signal,
      touchedStreams,
      postCommitInvalidations,
    } = params;

    let pendingEvent: JobWriteReadyEvent | undefined;
    const indexTxn = stores.operationIndex.start();

    if (job.kind === "load") {
      const loadResult = await this.executeLoadJob({
        job,
        startTime,
        indexTxn,
        stores,
        signal,
        replayingAcceptedHistory: true,
        evaluatedByPosition: false,
        postCommitInvalidations,
        touchedStreams,
      });
      if (loadResult.success && loadResult.operationsWithContext) {
        const ordinals = await stores.operationIndex.commit(indexTxn, signal);

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
      return { result: loadResult, pendingEvent };
    }

    if (job.kind === "reevaluation") {
      const reevalResult = await this.executeReevaluationJob({
        job,
        startTime,
        indexTxn,
        stores,
        signal,
        replayingAcceptedHistory: false,
        evaluatedByPosition: false,
        postCommitInvalidations,
        touchedStreams,
      });
      if (reevalResult.success && reevalResult.operationsWithContext) {
        const ordinals = await stores.operationIndex.commit(indexTxn, signal);

        for (let i = 0; i < reevalResult.operationsWithContext.length; i++) {
          reevalResult.operationsWithContext[i].context.ordinal = ordinals[i];
        }
        if (reevalResult.operationsWithContext.length > 0) {
          const collectionMemberships =
            await this.getCollectionMembershipsForOperations(
              reevalResult.operationsWithContext,
              stores,
            );
          pendingEvent = {
            jobId: job.id,
            operations: reevalResult.operationsWithContext,
            jobMeta: job.meta,
            collectionMemberships,
          };
        }
      }
      return { result: reevalResult, pendingEvent };
    }

    const positioned = await this.positionByTimestamp(job, stores, signal);
    if (positioned.error) {
      return {
        result: buildErrorResult(job, positioned.error, startTime),
        pendingEvent,
      };
    }

    const executing: ExecutingJob = {
      job,
      startTime,
      indexTxn,
      stores,
      signal,
      replayingAcceptedHistory: false,
      evaluatedByPosition: positioned.evaluatedByPosition,
      postCommitInvalidations,
      touchedStreams,
    };

    const actionResult = await this.processActions(
      positioned.writes,
      executing,
    );

    if (!actionResult.success) {
      return {
        result: {
          job,
          success: false as const,
          error: actionResult.error,
          duration: Date.now() - startTime,
        },
        pendingEvent,
      };
    }

    // Put here because a re-eval pass writes through the same db db
    // transaction.
    const reevaluationError = await this.reevaluateIfCriteriaMet(
      { scope: job.scope, operations: actionResult.generatedOperations },
      executing,
    );
    if (reevaluationError) {
      return {
        result: {
          job,
          success: false as const,
          error: reevaluationError,
          duration: Date.now() - startTime,
        },
        pendingEvent,
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
      result: {
        job,
        success: true as const,
        operations: actionResult.generatedOperations,
        operationsWithContext: actionResult.operationsWithContext,
        duration: Date.now() - startTime,
      },
      pendingEvent,
    };
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
    writes: PendingWrite[],
    executing: ExecutingJob,
  ): Promise<ProcessActionsResult> {
    const { job, signal } = executing;
    const actions = writes.map((write) => write.action);

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
          error: new InvalidOperationTimestampError(
            job.documentId,
            action.scope,
            action.timestampUtcMs,
            `action ${action.type} (id: ${action.id})`,
          ),
        };
      }
    }

    let lastYield = performance.now();

    if (this.config.batchApplies && this.canBatch(writes, executing)) {
      const batched = await this.executeRegularActionsBatched(
        writes,
        executing,
      );
      const error = this.accumulateResultOrReturnError(
        batched,
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
      return { success: true, generatedOperations, operationsWithContext };
    }

    for (const write of writes) {
      const isDocumentAction = DOCUMENT_SCOPE_ACTIONS.has(write.action.type);
      const result = isDocumentAction
        ? await this.documentActionHandler.execute(write, executing)
        : await this.executeRegularAction(write, executing);

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

  /**
   * Decides a write and reduces it, without persisting anything.
   *
   * Split from the commit so one write and a batch of them share this logic
   * rather than keeping two copies of it. `baseDocument` lets a batch thread
   * the previous action's result forward instead of reading its own write back
   * out of the cache, which is the only reason the reduce has to be sequential.
   */
  private async prepareRegularWrite(
    write: PendingWrite,
    executing: ExecutingJob,
    baseDocument?: PHDocument,
  ): Promise<PreparedWrite | JobResult> {
    const { action, skip, sourceOperation, sourceRemote, deniedReason } = write;
    const { job, startTime, indexTxn, stores, signal } = executing;

    // append conditions are used iff the decision model flag is on
    let appendCondition: AppendCondition | undefined;
    let documentVersion: number | undefined;

    const alreadyEvaluated =
      this.featureFlags.documentDecisions &&
      (executing.replayingAcceptedHistory || executing.evaluatedByPosition);

    if (this.featureFlags.documentDecisions && !alreadyEvaluated) {
      const target = { documentId: job.documentId, branch: job.branch };

      let admission;
      try {
        admission = await decideAtHead(
          this.decisionModel,
          stores.writeCache,
          target,
          {
            address: action.context?.signer?.user.address,
            key: action.context?.signer?.app.key,
          },
          { verb: "execute", scope: action.scope, operation: action.type },
          signal,
          this.featureFlags.authConditions
            ? { actionInput: action.input, carriedDocument: baseDocument }
            : undefined,
        );
      } catch (error) {
        return buildErrorResult(
          job,
          error instanceof Error ? error : new Error(String(error)),
          startTime,
        );
      }

      if (admission.evaluation.decision === "deny") {
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

      appendCondition = admission.appendCondition;
      documentVersion = admission.documentVersion;
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

    // UNDO, REDO, PRUNE, and any operation carrying a skip need the full
    // operation history to replay state correctly: a skip rewinds the stream
    // past the operations it supersedes, so the base state is the one standing
    // before them, not the head. The write cache stores sliced documents (last
    // op per scope only), so invalidate before loading to force a cold-miss
    // rebuild.
    //
    // The skip is not always a NOOP's. A reshuffle hands its first re-appended
    // operation the whole skip, and that operation is whatever sorted first --
    // an ADD_FOLDER as readily as a NOOP. Reducing it against the sliced head
    // left the resulting state derived from the superseded lineage, which is
    // what the document view stores and serves; the write cache recovered on
    // its next cold read and the read model never did.
    if (isUndoRedo(action) || action.type === "PRUNE" || skip > 0) {
      stores.writeCache.invalidate(job.documentId, job.scope, job.branch);
    }

    let document: PHDocument;
    if (baseDocument !== undefined) {
      document = baseDocument;
    } else {
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
    }

    // The interim gate, superseded by the auth projection. Re-evaluating already
    // accepted operations could drop them and diverge replicas.
    if (
      !this.featureFlags.authEnforcement &&
      !executing.replayingAcceptedHistory
    ) {
      const subject = {
        address: write.action.context?.signer?.user.address,
        key: write.action.context?.signer?.app.key,
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
      module = this.registry.getModule(
        document.header.documentType,
        normalizeDocumentModelVersion(documentVersion),
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

    return {
      action,
      sourceRemote,
      scope,
      document,
      updatedDocument,
      operation: newOperation,
      resultingState,
      appendCondition,
      denied: deniedReason !== undefined,
    };
  }

  /**
   * Persists a run of prepared writes in one store transaction.
   *
   * The store has always accepted many operations per apply; the executor only
   * ever handed it one. Passing the whole run means one advisory lock over the
   * read set and one guarded insert for the batch, instead of one of each per
   * operation.
   *
   * The append condition is taken from the first write. Every write in a run
   * reads the same streams at the same revisions, because nothing outside the
   * run can change them mid-batch, and the caller has already refused to batch
   * the scopes where that does not hold.
   */
  private async commitPreparedWrites(
    prepared: PreparedWrite[],
    executing: ExecutingJob,
  ): Promise<JobResult> {
    const { job, startTime, indexTxn, stores, signal } = executing;
    const first = prepared[0];
    const last = prepared[prepared.length - 1];
    const scope = first.scope;
    const documentType = first.document.header.documentType;
    const operations = prepared.map((write) => write.operation);

    // Recorded before the apply, not after: the rows an apply that throws left
    // behind are the ones a rollback has to take the cached state of with it.
    executing.touchedStreams.add(job.documentId, scope, job.branch);

    let storedOperations: Operation[];
    try {
      storedOperations = await stores.operationStore.apply(
        job.documentId,
        documentType,
        scope,
        job.branch,
        first.operation.index,
        (txn) => {
          txn.addOperations(...operations);
        },
        signal,
        // Undefined unless a decision was made, so the store's guard is only
        // enforced for a write a decision stands behind.
        first.appendCondition,
      );
    } catch (error) {
      this.logger.error(
        "Error writing @Operation to IOperationStore: @Error",
        operations,
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

    const head = storedOperations[storedOperations.length - 1];

    last.updatedDocument.header.revision = {
      ...last.updatedDocument.header.revision,
      [scope]: head.index + 1,
    };

    // The whole run, not just its head: the cache keeps only the head as
    // state, but a run that writes past a keyframe boundary crossed it, and
    // handing over the head alone would skip every boundary between.
    stores.writeCache.putRun(
      job.documentId,
      scope,
      job.branch,
      storedOperations.map((operation, position) => ({
        revision: operation.index,
        document: prepared[position].updatedDocument,
      })),
    );

    indexTxn.write(
      storedOperations.map((operation, position) => ({
        ...operation,
        documentId: job.documentId,
        documentType,
        branch: job.branch,
        scope,
        sourceRemote: prepared[position].sourceRemote,
      })),
    );

    // References come from the input as it arrived, including operations
    // stored denied or errored, so sync topology never depends on evaluation.
    if (scope === "auth") {
      for (const write of prepared) {
        indexTxn.recordGroupReferences(
          job.documentId,
          mentionedGroupIds(write.action),
        );
      }
    }

    return {
      job,
      success: true,
      operations: storedOperations,
      operationsWithContext: storedOperations.map((operation, position) => ({
        operation,
        context: {
          documentId: job.documentId,
          scope,
          branch: job.branch,
          documentType,
          resultingState: prepared[position].resultingState,
          ordinal: 0,
        },
      })),
      duration: Date.now() - startTime,
    };
  }

  /**
   * Whether a job's writes may share one store transaction.
   *
   * Deliberately narrow. Batching changes only how many transactions the
   * operations arrive in, and every condition below is a case where that would
   * change something else as well:
   *
   * - A document-scope action goes through its own handler, which has its own
   *   apply and its own reasons for it.
   * - A positional or replayed run carries skips and re-appended operations,
   *   whose indices are not a simple ascending run from the head.
   * - UNDO, REDO, PRUNE and NOOP-with-skip each invalidate the write cache to
   *   force a full-history rebuild, so they cannot be reduced against state
   *   threaded from the write before them.
   * - The auth scope decides later writes against the policy earlier ones
   *   install, so a batch would decide them all against the policy as it stood
   *   before the batch.
   * - The document scope is read by every decision model, so writing it is
   *   writing part of the read set; the per-write conditions would not agree.
   *
   * A run that fails any of these is executed one write at a time, unchanged.
   */
  private canBatch(writes: PendingWrite[], executing: ExecutingJob): boolean {
    if (writes.length < 2) {
      return false;
    }
    if (executing.evaluatedByPosition || executing.replayingAcceptedHistory) {
      return false;
    }
    const scope = executing.job.scope;
    if (scope === "auth" || scope === "document") {
      return false;
    }
    return writes.every((write) => {
      const type = write.action.type;
      return (
        write.skip === 0 &&
        write.deniedReason === undefined &&
        write.sourceOperation === undefined &&
        !DOCUMENT_SCOPE_ACTIONS.has(type) &&
        !isUndoRedo(write.action) &&
        type !== "PRUNE" &&
        type !== "NOOP"
      );
    });
  }

  /**
   * Decides and reduces a run of writes, then persists them together.
   *
   * The reduce stays sequential - each action needs the state the one before it
   * produced - but the result is threaded in memory rather than read back from
   * the cache, and the whole run reaches the store in a single apply.
   *
   * A write that turns out to be denied abandons the batch and replays the run
   * one write at a time, because a denied write holds a position of its own and
   * that is the path where the per-write behaviour is load-bearing. A write
   * that cannot be prepared fails the job outright: preparing is a read, so the
   * replay would only reach the same failure, and the job leaves nothing behind
   * either way.
   */
  private async executeRegularActionsBatched(
    writes: PendingWrite[],
    executing: ExecutingJob,
  ): Promise<JobResult> {
    const prepared: PreparedWrite[] = [];
    let carried: PHDocument | undefined;
    let lastYield = performance.now();

    for (const write of writes) {
      const outcome = await this.prepareRegularWrite(write, executing, carried);
      if ("success" in outcome) {
        return outcome;
      }
      if (outcome.denied) {
        return this.executeRegularActionsSequentially(writes, executing);
      }
      prepared.push(outcome);
      carried = outcome.updatedDocument;

      if (performance.now() - lastYield > this.config.yieldDeadlineMs) {
        await yieldToMain();
        lastYield = performance.now();

        if (executing.signal?.aborted) {
          return buildErrorResult(
            executing.job,
            new Error("Aborted"),
            executing.startTime,
          );
        }
      }
    }

    // Every write in the run must have read the same streams at the same
    // revisions for one condition to stand for all of them. canBatch excludes
    // the scopes where that can fail, and this is the assertion of it: a
    // mismatch falls back rather than writing under a condition that only
    // describes part of the batch.
    if (!this.conditionsAgree(prepared)) {
      return this.executeRegularActionsSequentially(writes, executing);
    }

    return this.commitPreparedWrites(prepared, executing);
  }

  /** Whether every prepared write carries the same read-set condition. */
  private conditionsAgree(prepared: PreparedWrite[]): boolean {
    const shape = (write: PreparedWrite): string =>
      write.appendCondition === undefined
        ? "none"
        : JSON.stringify(
            [...write.appendCondition.streams]
              .map((stream) => [
                stream.documentId,
                stream.scope,
                stream.branch,
                stream.revision,
              ])
              .sort(),
          );
    const first = shape(prepared[0]);
    return prepared.every((write) => shape(write) === first);
  }

  /**
   * The unbatched path, for a run that turned out not to qualify after its
   * writes were prepared. Nothing has been persisted at that point, so
   * replaying the whole run per write is safe.
   */
  private async executeRegularActionsSequentially(
    writes: PendingWrite[],
    executing: ExecutingJob,
  ): Promise<JobResult> {
    const operations: Operation[] = [];
    const contexts: OperationWithContext[] = [];
    let lastYield = performance.now();

    for (const write of writes) {
      const result = await this.executeRegularAction(write, executing);
      if (!result.success) {
        return result;
      }
      operations.push(...(result.operations ?? []));
      contexts.push(...(result.operationsWithContext ?? []));

      if (performance.now() - lastYield > this.config.yieldDeadlineMs) {
        await yieldToMain();
        lastYield = performance.now();

        if (executing.signal?.aborted) {
          return buildErrorResult(
            executing.job,
            new Error("Aborted"),
            executing.startTime,
          );
        }
      }
    }

    return {
      job: executing.job,
      success: true,
      operations,
      operationsWithContext: contexts,
      duration: Date.now() - executing.startTime,
    };
  }

  /** Decides, reduces and persists one write. */
  private async executeRegularAction(
    write: PendingWrite,
    executing: ExecutingJob,
  ): Promise<JobResult> {
    const prepared = await this.prepareRegularWrite(write, executing);
    if ("success" in prepared) {
      return prepared;
    }
    return this.commitPreparedWrites([prepared], executing);
  }

  /**
   * Orders a write by timestamp and decides it where it lands. The caller
   * supplies the timestamp, so a write can belong before operations already
   * stored; those are re-appended alongside it, the way a load reshuffles.
   *
   * Deciding a backdated write at the stream heads instead of at its position
   * would overwrite the verdict every other replica computes for it.
   */
  private async positionByTimestamp(
    job: Job,
    stores: ExecutionStores,
    signal?: AbortSignal,
  ): Promise<PositionedWrites> {
    const plain = (): PositionedWrites => ({
      writes: job.actions.map((action) => ({
        action,
        skip: 0,
        sourceRemote: "",
      })),
      evaluatedByPosition: false,
    });

    if (!this.featureFlags.documentDecisions || job.actions.length === 0) {
      return plain();
    }

    // Parsed, not compared as strings, here and below: a submitted timestamp
    // may carry second precision, and "…:00Z" sorts after "…:00.000Z"
    // lexically though it is the earlier instant. Selecting the minimum by
    // string would pick the later one, so a genuinely backdated action would
    // read as current and be appended at the tail instead of positioned.
    let earliest = job.actions[0].timestampUtcMs;
    let earliestAt = Date.parse(earliest);
    for (const action of job.actions) {
      const at = Date.parse(action.timestampUtcMs);
      if (at < earliestAt) {
        earliest = action.timestampUtcMs;
        earliestAt = at;
      }
    }

    const revisions = await stores.operationStore.getRevisions(
      job.documentId,
      job.branch,
      signal,
    );

    const backdated = earliestAt < Date.parse(revisions.latestTimestamp);

    // The auth stream is never reshuffled: rejected by the monotonic rule, or
    // evaluated where it lands without moving anything.
    if (this.featureFlags.authEnforcement && job.scope === "auth") {
      const newest = await stores.operationStore.getStreamLatestTimestamp(
        job.documentId,
        "auth",
        job.branch,
        signal,
      );
      const violation = this.firstNonMonotonicTimestamp(
        job.actions,
        newest,
        job.documentId,
        job.branch,
      );
      if (violation) {
        return { writes: [], evaluatedByPosition: false, error: violation };
      }

      if (!backdated) {
        return plain();
      }
      return this.evaluatePositioned(
        job,
        stores,
        this.appendedOperations(job, revisions.revision[job.scope] ?? 0),
        signal,
      );
    }

    if (!backdated) {
      return plain();
    }

    const conflicting = (
      await stores.operationStore.getConflicting(
        job.documentId,
        job.scope,
        job.branch,
        earliest,
        undefined,
        signal,
      )
    ).results.filter((operation) => !isGenesisOperation(operation));

    // Nothing to move here, but still below another scope's newest operation.
    if (conflicting.length === 0) {
      if (!this.featureFlags.authEnforcement) {
        return plain();
      }
      return this.evaluatePositioned(
        job,
        stores,
        this.appendedOperations(job, revisions.revision[job.scope] ?? 0),
        signal,
      );
    }

    const nextIndex = revisions.revision[job.scope] ?? 0;
    let firstConflicting = conflicting[0].index;
    for (const operation of conflicting) {
      if (operation.index < firstConflicting) {
        firstConflicting = operation.index;
      }
    }

    // Given positions rather than stored rows, so a tie puts the new write
    // after what is already there.
    const incoming = job.actions.map(
      (action, i) =>
        ({
          id: action.id,
          index: nextIndex + i,
          skip: 0,
          hash: "",
          timestampUtcMs: action.timestampUtcMs,
          action,
        }) as Operation,
    );

    const merged = reshuffleByTimestamp(
      { index: nextIndex, skip: retractionSkip(nextIndex, firstConflicting) },
      conflicting,
      incoming,
    );

    stores.writeCache.invalidate(job.documentId, job.scope, job.branch);

    // Without the auth projection the only refusal is a deletion, which fails the
    // job outright, so a head decide is equivalent.
    if (!this.featureFlags.authEnforcement) {
      return {
        writes: merged.map((operation) => ({
          action: operation.action,
          skip: operation.skip,
          sourceRemote: "",
        })),
        evaluatedByPosition: false,
      };
    }

    return this.evaluatePositioned(job, stores, merged, signal);
  }

  /**
   * Decides each operation where it lands and carries the verdict on it. A
   * refused submitted action is reported to the caller and nothing is stored; a
   * refused operation the reshuffle merely moved keeps its verdict, because it
   * already holds a position.
   *
   * The operations carry the indexes and skips they will be stored at, because
   * the walk resolves skips before it orders them.
   */
  private async evaluatePositioned(
    job: Job,
    stores: ExecutionStores,
    operations: Operation[],
    signal?: AbortSignal,
  ): Promise<PositionedWrites> {
    const reasons = await evaluateByPosition(
      this.decisionModel,
      { documentId: job.documentId, branch: job.branch },
      { scope: job.scope, operations },
      stores,
      signal,
    );

    const submitted = new Set(job.actions.map((action) => action.id));
    for (let i = 0; i < operations.length; i++) {
      const reason = reasons[i];
      if (reason !== undefined && submitted.has(operations[i].action.id)) {
        return {
          writes: [],
          evaluatedByPosition: false,
          error: refusalError(
            reason,
            job.documentId,
            null,
            operations[i].action,
          ),
        };
      }
    }

    return {
      writes: operations.map((operation, i) => ({
        action: operation.action,
        skip: operation.skip,
        sourceRemote: "",
        deniedReason: reasons[i],
      })),
      evaluatedByPosition: true,
    };
  }

  /**
   * The scopes a re-evaluation pass visits, in a fixed order.
   *
   * The revisions map comes from a query with no ORDER BY, and the order is
   * load-bearing: each scope's pass re-reads the auth stream, and the walk skips
   * an operation by its stored denial, so a denial this pass just wrote is
   * visible to a later-visited scope and invisible to an earlier one. The model's
   * own projection order leads, then the rest sorted, so the pass is reproducible
   * across replicas and across runs.
   */
  private evaluationOrder(
    target: { documentId: string; branch: string },
    revision: Record<string, number>,
  ): string[] {
    const definition = this.decisionModel(target);

    const evaluated = Object.keys(revision).filter((scope) =>
      definition.evaluatesScope(scope),
    );

    const leading: string[] = [];
    for (const stream of staticReadSet(definition)) {
      const scope = stream.query.scope;
      if (evaluated.includes(scope) && !leading.includes(scope)) {
        leading.push(scope);
      }
    }

    const rest = evaluated
      .filter((scope) => !leading.includes(scope))
      .sort((a, b) => a.localeCompare(b));

    return [...leading, ...rest];
  }

  /**
   * The first timestamp in the batch that does not strictly exceed everything
   * ahead of it, or undefined when the whole batch is monotonic.
   *
   * The bound is carried forward rather than compared against one stored maximum,
   * because a single execute can carry several auth actions stamped in the same
   * millisecond. Letting a tie through would store a stream the position walk
   * then refuses to read, with no repair path.
   */
  private firstNonMonotonicTimestamp(
    entries: Array<{ timestampUtcMs: string }>,
    newest: string | undefined,
    documentId: string,
    branch: string,
  ): Error | undefined {
    let boundIso = newest;
    let bound =
      newest === undefined ? Number.NEGATIVE_INFINITY : Date.parse(newest);

    for (const entry of entries) {
      if (!isValidISOTimestamp(entry.timestampUtcMs)) {
        return new InvalidOperationTimestampError(
          documentId,
          "auth",
          entry.timestampUtcMs,
          "auth operation",
        );
      }

      const at = Date.parse(entry.timestampUtcMs);
      if (boundIso !== undefined && at <= bound) {
        return new AuthTimestampNotMonotonicError(
          documentId,
          branch,
          entry.timestampUtcMs,
          boundIso,
        );
      }

      bound = at;
      boundIso = entry.timestampUtcMs;
    }

    return undefined;
  }

  /** The operations a batch of submitted actions appends at the scope's tail. */
  private appendedOperations(job: Job, nextIndex: number): Operation[] {
    return job.actions.map(
      (action, i) =>
        ({
          id: action.id,
          index: nextIndex + i,
          skip: 0,
          hash: "",
          timestampUtcMs: action.timestampUtcMs,
          action,
        }) as Operation,
    );
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

    const target = { documentId: job.documentId, branch: job.branch };
    const inReadSet = staticReadSet(this.decisionModel(target)).some(
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

    const outcome = await this.reevaluateDocument(executing);
    return outcome.error;
  }

  /**
   * Re-evaluates every scope the model evaluates. Where an operation's
   * evaluation differs from what is stored, the tail from that operation is
   * re-appended, carrying a skip that spans the indices it supersedes.
   */
  private async reevaluateDocument(
    executing: ExecutingJob,
  ): Promise<{ error?: Error; operationsWithContext: OperationWithContext[] }> {
    const { job, stores, signal } = executing;

    const target = { documentId: job.documentId, branch: job.branch };
    const reappended: OperationWithContext[] = [];

    const revisions = await stores.operationStore.getRevisions(
      job.documentId,
      job.branch,
      signal,
    );

    for (const scope of this.evaluationOrder(target, revisions.revision)) {
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

      const reevaluated = await evaluateByPosition(
        this.decisionModel,
        target,
        { scope, operations: effective },
        stores,
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
        tail.map((operation, i) => ({
          action: operation.action,
          skip: i === 0 ? retractionSkip(nextIndex, tail[0].index) : 0,
          sourceRemote: "",
          deniedReason: reevaluated[firstChange + i],
        })),
        {
          ...executing,
          job: { ...job, scope },
          replayingAcceptedHistory: true,
          evaluatedByPosition: true,
        },
      );

      if (!result.success) {
        return {
          error:
            result.error ??
            new Error(`Re-evaluation of ${job.documentId} ${scope} failed`),
          operationsWithContext: reappended,
        };
      }

      reappended.push(...result.operationsWithContext);
    }

    return { operationsWithContext: reappended };
  }

  /**
   * Re-judges a document's stored operations because a read-set stream in
   * another document (a group) gained an operation. The trigger timestamp
   * bounds the work: an operation later than everything this document holds
   * cannot change any evaluation, so the pass is skipped.
   */
  private async executeReevaluationJob(
    executing: ExecutingJob,
  ): Promise<JobResult> {
    const { job, startTime, stores, signal } = executing;

    if (!this.featureFlags.documentDecisions) {
      return {
        job,
        success: true,
        operations: [],
        operationsWithContext: [],
        duration: Date.now() - startTime,
      };
    }

    const trigger = job.meta.triggerTimestampUtcMs;
    if (typeof trigger === "string") {
      let latestTimestamp: string;
      try {
        const revisions = await stores.operationStore.getRevisions(
          job.documentId,
          job.branch,
          signal,
        );
        latestTimestamp = revisions.latestTimestamp;
      } catch {
        // Nothing stored for this document here, so nothing to re-judge.
        return {
          job,
          success: true,
          operations: [],
          operationsWithContext: [],
          duration: Date.now() - startTime,
        };
      }

      if (Date.parse(trigger) > Date.parse(latestTimestamp)) {
        return {
          job,
          success: true,
          operations: [],
          operationsWithContext: [],
          duration: Date.now() - startTime,
        };
      }
    }

    const outcome = await this.reevaluateDocument(executing);
    if (outcome.error) {
      return buildErrorResult(job, outcome.error, startTime);
    }

    return {
      job,
      success: true,
      operations: outcome.operationsWithContext.map((owc) => owc.operation),
      operationsWithContext: outcome.operationsWithContext,
      duration: Date.now() - startTime,
    };
  }

  private async executeLoadJob(executing: ExecutingJob): Promise<JobResult> {
    const { job, startTime, indexTxn, stores, signal } = executing;

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

    // The auth stream holds no ties: an arrival that does not exceed its newest
    // timestamp is rejected rather than repositioned.
    const monotonicAuthStream =
      this.featureFlags.authEnforcement && scope === "auth";

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
          error: new InvalidOperationTimestampError(
            job.documentId,
            scope,
            operation.timestampUtcMs,
            `operation (index: ${operation.index})`,
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
      if (Date.parse(ts) < Date.parse(minIncomingTimestamp)) {
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

    // Creation holds the first two indexes for the life of the document, so it
    // never moves however far back the conflicting range reaches. The auth stream
    // moves nothing at all.
    const existingOpsToReshuffle = monotonicAuthStream
      ? []
      : nonSupersededOps.filter((operation) => !isGenesisOperation(operation));

    // Only work this load does for the first time counts. A re-append is an action
    // the window already holds twice, so counting those would make the busiest
    // documents revocation-proof.
    const actionIdCounts = new Map<string, number>();
    for (const operation of allOpsFromMinConflictingIndex) {
      actionIdCounts.set(
        operation.action.id,
        (actionIdCounts.get(operation.action.id) ?? 0) + 1,
      );
    }
    const reshuffleCost = existingOpsToReshuffle.filter(
      (operation) => (actionIdCounts.get(operation.action.id) ?? 0) < 2,
    ).length;

    if (reshuffleCost > this.config.maxSkipThreshold) {
      return {
        job,
        success: false,
        error: new ExcessiveReshuffleError(
          job.documentId,
          scope,
          reshuffleCost,
          this.config.maxSkipThreshold,
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

    // After the dedup, never before: a re-appended auth operation keeps its
    // original timestamp and does travel, so a re-delivered copy is at or below
    // the local head and would dead-letter on traffic both replicas agree about.
    if (monotonicAuthStream) {
      const newest = await stores.operationStore.getStreamLatestTimestamp(
        job.documentId,
        "auth",
        job.branch,
        signal,
      );
      const violation = this.firstNonMonotonicTimestamp(
        [...incomingOpsToApply].sort((a, b) => a.index - b.index),
        newest,
        job.documentId,
        job.branch,
      );
      if (violation) {
        return {
          job,
          success: false,
          error: violation,
          duration: Date.now() - startTime,
        };
      }
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

    // A NOOP is the v2 undo marker, and it is only a marker while its skip is
    // positive: the state rebuild reads the flag, not the count. A reshuffle
    // hands its whole skip to whichever operation sorts first and zeroes every
    // other one, so the zeroed NOOPs have to be given theirs back or they stop
    // undoing anything.
    //
    // Not the first one. Its skip spans the operations the reshuffle retired,
    // and a NOOP sorts first as readily as anything else does - it has no rank
    // of its own, so the earliest timestamp wins. Overwriting it with 1 leaves
    // the operations it was meant to supersede standing, which reads them back
    // into the next reshuffle and drives the cost toward the excessive-
    // reshuffle limit. Peers get the shortened skip too, and compute a
    // different superseded set than the reactor that sent it.
    for (const operation of reshuffledOperations) {
      if (operation.action.type === "NOOP" && operation.skip === 0) {
        operation.skip = 1;
      }
    }

    // A deletion refuses the operations that sort after it and leaves the
    // earlier ones alone.
    let deniedReasons: Array<string | undefined> | undefined;
    if (this.featureFlags.documentDecisions) {
      try {
        deniedReasons = await evaluateByPosition(
          this.decisionModel,
          { documentId: job.documentId, branch: job.branch },
          { scope, operations: reshuffledOperations },
          stores,
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
      reshuffledOperations.map((operation, i) => ({
        action: operation.action,
        skip: operation.skip,
        sourceOperation: operation,
        sourceRemote: effectiveSourceRemote,
        deniedReason: deniedReasons?.[i],
      })),
      executing,
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
      executing,
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

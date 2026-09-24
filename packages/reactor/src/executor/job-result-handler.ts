import type { ILogger } from "document-model";
import type { IEventBus } from "../events/interfaces.js";
import { ReactorEventTypes } from "../events/types.js";
import type { IJobTracker } from "../job-tracker/interfaces.js";
import type { IQueue } from "../queue/interfaces.js";
import { RetryAccounting } from "../queue/types.js";
import type { IJobExecutionHandle, Job } from "../queue/types.js";
import type { IDocumentModelResolver } from "../registry/document-model-resolver.js";
import { ModuleNotFoundError } from "../registry/errors.js";
import {
  AuthorizationDeniedError,
  AuthTimestampNotMonotonicError,
  DeferredAdmissionError,
  DocumentDeletedError,
  DocumentNotFoundError,
  ExcessiveReshuffleError,
  InvalidOperationTimestampError,
  InvalidSignatureError,
  UpgradePreconditionFailedError,
} from "../shared/errors.js";
import {
  AppendConditionFailedError,
  DocumentAlreadyExistsError,
} from "../storage/interfaces.js";
import type { ErrorInfo } from "../shared/types.js";
import { DEFAULT_MAX_ADMISSION_DEFERRAL_MS, type JobResult } from "./types.js";

/** Conflict retries a job may take without charging its retry limit. */
const MAX_EXEMPT_CONFLICT_RETRIES = 20;

/** The longest single wait between deferred attempts. */
const MAX_DEFERRAL_DELAY_MS = 60_000;

export type JobResultCallbacks = {
  deferJob(documentId: string, job: Job): void;
  flushDeferredFor(documentId: string): Promise<void>;
};

export interface IJobResultHandler {
  handleResult(
    handle: IJobExecutionHandle,
    result: JobResult,
    callbacks: JobResultCallbacks,
  ): Promise<void>;
}

export function toErrorInfo(error: Error | string): ErrorInfo {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack || new Error().stack || "",
    };
  }
  return {
    name: "Error",
    message: error,
    stack: new Error().stack || "",
  };
}

export class JobResultHandler implements IJobResultHandler {
  constructor(
    private queue: IQueue,
    private jobTracker: IJobTracker,
    private eventBus: IEventBus,
    private resolver: IDocumentModelResolver,
    private logger: ILogger,
    private maxDeferralMs: number = DEFAULT_MAX_ADMISSION_DEFERRAL_MS,
  ) {}

  async handleResult(
    handle: IJobExecutionHandle,
    result: JobResult,
    callbacks: JobResultCallbacks,
  ): Promise<void> {
    if (result.success) {
      handle.complete();

      if (this.hasCreateDocumentAction(handle.job)) {
        await callbacks.flushDeferredFor(handle.job.documentId);
      }
      return;
    }

    if (result.error && (await this.deferRetry(handle.job, result.error))) {
      return;
    }

    // Attempt model recovery before exhausting retries
    if (result.error && ModuleNotFoundError.isError(result.error)) {
      let modelLoaded = false;
      try {
        await this.resolver.ensureModelLoaded(result.error.documentType);
        modelLoaded = true;
      } catch {
        // Model could not be loaded, fall through to normal failure path
      }

      if (modelLoaded) {
        const errorInfo = toErrorInfo(result.error);
        try {
          await this.queue.retryJob(handle.job.id, errorInfo);
          return;
        } catch {
          // Fall through to normal failure path
        }
      }
    }

    // AppendConditionFailedError: a concurrency conflict, not a fault. Retry
    // exempt from the retry limit; the executor already dropped the stale
    // streams from the write cache.
    if (
      result.error &&
      AppendConditionFailedError.isError(result.error) &&
      this.countConflicts(handle.job) < MAX_EXEMPT_CONFLICT_RETRIES
    ) {
      const errorInfo = toErrorInfo(result.error);
      try {
        await this.queue.retryJob(
          handle.job.id,
          errorInfo,
          RetryAccounting.ExemptFromLimit,
        );
        return;
      } catch {
        // Fall through to normal failure path
      }
    }

    // DocumentNotFoundError on a load job: the operations came from a remote and
    // may have arrived ahead of the ones that create the document, so the job is
    // held for a CREATE_DOCUMENT that could still land. Held against the id the
    // error names, which is the document a flush has to create - not necessarily
    // the job's own, since a relationship reads its source.
    //
    // A mutation is not held. It names its document itself, and nothing in
    // flight will create one the caller got wrong, so holding it only delays the
    // refusal until the deferral deadline. It falls through to the deterministic
    // failures below.
    if (
      result.error &&
      DocumentNotFoundError.isError(result.error) &&
      handle.job.kind === "load"
    ) {
      handle.defer();
      callbacks.deferJob(result.error.documentId, handle.job);
      return;
    }

    if (
      result.error &&
      (DocumentDeletedError.isError(result.error) ||
        // The id is taken. A retry re-writes against the same stream and loses
        // the same way; only a new id resolves it.
        DocumentAlreadyExistsError.isError(result.error) ||
        // A document that is not there will not appear because a load ran again.
        DocumentNotFoundError.isError(result.error) ||
        AuthorizationDeniedError.isError(result.error) ||
        // All deterministic, so retrying only re-runs the load to fail the same.
        AuthTimestampNotMonotonicError.isError(result.error) ||
        InvalidOperationTimestampError.isError(result.error) ||
        ExcessiveReshuffleError.isError(result.error) ||
        // A refusal is a function of the write's content.
        InvalidSignatureError.isError(result.error) ||
        // The action's snapshot stays stale; the client retries with a fresh read.
        UpgradePreconditionFailedError.isError(result.error))
    ) {
      const errorInfo = toErrorInfo(result.error);
      this.jobTracker.markFailed(handle.job.id, errorInfo, handle.job);
      this.eventBus
        .emit(ReactorEventTypes.JOB_FAILED, {
          jobId: handle.job.id,
          error: result.error,
          job: handle.job,
        })
        .catch(() => {});
      handle.fail(errorInfo);
      return;
    }

    const retryCount = handle.job.retryCount || 0;
    const maxRetries = handle.job.maxRetries || 0;

    if (retryCount < maxRetries) {
      const currentErrorInfo = result.error
        ? toErrorInfo(result.error)
        : toErrorInfo("Unknown error");

      try {
        await this.queue.retryJob(handle.job.id, currentErrorInfo);
      } catch (error) {
        const retryErrorInfo = toErrorInfo(
          error instanceof Error ? error : "Failed to retry job",
        );

        this.jobTracker.markFailed(handle.job.id, retryErrorInfo, handle.job);

        this.eventBus
          .emit(ReactorEventTypes.JOB_FAILED, {
            jobId: handle.job.id,
            error: result.error ?? new Error(retryErrorInfo.message),
            job: handle.job,
          })
          .catch(() => {});

        handle.fail(retryErrorInfo);
      }
    } else {
      const currentErrorInfo = result.error
        ? toErrorInfo(result.error)
        : toErrorInfo("Unknown error");

      const fullErrorInfo = this.formatErrorHistory(
        handle.job.errorHistory,
        currentErrorInfo,
        retryCount + 1,
      );

      this.jobTracker.markFailed(handle.job.id, fullErrorInfo, handle.job);

      this.eventBus
        .emit(ReactorEventTypes.JOB_FAILED, {
          jobId: handle.job.id,
          error: result.error ?? new Error(fullErrorInfo.message),
          job: handle.job,
        })
        .catch(() => {});

      handle.fail(fullErrorInfo);
    }
  }

  /**
   * Holds a job admission could not decide yet at the head of its stream and
   * retries it later, uncharged, until the deferral cap; past it the error
   * takes the normal retry path.
   */
  private async deferRetry(job: Job, error: Error): Promise<boolean> {
    const delayMs = this.deferralDelay(job, error);
    if (delayMs === undefined) {
      return false;
    }
    const errorInfo = toErrorInfo(error);
    try {
      await this.queue.retryJobAfter(job.id, delayMs, errorInfo);
    } catch (retryError) {
      this.logger.error(
        "Error deferring job @jobId: @Error",
        job.id,
        retryError,
      );
      return false;
    }
    this.jobTracker.markDeferred(
      job.id,
      errorInfo,
      new Date(Date.now() + delayMs).toISOString(),
    );
    this.logger.warn(
      "Job @jobId deferred @delayMs ms (deferral @count): @reason",
      job.id,
      delayMs,
      (job.deferral?.count ?? 0) + 1,
      error.message,
    );
    return true;
  }

  /** Doubles from the error's delay per deferral, within the cap. */
  private deferralDelay(job: Job, error: Error): number | undefined {
    if (!DeferredAdmissionError.isError(error)) {
      return undefined;
    }
    const retryAfterMs = DeferredAdmissionError.retryAfterOf(error);
    if (retryAfterMs === undefined) {
      return undefined;
    }
    const elapsed = job.deferral ? Date.now() - job.deferral.firstAtMs : 0;
    const remaining = this.maxDeferralMs - elapsed;
    if (remaining <= 0) {
      return undefined;
    }
    const backoff = retryAfterMs * 2 ** (job.deferral?.count ?? 0);
    return Math.min(backoff, MAX_DEFERRAL_DELAY_MS, remaining);
  }

  /** How many times this job has already lost an append-condition race. */
  private countConflicts(job: Job): number {
    let conflicts = 0;
    for (const error of job.errorHistory) {
      if (AppendConditionFailedError.isFailureMessage(error.message)) {
        conflicts++;
      }
    }
    return conflicts;
  }

  private hasCreateDocumentAction(job: Job): boolean {
    for (const action of job.actions) {
      if (action.type === "CREATE_DOCUMENT") {
        return true;
      }
    }
    for (const operation of job.operations) {
      if (operation.action.type === "CREATE_DOCUMENT") {
        return true;
      }
    }
    return false;
  }

  private formatErrorHistory(
    errorHistory: ErrorInfo[],
    currentError: ErrorInfo,
    totalAttempts: number,
  ): ErrorInfo {
    const allErrors = [...errorHistory, currentError];

    if (allErrors.length === 1) {
      return currentError;
    }

    const messageLines = [`Job failed after ${totalAttempts} attempts:`];
    const stackLines: string[] = [];

    allErrors.forEach((error, index) => {
      messageLines.push(`[Attempt ${index + 1}] ${error.message}`);
      stackLines.push(`[Attempt ${index + 1}] Stack trace:\n${error.stack}`);
    });

    return {
      // The attempt that ended the job is the one a consumer classifies by.
      name: currentError.name,
      message: messageLines.join("\n"),
      stack: stackLines.join("\n\n"),
    };
  }
}

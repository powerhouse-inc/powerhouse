import type { ILogger } from "document-model";
import type { IEventBus } from "../events/interfaces.js";
import { ReactorEventTypes } from "../events/types.js";
import type { IJobTracker } from "../job-tracker/interfaces.js";
import type { IQueue } from "../queue/interfaces.js";
import type { IJobExecutionHandle, Job } from "../queue/types.js";
import type { IDocumentModelResolver } from "../registry/document-model-resolver.js";
import { ModuleNotFoundError } from "../registry/errors.js";
import {
  DocumentDeletedError,
  DocumentNotFoundError,
} from "../shared/errors.js";
import type { ErrorInfo } from "../shared/types.js";
import type { JobResult } from "./types.js";

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
      message: error.message,
      stack: error.stack || new Error().stack || "",
    };
  }
  return {
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

    // DocumentNotFoundError: defer the job instead of failing immediately.
    // A CREATE_DOCUMENT job may arrive later and unblock it.
    if (result.error && DocumentNotFoundError.isError(result.error)) {
      handle.defer();
      callbacks.deferJob(handle.job.documentId, handle.job);
      return;
    }

    if (result.error && DocumentDeletedError.isError(result.error)) {
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
      message: messageLines.join("\n"),
      stack: stackLines.join("\n\n"),
    };
  }
}

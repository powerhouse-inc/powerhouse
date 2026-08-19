import type { ILogger } from "document-model";
import type { IEventBus } from "../events/interfaces.js";
import { ReactorEventTypes } from "../events/types.js";
import type { IJobTracker } from "../job-tracker/interfaces.js";
import type { IQueue } from "../queue/interfaces.js";
import type { Job } from "../queue/types.js";
import { DocumentNotFoundError } from "../shared/errors.js";
import { toErrorInfo } from "./job-result-handler.js";
import { DEFAULT_DEFERRED_JOB_TTL_MS } from "./types.js";

/**
 * The jobs held back because the document they write to was not there yet.
 *
 * A job whose document is missing is deferred rather than failed, because the
 * operations that create that document may still be on their way - out of order
 * from a peer, or a sibling job in the same batch. Deferring emits no event and
 * moves no job status, which is what makes it cheap: a job that gets flushed
 * runs as if it had merely waited its turn.
 *
 * That silence is also why the wait has to be bounded. A deferred job is only
 * released when a job carrying CREATE_DOCUMENT for that exact document id
 * completes, so a job deferred against an id nothing will ever create is
 * released by nothing. Its status stays RUNNING, which is not terminal, so a
 * caller awaiting it waits forever - there is no timeout on that side. The TTL
 * converts that silence into the failure the caller can act on.
 *
 * Failing through the queue rather than only the tracker matters: the queue
 * records the job as resolved, which is what unblocks anything that declared a
 * dependency on it. Deferring alone does not, so a dependent of a deferred job
 * is stranded at PENDING for as long as the deferral lasts.
 */
export class DeferredJobs {
  #byDocumentId = new Map<string, Job[]>();
  #timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly queue: IQueue,
    private readonly jobTracker: IJobTracker,
    private readonly eventBus: IEventBus,
    private readonly logger: ILogger,
    private readonly ttlMs: number = DEFAULT_DEFERRED_JOB_TTL_MS,
    /**
     * Called once an expiry has resolved a job in the queue. Resolving one job
     * can make a dependent runnable, and an expiry fires outside the dispatch
     * loop, so without this nudge the dependent waits for unrelated traffic to
     * wake the manager up.
     */
    private readonly onReleased: () => Promise<void> = () => Promise.resolve(),
  ) {}

  /**
   * Holds a job until its document arrives, or until the TTL elapses.
   *
   * A job deferred again after a flush replaces its own timer rather than
   * accumulating one, so the wait is measured from the most recent attempt.
   */
  add(documentId: string, job: Job): void {
    const existing = this.#byDocumentId.get(documentId) ?? [];
    existing.push(job);
    this.#byDocumentId.set(documentId, existing);

    this.#clearTimer(job.id);
    const timer = setTimeout(() => {
      void this.#expire(documentId, job);
    }, this.ttlMs);
    // Node keeps the process alive for a pending timer; a deferral must not.
    // Browsers hand back a number, which has nothing to unref.
    if (typeof timer === "object" && "unref" in timer) {
      timer.unref();
    }
    this.#timers.set(job.id, timer);
  }

  /** Re-enqueues everything waiting on a document that has now arrived. */
  async flush(documentId: string): Promise<void> {
    const jobs = this.#byDocumentId.get(documentId);
    if (!jobs || jobs.length === 0) {
      return;
    }
    this.#byDocumentId.delete(documentId);

    for (const job of jobs) {
      this.#clearTimer(job.id);
      try {
        await this.queue.enqueue(job);
      } catch (error) {
        this.logger.error("Error re-enqueuing deferred job: @Error", error);
      }
    }
  }

  /**
   * Fails everything still deferred, for a reactor that is shutting down.
   *
   * The queue is deliberately not told: it is going away too, and nothing is
   * left to unblock.
   */
  failAll(): void {
    for (const [, jobs] of this.#byDocumentId) {
      for (const job of jobs) {
        this.#clearTimer(job.id);
        this.#markFailed(job);
      }
    }
    this.#byDocumentId.clear();
  }

  /** The jobs still waiting on a document. Exposed for assertions. */
  waitingOn(documentId: string): readonly Job[] {
    return this.#byDocumentId.get(documentId) ?? [];
  }

  async #expire(documentId: string, job: Job): Promise<void> {
    const jobs = this.#byDocumentId.get(documentId);
    if (!jobs?.includes(job)) {
      return;
    }
    const remaining = jobs.filter((held) => held !== job);
    if (remaining.length === 0) {
      this.#byDocumentId.delete(documentId);
    } else {
      this.#byDocumentId.set(documentId, remaining);
    }
    this.#timers.delete(job.id);

    this.logger.error(
      "Deferred job @jobId gave up waiting for document @documentId after @ttlMs ms",
      job.id,
      documentId,
      this.ttlMs,
    );

    const errorInfo = this.#markFailed(job);

    try {
      // Resolves the job in the queue, which is what releases its dependents.
      await this.queue.failJob(job.id, errorInfo);
    } catch (error) {
      this.logger.error("Error failing an expired deferred job: @Error", error);
      return;
    }

    // Deferring dropped the job from the queue's index, so the JOB_FAILED the
    // queue just emitted carried no job with it, and the tracker's own handler
    // overwrote the one recorded above with nothing. Re-asserted so the failed
    // job keeps the record it is meant to be debuggable from.
    this.jobTracker.markFailed(job.id, errorInfo, job);

    try {
      await this.onReleased();
    } catch (error) {
      this.logger.error(
        "Error dispatching after a deferred job expired: @Error",
        error,
      );
    }
  }

  #markFailed(job: Job) {
    const error = new DocumentNotFoundError(job.documentId);
    const errorInfo = toErrorInfo(error);
    this.jobTracker.markFailed(job.id, errorInfo, job);
    this.eventBus
      .emit(ReactorEventTypes.JOB_FAILED, {
        jobId: job.id,
        error,
        job,
      })
      .catch(() => {});
    return errorInfo;
  }

  #clearTimer(jobId: string): void {
    const timer = this.#timers.get(jobId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.#timers.delete(jobId);
    }
  }
}

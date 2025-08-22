import { type IOperationResult } from "#server/types";
import { childLogger, logger } from "#utils/logger";
import { generateId } from "document-model";
import { createNanoEvents, type Unsubscribe } from "nanoevents";
import { MemoryQueue } from "./base.js";
import {
  type IJob,
  type IJobQueue,
  type IQueueManager,
  isDocumentJob,
  type IServerDelegate,
  isOperationJob,
  type Job,
  type JobId,
  type QueueEvents,
} from "./types.js";

type DocId = string;

interface EnqueuedJob {
  jobId: string;
  documentId: string;
  scope: string;
  timestampUtcMs: string;
}

export class EventQueueManager implements IQueueManager {
  protected logger = childLogger(["EventQueueManager"]);
  protected emitter = createNanoEvents<QueueEvents>();
  protected queues = new Map<DocId, Map<string, IJobQueue>>();
  protected globalQueue = new Array<EnqueuedJob>();
  protected isFindingJob = false;
  protected maxWorkers: number;
  protected workers: number;
  protected runningJobs = new Array<IJob<Job>>();
  protected timeout: number;
  protected delegate: IServerDelegate | undefined;
  protected onError: ((error: Error) => void) | undefined;

  constructor(maxWorkers = 1, timeout = 0) {
    this.maxWorkers = maxWorkers;
    this.workers = 0;
    this.timeout = timeout;
  }

  async init(
    delegate: IServerDelegate,
    onError: (error: Error) => void,
  ): Promise<void> {
    this.delegate = delegate;
    this.onError = onError;

    function wrapErrorHandler<T extends (...args: any) => Promise<void> | void>(
      method: T,
    ): T {
      return (async (...args: any) => {
        try {
          await method(...args);
        } catch (error) {
          throw error instanceof Error
            ? error
            : new Error(JSON.stringify(error));
        }
      }) as T;
    }

    this.emitter.on(
      "jobAdded",
      wrapErrorHandler(async (job) => {
        this.logger.verbose("Added job", job);
        await this.processNextJob();
      }),
    );

    this.emitter.on(
      "jobStarted",
      wrapErrorHandler(async (job) => {
        this.logger.verbose("Started job", job.jobId);
        this.runningJobs.push(job);
        await this.processNextJob();
      }),
    );

    this.emitter.on(
      "jobCompleted",
      wrapErrorHandler(async (job, result) => {
        this.logger.verbose("Completed job", job.jobId);
        await this.handleJobCompleted(job, result);
      }),
    );

    this.emitter.on(
      "jobFailed",
      wrapErrorHandler(async (job, error) => {
        this.logger.error("Failed job", job, error);
        this.removeJob(job);
        onError(error);
        await this.processNextJob();
      }),
    );

    return Promise.resolve();
  }

  async addJob(job: Job): Promise<JobId> {
    if (!this.delegate) {
      throw new Error("No server delegate defined");
    }

    const jobId = generateId();

    const documentJob = isDocumentJob(job);
    const jobActions = isDocumentJob(job)
      ? undefined
      : isOperationJob(job)
        ? job.operations
        : job.actions;

    if (!documentJob && !jobActions?.length) {
      throw new Error(
        "Job has no operations or actions: " + JSON.stringify(job),
      );
    }

    const firstItem = jobActions?.at(0);
    const scope = firstItem
      ? "action" in firstItem
        ? firstItem.action.scope
        : firstItem.scope
      : "global";
    if (
      jobActions?.find(
        (j) => ("action" in j ? j.action.scope : j.scope) !== scope,
      )
    ) {
      throw new Error("Job has actions with different scopes");
    }
    const queue = this.getQueue(job.documentId, scope);

    // checks if the job is for a document:scope that has been deleted
    if (!isDocumentJob(job) && (await queue.isDeleted())) {
      throw new Error("Job has operations for deleted document");
    }

    // TODO should create document job be a dependency of all jobs to the same document?

    const jobValue = Object.freeze({ jobId, ...job });
    await queue.addJob(jobValue);
    this.globalQueue.push({
      jobId,
      documentId: job.documentId,
      scope,
      timestampUtcMs: new Date().toUTCString(),
    });

    this.emit("jobAdded", jobValue);
    return jobId;
  }

  getQueue(documentId: string, scope: string) {
    let docQueue = this.queues.get(documentId);
    if (!docQueue) {
      docQueue = new Map();
      this.queues.set(documentId, docQueue);
    }

    let scopeQueue = docQueue.get(scope);
    if (!scopeQueue) {
      scopeQueue = new MemoryQueue(scope);
      docQueue.set(scope, scopeQueue);
    }

    return scopeQueue;
  }

  getDocumentQueues(documentId: string) {
    return this.queues.get(documentId);
  }

  removeQueue(documentId: string, scope: string) {
    const docQueues = this.queues.get(documentId);
    const deleted = docQueues?.delete(scope);
    if (deleted) {
      this.emit("queueRemoved", { documentId, scope });
    }
    return deleted;
  }

  removeDocumentQueues(documentId: string) {
    const docQueues = this.queues.get(documentId);
    docQueues?.keys().forEach((scope) => {
      this.removeQueue(documentId, scope);
    });
  }

  protected removeJob(job: IJob<Job>) {
    const indexRunning = this.runningJobs.findIndex(
      (j) => j.jobId === job.jobId,
    );
    if (indexRunning === -1) {
      this.logger.warn("Running job not found", job.jobId);
    }
    this.runningJobs.splice(indexRunning, 1);

    const indexGlobal = this.globalQueue.findIndex(
      (j) => j.jobId === job.jobId,
    );
    if (indexGlobal === -1) {
      this.logger.warn("Job not found on global queue", job.jobId);
    }
    this.globalQueue.splice(indexGlobal, 1);
  }

  protected async handleJobCompleted(job: IJob<Job>, result: IOperationResult) {
    this.removeJob(job);
    return this.processNextJob();
  }
  protected isBusy() {
    return this.workers >= this.maxWorkers;
  }

  protected async processNextJob() {
    // if there is already a worker looking for a job then waits for it to finish
    if (this.isFindingJob) {
      return;
    }

    if (!this.delegate) {
      throw new Error("No server delegate defined");
    }

    // returns if there are no jobs available
    if (this.globalQueue.length === 0) {
      return;
    }

    // returns if there are no workers available
    if (this.isBusy()) {
      return;
    }

    this.isFindingJob = true;
    this.workers++;
    let queue: IJobQueue | undefined;
    let job: IJob<Job> | undefined;
    try {
      const queueJob = await this.findNextJob();
      queue = queueJob?.queue;
      job = queueJob?.job;
    } catch (error) {
      logger.error("Error finding next job", error);
    }
    if (!queue || !job) {
      this.workers--;
      this.isFindingJob = false;
      return;
    }

    try {
      await queue.setRunning(true);
      this.isFindingJob = false;
      this.emit("jobStarted", job);
      const result = await this.delegate.processJob(job);
      this.workers--;
      await queue.setRunning(false);
      this.emit("jobCompleted", job, result);
    } catch (error) {
      logger.error("Job failed", error);
      this.workers--;
      this.isFindingJob = false;
      await queue.setRunning(false);
      this.emit(
        "jobFailed",
        job,
        error instanceof Error ? error : new Error(JSON.stringify(error)),
      );
    }
  }

  protected async findNextJob(): Promise<
    { queue: IJobQueue; job: IJob<Job> } | undefined
  > {
    const skippedQueues = new Set<string>();
    for (const job of this.globalQueue) {
      const queue = this.getQueue(job.documentId, job.scope);
      const queueId = queue.getId();
      if (skippedQueues.has(queueId)) {
        continue;
      }
      if (await queue.isBlocked()) {
        skippedQueues.add(queue.getId());
        continue;
      }
      const queueJob = await queue.getNextJob();
      if (queueJob?.jobId !== job.jobId) {
        logger.warn("Queue has different job waiting to be picked up"); // TODO ensure this is not possible
        logger.error(job, queueJob);
        continue;
      }

      return { queue, job: queueJob };
    }
  }

  protected emit<K extends keyof QueueEvents>(
    event: K,
    ...args: Parameters<QueueEvents[K]>
  ) {
    this.emitter.emit(event, ...args);
  }

  public on<K extends keyof QueueEvents>(
    event: K,
    cb: QueueEvents[K],
  ): Unsubscribe {
    return this.emitter.on(event, cb);
  }
}

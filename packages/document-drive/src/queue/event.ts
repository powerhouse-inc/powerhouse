import { type AddFileInput } from "#drive-document-model/gen/types";
import { type IOperationResult } from "#server/types";
import { childLogger, logger } from "#utils/logger";
import { type Action, generateId, type OperationScope } from "document-model";
import { createNanoEvents, type Unsubscribe } from "nanoevents";
import { type SignalResult } from "../../../document-model/src/document/signal.js";
import { MemoryQueue } from "./base.js";
import {
  type IJob,
  type IJobQueue,
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
  scope: OperationScope;
  timestamp: string;
}
/**
 * TODO:
 *  - Separate priority scheduler class
 *  - Separate dependencies manager (isBlocked)
 */
export class EventQueueManager {
  protected logger = childLogger(["EventQueueManager"]);
  protected emitter = createNanoEvents<QueueEvents>();
  protected queues = new Map<DocId, Map<OperationScope, IJobQueue>>();
  protected globalQueue = new Array<EnqueuedJob>();
  protected maxWorkers: number;
  protected workers: number;
  protected runningJobs = new Array<IJob<Job>>();
  protected timeout: number;
  private delegate: IServerDelegate | undefined;
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
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
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
        this.logger.debug("Added job", job);
        await this.processNextJob();
      }),
    );

    this.emitter.on(
      "jobStarted",
      wrapErrorHandler((job) => {
        this.logger.debug("Started job", job.jobId);
        this.runningJobs.push(job);
      }),
    );

    this.emitter.on(
      "jobCompleted",
      wrapErrorHandler(async (job, result) => {
        this.logger.debug("Completed job", job.jobId);
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
    const jobActions = isOperationJob(job) ? job.operations : job.actions;
    if (!jobActions.length) {
      throw new Error("Job has no operations or actions");
    }

    const scope = jobActions[0].scope;
    if (jobActions.find((j) => j.scope !== scope)) {
      throw new Error("Job has actions with different scopes");
    }
    const queue = this.getQueue(job.documentId ?? job.driveId, scope);

    // checks if the job is for a document:scope that has been deleted
    if (await queue.isDeleted()) {
      throw new Error("Document queue is deleted");
    }

    // checks if the job is for a document that doesn't exist in storage yet
    const { documentId } = job;
    const newDocument = documentId && !(await this.delegate.exists(documentId));

    // if it is a new document and queue is not yet blocked then
    // blocks it so the jobs are not processed until it's ready
    if (newDocument) {
      // checks if there any job in the queue adding the file and adds as dependency
      const addFileJob = await this.getAddFileJob(job.driveId, documentId);
      if (addFileJob) {
        await queue.addDependency(addFileJob);
      }
    }

    // TODO is this needed?
    // if it has ADD_FILE operations then adds the job as
    // a dependency to the corresponding document queues
    // const actions = isOperationJob(job) ? job.operations : (job.actions ?? []);
    // const addFileOps = actions.filter((j: Action) => j.type === "ADD_FILE");
    // for (const addFileOp of addFileOps) {
    //   const input = addFileOp.input as AddFileInput;
    //   const q = this.getQueue(job.driveId, input.id);
    //   await q.addDependencies({ jobId, ...job });
    // }

    const jobValue = Object.freeze({ jobId, ...job });
    await queue.addJob(jobValue);
    this.globalQueue.push({
      jobId,
      documentId: job.documentId ?? job.driveId,
      scope,
      timestamp: new Date().toUTCString(),
    });

    this.emit("jobAdded", jobValue);
    return jobId;
  }

  getQueue(documentId: string, scope: OperationScope) {
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

  removeQueue(documentId: string, scope: OperationScope) {
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

  private removeJob(job: IJob<Job>) {
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

  private async handleJobCompleted(job: IJob<Job>, result: IOperationResult) {
    this.removeJob(job);

    for (const signal of result.signals) {
      await this.handleJobSignal(job, signal);
    }

    return this.processNextJob();
  }

  private async handleJobSignal(job: IJob<Job>, s: SignalResult) {
    switch (s.signal.type) {
      case "CREATE_CHILD_DOCUMENT": {
        const id =
          typeof s.result !== "boolean" ? s.result.id : s.signal.input.newId;
        const docQueues = this.getDocumentQueues(id);
        if (docQueues) {
          await Promise.all(
            docQueues
              .values()
              .map(async (queue) => queue.removeDependency(job)),
          );
        }
        break;
      }
      case "DELETE_CHILD_DOCUMENT": {
        const docQueues = this.getDocumentQueues(s.signal.input.id);
        if (docQueues) {
          await Promise.all(
            docQueues.values().map((queue) => queue.setDeleted(true)),
          );
        }
        break;
      }
    }
  }

  private async getAddFileJob(driveId: string, documentId: string) {
    const driveQueue = this.getQueue(driveId, "global");
    const jobs = await driveQueue.getJobs();
    for (const driveJob of jobs) {
      const actions = isOperationJob(driveJob)
        ? driveJob.operations
        : driveJob.actions;
      if (
        actions.find((j: Action) => {
          const input = j.input as AddFileInput;
          return j.type === "ADD_FILE" && input.id === documentId;
        })
      ) {
        return driveJob;
      }
    }
  }

  protected isBusy() {
    return this.workers >= this.maxWorkers;
  }

  private async processNextJob() {
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
      return;
    }

    try {
      await queue.setRunning(true);
      this.emit("jobStarted", job);
      if ("operations" in job) {
        this.logger.debug(
          "Running Operations",
          JSON.stringify(job.operations, null, 2),
        );
      }
      const result = await this.delegate.processJob(job);
      this.workers--;
      await queue.setRunning(false);
      this.emit("jobCompleted", job, result);
    } catch (error) {
      logger.error("Job failed", error);
      this.workers--;
      await queue.setRunning(false);
      this.emit(
        "jobFailed",
        job,
        error instanceof Error ? error : new Error(JSON.stringify(error)),
      );
    }
  }

  private async findNextJob(): Promise<
    { queue: IJobQueue; job: IJob<Job> } | undefined
  > {
    for (const job of this.globalQueue) {
      const queue = this.getQueue(job.documentId, job.scope);
      if (await queue.isBlocked()) {
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

import {
  AddFileInput,
  DeleteNodeInput,
} from "document-model-libs/document-drive";
import { Action } from "document-model/document";
import { Unsubscribe, createNanoEvents } from "nanoevents";
import { generateUUID, runAsap } from "../utils";
import { logger } from "../utils/logger";
import {
  IJob,
  IJobQueue,
  IQueue,
  IQueueManager,
  IServerDelegate,
  Job,
  JobId,
  QueueEvents,
  isOperationJob,
} from "./types";

export class MemoryQueue<T, R> implements IQueue<T, R> {
  private id: string;
  private blocked = false;
  private deleted = false;
  private items: IJob<T>[] = [];
  private dependencies = new Array<IJob<Job>>();

  constructor(id: string) {
    this.id = id;
  }

  async setDeleted(deleted: boolean) {
    this.deleted = deleted;
  }

  async isDeleted() {
    return this.deleted;
  }

  async addJob(data: IJob<T>) {
    this.items.push(data);
    return Promise.resolve();
  }

  async getNextJob() {
    const job = this.items.shift();
    return Promise.resolve(job);
  }

  async amountOfJobs() {
    return Promise.resolve(this.items.length);
  }

  getId() {
    return this.id;
  }

  async setBlocked(blocked: boolean) {
    this.blocked = blocked;
  }

  async isBlocked() {
    return this.blocked;
  }

  async getJobs() {
    return this.items;
  }

  async addDependencies(job: IJob<Job>) {
    if (!this.dependencies.find((j) => j.jobId === job.jobId)) {
      this.dependencies.push(job);
    }
    if (!this.isBlocked()) {
      this.setBlocked(true);
    }
  }

  async removeDependencies(job: IJob<Job>) {
    this.dependencies = this.dependencies.filter(
      (j) => j.jobId !== job.jobId && j.driveId !== job.driveId,
    );
    if (this.dependencies.length === 0) {
      await this.setBlocked(false);
    }
  }
}

export class BaseQueueManager implements IQueueManager {
  protected emitter = createNanoEvents<QueueEvents>();
  protected ticker = 0;
  protected queues: IJobQueue[] = [];
  protected workers: number;
  protected timeout: number;
  private delegate: IServerDelegate | undefined;

  constructor(workers = 3, timeout = 0) {
    this.workers = workers;
    this.timeout = timeout;
  }

  async init(
    delegate: IServerDelegate,
    onError: (error: Error) => void,
  ): Promise<void> {
    this.delegate = delegate;
    for (let i = 0; i < this.workers; i++) {
      setTimeout(
        () => this.processNextJob.bind(this)().catch(onError),
        100 * i,
      );
    }
    return Promise.resolve();
  }

  async addJob(job: Job): Promise<JobId> {
    if (!this.delegate) {
      throw new Error("No server delegate defined");
    }

    const jobId = generateUUID();
    const queue = this.getQueue(job.driveId, job.documentId);

    if (await queue.isDeleted()) {
      throw new Error("Queue is deleted");
    }

    // checks if the job is for a document that doesn't exist in storage yet
    const newDocument =
      job.documentId &&
      !(await this.delegate.checkDocumentExists(job.driveId, job.documentId));
    // if it is a new document and queue is not yet blocked then
    // blocks it so the jobs are not processed until it's ready
    if (newDocument && !(await queue.isBlocked())) {
      await queue.setBlocked(true);

      // checks if there any job in the queue adding the file and adds as dependency
      const driveQueue = this.getQueue(job.driveId);
      const jobs = await driveQueue.getJobs();
      for (const driveJob of jobs) {
        const actions = isOperationJob(driveJob)
          ? driveJob.operations
          : driveJob.actions;
        const op = actions.find((j: Action) => {
          const input = j.input as AddFileInput;
          return j.type === "ADD_FILE" && input.id === job.documentId;
        });
        if (op) {
          await queue.addDependencies(driveJob);
        }
      }
    }

    // if it has ADD_FILE operations then adds the job as
    // a dependency to the corresponding document queues
    const actions = isOperationJob(job) ? job.operations : job.actions;
    const addFileOps = actions.filter((j: Action) => j.type === "ADD_FILE");
    for (const addFileOp of addFileOps) {
      const input = addFileOp.input as AddFileInput;
      const q = this.getQueue(job.driveId, input.id);
      await q.addDependencies({ jobId, ...job });
    }

    // remove document if operations contains delete_node
    const removeFileOps = actions.filter(
      (j: Action) => j.type === "DELETE_NODE",
    );
    for (const removeFileOp of removeFileOps) {
      const input = removeFileOp.input as DeleteNodeInput;
      const queue = this.getQueue(job.driveId, input.id);
      await queue.setDeleted(true);
    }
    await queue.addJob({ jobId, ...job });

    return jobId;
  }

  getQueue(driveId: string, documentId?: string) {
    const queueId = this.getQueueId(driveId, documentId);
    let queue = this.queues.find((q) => q.getId() === queueId);

    if (!queue) {
      queue = new MemoryQueue(queueId);
      this.queues.push(queue);
    }

    return queue;
  }

  removeQueue(driveId: string, documentId?: string) {
    const queueId = this.getQueueId(driveId, documentId);
    this.queues = this.queues.filter((q) => q.getId() !== queueId);
    this.emit("queueRemoved", queueId);
  }

  getQueueByIndex(index: number) {
    const queue = this.queues[index];
    if (queue) {
      return queue;
    }

    return null;
  }

  getQueues() {
    return this.queues.map((q) => q.getId());
  }

  private retryNextJob(timeout?: number) {
    const _timeout = timeout !== undefined ? timeout : this.timeout;
    const retry =
      _timeout > 0 ? (fn: () => void) => setTimeout(fn, _timeout) : runAsap;
    retry(() => this.processNextJob());
  }

  private async findFirstNonEmptyQueue(ticker: number): Promise<number | null> {
    const numQueues = this.queues.length;

    for (let i = 0; i < numQueues; i++) {
      const index = (ticker + i) % numQueues;
      const queue = this.queues[index];
      if (queue && (await queue.amountOfJobs()) > 0) {
        return index;
      }
    }
    return null;
  }

  private async processNextJob() {
    if (!this.delegate) {
      throw new Error("No server delegate defined");
    }

    if (this.queues.length === 0) {
      this.retryNextJob();
      return;
    }

    const queue = this.queues[this.ticker];
    if (!queue) {
      this.ticker = 0;
      this.retryNextJob();
      return;
    }

    // if no jobs in the current queue then looks for the
    // next queue with jobs. If no jobs in any queue then
    // retries after a timeout
    const amountOfJobs = await queue.amountOfJobs();
    if (amountOfJobs === 0) {
      const nextTicker = await this.findFirstNonEmptyQueue(this.ticker);
      if (nextTicker !== null) {
        this.ticker = nextTicker;
        this.retryNextJob(0);
      } else {
        this.retryNextJob();
      }
      return;
    }

    this.ticker = this.ticker === this.queues.length - 1 ? 0 : this.ticker + 1;

    const isBlocked = await queue.isBlocked();
    if (isBlocked) {
      this.retryNextJob();
      return;
    }

    await queue.setBlocked(true);
    const nextJob = await queue.getNextJob();
    if (!nextJob) {
      this.retryNextJob();
      return;
    }

    try {
      const result = await this.delegate.processJob(nextJob);

      // unblock the document queues of each add_file operation
      const actions = isOperationJob(nextJob)
        ? nextJob.operations
        : nextJob.actions;
      const addFileActions = actions.filter((op) => op.type === "ADD_FILE");
      if (addFileActions.length > 0) {
        for (const addFile of addFileActions) {
          const documentQueue = this.getQueue(
            nextJob.driveId,
            (addFile.input as AddFileInput).id,
          );
          await documentQueue.removeDependencies(nextJob);
        }
      }
      this.emit("jobCompleted", nextJob, result);
    } catch (e) {
      logger.error(`job failed`, e);
      this.emit("jobFailed", nextJob, e as Error);
    } finally {
      await queue.setBlocked(false);
      this.retryNextJob(0);
    }
  }

  protected emit<K extends keyof QueueEvents>(
    event: K,
    ...args: Parameters<QueueEvents[K]>
  ) {
    this.emitter.emit(event, ...args);
  }
  on<K extends keyof QueueEvents>(
    this: this,
    event: K,
    cb: QueueEvents[K],
  ): Unsubscribe {
    return this.emitter.on(event, cb);
  }

  protected getQueueId(driveId: string, documentId?: string) {
    return `queue:${driveId}${documentId ? `:${documentId}` : ""}`;
  }
}

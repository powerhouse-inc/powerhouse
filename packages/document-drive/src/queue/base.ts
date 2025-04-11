import { type DeleteNodeAction } from "#drive-document-model/gen/actions";
import { type AddFileInput } from "#drive-document-model/gen/types";
import { generateUUID } from "#utils/misc";
import { type Action } from "document-model";
import { createNanoEvents, type Unsubscribe } from "nanoevents";
import {
  type IJob,
  type IJobQueue,
  type IQueue,
  type IQueueManager,
  type IServerDelegate,
  isOperationJob,
  type Job,
  type JobId,
  type QueueEvents,
} from "./types.js";

export class MemoryQueue<T> implements IQueue<T> {
  private id: string;
  private blocked = false;
  private deleted = false;
  private items: IJob<T>[] = [];
  private dependencies = new Array<IJob<Job>>();
  private jobAddedEmitter = createNanoEvents<{
    jobAdded: (job: IJob<T>) => void;
  }>();

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
    this.jobAddedEmitter.emit("jobAdded", data);
    return Promise.resolve();
  }

  async getNextJob() {
    if (this.blocked || this.dependencies.length > 0) {
      return Promise.resolve(undefined);
    }
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
    // Special handling for drive queue dependency
    if (job.jobId === "drive-queue") {
      this.dependencies = this.dependencies.filter(
        (j) => !(j.jobId === "drive-queue" && j.driveId === job.driveId),
      );
    } else {
      this.dependencies = this.dependencies.filter(
        (j) => !(j.jobId === job.jobId && j.driveId === job.driveId),
      );
    }
    if (this.dependencies.length === 0) {
      await this.setBlocked(false);
    }
  }

  onJobAdded(callback: (job: IJob<T>) => void): Unsubscribe {
    return this.jobAddedEmitter.on("jobAdded", callback);
  }
}

export class BaseQueueManager implements IQueueManager {
  protected emitter = createNanoEvents<QueueEvents>();
  protected queues: IJobQueue[] = [];
  protected workers: number;
  protected timeout: number;
  private delegate: IServerDelegate | undefined;
  private activeWorkers = 0;
  private jobProcessingQueue: IJob<Job>[] = [];
  private isProcessing = false;

  constructor(workers = 3, timeout = 0) {
    this.workers = workers;
    this.timeout = timeout;
  }

  async init(
    delegate: IServerDelegate,
    onError: (error: Error) => void,
  ): Promise<void> {
    this.delegate = delegate;

    // Set up event listeners for all queues
    this.setupQueueListeners();

    return Promise.resolve();
  }

  private setupQueueListeners() {
    // Set up listeners for existing queues
    for (const queue of this.queues) {
      this.setupQueueListener(queue);
    }
  }

  protected setupQueueListener(queue: IJobQueue) {
    // @ts-ignore - onJobAdded is not in the interface yet
    if (queue.onJobAdded) {
      // @ts-ignore
      queue.onJobAdded((job: IJob<Job>) => {
        this.handleNewJob(job);
      });
    }
  }

  private async handleNewJob(job: IJob<Job>) {
    // Add job to processing queue
    this.jobProcessingQueue.push(job);

    // Start processing if not already processing
    if (!this.isProcessing) {
      this.processJobs();
    }
  }

  private async processJobs() {
    if (!this.delegate || this.jobProcessingQueue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;

    // Process jobs up to the worker limit
    while (
      this.activeWorkers < this.workers &&
      this.jobProcessingQueue.length > 0
    ) {
      const job = this.jobProcessingQueue.shift();
      if (!job) break;

      this.activeWorkers++;
      this.processJob(job).finally(() => {
        this.activeWorkers--;
        // Continue processing if there are more jobs
        if (this.jobProcessingQueue.length > 0) {
          this.processJobs();
        } else {
          this.isProcessing = false;
        }
      });
    }
  }

  private async processJob(job: IJob<Job>) {
    if (!this.delegate) {
      throw new Error("No server delegate defined");
    }

    try {
      // If this is a document operation, verify the document exists first
      if (job.documentId && !(await this.delegate.exists(job.documentId))) {
        throw new Error(`Document with id ${job.documentId} not found`);
      }

      const result = await this.delegate.processJob(job);
      this.emit("jobCompleted", job, result);

      // If this was an ADD_FILE operation, we need to unblock the corresponding document queue
      if (isOperationJob(job)) {
        const addFileOps = job.operations.filter((op: Action) => {
          return op.type === "ADD_FILE";
        });

        for (const op of addFileOps) {
          const input = op.input as AddFileInput;
          if (input.id) {
            const documentQueue = this.getQueue(job.driveId, input.id);
            // Remove both the drive queue dependency and this job as a dependency
            await documentQueue.removeDependencies({
              jobId: "drive-queue",
              driveId: job.driveId,
              actions: [],
              operations: [],
            });
            await documentQueue.removeDependencies(job);
            await documentQueue.setBlocked(false);
          }
        }
      }

      // If this is a document operation, we need to notify the document queue
      if (job.documentId) {
        const documentQueue = this.getQueue(job.driveId, job.documentId);
        await documentQueue.removeDependencies(job);
      }
    } catch (error: unknown) {
      // Create a new Error object to avoid unsafe calls
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Unknown error";

      this.emit("jobFailed", job, new Error(errorMessage));
      throw error; // Re-throw the error to ensure the job is marked as failed
    }
  }

  async addJob(job: Job): Promise<JobId> {
    if (!this.delegate) {
      throw new Error("No server delegate defined");
    }

    const jobId = generateUUID();
    const queue = this.getQueue(job.driveId, job.documentId);

    // Check if this is a DELETE_NODE operation first
    const actions = isOperationJob(job) ? job.operations : (job.actions ?? []);
    const removeFileOps = actions.filter(
      (j: Action) => j.type === "DELETE_NODE",
    ) as DeleteNodeAction[];

    // Handle DELETE_NODE operations first
    for (const removeFileOp of removeFileOps) {
      const input = removeFileOp.input;
      const targetQueue = this.getQueue(job.driveId, input.id);
      await targetQueue.setDeleted(true);
    }

    // If this queue is deleted and this is not a drive operation, reject it
    if ((await queue.isDeleted()) && job.documentId) {
      throw new Error("Queue is deleted");
    }

    // if it has ADD_FILE operations then handle those first
    const addFileOps = actions.filter((j: Action) => j.type === "ADD_FILE");

    for (const addFileOp of addFileOps) {
      const input = addFileOp.input as AddFileInput;
      const documentQueue = this.getQueue(job.driveId, input.id);

      // Skip if the document queue is deleted
      if (await documentQueue.isDeleted()) {
        continue;
      }

      // If this ADD_FILE operation has a parent folder, we need to ensure the folder exists first
      if (input.parentFolder) {
        const driveQueue = this.getQueue(job.driveId);
        const jobs = await driveQueue.getJobs();

        // Look for the folder creation job
        for (const driveJob of jobs) {
          const folderActions = isOperationJob(driveJob)
            ? driveJob.operations
            : driveJob.actions;
          const folderOp = folderActions.find((j: Action) => {
            const folderInput = j.input as { id: string };
            return (
              j.type === "ADD_FOLDER" && folderInput.id === input.parentFolder
            );
          });
          if (folderOp) {
            // Make this job depend on the folder creation job
            await documentQueue.addDependencies(driveJob);
          }
        }
      }

      // Add this job as a dependency to the document queue
      await documentQueue.addDependencies({ jobId, ...job });
    }

    // if it's a document operation for a non-existent document, block until ADD_FILE
    const newDocument =
      job.documentId && !(await this.delegate.exists(job.documentId));

    if (newDocument) {
      await queue.setBlocked(true);

      // checks if there any job in the queue adding the file and adds as dependency
      const driveQueue = this.getQueue(job.driveId);
      const jobs = await driveQueue.getJobs();
      let foundAddFileOp = false;

      for (const driveJob of jobs) {
        const actions = isOperationJob(driveJob)
          ? driveJob.operations
          : driveJob.actions;
        const op = actions.find((j: Action) => {
          const input = j.input as AddFileInput;
          return j.type === "ADD_FILE" && input.id === job.documentId;
        });
        if (op) {
          foundAddFileOp = true;
          await queue.addDependencies(driveJob);
        }
      }

      // If we didn't find an ADD_FILE operation, we need to wait for one
      if (!foundAddFileOp) {
        await queue.addDependencies({
          jobId: "drive-queue",
          driveId: job.driveId,
          actions: [],
          operations: [],
        });
      }
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
      this.setupQueueListener(queue);
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

  protected getQueueId(driveId: string, documentId?: string) {
    return documentId ? `${driveId}:${documentId}` : driveId;
  }
}

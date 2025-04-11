import { createNanoEvents, type Unsubscribe } from "nanoevents";
import { type RedisClientType } from "redis";
import { BaseQueueManager } from "./base.js";
import {
  type IJob,
  type IQueue,
  type IQueueManager,
  type IServerDelegate,
  type Job,
} from "./types.js";

export class RedisQueue<T> implements IQueue<T> {
  private id: string;
  private client: RedisClientType;
  private jobAddedEmitter = createNanoEvents<{
    jobAdded: (job: IJob<T>) => void;
  }>();

  constructor(id: string, client: RedisClientType) {
    this.client = client;
    this.id = id;
    this.client.hSet("queues", id, "true");
    this.client.hSet(this.id, "blocked", "false");
  }

  async addJob(data: IJob<T>) {
    await this.client.lPush(this.id + "-jobs", JSON.stringify(data));
    this.jobAddedEmitter.emit("jobAdded", data);
  }

  async getNextJob() {
    const job = await this.client.rPop(this.id + "-jobs");
    if (!job) {
      return undefined;
    }
    return JSON.parse(job) as IJob<T>;
  }

  async amountOfJobs() {
    return this.client.lLen(this.id + "-jobs");
  }

  async setBlocked(blocked: boolean) {
    if (blocked) {
      await this.client.hSet(this.id, "blocked", "true");
    } else {
      await this.client.hSet(this.id, "blocked", "false");
    }
  }

  async isBlocked() {
    const blockedResult = await this.client.hGet(this.id, "blocked");
    if (blockedResult === "true") {
      return true;
    }

    return false;
  }

  getId() {
    return this.id;
  }

  async getJobs() {
    const entries = await this.client.lRange(this.id + "-jobs", 0, -1);
    return entries.map((e) => JSON.parse(e) as IJob<T>);
  }

  async addDependencies(job: IJob<Job>) {
    if (await this.hasDependency(job)) {
      return;
    }
    await this.client.lPush(this.id + "-deps", JSON.stringify(job));
    await this.setBlocked(true);
  }

  async hasDependency(job: IJob<Job>) {
    const deps = await this.client.lRange(this.id + "-deps", 0, -1);
    return deps.some((d) => d === JSON.stringify(job));
  }

  async removeDependencies(job: IJob<Job>) {
    await this.client.lRem(this.id + "-deps", 1, JSON.stringify(job));
    const allDeps = await this.client.lLen(this.id + "-deps");
    if (allDeps > 0) {
      await this.setBlocked(true);
    } else {
      await this.setBlocked(false);
    }
  }

  async isDeleted() {
    const active = await this.client.hGet("queues", this.id);
    return active === "false";
  }

  async setDeleted(deleted: boolean) {
    if (deleted) {
      await this.client.hSet("queues", this.id, "false");
    } else {
      await this.client.hSet("queues", this.id, "true");
    }
  }

  onJobAdded(callback: (job: IJob<T>) => void): Unsubscribe {
    return this.jobAddedEmitter.on("jobAdded", callback);
  }
}

export class RedisQueueManager
  extends BaseQueueManager
  implements IQueueManager
{
  private client: RedisClientType;

  constructor(workers = 3, timeout = 0, client: RedisClientType) {
    super(workers, timeout);
    this.client = client;
  }

  async init(
    delegate: IServerDelegate,
    onError: (error: Error) => void,
  ): Promise<void> {
    await super.init(delegate, onError);
    const queues = await this.client.hGetAll("queues");
    for (const queueId in queues) {
      const active = await this.client.hGet("queues", queueId);
      if (active === "true") {
        const queue = new RedisQueue<Job>(queueId, this.client);
        this.queues.push(queue);
        this.setupQueueListener(queue);
      }
    }
  }

  getQueue(driveId: string, documentId?: string) {
    const queueId = this.getQueueId(driveId, documentId);
    let queue = this.queues.find((q) => q.getId() === queueId);

    if (!queue) {
      queue = new RedisQueue<Job>(queueId, this.client);
      this.queues.push(queue);
      this.setupQueueListener(queue);
    }

    return queue;
  }

  removeQueue(driveId: string, documentId?: string | undefined): void {
    super.removeQueue(driveId, documentId);

    const queueId = this.getQueueId(driveId, documentId);
    this.client.hDel("queues", queueId);
  }
}

import { RedisClientType } from "redis";
import { IJob, IQueue, IQueueManager, OperationJob } from "./types";
import { BaseQueueManager } from "./base";

export class RedisQueue<T, R> implements IQueue<T, R> {
    private id: string;
    private client: RedisClientType;

    constructor(id: string, client: RedisClientType) {
        this.client = client;
        this.id = id;
        this.client.hSet("queues", id, "true");

    }

    async addJob(data: any) {
        await this.client.lPush(this.id + "-jobs", JSON.stringify(data));
    }

    async getNextJob() {
        const job = await this.client.rPop(this.id + "-jobs");
        if (!job) {
            return null;
        }
        return JSON.parse(job);
    }

    async amountOfJobs() {
        return this.client.lLen(this.id + "-jobs");
    }

    async setBlocked(blocked: boolean) {
        if (blocked) {
            await this.client.hSet(this.id, "blocked", "true");
        } else {
            await this.client.hDel(this.id, "blocked");
        }
    }

    async isBlocked() {
        const blockedResult = await this.client.hGet(this.id, "blocked");
        if (blockedResult) {
            return true;
        }

        return false;
    }

    getId() {
        return this.id;
    }

    async getJobs() {
        const entries = await this.client.lRange(this.id + "-jobs", 0, -1)
        return entries.map(e => JSON.parse(e));
    }

    async addDependencies(job: IJob<OperationJob>) {
        if (await this.hasDependency(job)) {
            return;
        }
        await this.client.lPush(this.id + "-deps", JSON.stringify(job));
        await this.setBlocked(true);
    }

    async hasDependency(job: IJob<OperationJob>) {
        const deps = await this.client.lRange(this.id + "-deps", 0, -1);
        return deps.some(d => d === JSON.stringify(job));
    }

    async removeDependencies(job: IJob<OperationJob>) {
        const allDeps1 = await this.client.lLen(this.id + "-deps");
        await this.client.lRem(this.id + "-deps", 1, JSON.stringify(job));
        const allDeps = await this.client.lLen(this.id + "-deps");
        if (allDeps > 0) {
            await this.setBlocked(true);
        } else {
            await this.setBlocked(false);
        }
    }

    async isDeleted() {
        const deleted = await this.client.hGet(this.id, "deleted");
        return deleted === "true";
    }

    async setDeleted(deleted: boolean) {
        if (deleted) {
            await this.client.hSet(this.id, "deleted", "true");
        } else {
            await this.client.hDel(this.id, "deleted");
        }
    }
}

export class RedisQueueManager extends BaseQueueManager implements IQueueManager {

    private client: RedisClientType;

    constructor(workers = 3, timeout = 0, client: RedisClientType) {
        super(workers, timeout);
        this.client = client;
    }

    async init(delegate: IServerDelegate, onError: (error: Error) => void): Promise<void> {
        await super.init(delegate, onError);
        // load all queues
        const queues = await this.client.hGetAll("queues");
        for (const queueId in queues) {
            this.queues.push(new RedisQueue(queueId, this.client));
        }
    }

    getQueue(driveId: string, documentId?: string) {
        const queueId = this.getQueueId(driveId, documentId);
        let queue = this.queues.find((q) => q.getId() === queueId);

        if (!queue) {
            queue = new RedisQueue(queueId, this.client);
            this.queues.push(queue);
        }

        return queue;
    }

    removeQueue(driveId: string, documentId?: string | undefined): void {
        super.removeQueue(driveId, documentId);

        const queueId = this.getQueueId(driveId, documentId);
        this.client.hDel("queues", queueId);
    }
}
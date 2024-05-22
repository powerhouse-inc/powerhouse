import { Operation } from "document-model/document";
import { IOperationResult } from "../server";
import type { Unsubscribe } from "nanoevents";

export type OperationJob = {
    driveId: string;
    documentId?: string
    operations: Operation[]
    forceSync?: boolean
}

export type JobId = string;

export interface QueueEvents {
    jobCompleted: (job: IJob<OperationJob>, result: IOperationResult) => void;
    jobFailed: (job: IJob<OperationJob>, error: Error) => void;
}

export interface IServerDelegate {
    checkDocumentExists: (driveId: string, documentId: string) => Promise<boolean>;
    processOperationJob: (job: OperationJob) => Promise<IOperationResult>;
}

export interface IQueueManager {
    addJob(job: OperationJob): Promise<JobId>;
    getResult(driveId: string, documentId: string, jobId: JobId): Promise<IOperationResult | undefined>;
    getQueue(driveId: string, document?: string): IQueue<OperationJob, IOperationResult>;
    removeQueue(driveId: string, documentId?: string): void;
    getQueueByIndex(index: number): IQueue<OperationJob, IOperationResult> | null;
    getQueues(): string[];
    init(delegate: IServerDelegate, onError: (error: Error) => void): Promise<void>;
    on<K extends keyof QueueEvents>(
        this: this,
        event: K,
        cb: QueueEvents[K]
    ): Unsubscribe;
}

export type IJob<T> = { jobId: JobId } & T;

export interface IQueue<T, R> {
    addJob(data: IJob<T>): Promise<void>;
    getNextJob(): Promise<IJob<T> | undefined>;
    amountOfJobs(): Promise<number>;
    getId(): string;
    setBlocked(blocked: boolean): Promise<void>;
    isBlocked(): Promise<boolean>;
    isDeleted(): Promise<boolean>;
    setDeleted(deleted: boolean): Promise<void>;
    setResult(jobId: JobId, result: R): Promise<void>;
    getResult(jobId: JobId): Promise<R | undefined>;
    getJobs(): Promise<IJob<T>[]>;
    addDependencies(job: IJob<OperationJob>): Promise<void>;
    removeDependencies(job: IJob<OperationJob>): Promise<void>;
}

export type IJobQueue = IQueue<OperationJob, IOperationResult>;
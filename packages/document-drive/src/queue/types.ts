import type { AddOperationOptions, IOperationResult } from "@server/types";
import type { BaseAction, Operation } from "document-model";
import type { Unsubscribe } from "nanoevents";

export interface BaseJob {
  driveId: string;
  documentId?: string;
  actions?: BaseAction[];
  options?: AddOperationOptions;
}

export interface OperationJob extends BaseJob {
  operations: Operation<any, any, BaseAction>[];
}

export interface ActionJob extends BaseJob {
  actions: BaseAction[];
}

export type Job = OperationJob | ActionJob;

export type JobId = string;

export interface QueueEvents {
  jobCompleted: <TGlobalState, TLocalState, TAction extends BaseAction>(
    job: IJob<Job>,
    result: IOperationResult<TGlobalState, TLocalState, TAction>,
  ) => void;
  jobFailed: (job: IJob<Job>, error: Error) => void;
  queueRemoved: (queueId: string) => void;
}

export interface IServerDelegate {
  checkDocumentExists: (
    driveId: string,
    documentId: string,
  ) => Promise<boolean>;
  processJob: <TGlobalState, TLocalState, TAction extends BaseAction>(
    job: Job,
  ) => Promise<IOperationResult<TGlobalState, TLocalState, TAction>>;
}

export interface IQueueManager {
  addJob: (job: Job) => Promise<JobId>;
  getQueue: (driveId: string, documentId?: string) => IQueue<Job>;
  removeQueue: (driveId: string, documentId?: string) => void;
  getQueueByIndex: (index: number) => IQueue<Job> | null;
  getQueues: () => string[];
  init: (
    delegate: IServerDelegate,
    onError: (error: Error) => void,
  ) => Promise<void>;
  on: <K extends keyof QueueEvents>(
    this: this,
    event: K,
    cb: QueueEvents[K],
  ) => Unsubscribe;
}

export type IJob<T> = { jobId: JobId } & T;

export interface IQueue<T> {
  addJob(data: IJob<T>): Promise<void>;
  getNextJob(): Promise<IJob<T> | undefined>;
  amountOfJobs(): Promise<number>;
  getId(): string;
  setBlocked(blocked: boolean): Promise<void>;
  isBlocked(): Promise<boolean>;
  isDeleted(): Promise<boolean>;
  setDeleted(deleted: boolean): Promise<void>;
  getJobs(): Promise<IJob<T>[]>;
  addDependencies(job: IJob<Job>): Promise<void>;
  removeDependencies(job: IJob<Job>): Promise<void>;
}

export type IJobQueue = IQueue<Job>;

export function isOperationJob(job: Job): job is OperationJob {
  return "operations" in job;
}

export function isActionJob(job: Job): job is ActionJob {
  return "actions" in job;
}

import { type AddOperationOptions, type IOperationResult } from "#server/types";
import type {
  Action,
  Operation,
  PHBaseState,
  PHDocumentHeader,
} from "document-model";
import type { Unsubscribe } from "nanoevents";

export interface BaseJob {
  documentId: string;
  actions?: Action[];
  options?: AddOperationOptions;
}

export interface DocumentJob extends Omit<BaseJob, "actions"> {
  documentType: string;
  header?: Partial<PHDocumentHeader>;
  initialState?: Partial<PHBaseState>;
}

export interface OperationJob extends BaseJob {
  operations: Operation[];
}

export interface ActionJob extends BaseJob {
  actions: Action[];
}

export type Job = DocumentJob | OperationJob | ActionJob;

export type JobId = string;

export interface QueueEvents {
  jobAdded: (job: IJob<Job>) => void;
  jobStarted: (job: IJob<Job>) => void;
  jobCompleted: (job: IJob<Job>, result: IOperationResult) => void;
  jobFailed: (job: IJob<Job>, error: Error) => void;
  queueRemoved: (queue: { documentId: string; scope: string }) => void;
}

export interface IServerDelegate {
  exists: (documentId: string) => Promise<boolean>;
  processJob: (job: Job) => Promise<IOperationResult>;
}

export interface IQueueManager {
  addJob: (job: Job) => Promise<JobId>;
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
  isBlocked(): Promise<boolean>;
  isDeleted(): Promise<boolean>;
  isRunning(): Promise<boolean>;
  setDeleted(deleted: boolean): Promise<void>;
  setRunning(running: boolean): Promise<void>;
  getJobs(): Promise<IJob<T>[]>;
  addDependency: (job: IJob<Job>) => Promise<void>;
  removeDependency: (job: IJob<Job>) => Promise<void>;
}

export type IJobQueue = IQueue<Job>;

export function isDocumentJob(job: Job): job is DocumentJob {
  return "documentType" in job;
}

export function isOperationJob(job: Job): job is OperationJob {
  return "operations" in job;
}

export function isActionJob(job: Job): job is ActionJob {
  return "actions" in job;
}

import { JobQueueState, type IJobExecutionHandle, type Job } from "./types.js";

/**
 * Implementation of the IJobExecutionHandle interface
 */
export class JobExecutionHandle implements IJobExecutionHandle {
  private _state: JobQueueState;
  private _job: Job;
  private onStart?: () => void;
  private onComplete?: () => void;
  private onFail?: (reason: string) => void;

  constructor(
    job: Job,
    initialState: JobQueueState,
    callbacks?: {
      onStart?: () => void;
      onComplete?: () => void;
      onFail?: (reason: string) => void;
    }
  ) {
    this._job = job;
    this._state = initialState;
    this.onStart = callbacks?.onStart;
    this.onComplete = callbacks?.onComplete;
    this.onFail = callbacks?.onFail;
  }

  get job(): Job {
    return this._job;
  }

  get state(): JobQueueState {
    return this._state;
  }

  start(): void {
    if (this._state !== JobQueueState.READY) {
      throw new Error(`Cannot start job in state ${this._state}`);
    }
    this._state = JobQueueState.RUNNING;
    this.onStart?.();
  }

  complete(): void {
    if (this._state !== JobQueueState.RUNNING) {
      throw new Error(`Cannot complete job in state ${this._state}`);
    }
    this._state = JobQueueState.RESOLVED;
    this.onComplete?.();
  }

  fail(reason: string): void {
    if (this._state !== JobQueueState.RUNNING) {
      throw new Error(`Cannot fail job in state ${this._state}`);
    }
    this._state = JobQueueState.RESOLVED;
    this.onFail?.(reason);
  }
}
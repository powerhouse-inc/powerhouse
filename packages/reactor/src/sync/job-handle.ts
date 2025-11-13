import type { OperationWithContext } from "../storage/interfaces.js";
import type { ChannelError } from "./errors.js";
import { JobChannelStatus } from "./types.js";

type JobStatusCallback = (
  job: JobHandle,
  prev: JobChannelStatus,
  next: JobChannelStatus,
) => void;

export class JobHandleAggregateError extends Error {
  errors: Error[];

  constructor(errors: Error[]) {
    const messages = errors.map((e) => e.message).join("; ");
    super(
      `JobHandle callback failed with ${errors.length} error(s): ${messages}`,
    );
    this.name = "JobHandleAggregateError";
    this.errors = errors;
  }
}

export class JobHandle {
  readonly id: string;
  readonly remoteName: string;
  readonly documentId: string;
  readonly scopes: string[];
  readonly branch: string;
  readonly operations: OperationWithContext[];
  status: JobChannelStatus;
  error?: ChannelError;

  private callbacks: JobStatusCallback[] = [];

  constructor(
    id: string,
    remoteName: string,
    documentId: string,
    scopes: string[],
    branch: string,
    operations: OperationWithContext[],
  ) {
    this.id = id;
    this.remoteName = remoteName;
    this.documentId = documentId;
    this.scopes = scopes;
    this.branch = branch;
    this.operations = operations;
    this.status = JobChannelStatus.Unknown;
  }

  on(callback: JobStatusCallback): void {
    this.callbacks.push(callback);
  }

  started(): void {
    this.transition(JobChannelStatus.TransportPending);
  }

  transported(): void {
    this.transition(JobChannelStatus.ExecutionPending);
  }

  executed(): void {
    this.transition(JobChannelStatus.Applied);
  }

  failed(error: ChannelError): void {
    this.error = error;
    this.transition(JobChannelStatus.Error);
  }

  private transition(next: JobChannelStatus): void {
    const prev = this.status;
    this.status = next;
    const errors: Error[] = [];
    for (const callback of this.callbacks) {
      try {
        callback(this, prev, next);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
    if (errors.length > 0) {
      throw new JobHandleAggregateError(errors);
    }
  }
}

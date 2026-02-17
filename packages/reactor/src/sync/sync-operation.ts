import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { ChannelError } from "./errors.js";
import { SyncOperationStatus } from "./types.js";

type SyncOperationStatusCallback = (
  syncOp: SyncOperation,
  prev: SyncOperationStatus,
  next: SyncOperationStatus,
) => void;

export class SyncOperationAggregateError extends Error {
  errors: Error[];

  constructor(errors: Error[]) {
    const messages = errors.map((e) => e.message).join("; ");
    super(
      `SyncOperation callback failed with ${errors.length} error(s): ${messages}`,
    );
    this.name = "SyncOperationAggregateError";
    this.errors = errors;
  }
}

export class SyncOperation {
  readonly id: string;
  readonly jobId: string;
  jobDependencies: string[];
  readonly remoteName: string;
  readonly documentId: string;
  readonly scopes: string[];
  readonly branch: string;
  readonly operations: OperationWithContext[];
  status: SyncOperationStatus;
  error?: ChannelError;

  private callbacks: SyncOperationStatusCallback[] = [];

  constructor(
    id: string,
    jobId: string,
    jobDependencies: string[],
    remoteName: string,
    documentId: string,
    scopes: string[],
    branch: string,
    operations: OperationWithContext[],
  ) {
    this.id = id;
    this.jobId = jobId;
    this.jobDependencies = jobDependencies;
    this.remoteName = remoteName;
    this.documentId = documentId;
    this.scopes = scopes;
    this.branch = branch;
    this.operations = operations;
    this.status = SyncOperationStatus.Unknown;
  }

  on(callback: SyncOperationStatusCallback): void {
    this.callbacks.push(callback);
  }

  started(): void {
    this.transition(SyncOperationStatus.TransportPending);
  }

  transported(): void {
    this.transition(SyncOperationStatus.ExecutionPending);
  }

  executed(): void {
    this.transition(SyncOperationStatus.Applied);
  }

  failed(error: ChannelError): void {
    this.error = error;
    this.transition(SyncOperationStatus.Error);
  }

  private transition(next: SyncOperationStatus): void {
    const prev = this.status;
    if (next <= prev) {
      return;
    }
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
      throw new SyncOperationAggregateError(errors);
    }
  }
}

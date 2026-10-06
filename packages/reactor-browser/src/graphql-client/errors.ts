import type { JobInfo } from "@powerhousedao/reactor";

/** A call the Switchboard GraphQL surface cannot express. */
export class GraphQLOperationNotSupportedError extends Error {
  readonly name = "GraphQLOperationNotSupportedError";
  readonly operation: string;

  constructor(operation: string, reason: string) {
    super(`GraphQLReactorClient.${operation} is not supported: ${reason}`);
    this.operation = operation;
  }

  static isError(error: unknown): error is GraphQLOperationNotSupportedError {
    return (
      Error.isError(error) && error.name === "GraphQLOperationNotSupportedError"
    );
  }
}

/**
 * The Switchboard refused a request with 421 Misdirected Request: the
 * `Drive-Id` it carried names a drive that Switchboard does not own.
 */
export class GraphQLWrongBackendError extends Error {
  readonly name = "GraphQLWrongBackendError";
  readonly status = 421;
  /** The drive the Switchboard refused, or `""` when its answer names none. */
  readonly driveId: string;
  /** The response body, parsed when it is JSON. */
  readonly payload: unknown;

  constructor(driveId: string, payload: unknown, options?: ErrorOptions) {
    super(
      `The Switchboard does not serve drive ${driveId === "" ? "(unnamed)" : driveId}: 421 Misdirected Request`,
      options,
    );
    this.driveId = driveId;
    this.payload = payload;
  }

  static isError(error: unknown): error is GraphQLWrongBackendError {
    return (
      Error.isError(error) &&
      error.name === "GraphQLWrongBackendError" &&
      typeof (error as Partial<GraphQLWrongBackendError>).driveId === "string"
    );
  }
}

/**
 * The reactor's `BatchJobFailedError`, rebuilt from a batch result; this entry
 * imports the reactor for types only. The shared name lets either `isError`
 * recognise it.
 */
export class BatchJobFailedError extends Error {
  readonly name = "BatchJobFailedError";
  readonly key: string;
  readonly jobs: Readonly<Record<string, JobInfo>>;

  constructor(key: string, jobs: Record<string, JobInfo>) {
    const failure = jobs[key].error;
    const cause = new Error(failure?.message ?? "Job failed");
    cause.name = failure?.name ?? "Error";
    super(failure?.message ?? "Job failed", { cause });
    this.key = key;
    this.jobs = jobs;
  }

  static isError(error: unknown): error is BatchJobFailedError {
    return (
      Error.isError(error) &&
      error.name === "BatchJobFailedError" &&
      typeof (error as Partial<BatchJobFailedError>).key === "string" &&
      typeof (error as Partial<BatchJobFailedError>).jobs === "object"
    );
  }
}

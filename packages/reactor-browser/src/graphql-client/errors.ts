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

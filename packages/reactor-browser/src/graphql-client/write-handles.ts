import type {
  ConsistencyToken,
  JobInfo,
  JobStatus,
  ViewFilter,
  WriteHandle,
  WriteReceipt,
} from "@powerhousedao/reactor";
import type { PHDocument } from "document-model";
import { JobFailedError } from "./errors.js";

/** The two stages a write handle waits for. */
export type GraphQLJobStage = "written" | "readable";

/** Waits for a job to settle a stage, resolving with a FAILED job too. */
export type GraphQLJobStageWaiter = (
  jobId: string,
  stage: GraphQLJobStage,
  signal: AbortSignal | undefined,
) => Promise<JobInfo>;

/** Reads the document a write targeted, bounded by its receipt's token. */
export type GraphQLHandleReader = <TDocument extends PHDocument>(
  receipt: WriteReceipt,
  view: ViewFilter | undefined,
  signal: AbortSignal | undefined,
) => Promise<TDocument>;

/** Whether a job status has reached a stage, FAILED counting as settled. */
export function settlesGraphQLJobStage(
  status: JobStatus | string,
  stage: GraphQLJobStage,
): boolean {
  const value: string = status;
  if (value === "FAILED" || value === "READ_READY") {
    return true;
  }
  return stage === "written" && value === "WRITE_READY";
}

function emptyToken(): ConsistencyToken {
  return {
    version: 1,
    createdAtUtcIso: new Date().toISOString(),
    coordinates: [],
  };
}

function abortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new Error(String(reason));
}

/** `promise`, rejected early when `signal` aborts. */
function bounded<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.reject(abortError(signal));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * A write handle over a job the Switchboard accepted (`executeAsync`).
 *
 * Each stage is the waiter's: `jobStatus`, woken early by the `jobChanges`
 * subscription when the client has realtime. Stage promises are created on
 * first access, so a fire-and-forget caller never owns a rejection. A FAILED
 * job rejects a stage with {@link JobFailedError}.
 *
 * `document()` with no view is read once and shared, so the client's own
 * change announcement and the caller's read-back cost one request.
 */
export class GraphQLJobWriteHandle implements WriteHandle {
  readonly jobId: string;
  readonly documentId: string;
  readonly branch: string;

  private readonly wait: GraphQLJobStageWaiter;
  private readonly reader: GraphQLHandleReader;
  private readonly signal: AbortSignal | undefined;
  private writtenReceipt: Promise<WriteReceipt> | undefined;
  private readableReceipt: Promise<WriteReceipt> | undefined;
  private defaultDocument: Promise<PHDocument> | undefined;

  constructor(
    job: JobInfo,
    documentId: string,
    branch: string,
    wait: GraphQLJobStageWaiter,
    reader: GraphQLHandleReader,
    signal: AbortSignal | undefined,
  ) {
    this.jobId = job.id;
    this.documentId = documentId;
    this.branch = branch;
    this.wait = wait;
    this.reader = reader;
    this.signal = signal;
  }

  get written(): Promise<WriteReceipt> {
    this.writtenReceipt ??= this.receiptAt("written");
    return this.writtenReceipt;
  }

  get readable(): Promise<WriteReceipt> {
    this.readableReceipt ??= this.receiptAt("readable");
    return this.readableReceipt;
  }

  async document<TDocument extends PHDocument = PHDocument>(
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    if (view !== undefined) {
      const receipt = await bounded(this.readable, signal);
      return this.reader<TDocument>(receipt, view, signal);
    }
    this.defaultDocument ??= this.readable.then((receipt) =>
      this.reader(receipt, undefined, undefined),
    );
    return bounded(this.defaultDocument as Promise<TDocument>, signal);
  }

  private async receiptAt(stage: GraphQLJobStage): Promise<WriteReceipt> {
    const job = await this.wait(this.jobId, stage, this.signal);
    if ((job.status as string) === "FAILED") {
      throw new JobFailedError(job);
    }
    return {
      job,
      token: job.consistencyToken,
      documentId: this.documentId,
      branch: this.branch,
    };
  }
}

/**
 * A write handle for a write the Switchboard applied before answering: the
 * synchronous `createDocument` and `deleteDocument` mutations name no job. Both
 * stages are settled; `jobId` is empty and the receipt's job is a READ_READY
 * placeholder with an empty token, as the reactor's own settled handle has.
 */
export class GraphQLSettledWriteHandle implements WriteHandle {
  readonly jobId = "";
  readonly documentId: string;
  readonly branch: string;

  private readonly receipt: WriteReceipt;
  private readonly reader: GraphQLHandleReader;

  constructor(documentId: string, branch: string, reader: GraphQLHandleReader) {
    this.documentId = documentId;
    this.branch = branch;
    this.reader = reader;
    const token = emptyToken();
    this.receipt = {
      job: {
        id: "",
        documentId,
        status: "READ_READY" as JobStatus,
        createdAtUtcIso: token.createdAtUtcIso,
        consistencyToken: token,
        meta: { batchId: "", batchJobIds: [] },
      },
      token,
      documentId,
      branch,
    };
  }

  get written(): Promise<WriteReceipt> {
    return Promise.resolve(this.receipt);
  }

  get readable(): Promise<WriteReceipt> {
    return Promise.resolve(this.receipt);
  }

  document<TDocument extends PHDocument = PHDocument>(
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    return this.reader<TDocument>(this.receipt, view, signal);
  }
}

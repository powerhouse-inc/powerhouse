import {
  JobFailedError,
  JobStatus,
  type BatchWriteHandle,
  type ConsistencyToken,
  type JobInfo,
  type ViewFilter,
  type WriteHandle,
  type WriteReceipt,
} from "@powerhousedao/reactor";
import {
  RemoteWriteHandles,
  type RemoteReads,
  type WireBatchWriteHandle,
  type WireWriteHandle,
} from "@powerhousedao/reactor/rpc";
import type { PHDocument } from "@powerhousedao/shared/document-model";

/** Reads a write's document back once its receipt is in hand. */
type ReceiptReader = <TDocument extends PHDocument>(
  receipt: WriteReceipt,
  view: ViewFilter | undefined,
  signal: AbortSignal | undefined,
) => Promise<TDocument>;

function emptyToken(): ConsistencyToken {
  return { version: 1, createdAtUtcIso: "", coordinates: [] };
}

/**
 * Every job id a handle waits for: a handle that names its jobs gives them
 * all; any other gives its primary job, or none when it needed no job.
 */
export function jobIdsOfHandle(handle: WriteHandle): readonly string[] {
  const named = (handle as { jobIds?: readonly string[] }).jobIds;
  return named ?? (handle.jobId === "" ? [] : [handle.jobId]);
}

/**
 * A write whose job has already settled (the router waited for it, as an
 * upgrade must to retry a conflict). Both stages answer from that job: a
 * FAILED job rejects them with `JobFailedError`.
 */
class SettledJobHandle implements WriteHandle {
  readonly jobId: string;
  readonly jobIds: readonly string[];
  private readonly receipt: WriteReceipt;

  constructor(
    job: JobInfo,
    readonly documentId: string,
    readonly branch: string,
    private readonly reader: ReceiptReader,
  ) {
    this.jobId = job.id;
    this.jobIds = [job.id];
    this.receipt = { job, token: job.consistencyToken, documentId, branch };
  }

  get written(): Promise<WriteReceipt> {
    return this.settle();
  }

  get readable(): Promise<WriteReceipt> {
    return this.settle();
  }

  async document<TDocument extends PHDocument = PHDocument>(
    view?: ViewFilter,
    signal?: AbortSignal,
  ): Promise<TDocument> {
    const receipt = await this.settle();
    return this.reader<TDocument>(receipt, view, signal);
  }

  private settle(): Promise<WriteReceipt> {
    return this.receipt.job.status === JobStatus.FAILED
      ? Promise.reject(new JobFailedError(this.receipt.job))
      : Promise.resolve(this.receipt);
  }
}

/**
 * A write made through a backend's waiting facade member: it completed before
 * the handle existed and handed back no job, so both stages are settled,
 * `jobId` is empty and the receipt's token is empty. Read back without a view,
 * the document is the one the write returned, when it returned one; otherwise
 * it is read through the router.
 */
class CompletedWriteHandle implements WriteHandle {
  readonly jobId = "";
  readonly jobIds: readonly string[] = [];
  private readonly receipt: WriteReceipt;

  constructor(
    readonly documentId: string,
    readonly branch: string,
    private readonly carried: PHDocument | undefined,
    private readonly reader: ReceiptReader,
  ) {
    const token = emptyToken();
    this.receipt = {
      job: {
        id: "",
        documentId,
        status: JobStatus.READ_READY,
        createdAtUtcIso: "",
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
    if (view === undefined && this.carried !== undefined) {
      return Promise.resolve(this.carried as TDocument);
    }
    return this.reader<TDocument>(this.receipt, view, signal);
  }
}

/**
 * Builds the handles the router hands back for backends without a write half.
 *
 * A job the router holds but has not waited for (from a backend's `submit` or
 * `executeBatch`) gets the handle the RPC client builds for a write over the
 * wire (`rpc/write-handles.ts`), over the router's own read half: `readable` is
 * `read.waitForJob`, `written` polls `read.getJobStatus`, and `document()` is
 * `read.get` with the receipt's token. Both job reads go to the backend the
 * router recorded for the job.
 */
export class RoutingHandles {
  private readonly remote: RemoteWriteHandles;

  constructor(private readonly reads: RemoteReads) {
    this.remote = new RemoteWriteHandles(reads);
  }

  /** A handle over submitted jobs, the primary first; stages wait from job status. */
  forJobs(
    jobs: readonly JobInfo[],
    documentId: string,
    branch: string,
    signal: AbortSignal | undefined,
  ): WriteHandle {
    const wire: WireWriteHandle = {
      kind: "write-handle",
      jobId: jobs[0].id,
      jobIds: jobs.map((job) => job.id),
      documentId,
      branch,
    };
    return this.remote.fromWire(wire, signal) as WriteHandle;
  }

  /** A handle per plan key over a submitted batch, and stages over all of them. */
  forBatch(
    jobs: Record<string, JobInfo>,
    targets: ReadonlyMap<string, { documentId: string; branch: string }>,
    planOrder: readonly string[],
    signal: AbortSignal | undefined,
  ): BatchWriteHandle {
    const handles: Record<string, WireWriteHandle> = {};
    for (const [key, job] of Object.entries(jobs)) {
      const target = targets.get(key);
      handles[key] = {
        kind: "write-handle",
        jobId: job.id,
        jobIds: [job.id],
        documentId: job.documentId || target?.documentId || "",
        branch: target?.branch ?? "main",
      };
    }
    const wire: WireBatchWriteHandle = {
      kind: "batch-write-handle",
      jobs,
      handles,
      planOrder: [...planOrder],
    };
    return this.remote.fromWire(wire, signal) as BatchWriteHandle;
  }

  /** A handle over a job the router already waited for. */
  settledJob(job: JobInfo, documentId: string, branch: string): WriteHandle {
    return new SettledJobHandle(
      job,
      documentId,
      branch,
      this.reader(documentId),
    );
  }

  /** A handle over a write a waiting facade member completed. */
  completed(
    documentId: string,
    branch: string,
    carried?: PHDocument,
  ): WriteHandle {
    return new CompletedWriteHandle(
      documentId,
      branch,
      carried,
      this.reader(documentId),
    );
  }

  private reader(documentId: string): ReceiptReader {
    return <TDocument extends PHDocument>(
      receipt: WriteReceipt,
      view: ViewFilter | undefined,
      signal: AbortSignal | undefined,
    ): Promise<TDocument> =>
      this.reads.get<TDocument>(
        documentId,
        { ...view, branch: receipt.branch },
        signal,
        receipt.token.coordinates.length === 0 ? undefined : receipt.token,
      );
  }
}

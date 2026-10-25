import type { PHDocument } from "@powerhousedao/shared/document-model";
import { createEmptyConsistencyToken } from "../../executor/util.js";
import {
  isJobStageAwaiter,
  type IJobAwaiter,
  type JobStage,
} from "../../shared/awaiter.js";
import { BatchJobFailedError } from "../../shared/errors.js";
import {
  JobStatus,
  type ConsistencyCoordinate,
  type ConsistencyToken,
  type JobInfo,
  type ViewFilter,
} from "../../shared/types.js";
import type { BatchWriteHandle, WriteHandle, WriteReceipt } from "../types.js";

/**
 * A write's job FAILED: an infrastructure failure, a denial that aborted the
 * job, or a timeout. A reducer error is not one; it is reported on
 * `receipt.job.result` of a job that still reaches READ_READY.
 *
 * The message is the job error's message, so code that matched on the message
 * the client threw before handles existed keeps matching.
 */
export class JobFailedError extends Error {
  readonly job: JobInfo;

  constructor(job: JobInfo) {
    super(job.error?.message);
    this.name = "JobFailedError";
    this.job = job;
  }
}

/** Waits for a job to settle a stage, resolving with FAILED jobs too. */
export interface IJobStagePort {
  waitForStage(
    jobId: string,
    stage: JobStage,
    signal: AbortSignal | undefined,
  ): Promise<JobInfo>;
}

/**
 * Reads the document a write targeted, once its receipt is in hand. Each write
 * names its own reader so the read-back is exactly the read the client made
 * before handles existed.
 */
export type HandleReader = <TDocument extends PHDocument>(
  receipt: WriteReceipt,
  view: ViewFilter | undefined,
  signal: AbortSignal | undefined,
) => Promise<TDocument>;

/**
 * The stage port over an in-process awaiter. `readable` is `waitForJob`, so a
 * caller that awaits only `readable` makes exactly the call the client made
 * before handles existed; `written` uses the awaiter's stage wait, or falls
 * back to `readable`, which implies it, on an awaiter without one.
 */
export function awaiterStagePort(awaiter: IJobAwaiter): IJobStagePort {
  return {
    waitForStage(jobId, stage, signal) {
      if (stage === "written" && isJobStageAwaiter(awaiter)) {
        return awaiter.waitForStage(jobId, "written", signal);
      }
      return awaiter.waitForJob(jobId, signal);
    },
  };
}

/**
 * One token naming every coordinate of the given ones, keeping the highest
 * operation index per document, scope and branch.
 */
export function mergeConsistencyTokens(
  tokens: readonly ConsistencyToken[],
): ConsistencyToken {
  if (tokens.length === 1) {
    return tokens[0];
  }
  const byKey = new Map<string, ConsistencyCoordinate>();
  let createdAtUtcIso = "";
  for (const token of tokens) {
    if (token.createdAtUtcIso > createdAtUtcIso) {
      createdAtUtcIso = token.createdAtUtcIso;
    }
    for (const coordinate of token.coordinates) {
      const key = `${coordinate.documentId}:${coordinate.scope}:${coordinate.branch}`;
      const held = byKey.get(key);
      if (!held || held.operationIndex < coordinate.operationIndex) {
        byKey.set(key, coordinate);
      }
    }
  }
  return {
    version: 1,
    createdAtUtcIso: createdAtUtcIso || new Date().toISOString(),
    coordinates: [...byKey.values()],
  };
}

/** The first FAILED job, in the order given, or undefined. */
function firstFailed(jobs: readonly JobInfo[]): JobInfo | undefined {
  return jobs.find((job) => job.status === JobStatus.FAILED);
}

/**
 * A handle over one or more jobs that together make one write: the primary job,
 * whose id is the handle's and whose state the receipt carries, and every job
 * the write needs, such as a create's parent relationship or a delete's
 * relationship removals. Each stage settles when every job has settled it, and
 * rejects with the first FAILED job in the order the jobs were given.
 *
 * Stage promises are created on first access, so a caller that never awaits a
 * stage never owns a rejection.
 */
export class JobSetHandle implements WriteHandle {
  readonly jobId: string;
  readonly documentId: string;
  readonly branch: string;

  private readonly port: IJobStagePort;
  private readonly jobs: readonly JobInfo[];
  private readonly signal: AbortSignal | undefined;
  private readonly reader: HandleReader;
  private readonly settledAtCreation: boolean;
  private readonly settledByStage = new Map<JobStage, Promise<JobInfo[]>>();
  private writtenReceipt: Promise<WriteReceipt> | undefined;
  private readableReceipt: Promise<WriteReceipt> | undefined;

  /**
   * @param port - Waits for each job's stage
   * @param primaryJobId - The id of the job the handle stands for
   * @param jobs - Every job of the write, the primary among them, in the
   *   order they are waited for
   * @param documentId - The document the write targets
   * @param branch - The branch the write targets
   * @param signal - The write call's signal, which also bounds the stage waits
   * @param reader - Reads the targeted document back once readable
   * @param settledAtCreation - True when `jobs` already hold their final state
   */
  constructor(
    port: IJobStagePort,
    primaryJobId: string,
    jobs: readonly JobInfo[],
    documentId: string,
    branch: string,
    signal: AbortSignal | undefined,
    reader: HandleReader,
    settledAtCreation: boolean,
  ) {
    if (!jobs.some((job) => job.id === primaryJobId)) {
      throw new Error(`Job ${primaryJobId} is not among the write's jobs`);
    }
    this.port = port;
    this.jobs = jobs;
    this.jobId = primaryJobId;
    this.documentId = documentId;
    this.branch = branch;
    this.signal = signal;
    this.reader = reader;
    this.settledAtCreation = settledAtCreation;
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
    const receipt = await this.readable;
    return this.reader<TDocument>(receipt, view, signal);
  }

  /**
   * Every job's state once it settled the stage, FAILED included and in the
   * order given. Never rejects for a FAILED job, only for a failed wait.
   */
  settled(stage: JobStage): Promise<JobInfo[]> {
    let settled = this.settledByStage.get(stage);
    if (settled === undefined) {
      settled = this.settledAtCreation
        ? Promise.resolve([...this.jobs])
        : Promise.all(
            this.jobs.map((job) =>
              this.port.waitForStage(job.id, stage, this.signal),
            ),
          );
      this.settledByStage.set(stage, settled);
    }
    return settled;
  }

  private async receiptAt(stage: JobStage): Promise<WriteReceipt> {
    const jobs = await this.settled(stage);
    const failed = firstFailed(jobs);
    if (failed) {
      throw new JobFailedError(failed);
    }
    return {
      job: jobs.find((job) => job.id === this.jobId) ?? jobs[0],
      token: mergeConsistencyTokens(jobs.map((job) => job.consistencyToken)),
      documentId: this.documentId,
      branch: this.branch,
    };
  }
}

/**
 * A handle for a write that needed no job, such as an upgrade of a document
 * already at the target version. Both stages are settled; `jobId` is empty and
 * the receipt's job is a READ_READY placeholder with an empty token.
 */
export class SettledWriteHandle implements WriteHandle {
  readonly jobId = "";
  readonly documentId: string;
  readonly branch: string;

  private readonly receipt: WriteReceipt;
  private readonly reader: HandleReader;

  constructor(documentId: string, branch: string, reader: HandleReader) {
    this.documentId = documentId;
    this.branch = branch;
    this.reader = reader;
    const token = createEmptyConsistencyToken();
    this.receipt = {
      job: {
        id: "",
        documentId,
        status: JobStatus.READ_READY,
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

/**
 * The handle over an `executeBatch`: one handle per plan key, and stages over
 * all of them. A batch stage waits for every job, then rejects with a
 * `BatchJobFailedError` naming the first failed job in plan order and carrying
 * every job's state, as the waiting `executeBatch` always has.
 */
export class JobBatchHandle implements BatchWriteHandle {
  readonly jobs: Record<string, JobInfo>;
  readonly handles: Record<string, JobSetHandle>;

  private readonly planOrder: readonly string[];
  private writtenReceipts: Promise<Record<string, WriteReceipt>> | undefined;
  private readableReceipts: Promise<Record<string, WriteReceipt>> | undefined;

  /**
   * @param jobs - The accepted jobs, keyed by plan key
   * @param handles - One handle per plan key
   * @param planOrder - The plan keys in the order the request listed them
   */
  constructor(
    jobs: Record<string, JobInfo>,
    handles: Record<string, JobSetHandle>,
    planOrder: readonly string[],
  ) {
    this.jobs = jobs;
    this.handles = handles;
    this.planOrder = planOrder;
  }

  get written(): Promise<Record<string, WriteReceipt>> {
    this.writtenReceipts ??= this.receiptsAt("written");
    return this.writtenReceipts;
  }

  get readable(): Promise<Record<string, WriteReceipt>> {
    this.readableReceipts ??= this.receiptsAt("readable");
    return this.readableReceipts;
  }

  private async receiptsAt(
    stage: JobStage,
  ): Promise<Record<string, WriteReceipt>> {
    const entries = Object.entries(this.handles);
    const settled = await Promise.all(
      entries.map(
        async ([key, handle]) => [key, await handle.settled(stage)] as const,
      ),
    );
    const finalJobs: Record<string, JobInfo> = Object.fromEntries(
      settled.map(([key, jobs]) => [key, jobs[0]]),
    );
    for (const key of this.planOrder) {
      if (finalJobs[key]?.status === JobStatus.FAILED) {
        throw new BatchJobFailedError(key, finalJobs);
      }
    }
    const receipts = await Promise.all(
      entries.map(async ([key, handle]) => {
        const receipt =
          stage === "written" ? await handle.written : await handle.readable;
        return [key, receipt] as const;
      }),
    );
    return Object.fromEntries(receipts);
  }
}

/**
 * Builds handles over jobs this client submitted. One factory per client, so
 * every handle waits through the same port.
 */
export class WriteHandleFactory {
  constructor(private readonly port: IJobStagePort) {}

  /** A handle over one job, still to settle. */
  forJob(
    job: JobInfo,
    documentId: string,
    branch: string,
    signal: AbortSignal | undefined,
    reader: HandleReader,
  ): JobSetHandle {
    return this.forJobs(job.id, [job], documentId, branch, signal, reader);
  }

  /** A handle over a write's jobs, still to settle. */
  forJobs(
    primaryJobId: string,
    jobs: readonly JobInfo[],
    documentId: string,
    branch: string,
    signal: AbortSignal | undefined,
    reader: HandleReader,
  ): JobSetHandle {
    return new JobSetHandle(
      this.port,
      primaryJobId,
      jobs,
      documentId,
      branch,
      signal,
      reader,
      false,
    );
  }

  /** A handle over one job whose final state the caller already waited for. */
  forSettledJob(
    job: JobInfo,
    documentId: string,
    branch: string,
    reader: HandleReader,
  ): JobSetHandle {
    return new JobSetHandle(
      this.port,
      job.id,
      [job],
      documentId,
      branch,
      undefined,
      reader,
      true,
    );
  }

  /** A handle for a write that needed no job. */
  settled(
    documentId: string,
    branch: string,
    reader: HandleReader,
  ): SettledWriteHandle {
    return new SettledWriteHandle(documentId, branch, reader);
  }
}

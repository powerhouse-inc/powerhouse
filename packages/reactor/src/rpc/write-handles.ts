import type { PHDocument } from "@powerhousedao/shared/document-model";
import {
  JobBatchHandle,
  jobIdsOf,
  NodeHandle,
  WriteHandleFactory,
  type HandleReader,
  type IJobStagePort,
  type JobSetHandle,
} from "../client/internal/handles.js";
import type {
  BatchWriteHandle,
  NodeWriteHandle,
  WriteHandle,
} from "../client/types.js";
import { settlesStage, type JobStage } from "../shared/awaiter.js";
import {
  JobStatus,
  type ConsistencyToken,
  type JobInfo,
  type ViewFilter,
} from "../shared/types.js";
import type { WireBatchWriteHandle, WireWriteHandle } from "./protocol.js";

/**
 * A write handle cannot cross the wire: its stages are promises and its
 * `document()` is a closure. The host sends what identifies the write (the job
 * ids, the target, a drive write's node) and the tab builds a handle of its own
 * over the read half's RPC methods:
 *
 * - `readable` is `read.waitForJob` on the host, which is the host's
 *   event-driven job awaiter (the same JOB_READ_READY subscription an
 *   in-process handle waits on), one request per job.
 * - `written` polls `read.getJobStatus` until the job reaches WRITE_READY
 *   (or later, or FAILED), backing off from 25 ms to 500 ms. The client
 *   surface has no stage wait short of READ_READY to forward to; polling keeps
 *   the wire protocol to plain method calls.
 * - `document()` is `read.get` with the receipt's token.
 */
export type RemoteReads = {
  waitForJob(jobId: string, signal?: AbortSignal): Promise<JobInfo>;
  getJobStatus(jobId: string, signal?: AbortSignal): Promise<JobInfo>;
  get<TDocument extends PHDocument>(
    identifier: string,
    view: ViewFilter | undefined,
    signal: AbortSignal | undefined,
    consistencyToken: ConsistencyToken | undefined,
  ): Promise<TDocument>;
};

const WRITTEN_POLL_START_MS = 25;
const WRITTEN_POLL_MAX_MS = 500;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWriteHandle(value: unknown): value is WriteHandle {
  return (
    isObject(value) &&
    typeof value.jobId === "string" &&
    typeof value.documentId === "string" &&
    typeof value.branch === "string" &&
    typeof value.document === "function"
  );
}

function isBatchWriteHandle(value: unknown): value is BatchWriteHandle {
  return (
    isObject(value) &&
    isObject(value.handles) &&
    isObject(value.jobs) &&
    Object.values(value.handles).every(isWriteHandle)
  );
}

function isWireWriteHandle(value: unknown): value is WireWriteHandle {
  return isObject(value) && value.kind === "write-handle";
}

function isWireBatchWriteHandle(value: unknown): value is WireBatchWriteHandle {
  return isObject(value) && value.kind === "batch-write-handle";
}

function wireHandle(handle: WriteHandle): WireWriteHandle {
  const nodeId = (handle as Partial<NodeWriteHandle>).nodeId;
  return {
    kind: "write-handle",
    jobId: handle.jobId,
    jobIds: [...jobIdsOf(handle)],
    documentId: handle.documentId,
    branch: handle.branch,
    ...(typeof nodeId === "string" ? { nodeId } : {}),
  };
}

/**
 * Replaces the handles in a write method's result with their wire form: a
 * handle, a batch handle, an array of handles, or an object of handles (a
 * relationship move). Anything else passes through.
 */
export function writeResultToWire(value: unknown): unknown {
  if (isWriteHandle(value)) {
    return wireHandle(value);
  }
  if (isBatchWriteHandle(value)) {
    const handles: Record<string, WireWriteHandle> = {};
    for (const [key, handle] of Object.entries(value.handles)) {
      handles[key] = wireHandle(handle);
    }
    const planOrder = (value as { planOrder?: readonly string[] }).planOrder;
    const wire: WireBatchWriteHandle = {
      kind: "batch-write-handle",
      jobs: value.jobs,
      handles,
      planOrder: planOrder ? [...planOrder] : Object.keys(handles),
    };
    return wire;
  }
  if (Array.isArray(value) && value.length > 0 && value.every(isWriteHandle)) {
    return value.map(wireHandle);
  }
  if (isObject(value) && !Array.isArray(value)) {
    const entries = Object.entries(value);
    if (entries.length > 0 && entries.every(([, v]) => isWriteHandle(v))) {
      return Object.fromEntries(
        entries.map(([key, handle]) => [
          key,
          wireHandle(handle as WriteHandle),
        ]),
      );
    }
  }
  return value;
}

function placeholderJob(id: string, documentId: string): JobInfo {
  return {
    id,
    documentId,
    status: JobStatus.PENDING,
    createdAtUtcIso: "",
    consistencyToken: { version: 1, createdAtUtcIso: "", coordinates: [] },
    meta: { batchId: "", batchJobIds: [] },
  };
}

function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Operation aborted"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new Error("Operation aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** The stage port over the host's read half; see {@link RemoteReads}. */
export function remoteStagePort(reads: RemoteReads): IJobStagePort {
  return {
    async waitForStage(
      jobId: string,
      stage: JobStage,
      signal: AbortSignal | undefined,
    ): Promise<JobInfo> {
      if (stage === "readable") {
        return reads.waitForJob(jobId, signal);
      }
      let interval = WRITTEN_POLL_START_MS;
      for (;;) {
        const job = await reads.getJobStatus(jobId, signal);
        if (settlesStage(job.status, "written")) {
          return job;
        }
        await delay(interval, signal);
        interval = Math.min(interval * 2, WRITTEN_POLL_MAX_MS);
      }
    },
  };
}

/** Rebuilds the handles in a write method's result from their wire form. */
export class RemoteWriteHandles {
  private readonly handles: WriteHandleFactory;

  constructor(private readonly reads: RemoteReads) {
    this.handles = new WriteHandleFactory(remoteStagePort(reads));
  }

  fromWire(
    value: WireWriteHandle,
    signal: AbortSignal | undefined,
  ): WriteHandle;
  fromWire(
    value: WireBatchWriteHandle,
    signal: AbortSignal | undefined,
  ): BatchWriteHandle;
  fromWire(
    value: readonly WireWriteHandle[],
    signal: AbortSignal | undefined,
  ): WriteHandle[];
  fromWire(
    value: Readonly<Record<string, WireWriteHandle>>,
    signal: AbortSignal | undefined,
  ): Record<string, WriteHandle>;
  fromWire(value: unknown, signal: AbortSignal | undefined): unknown;
  fromWire(value: unknown, signal: AbortSignal | undefined): unknown {
    if (isWireWriteHandle(value)) {
      return this.handle(value, signal);
    }
    if (isWireBatchWriteHandle(value)) {
      const handles: Record<string, JobSetHandle> = {};
      for (const [key, wire] of Object.entries(value.handles)) {
        handles[key] = this.jobHandle(wire, signal);
      }
      return new JobBatchHandle(value.jobs, handles, value.planOrder);
    }
    if (Array.isArray(value) && value.every(isWireWriteHandle)) {
      return value.map((wire) => this.handle(wire, signal));
    }
    if (isObject(value) && !Array.isArray(value)) {
      const entries = Object.entries(value);
      if (
        entries.length > 0 &&
        entries.every(([, v]) => isWireWriteHandle(v))
      ) {
        return Object.fromEntries(
          entries.map(([key, wire]) => [
            key,
            this.handle(wire as WireWriteHandle, signal),
          ]),
        );
      }
    }
    return value;
  }

  private handle(
    wire: WireWriteHandle,
    signal: AbortSignal | undefined,
  ): WriteHandle {
    const handle: WriteHandle =
      wire.jobIds.length === 0
        ? this.handles.settled(
            wire.documentId,
            wire.branch,
            this.reader(wire.documentId),
          )
        : this.jobHandle(wire, signal);
    return wire.nodeId === undefined
      ? handle
      : new NodeHandle(handle, wire.nodeId);
  }

  private jobHandle(
    wire: WireWriteHandle,
    signal: AbortSignal | undefined,
  ): JobSetHandle {
    const ids = wire.jobIds.length > 0 ? wire.jobIds : [wire.jobId];
    return this.handles.forJobs(
      wire.jobId,
      ids.map((id) => placeholderJob(id, wire.documentId)),
      wire.documentId,
      wire.branch,
      signal,
      this.reader(wire.documentId),
    );
  }

  private reader(documentId: string): HandleReader {
    return <T extends PHDocument>(
      receipt: { branch: string; token: ConsistencyToken },
      view: ViewFilter | undefined,
      readSignal: AbortSignal | undefined,
    ): Promise<T> =>
      this.reads.get<T>(
        documentId,
        { ...view, branch: receipt.branch },
        readSignal,
        receipt.token,
      );
  }
}

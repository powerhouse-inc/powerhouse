import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  JobBatchHandle,
  JobSetHandle,
  JobStatus,
  mergeConsistencyTokens,
  RemoteWriteHandles,
  settlesStage,
  WriteHandleFactory,
  type BatchWriteHandle,
  type ConsistencyToken,
  type JobInfo,
  type WireBatchWriteHandle,
  type WireWriteHandle,
  type WriteHandle,
} from "../../index.js";

function job(id: string): JobInfo {
  return {
    id,
    documentId: "doc-1",
    status: JobStatus.READ_READY,
    createdAtUtcIso: "2026-10-25T00:00:00.000Z",
    consistencyToken: { version: 1, createdAtUtcIso: "", coordinates: [] },
    meta: { batchId: "b", batchJobIds: [id] },
  };
}

describe("handle building blocks on the package index", () => {
  it("exports the handle factory and the handle classes", async () => {
    const factory = new WriteHandleFactory({
      waitForStage: (jobId) => Promise.resolve(job(jobId)),
    });
    const handle = factory.forJobs(
      "job-1",
      [job("job-1")],
      "doc-1",
      "main",
      undefined,
      vi.fn(),
    );

    expect(handle).toBeInstanceOf(JobSetHandle);
    expect((await handle.readable).job.id).toBe("job-1");
    expect(
      new JobBatchHandle({ a: job("job-1") }, { a: handle }, ["a"]).handles.a,
    ).toBe(handle);
  });

  it("exports mergeConsistencyTokens and settlesStage", () => {
    const token = (scope: string, index: number): ConsistencyToken => ({
      version: 1,
      createdAtUtcIso: "2026-10-25T00:00:00.000Z",
      coordinates: [
        {
          documentId: "doc-1",
          scope,
          branch: "main",
          operationIndex: index,
        },
      ],
    });

    expect(
      mergeConsistencyTokens([token("global", 1), token("local", 2)])
        .coordinates,
    ).toHaveLength(2);
    expect(settlesStage(JobStatus.WRITE_READY, "written")).toBe(true);
    expect(settlesStage(JobStatus.WRITE_READY, "readable")).toBe(false);
  });

  it("types RemoteWriteHandles.fromWire by the wire form it is given", () => {
    const remote = new RemoteWriteHandles({
      waitForJob: (jobId) => Promise.resolve(job(jobId)),
      getJobStatus: (jobId) => Promise.resolve(job(jobId)),
      get: vi.fn(),
    });
    const wire: WireWriteHandle = {
      kind: "write-handle",
      jobId: "job-1",
      jobIds: ["job-1"],
      documentId: "doc-1",
      branch: "main",
    };
    const batch: WireBatchWriteHandle = {
      kind: "batch-write-handle",
      jobs: { a: job("job-1") },
      handles: { a: wire },
      planOrder: ["a"],
    };

    const single = remote.fromWire(wire, undefined);
    const many = remote.fromWire(batch, undefined);
    const list = remote.fromWire([wire], undefined);

    expectTypeOf(single).toEqualTypeOf<WriteHandle>();
    expectTypeOf(many).toEqualTypeOf<BatchWriteHandle>();
    expectTypeOf(list).toEqualTypeOf<WriteHandle[]>();
    expect(single.documentId).toBe("doc-1");
    expect(many.handles.a.jobId).toBe("job-1");
    expect(list).toHaveLength(1);
  });
});

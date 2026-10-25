import { describe, expect, it, vi } from "vitest";
import {
  DriveWriteClient,
  type DriveWriteHalf,
  type DriveWriteReads,
} from "../../src/client/drive-write-client.js";
import { WriteHandleFactory } from "../../src/client/internal/handles.js";
import type { WriteHandle, WriteReceipt } from "../../src/client/types.js";
import { JobStatus } from "../../src/shared/types.js";
import {
  createEmptyConsistencyToken,
  createMockLogger,
  createMockSigner,
} from "../factories.js";

function handleWith(allApplied: boolean | undefined): WriteHandle {
  const receipt: WriteReceipt = {
    job: {
      id: "job-1",
      documentId: "doc-1",
      status: JobStatus.READ_READY,
      createdAtUtcIso: "2026-10-25T00:00:00.000Z",
      consistencyToken: createEmptyConsistencyToken(),
      meta: { batchId: "b", batchJobIds: ["job-1"] },
      result:
        allApplied === undefined ? undefined : { actions: [], allApplied },
    },
    token: createEmptyConsistencyToken(),
    documentId: "doc-1",
    branch: "main",
  };
  return {
    jobId: "job-1",
    documentId: "doc-1",
    branch: "main",
    written: Promise.resolve(receipt),
    readable: Promise.resolve(receipt),
    document: vi.fn().mockResolvedValue({ header: { name: "Stale" } }),
  };
}

function driveClient(renameHandle: WriteHandle) {
  const execute = vi
    .fn()
    .mockResolvedValueOnce(renameHandle)
    .mockResolvedValueOnce(handleWith(true));
  const write = { execute } as unknown as DriveWriteHalf;
  const reads = { get: vi.fn() } as unknown as DriveWriteReads;
  const client = new DriveWriteClient(
    write,
    reads,
    new WriteHandleFactory({ waitForStage: vi.fn() }),
    createMockLogger(),
    vi.fn(),
    createMockSigner(),
    (identifier) => Promise.resolve(identifier),
  );
  return { client, execute, reads };
}

describe("DriveWriteClient.renameNode", () => {
  it("refuses when the job reports the SET_NAME was not applied, with no read", async () => {
    const renameHandle = handleWith(false);
    const { client, execute, reads } = driveClient(renameHandle);

    await expect(
      client.renameNode("drive-1", "doc-1", "Renamed"),
    ).rejects.toThrow("Document rename did not apply");

    expect(renameHandle.document).not.toHaveBeenCalled();
    expect(reads.get).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("reads back a handle whose job carries no outcome, as before", async () => {
    const renameHandle = handleWith(undefined);
    const { client } = driveClient(renameHandle);

    await expect(
      client.renameNode("drive-1", "doc-1", "Renamed"),
    ).rejects.toThrow("Document rename did not apply");

    expect(renameHandle.document).toHaveBeenCalledTimes(1);
  });
});

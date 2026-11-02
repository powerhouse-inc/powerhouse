import { describe, expect, it, vi } from "vitest";
import {
  DriveWriteClient,
  type BatchSubmitter,
  type DriveWriteHalf,
  type DriveWriteReads,
} from "../../src/client/drive-write-client.js";
import type { IDriveWriteStrategy } from "../../src/client/drive-nodes.js";
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
    vi.fn<BatchSubmitter>(),
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

describe("DriveWriteClient strategy routing", () => {
  function routedClient(documentType: string) {
    const execute = vi.fn().mockResolvedValue(handleWith(true));
    const write = { execute } as unknown as DriveWriteHalf;
    const reads = { get: vi.fn() } as unknown as DriveWriteReads;
    const strategyHandle = handleWith(true);
    const strategy = {
      addFile: vi.fn(),
      addFolder: vi.fn(),
      removeNode: vi.fn(),
      renameNode: vi.fn(),
      setPreferredEditorOnNode: vi.fn(),
      moveNode: vi.fn().mockResolvedValue(strategyHandle),
      copyNode: vi.fn(),
    } satisfies Record<keyof IDriveWriteStrategy, unknown>;
    const describeDrive = vi.fn().mockResolvedValue({
      documentId: "drive-1",
      documentType,
      slug: "drive-slug",
      branch: "main",
      revision: {},
    });
    const client = new DriveWriteClient(
      write,
      reads,
      new WriteHandleFactory({ waitForStage: vi.fn() }),
      createMockLogger(),
      vi.fn<BatchSubmitter>(),
      createMockSigner(),
      () => Promise.resolve("drive-1"),
      undefined,
      {
        strategies: new Map([
          ["powerhouse/reactor-drive", strategy as IDriveWriteStrategy],
        ]),
        describe: describeDrive,
      },
    );
    return { client, execute, strategy, strategyHandle, describeDrive };
  }

  it("delegates to the strategy for the drive's type, with the resolved id, and looks the type up once", async () => {
    const { client, execute, strategy, strategyHandle, describeDrive } =
      routedClient("powerhouse/reactor-drive");

    const first = await client.moveNode("drive-slug", "node-1", "folder-1");
    await client.moveNode("drive-1", "node-2", undefined);

    expect(first).toBe(strategyHandle);
    expect(strategy.moveNode).toHaveBeenNthCalledWith(
      1,
      "drive-1",
      "node-1",
      "folder-1",
      undefined,
    );
    expect(describeDrive).toHaveBeenCalledTimes(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it("takes the document-drive path for a type with no strategy", async () => {
    const { client, execute, strategy } = routedClient(
      "powerhouse/document-drive",
    );

    await client.moveNode("drive-slug", "node-1", undefined);

    expect(strategy.moveNode).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0]).toBe("drive-slug");
  });
});

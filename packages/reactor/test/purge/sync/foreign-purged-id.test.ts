import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { JobStatus } from "../../../src/shared/types.js";
import { SyncOperation } from "../../../src/sync/sync-operation.js";
import { createTestOperation } from "../../factories.js";
import {
  createHarness,
  emitWriteReady,
  FILTER,
  FULL_MANIFEST,
  indexOperation,
  quiesce,
  sentOperations,
  withContext,
  type Harness,
} from "./harness.js";

const LIVE = "live-drive";
const COL = DriveCollectionId.forDrive("drive-a");
const CONFIG = { type: "internal", parameters: {} };

describe("a failed load naming another purged id [Postgres]", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createHarness();
    await harness.manager.startup();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("does not tombstone the live document it was loaded for", async () => {
    const { manager } = harness;
    await manager.add("remote", COL, CONFIG, FILTER, {}, "r", FULL_MANIFEST);
    const channel = manager.getByName("remote").channel;
    harness.reactor.load.mockResolvedValue({ id: "job-1" });
    harness.reactor.getJobStatus.mockResolvedValue({
      id: "job-1",
      status: JobStatus.FAILED,
      error: {
        name: "DocumentPurgedError",
        message: "Document other-purged-id was purged",
        stack: "",
      },
    });

    channel.inbox.add(
      new SyncOperation(
        crypto.randomUUID(),
        "",
        [],
        "remote",
        LIVE,
        ["global"],
        "main",
        [withContext(createTestOperation(LIVE), LIVE, 1)],
      ),
    );
    await vi.waitFor(() => expect(channel.inbox.items).toEqual([]));

    const purged = (manager as unknown as { purgedDocumentIds: Set<string> })
      .purgedDocumentIds;
    expect(purged.has(LIVE)).toBe(false);

    // Later inbound still reaches a job, and local writes are still served.
    channel.inbox.add(
      new SyncOperation(
        crypto.randomUUID(),
        "",
        [],
        "remote",
        LIVE,
        ["global"],
        "main",
        [withContext(createTestOperation(LIVE, { index: 7 }), LIVE, 2)],
      ),
    );
    await vi.waitFor(() =>
      expect(harness.reactor.load).toHaveBeenCalledTimes(2),
    );
    const local = await indexOperation(harness.index, LIVE, {
      joins: [COL.key],
    });
    await emitWriteReady(harness.eventBus, [local], { [LIVE]: [COL.key] });
    await quiesce();
    expect(
      sentOperations(harness, "remote").some(
        (op) => op.context.ordinal === local.context.ordinal,
      ),
    ).toBe(true);
  });
});

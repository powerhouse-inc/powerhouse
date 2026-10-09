import { afterEach, describe, expect, it, vi } from "vitest";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { ReactorEventTypes } from "../../../src/events/types.js";
import { JobStatus } from "../../../src/shared/types.js";
import { SyncOperation } from "../../../src/sync/sync-operation.js";
import { SyncOperationStatus } from "../../../src/sync/types.js";
import { syncOperationErrorType } from "../../../src/sync/utils.js";
import { createTestOperation } from "../../factories.js";
import { purgeMarker } from "../helpers.js";
import {
  createHarness,
  FILTER,
  quiesce,
  withContext,
  type Harness,
} from "./harness.js";

const DOC = "purged-doc";
const COL_A = DriveCollectionId.forDrive("drive-a");
const CONFIG = { type: "internal", parameters: {} };
const FAST_RETRY = { markerRetryBaseDelayMs: 20, markerRetryMaxDelayMs: 40 };

type Internals = {
  quarantinedDocumentIds: Set<string>;
  purgedDocumentIds: Set<string>;
  markerRetries: Map<string, unknown>;
  appliedMarkers: Map<string, Map<string, number>>;
  sweptThrough: number;
  deriveSettled(): Promise<void>;
  hold(
    remote: unknown,
    documentId: string,
    branch: string,
    reason: { protocol: string; version: number; peerSupports: number[] },
  ): Promise<void>;
};

const internals = (harness: Harness) => harness.manager as unknown as Internals;

function markerSyncOp(
  jobId: string,
  marker = withContext(purgeMarker(DOC), DOC, 1, "document"),
): SyncOperation {
  return new SyncOperation(
    crypto.randomUUID(),
    jobId,
    [],
    "remote",
    DOC,
    ["document"],
    "main",
    [marker],
  );
}

async function deadLetterRows(harness: Harness) {
  return harness.db
    .selectFrom("sync_dead_letters")
    .select(["document_id", "error_type"])
    .execute();
}

function failFirstJob(harness: Harness, name: string): void {
  let jobs = 0;
  const nextJob = () => ({ id: `job-${++jobs}` });
  harness.reactor.load.mockImplementation(() => Promise.resolve(nextJob()));
  harness.reactor.loadBatch.mockImplementation(
    (request: { jobs: Array<{ key: string }> }) =>
      Promise.resolve({
        jobs: Object.fromEntries(request.jobs.map((j) => [j.key, nextJob()])),
      }),
  );
  harness.reactor.getJobStatus.mockImplementation((id: string) =>
    Promise.resolve(
      id === "job-1"
        ? {
            id,
            status: JobStatus.FAILED,
            error: { name, message: "trust service unreachable", stack: "" },
          }
        : { id, status: JobStatus.READ_READY },
    ),
  );
}

describe("a received marker whose load failed [Postgres]", () => {
  let harness: Harness;

  afterEach(async () => {
    await harness.cleanup();
  });

  it.each([
    ["a single load", ""],
    ["a batch load", "key-1"],
  ])(
    "keeps %s that failed transiently in the inbox and loads it again",
    async (_label, jobId) => {
      harness = await createHarness({ config: FAST_RETRY });
      await harness.manager.startup();
      await harness.manager.add("remote", COL_A, CONFIG, FILTER, {}, "r");
      const channel = harness.manager.getByName("remote").channel;
      failFirstJob(harness, "Error");

      const syncOp = markerSyncOp(jobId);
      channel.inbox.add(syncOp);

      await vi.waitFor(() => expect(channel.inbox.items).toEqual([]));
      expect(syncOp.status).toBe(SyncOperationStatus.Applied);
      expect(
        harness.reactor.load.mock.calls.length +
          harness.reactor.loadBatch.mock.calls.length,
      ).toBe(2);
      expect(channel.deadLetter.items).toEqual([]);
      expect(internals(harness).quarantinedDocumentIds.has(DOC)).toBe(false);
      expect(internals(harness).purgedDocumentIds.has(DOC)).toBe(true);
      expect(internals(harness).markerRetries.size).toBe(0);
      await quiesce();
      expect(await deadLetterRows(harness)).toEqual([]);
    },
  );

  it("backs off between retries while the failure lasts", async () => {
    // Jitter keeps every delay within [base / 2, base].
    harness = await createHarness({
      config: { markerRetryBaseDelayMs: 200, markerRetryMaxDelayMs: 200 },
    });
    await harness.manager.startup();
    await harness.manager.add("remote", COL_A, CONFIG, FILTER, {}, "r");
    const channel = harness.manager.getByName("remote").channel;
    const loadedAt: number[] = [];
    harness.reactor.load.mockImplementation(() => {
      loadedAt.push(performance.now());
      return Promise.resolve({ id: "job-1" });
    });
    harness.reactor.getJobStatus.mockResolvedValue({
      id: "job-1",
      status: JobStatus.FAILED,
      error: { name: "Error", message: "down", stack: "" },
    });

    channel.inbox.add(markerSyncOp(""));
    await vi.waitFor(() => expect(loadedAt.length).toBeGreaterThanOrEqual(3), {
      timeout: 5_000,
    });
    for (let i = 1; i < loadedAt.length; i++) {
      expect(loadedAt[i] - loadedAt[i - 1]).toBeGreaterThanOrEqual(95);
    }
    expect(channel.inbox.items).toHaveLength(1);
    expect(channel.deadLetter.items).toEqual([]);
    expect(internals(harness).quarantinedDocumentIds.has(DOC)).toBe(false);
  });

  it.each([
    ["a single load", ""],
    ["a batch load", "key-1"],
  ])(
    "dead-letters %s refused by admission without quarantine",
    async (_label, jobId) => {
      harness = await createHarness({ config: FAST_RETRY });
      await harness.manager.startup();
      await harness.manager.add("remote", COL_A, CONFIG, FILTER, {}, "r");
      const channel = harness.manager.getByName("remote").channel;
      failFirstJob(harness, "InvalidSignatureError");

      channel.inbox.add(markerSyncOp(jobId));

      await vi.waitFor(() => expect(channel.deadLetter.items).toHaveLength(1));
      expect(channel.inbox.items).toEqual([]);
      expect(syncOperationErrorType(channel.deadLetter.items[0].error)).toBe(
        "MARKER_REFUSED",
      );
      expect(internals(harness).quarantinedDocumentIds.has(DOC)).toBe(false);
      await vi.waitFor(async () =>
        expect(await deadLetterRows(harness)).toEqual([
          { document_id: DOC, error_type: "MARKER_REFUSED" },
        ]),
      );
      expect(
        await harness.storage.syncDeadLetterStorage.listQuarantinedDocumentIds(),
      ).toEqual([]);
      await quiesce();
      expect(
        harness.reactor.load.mock.calls.length +
          harness.reactor.loadBatch.mock.calls.length,
      ).toBe(1);
    },
  );

  it("drops a resent marker while its first copy awaits a retry", async () => {
    harness = await createHarness({
      config: { markerRetryBaseDelayMs: 60_000, markerRetryMaxDelayMs: 60_000 },
    });
    await harness.manager.startup();
    await harness.manager.add("remote", COL_A, CONFIG, FILTER, {}, "r");
    const channel = harness.manager.getByName("remote").channel;
    harness.reactor.load.mockResolvedValue({ id: "job-1" });
    harness.reactor.getJobStatus.mockResolvedValue({
      id: "job-1",
      status: JobStatus.FAILED,
      error: { name: "Error", message: "down", stack: "" },
    });

    const marker = withContext(purgeMarker(DOC), DOC, 1, "document");
    const first = markerSyncOp("", marker);
    channel.inbox.add(first);
    await vi.waitFor(() =>
      expect(internals(harness).markerRetries.size).toBe(1),
    );
    const resent = markerSyncOp("", marker);
    channel.inbox.add(resent);
    await quiesce();

    expect(harness.reactor.load).toHaveBeenCalledTimes(1);
    expect(channel.inbox.items).toEqual([first]);
    expect(resent.status).toBe(SyncOperationStatus.Applied);
    expect(channel.inbox.ackOrdinal).toBeLessThan(1);

    // A different marker for the same id is not a copy: it loads.
    channel.inbox.add(markerSyncOp(""));
    await vi.waitFor(() =>
      expect(harness.reactor.load).toHaveBeenCalledTimes(2),
    );
  });
  it("drops a resent marker its first copy applied while the ack is held", async () => {
    harness = await createHarness();
    await harness.manager.startup();
    await harness.manager.add("remote", COL_A, CONFIG, FILTER, {}, "r");
    const channel = harness.manager.getByName("remote").channel;
    let running = true;
    let markerJobs = 0;
    harness.reactor.load.mockImplementation((documentId: string) =>
      Promise.resolve({
        id: documentId === DOC ? `job-m-${++markerJobs}` : "job-x",
      }),
    );
    harness.reactor.getJobStatus.mockImplementation((id: string) =>
      Promise.resolve({
        id,
        status:
          id === "job-x" && running ? JobStatus.RUNNING : JobStatus.READ_READY,
      }),
    );

    const slow = new SyncOperation(
      crypto.randomUUID(),
      "",
      [],
      "remote",
      "doc-x",
      ["global"],
      "main",
      [withContext(createTestOperation("doc-x"), "doc-x", 1)],
    );
    const marker = withContext(purgeMarker(DOC), DOC, 2, "document");
    const first = markerSyncOp("", marker);
    channel.inbox.add(slow);
    channel.inbox.add(first);
    await vi.waitFor(() => expect(channel.inbox.items).toEqual([slow]));
    expect(first.status).toBe(SyncOperationStatus.Applied);
    expect(channel.inbox.ackOrdinal).toBe(0);

    const resent = markerSyncOp("", marker);
    channel.inbox.add(resent);
    await quiesce();

    expect(markerJobs).toBe(1);
    expect(resent.status).toBe(SyncOperationStatus.Applied);
    expect(channel.inbox.items).toEqual([slow]);

    running = false;
    await harness.eventBus.emit(ReactorEventTypes.JOB_READ_READY, {
      jobId: "job-x",
    });
    await vi.waitFor(() => expect(channel.inbox.items).toEqual([]));
    expect(channel.inbox.ackOrdinal).toBe(2);
    expect(internals(harness).appliedMarkers.get("remote")?.size ?? 0).toBe(0);
  });
});

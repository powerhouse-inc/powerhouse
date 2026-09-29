import { isPurgeMarker } from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { DocumentPurgedError } from "../../../src/shared/errors.js";
import { JobStatus } from "../../../src/shared/types.js";
import type { DeadLetterRecord } from "../../../src/storage/interfaces.js";
import { ChannelError } from "../../../src/sync/errors.js";
import { SyncOperation } from "../../../src/sync/sync-operation.js";
import {
  ChannelErrorSource,
  SyncEventTypes,
  SyncOperationStatus,
  type SyncOperationErrorType,
} from "../../../src/sync/types.js";
import { createTestOperation } from "../../factories.js";
import { purgeMarker, seedTombstone } from "../helpers.js";
import {
  createHarness,
  emitWriteReady,
  FILTER,
  FULL_MANIFEST,
  indexOperation,
  MANIFEST_WITHOUT_PURGE,
  purgeInIndex,
  quiesce,
  sentOperations,
  withContext,
  type Harness,
} from "./harness.js";

const DOC = "purged-doc";
const OTHER = "other-doc";
const COL_A = DriveCollectionId.forDrive("drive-a");
const COL_B = DriveCollectionId.forDrive("drive-b");
const CONFIG = { type: "internal", parameters: {} };

function quarantined(harness: Harness): Set<string> {
  return (harness.manager as unknown as { quarantinedDocumentIds: Set<string> })
    .quarantinedDocumentIds;
}

async function allDeadLetters(harness: Harness): Promise<string[]> {
  const rows = await harness.db
    .selectFrom("sync_dead_letters")
    .select("document_id")
    .execute();
  return rows.map((row) => row.document_id);
}

function inboxSyncOp(
  documentId: string,
  jobId: string,
  operations = [withContext(createTestOperation(documentId), documentId, 1)],
): SyncOperation {
  return new SyncOperation(
    crypto.randomUUID(),
    jobId,
    [],
    "remote",
    documentId,
    [operations[0].context.scope],
    "main",
    operations,
  );
}

function failedSyncOp(
  documentId: string,
  source: ChannelErrorSource,
  errorType: SyncOperationErrorType,
  remoteName = "remote",
): SyncOperation {
  const syncOp = new SyncOperation(
    crypto.randomUUID(),
    crypto.randomUUID(),
    [],
    remoteName,
    documentId,
    ["document"],
    "main",
    [],
  );
  syncOp.failed(new ChannelError(source, new Error("refused"), errorType));
  return syncOp;
}

describe("serving a purged document's marker [Postgres]", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createHarness();
    await harness.manager.startup();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("serves the marker alone to every remote of every collection the document was ever in, and to one added after", async () => {
    const { manager, index, db, eventBus } = harness;
    const early = await indexOperation(index, DOC, { joins: [COL_A.key] });
    await indexOperation(index, DOC, { leaves: [COL_A.key] });
    await indexOperation(index, DOC, { joins: [COL_B.key] });
    const other = await indexOperation(index, OTHER, { joins: [COL_A.key] });

    await manager.add("a", COL_A, CONFIG, FILTER, {}, "a", FULL_MANIFEST);
    await manager.add("b", COL_B, CONFIG, FILTER, {}, "b", FULL_MANIFEST);
    await vi.waitFor(() => {
      expect(sentOperations(harness, "a").map((op) => op.operation.id)).toEqual(
        expect.arrayContaining([early.operation.id, other.operation.id]),
      );
      expect(sentOperations(harness, "b").length).toBeGreaterThan(0);
    });
    await quiesce();
    const cursorA = await harness.storage.syncCursorStorage.get("a", "outbox");

    const { entry } = await purgeInIndex(db, index, DOC);
    expect(entry.context.ordinal).toBeGreaterThan(cursorA.cursorOrdinal);
    await emitWriteReady(eventBus, [entry], {
      [DOC]: [COL_A.key, COL_B.key],
    });

    for (const name of ["a", "b"]) {
      await vi.waitFor(() =>
        expect(sentOperations(harness, name).at(-1)?.operation.id).toBe(
          entry.operation.id,
        ),
      );
    }

    await manager.add("c", COL_A, CONFIG, FILTER, {}, "c", FULL_MANIFEST);
    await vi.waitFor(() =>
      expect(sentOperations(harness, "c").map((op) => op.operation.id)).toEqual(
        expect.arrayContaining([other.operation.id, entry.operation.id]),
      ),
    );
    await quiesce();

    for (const name of ["a", "b", "c"]) {
      const served = sentOperations(harness, name).filter((op) =>
        isPurgeMarker(op),
      );
      expect(served).toHaveLength(1);
    }
    expect(
      sentOperations(harness, "c").filter(
        (op) => op.context.documentId === DOC,
      ),
    ).toHaveLength(1);
    expect(await manager.listHolds()).toEqual([]);
  });

  it("serves the marker of a quarantined document and lifts the quarantine", async () => {
    const { manager, index, db, eventBus } = harness;
    await indexOperation(index, DOC, { joins: [COL_A.key] });
    await manager.add("a", COL_A, CONFIG, FILTER, {}, "a", FULL_MANIFEST);
    await vi.waitFor(() =>
      expect(sentOperations(harness, "a")).toHaveLength(1),
    );

    manager
      .getByName("a")
      .channel.deadLetter.add(
        failedSyncOp(DOC, ChannelErrorSource.Inbox, "SIGNATURE_INVALID", "a"),
      );
    expect(quarantined(harness).has(DOC)).toBe(true);
    await vi.waitFor(async () =>
      expect(await allDeadLetters(harness)).toEqual([DOC]),
    );

    const { entry } = await purgeInIndex(db, index, DOC);
    await emitWriteReady(eventBus, [entry], { [DOC]: [COL_A.key] });

    await vi.waitFor(() =>
      expect(sentOperations(harness, "a").at(-1)?.operation.id).toBe(
        entry.operation.id,
      ),
    );
    expect(quarantined(harness).has(DOC)).toBe(false);
    expect(manager.getByName("a").channel.deadLetter.items).toEqual([]);
    expect(
      await harness.storage.syncDeadLetterStorage.listQuarantinedDocumentIds(),
    ).not.toContain(DOC);
  });
});

describe("receiving operations of a purged document [Postgres]", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("drops them before a job exists when the id was purged before startup, with no dead letter", async () => {
    await seedTombstone(harness.db, DOC, 1);
    await harness.manager.startup();
    await harness.manager.add("remote", COL_A, CONFIG, FILTER, {}, "r");
    const channel = harness.manager.getByName("remote").channel;

    const unkeyed = inboxSyncOp(DOC, "");
    const keyed = inboxSyncOp(DOC, "key-1");
    channel.inbox.add(unkeyed, keyed);
    await quiesce();

    expect(channel.inbox.items).toEqual([]);
    expect(unkeyed.status).toBe(SyncOperationStatus.Applied);
    expect(keyed.status).toBe(SyncOperationStatus.Applied);
    expect(harness.reactor.load).not.toHaveBeenCalled();
    expect(harness.reactor.loadBatch).not.toHaveBeenCalled();
    expect(channel.deadLetter.items).toEqual([]);
    expect(await allDeadLetters(harness)).toEqual([]);
  });

  it("passes a marker to a load job even for a quarantined id, then drops what follows", async () => {
    await harness.manager.startup();
    await harness.manager.add("remote", COL_A, CONFIG, FILTER, {}, "r");
    const channel = harness.manager.getByName("remote").channel;
    quarantined(harness).add(DOC);
    harness.reactor.load.mockResolvedValue({ id: "job-1" });
    harness.reactor.getJobStatus.mockResolvedValue({
      id: "job-1",
      status: JobStatus.READ_READY,
    });

    const marker = purgeMarker(DOC);
    channel.inbox.add(
      inboxSyncOp(DOC, "", [withContext(marker, DOC, 1, "document")]),
    );
    await vi.waitFor(() => expect(channel.inbox.items).toEqual([]));
    expect(harness.reactor.load).toHaveBeenCalledWith(
      DOC,
      "main",
      [marker],
      expect.anything(),
      { sourceRemote: "remote" },
    );
    expect(quarantined(harness).has(DOC)).toBe(false);

    channel.inbox.add(inboxSyncOp(DOC, ""));
    await quiesce();
    expect(harness.reactor.load).toHaveBeenCalledTimes(1);
    expect(channel.inbox.items).toEqual([]);
  });

  it.each([
    ["a single load", ""],
    ["a batch load", "key-1"],
  ])(
    "drops %s that failed with DocumentPurgedError: no dead letter, no quarantine",
    async (_label, jobId) => {
      await harness.manager.startup();
      await harness.manager.add("remote", COL_A, CONFIG, FILTER, {}, "r");
      const channel = harness.manager.getByName("remote").channel;
      harness.reactor.load.mockResolvedValue({ id: "job-1" });
      harness.reactor.loadBatch.mockImplementation(
        (request: { jobs: Array<{ key: string }> }) =>
          Promise.resolve({
            jobs: Object.fromEntries(
              request.jobs.map((job) => [job.key, { id: "job-1" }]),
            ),
          }),
      );
      const error = new DocumentPurgedError(DOC);
      harness.reactor.getJobStatus.mockResolvedValue({
        id: "job-1",
        status: JobStatus.FAILED,
        error: { name: error.name, message: error.message, stack: "" },
      });

      const syncOp = inboxSyncOp(DOC, jobId);
      channel.inbox.add(syncOp);
      await vi.waitFor(() => expect(channel.inbox.items).toEqual([]));

      expect(syncOp.status).toBe(SyncOperationStatus.Applied);
      expect(channel.deadLetter.items).toEqual([]);
      expect(quarantined(harness).has(DOC)).toBe(false);
      await quiesce();
      expect(await allDeadLetters(harness)).toEqual([]);

      const loads =
        harness.reactor.load.mock.calls.length +
        harness.reactor.loadBatch.mock.calls.length;
      channel.inbox.add(inboxSyncOp(DOC, jobId ? "key-2" : ""));
      await quiesce();
      expect(
        harness.reactor.load.mock.calls.length +
          harness.reactor.loadBatch.mock.calls.length,
      ).toBe(loads);
    },
  );

  it("still dead-letters and quarantines a live document's failed load", async () => {
    await harness.manager.startup();
    await harness.manager.add("remote", COL_A, CONFIG, FILTER, {}, "r");
    const channel = harness.manager.getByName("remote").channel;
    harness.reactor.load.mockResolvedValue({ id: "job-1" });
    harness.reactor.getJobStatus.mockResolvedValue({
      id: "job-1",
      status: JobStatus.FAILED,
      error: { name: "Error", message: "boom", stack: "" },
    });

    channel.inbox.add(inboxSyncOp(DOC, ""));
    await vi.waitFor(() => expect(channel.deadLetter.items).toHaveLength(1));
    expect(quarantined(harness).has(DOC)).toBe(true);
    await vi.waitFor(async () =>
      expect(await allDeadLetters(harness)).toEqual([DOC]),
    );
  });

  it("dead-letters only the marker of a refused marker load", async () => {
    await harness.manager.startup();
    await harness.manager.add("remote", COL_A, CONFIG, FILTER, {}, "r");
    const channel = harness.manager.getByName("remote").channel;
    harness.reactor.load.mockResolvedValue({ id: "job-1" });
    harness.reactor.getJobStatus.mockResolvedValue({
      id: "job-1",
      status: JobStatus.FAILED,
      error: {
        name: "InvalidSignatureError",
        message: "unsigned marker",
        stack: "",
      },
    });
    const marker = withContext(purgeMarker(DOC), DOC, 2, "document");
    channel.inbox.add(
      inboxSyncOp(DOC, "", [
        withContext(createTestOperation(DOC), DOC, 1),
        marker,
      ]),
    );

    let rows: Array<{ operations: unknown }> = [];
    await vi.waitFor(async () => {
      rows = await harness.db
        .selectFrom("sync_dead_letters")
        .select("operations")
        .where("document_id", "=", DOC)
        .execute();
      expect(rows).toHaveLength(1);
    });
    expect(rows[0].operations).toEqual([marker]);
  });
});

describe("dead letters for a purged document [Postgres]", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("does not quarantine or persist a remote's refusal of the marker, and reports it", async () => {
    await seedTombstone(harness.db, DOC, 1);
    await harness.manager.startup();
    await harness.manager.add("remote", COL_A, CONFIG, FILTER, {}, "r");
    const refused = vi.fn();
    harness.eventBus.subscribe(SyncEventTypes.PURGE_REFUSED, (_t, event) => {
      refused(event);
    });
    const channel = harness.manager.getByName("remote").channel;

    channel.deadLetter.add(
      failedSyncOp(DOC, ChannelErrorSource.Outbox, "UNCLASSIFIED"),
      failedSyncOp(OTHER, ChannelErrorSource.Outbox, "UNCLASSIFIED"),
    );

    expect(quarantined(harness).has(DOC)).toBe(false);
    expect(quarantined(harness).has(OTHER)).toBe(true);
    expect(channel.deadLetter.items.map((item) => item.documentId)).toEqual([
      OTHER,
    ]);
    await vi.waitFor(async () =>
      expect(await allDeadLetters(harness)).toEqual([OTHER]),
    );
    await quiesce();
    expect(await allDeadLetters(harness)).toEqual([OTHER]);
    expect(refused).toHaveBeenCalledTimes(1);
    expect(refused).toHaveBeenCalledWith({
      remoteName: "remote",
      documentId: DOC,
      branch: "main",
      errorMessage: "refused",
    });
  });

  it("is refused by storage for a tombstoned id", async () => {
    await harness.manager.startup();
    await harness.manager.add("remote", COL_A, CONFIG, FILTER, {}, "r");
    await seedTombstone(harness.db, DOC, 1);
    const record = (documentId: string): DeadLetterRecord => ({
      id: crypto.randomUUID(),
      jobId: "job",
      jobDependencies: [],
      remoteName: "remote",
      documentId,
      scopes: ["global"],
      branch: "main",
      operations: [withContext(createTestOperation(documentId), documentId, 1)],
      errorSource: ChannelErrorSource.Inbox,
      errorMessage: "failed",
      errorType: "UNCLASSIFIED",
    });
    const storage = harness.storage.syncDeadLetterStorage;

    const error = await storage.add(record(DOC)).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(DocumentPurgedError.isError(error)).toBe(true);
    await storage.add(record(OTHER));

    expect(await allDeadLetters(harness)).toEqual([OTHER]);
  });

  it("learns an id is purged when storage refuses its dead letter", async () => {
    await harness.manager.startup();
    await harness.manager.add("remote", COL_A, CONFIG, FILTER, {}, "r");
    const channel = harness.manager.getByName("remote").channel;
    // Purged after startup, by a thread this sync manager never heard from.
    await seedTombstone(harness.db, DOC, 1);

    channel.deadLetter.add(
      failedSyncOp(DOC, ChannelErrorSource.Inbox, "UNCLASSIFIED"),
    );
    await vi.waitFor(() => expect(quarantined(harness).has(DOC)).toBe(false));
    expect(await allDeadLetters(harness)).toEqual([]);

    channel.inbox.add(inboxSyncOp(DOC, ""));
    await quiesce();
    expect(harness.reactor.load).not.toHaveBeenCalled();
    expect(channel.inbox.items).toEqual([]);
  });
});

describe("a purged document for peers without erasure [Postgres]", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createHarness();
    await harness.manager.startup();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it.each([
    ["a silent peer", null],
    ["a peer whose manifest lacks document-purge", MANIFEST_WITHOUT_PURGE],
  ])(
    "holds the marker from %s though its earlier versions were cached, and releases it alone on upgrade",
    async (_label, manifest) => {
      const { manager, index, db, eventBus } = harness;
      const held = vi.fn();
      const released = vi.fn();
      eventBus.subscribe(SyncEventTypes.SYNC_HELD, (_t, event) => {
        held(event);
      });
      eventBus.subscribe(SyncEventTypes.SYNC_RELEASED, (_t, event) => {
        released(event);
      });
      const before = await indexOperation(index, DOC, { joins: [COL_A.key] });

      await manager.add("peer", COL_A, CONFIG, FILTER, {}, "peer", manifest);
      await vi.waitFor(() =>
        expect(
          sentOperations(harness, "peer").map((op) => op.operation.id),
        ).toEqual([before.operation.id]),
      );
      expect(harness.protocolVersionsOf).toHaveBeenCalledWith(DOC, "main");
      const lookups = harness.protocolVersionsOf.mock.calls.length;

      const { entry } = await purgeInIndex(db, index, DOC);
      await emitWriteReady(eventBus, [entry], { [DOC]: [COL_A.key] });

      await vi.waitFor(async () =>
        expect(await manager.listHolds({ remoteName: "peer" })).toEqual([
          expect.objectContaining({
            documentId: DOC,
            branch: "main",
            reason: {
              protocol: "document-purge",
              version: 1,
              peerSupports: [],
            },
          }),
        ]),
      );
      expect(held).toHaveBeenCalledWith({
        remoteName: "peer",
        documentId: DOC,
        branch: "main",
        reason: { protocol: "document-purge", version: 1, peerSupports: [] },
      });
      expect(harness.forgetDocument).toHaveBeenCalledWith(DOC);
      expect(harness.protocolVersionsOf.mock.calls.length).toBe(lookups);
      await quiesce();
      expect(sentOperations(harness, "peer")).toHaveLength(1);
      expect(quarantined(harness).has(DOC)).toBe(false);
      expect(await allDeadLetters(harness)).toEqual([]);

      await manager.setPeerManifest("peer", FULL_MANIFEST);

      await vi.waitFor(() =>
        expect(
          sentOperations(harness, "peer")
            .slice(1)
            .map((op) => op.operation.id),
        ).toEqual([entry.operation.id]),
      );
      await vi.waitFor(async () =>
        expect(await manager.listHolds()).toEqual([]),
      );
      expect(released).toHaveBeenCalledWith({
        remoteName: "peer",
        documentId: DOC,
        branch: "main",
      });
    },
  );
});

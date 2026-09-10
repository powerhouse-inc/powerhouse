import type { Operation } from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import type { IOperationIndex } from "../../../src/cache/operation-index-types.js";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../../src/core/drive-container-types.js";
import type { IReactor } from "../../../src/core/types.js";
import { EventBus } from "../../../src/events/event-bus.js";
import { ReactorEventTypes } from "../../../src/events/types.js";
import type { ISyncCursorStorage } from "../../../src/storage/interfaces.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import { GqlResponseChannel } from "../../../src/sync/channels/gql-res-channel.js";
import type {
  IChannel,
  IChannelFactory,
} from "../../../src/sync/interfaces.js";
import type { SyncManagerConfig } from "../../../src/sync/sync-manager.js";
import { SyncManager } from "../../../src/sync/sync-manager.js";
import { SyncOperationStatus } from "../../../src/sync/types.js";
import { createTestSyncStorage } from "../../factories.js";

const DRIVE_ID = "drive-bound";
const COLLECTION = DriveCollectionId.forDrive(DRIVE_ID);
const STALE_WINDOW_MS = 50;
/**
 * For tests keeping a remote alive across a batch: notePoll() through
 * stalePollAgeMs runs on the real clock, so the survivor needs a window it
 * cannot age out of mid-batch.
 */
const LIVE_WINDOW_MS = 1_000;

/**
 * The serving channel: nothing takes an entry out of its outbox until a poll
 * acknowledges one, which is the situation the bound exists for.
 */
function passiveChannelFactory(): IChannelFactory {
  return {
    instance(
      remoteId: string,
      remoteName: string,
      _config: unknown,
      cursorStorage: ISyncCursorStorage,
    ): IChannel {
      return new GqlResponseChannel(
        new ConsoleLogger(["GqlResponseChannel"]),
        remoteId,
        remoteName,
        cursorStorage,
      );
    },
  } as unknown as IChannelFactory;
}

function operationFor(documentId: string): Operation {
  return {
    id: `op-${documentId}`,
    index: 0,
    skip: 0,
    hash: `hash-${documentId}`,
    timestampUtcMs: "2026-01-01T00:00:00.000Z",
    action: {
      type: "CREATE_DOCUMENT",
      scope: "global",
      id: `action-${documentId}`,
      timestampUtcMs: "2026-01-01T00:00:00.000Z",
      input: { protocolVersions: { "base-reducer": 2 } },
    },
  };
}

describe("bounding the entries one remote's outbox holds", () => {
  let db: Kysely<Database>;
  let storage: Awaited<ReturnType<typeof createTestSyncStorage>>;
  let operationIndex: IOperationIndex;
  let eventBus: EventBus;
  let syncManager: SyncManager;
  let reactor: IReactor;
  let collectionCreated = false;

  async function writeDocument(documentId: string): Promise<void> {
    const txn = operationIndex.start();
    txn.write([
      {
        ...operationFor(documentId),
        documentId,
        documentType: "powerhouse/document-model",
        branch: "main",
        scope: "global",
        sourceRemote: "",
      },
    ]);
    if (!collectionCreated) {
      txn.createCollection(COLLECTION.key);
      collectionCreated = true;
    }
    txn.addToCollection(COLLECTION.key, documentId);
    await operationIndex.commit(txn);
  }

  function outboxDocumentIds(name = "remote-bound"): string[] {
    return syncManager
      .getByName(name)
      .channel.outbox.items.map((syncOp) => syncOp.documentId)
      .sort();
  }

  async function buildManager(
    config: Partial<SyncManagerConfig>,
  ): Promise<void> {
    syncManager = new SyncManager(
      new ConsoleLogger(["SyncManager"]),
      storage.syncRemoteStorage,
      storage.syncCursorStorage,
      storage.syncDeadLetterStorage,
      passiveChannelFactory(),
      operationIndex,
      reactor,
      eventBus,
      DEFAULT_DRIVE_CONTAINER_TYPES,
      config,
    );
    await syncManager.startup();
  }

  async function rebuildManager(
    config: Partial<SyncManagerConfig>,
  ): Promise<void> {
    syncManager.shutdown();
    await buildManager(config);
  }

  function sleepPastWindow(windowMs = STALE_WINDOW_MS): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, windowMs + 100));
  }

  beforeEach(async () => {
    storage = await createTestSyncStorage();
    db = storage.db;
    eventBus = new EventBus();
    operationIndex = new KyselyOperationIndex(db);
    collectionCreated = false;

    reactor = {
      load: vi.fn().mockResolvedValue({ status: "ok" }),
      getJobStatus: vi.fn().mockResolvedValue({ id: "", status: "READ_READY" }),
      loadBatch: vi.fn().mockResolvedValue({ jobs: {} }),
    } as unknown as IReactor;

    await buildManager({
      maxHeldOperationsPerRemote: 3,
      staleRemotePollWindowMs: STALE_WINDOW_MS,
    });
  });

  afterEach(async () => {
    syncManager.shutdown();
    await db.destroy();
  });

  async function addRemote(name: string, type: string): Promise<void> {
    await syncManager.add(name, COLLECTION, { type, parameters: {} });
    await vi.waitFor(() => {
      expect(
        syncManager.getByName(name).channel.outbox.items.length,
      ).toBeGreaterThan(0);
    });
  }

  async function seedAndAdd(
    count: number,
    type = "internal",
    name = "remote-bound",
  ): Promise<void> {
    for (let i = 1; i <= count; i++) {
      await writeDocument(`doc-${i}`);
    }
    await addRemote(name, type);
  }

  /**
   * Drives one batch through the aggregator, which awaits the whole
   * processCompleteBatch chain -- eviction, and the prune drain after it.
   */
  async function emitWriteReady(
    documentId: string,
    ordinal: number,
  ): Promise<void> {
    await writeDocument(documentId);
    await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
      jobId: `job-${ordinal}`,
      operations: [
        {
          operation: operationFor(documentId),
          context: {
            documentId,
            documentType: "powerhouse/document-model",
            scope: "global",
            branch: "main",
            ordinal,
          },
        },
      ],
      jobMeta: { batchId: `batch-${ordinal}`, batchJobIds: [`job-${ordinal}`] },
      collectionMemberships: { [documentId]: [COLLECTION.key] },
    });
  }

  it("keeps the outbox at the cap when the backfill would overrun it", async () => {
    await seedAndAdd(6);

    expect(outboxDocumentIds()).toEqual(["doc-1", "doc-2", "doc-3"]);
  });

  it("keeps the oldest entries, so what remains runs from the cursor", async () => {
    await seedAndAdd(6);

    const items = syncManager.getByName("remote-bound").channel.outbox.items;
    const ordinals = items.map(
      (syncOp) => syncOp.operations[0].context.ordinal,
    );
    expect(Math.max(...ordinals)).toBeLessThan(4);
  });

  it("evicts without marking anything delivered", async () => {
    await seedAndAdd(6);

    for (const syncOp of syncManager.getByName("remote-bound").channel.outbox
      .items) {
      expect(syncOp.status).toBe(SyncOperationStatus.Unknown);
    }
    expect(
      syncManager.getByName("remote-bound").channel.outbox.ackOrdinal,
    ).toBe(0);
  });

  it("derives the evicted entries again once the outbox drains", async () => {
    await seedAndAdd(6);

    const remote = syncManager.getByName("remote-bound");
    const served = [...remote.channel.outbox.items];
    for (const syncOp of served) {
      syncOp.executed();
    }
    remote.channel.outbox.remove(...served);
    expect(remote.channel.outbox.items).toHaveLength(0);

    await emitWriteReady("doc-7", 7);

    await vi.waitFor(() => {
      expect(outboxDocumentIds()).toEqual(["doc-4", "doc-5", "doc-6"]);
    });
  });

  it("removes a serving remote whose holder has stopped polling", async () => {
    await seedAndAdd(6, "polling");
    expect(outboxDocumentIds()).toEqual(["doc-1", "doc-2", "doc-3"]);

    await sleepPastWindow();
    await emitWriteReady("doc-7", 7);

    await vi.waitFor(() => {
      expect(() => syncManager.getByName("remote-bound")).toThrow();
    });
  });

  it("takes the stale remote's persisted rows with it", async () => {
    await seedAndAdd(6, "polling");
    await storage.syncCursorStorage.upsert({
      remoteName: "remote-bound",
      cursorType: "outbox",
      cursorOrdinal: 2,
      lastSyncedAtUtcMs: Date.now(),
    });
    // Nothing acks in this suite, so without seeding the row the cursor
    // assertion below would pass on an already-empty table.
    expect(await storage.syncCursorStorage.list("remote-bound")).toHaveLength(
      1,
    );

    await sleepPastWindow();
    await emitWriteReady("doc-7", 7);
    await vi.waitFor(() => {
      expect(() => syncManager.getByName("remote-bound")).toThrow();
    });

    expect(
      await db.selectFrom("sync_remotes").selectAll().execute(),
    ).toHaveLength(0);
    expect(
      await db
        .selectFrom("sync_cursors")
        .selectAll()
        .where("remote_name", "=", "remote-bound")
        .execute(),
    ).toHaveLength(0);
  });

  it("only evicts while the holder is still within the poll window", async () => {
    await rebuildManager({
      maxHeldOperationsPerRemote: 3,
      staleRemotePollWindowMs: 300_000,
    });
    await seedAndAdd(6, "polling");

    await emitWriteReady("doc-7", 7);

    expect(outboxDocumentIds()).toEqual(["doc-1", "doc-2", "doc-3"]);
    expect(
      syncManager.getByName("remote-bound").channel.outbox.ackOrdinal,
    ).toBe(0);
  });

  it("evicts a client remote even when its own switchboard has gone quiet -- lastSuccessUtcMs cannot tell the two channel kinds apart, the type gate can", async () => {
    await seedAndAdd(6, "gql");

    await sleepPastWindow();
    await emitWriteReady("doc-7", 7);

    expect(outboxDocumentIds()).toEqual(["doc-1", "doc-2", "doc-3"]);
    expect(syncManager.getByName("remote-bound").meta.name).toBe(
      "remote-bound",
    );
  });

  it("keeps a serving remote whose holder polled again", async () => {
    await rebuildManager({
      maxHeldOperationsPerRemote: 3,
      staleRemotePollWindowMs: LIVE_WINDOW_MS,
    });
    await seedAndAdd(6, "polling");

    await sleepPastWindow(LIVE_WINDOW_MS);
    syncManager.getByName("remote-bound").channel.notePoll();
    await emitWriteReady("doc-7", 7);

    expect(outboxDocumentIds()).toEqual(["doc-1", "doc-2", "doc-3"]);
  });

  it("removes one stale remote without disturbing another on the same collection", async () => {
    await rebuildManager({
      maxHeldOperationsPerRemote: 3,
      staleRemotePollWindowMs: LIVE_WINDOW_MS,
    });
    await seedAndAdd(6, "polling");
    await addRemote("remote-live", "polling");

    await sleepPastWindow(LIVE_WINDOW_MS);
    syncManager.getByName("remote-live").channel.notePoll();
    await emitWriteReady("doc-7", 7);

    await vi.waitFor(() => {
      expect(() => syncManager.getByName("remote-bound")).toThrow();
    });
    expect(outboxDocumentIds("remote-live")).toEqual([
      "doc-1",
      "doc-2",
      "doc-3",
    ]);
    // The high-water mark, not the held run: the live remote derived doc-7 in
    // the same batch, so the sibling's removal did not cut its refill short.
    expect(
      syncManager.getByName("remote-live").channel.outbox.latestOrdinal,
    ).toBe(7);
  });
});

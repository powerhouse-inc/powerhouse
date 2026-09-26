import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import type {
  ISettledWatermark,
  WatermarkStatus,
} from "../../../src/catch-up/types.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../../src/core/drive-container-types.js";
import type { IReactor } from "../../../src/core/types.js";
import { EventBus } from "../../../src/events/event-bus.js";
import { ReactorEventTypes } from "../../../src/events/types.js";
import type { ISyncRemoteStorage } from "../../../src/storage/interfaces.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import { SyncManager } from "../../../src/sync/sync-manager.js";
import type { SyncEnvelope } from "../../../src/sync/types.js";
import { indexEntry } from "../../catch-up/helpers.js";
import {
  createTestChannelFactory,
  createTestSyncStorage,
} from "../../factories.js";
import type { TestChannel } from "../channels/test-channel.js";

/** Moves only when the test says so; refresh can optionally settle the head. */
class ManualWatermark implements ISettledWatermark {
  settledThrough = 0;
  head = 0;
  settleOnRefresh = false;
  private readonly listeners = new Set<(through: number) => void>();

  refresh(): Promise<number> {
    if (this.settleOnRefresh) this.settledThrough = this.head;
    return Promise.resolve(this.settledThrough);
  }

  onAdvance(listener: (through: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  status(): WatermarkStatus {
    return {
      head: this.head,
      settledThrough: this.settledThrough,
      waitingOn: [],
    };
  }

  advance(to: number): void {
    this.settledThrough = to;
    for (const listener of this.listeners) listener(to);
  }
}

const DRIVE_ID = "drive-1";
const COLLECTION = DriveCollectionId.forDrive(DRIVE_ID);
const REMOTE = "remote-1";

describe("SyncManager on the settled watermark", () => {
  let db: Kysely<Database>;
  let remoteStorage: ISyncRemoteStorage;
  let operationIndex: KyselyOperationIndex;
  let eventBus: EventBus;
  let watermark: ManualWatermark;
  let channels: Map<string, TestChannel>;
  let sent: SyncEnvelope[];
  let syncManager: SyncManager;

  beforeEach(async () => {
    const storage = await createTestSyncStorage();
    db = storage.db;
    remoteStorage = storage.syncRemoteStorage;
    operationIndex = new KyselyOperationIndex(db);
    eventBus = new EventBus();
    watermark = new ManualWatermark();
    channels = new Map();
    sent = [];
    syncManager = new SyncManager(
      new ConsoleLogger(["SyncManager"]),
      remoteStorage,
      storage.syncCursorStorage,
      storage.syncDeadLetterStorage,
      createTestChannelFactory(channels, sent),
      operationIndex,
      {
        load: vi.fn().mockResolvedValue({ status: "ok" }),
        getJobStatus: vi
          .fn()
          .mockResolvedValue({ id: "", status: "READ_READY" }),
        loadBatch: vi.fn().mockResolvedValue({ jobs: {} }),
      } as unknown as IReactor,
      eventBus,
      DEFAULT_DRIVE_CONTAINER_TYPES,
      watermark,
    );
  });

  afterEach(async () => {
    syncManager.shutdown();
    await db.destroy();
  });

  /** Commits one drive operation in the collection and returns it as indexed. */
  async function commitDriveOperation(index: number) {
    const txn = operationIndex.start();
    txn.createCollection(COLLECTION.key);
    txn.write([indexEntry(DRIVE_ID, index)]);
    txn.addToCollection(COLLECTION.key, DRIVE_ID);
    const [ordinal] = await operationIndex.commit(txn);
    const [op] = await operationIndex.getByOrdinals([ordinal!]);
    watermark.head = ordinal!;
    return op!;
  }

  function sentOrdinals(): number[] {
    return sent.flatMap((envelope) =>
      (envelope.operations ?? []).map((op) => op.context.ordinal),
    );
  }

  function channel(): TestChannel {
    return syncManager.getByName(REMOTE).channel as TestChannel;
  }

  async function addRemote(): Promise<void> {
    await syncManager.add(
      REMOTE,
      COLLECTION,
      { type: "internal", parameters: {} },
      { documentId: [], scope: [], branch: "main" },
    );
  }

  function writeReady(operations: OperationWithContext[]) {
    return eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
      jobId: `job-${operations[0]!.context.ordinal}`,
      operations,
      jobMeta: { batchId: "batch", batchJobIds: ["job"] },
      collectionMemberships: { [DRIVE_ID]: [COLLECTION.key] },
    });
  }

  it("derives an owed remote when the watermark advances without a batch", async () => {
    await syncManager.startup();
    const op = await commitDriveOperation(0);
    await addRemote();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(channel().outbox.latestOrdinal).toBe(0);
    expect(sentOrdinals()).toEqual([]);

    watermark.advance(op.context.ordinal);

    await vi.waitFor(() =>
      expect(sentOrdinals()).toContain(op.context.ordinal),
    );
    expect(channel().outbox.latestOrdinal).toBe(op.context.ordinal);
  });

  it("derives a remote whose stored ack is 0 after the first settle", async () => {
    await remoteStorage.upsert({
      id: "channel-1",
      name: REMOTE,
      collectionId: COLLECTION,
      channelConfig: { type: "internal", parameters: {} },
      filter: { documentId: [], scope: [], branch: "main" },
      options: { sinceTimestampUtcMs: "0" },
      status: {
        push: { state: "idle", failureCount: 0 },
        pull: { state: "idle", failureCount: 0 },
      },
    });
    const op = await commitDriveOperation(0);

    await syncManager.startup();
    expect(sentOrdinals()).toEqual([]);

    watermark.advance(op.context.ordinal);

    await vi.waitFor(() =>
      expect(sentOrdinals()).toContain(op.context.ordinal),
    );
  });

  it("derives a batch in its own pass when no other write is open", async () => {
    watermark.settleOnRefresh = true;
    await syncManager.startup();
    await addRemote();

    const op = await commitDriveOperation(0);
    await writeReady([op]);

    expect(channel().outbox.latestOrdinal).toBe(op.context.ordinal);
    expect(sentOrdinals()).toContain(op.context.ordinal);
  });

  it("holds derivation below an ordinal the watermark has not settled", async () => {
    await syncManager.startup();
    await addRemote();

    const op = await commitDriveOperation(0);
    await writeReady([op]);

    expect(channel().outbox.latestOrdinal).toBe(0);
    expect(sentOrdinals()).toEqual([]);

    watermark.advance(op.context.ordinal);
    await vi.waitFor(() =>
      expect(sentOrdinals()).toContain(op.context.ordinal),
    );
  });
});

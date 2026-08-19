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
import { SyncManager } from "../../../src/sync/sync-manager.js";
import { SyncOperationStatus } from "../../../src/sync/types.js";
import { createTestSyncStorage } from "../../factories.js";

const DRIVE_ID = "drive-bound";
const COLLECTION = DriveCollectionId.forDrive(DRIVE_ID);

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
  let operationIndex: IOperationIndex;
  let eventBus: EventBus;
  let syncManager: SyncManager;
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

  function outboxDocumentIds(): string[] {
    return syncManager
      .getByName("remote-bound")
      .channel.outbox.items.map((syncOp) => syncOp.documentId)
      .sort();
  }

  beforeEach(async () => {
    const storage = await createTestSyncStorage();
    db = storage.db;
    eventBus = new EventBus();
    operationIndex = new KyselyOperationIndex(db);
    collectionCreated = false;

    const reactor = {
      load: vi.fn().mockResolvedValue({ status: "ok" }),
      getJobStatus: vi.fn().mockResolvedValue({ id: "", status: "READ_READY" }),
      loadBatch: vi.fn().mockResolvedValue({ jobs: {} }),
    } as unknown as IReactor;

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
      { maxHeldOperationsPerRemote: 3 },
    );
    await syncManager.startup();
  });

  afterEach(async () => {
    syncManager.shutdown();
    await db.destroy();
  });

  async function seedAndAdd(count: number): Promise<void> {
    for (let i = 1; i <= count; i++) {
      await writeDocument(`doc-${i}`);
    }
    await syncManager.add("remote-bound", COLLECTION, {
      type: "internal",
      parameters: {},
    });
    await vi.waitFor(() => {
      expect(
        syncManager.getByName("remote-bound").channel.outbox.items.length,
      ).toBeGreaterThan(0);
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

    await writeDocument("doc-7");
    await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, {
      jobId: "job-7",
      operations: [
        {
          operation: operationFor("doc-7"),
          context: {
            documentId: "doc-7",
            documentType: "powerhouse/document-model",
            scope: "global",
            branch: "main",
            ordinal: 7,
          },
        },
      ],
      jobMeta: { batchId: "batch-7", batchJobIds: ["job-7"] },
      collectionMemberships: { "doc-7": [COLLECTION.key] },
    });

    await vi.waitFor(() => {
      expect(outboxDocumentIds()).toEqual(["doc-4", "doc-5", "doc-6"]);
    });
  });
});

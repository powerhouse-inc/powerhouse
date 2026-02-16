import type { Operation } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import type { IOperationIndex } from "../../../src/cache/operation-index-types.js";
import { driveCollectionId } from "../../../src/cache/operation-index-types.js";
import type { IReactor } from "../../../src/core/types.js";
import { EventBus } from "../../../src/events/event-bus.js";
import type { IEventBus } from "../../../src/events/interfaces.js";
import { ConsoleLogger } from "../../../src/logging/console.js";
import type {
  ISyncCursorStorage,
  ISyncRemoteStorage,
} from "../../../src/storage/interfaces.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import type { IChannelFactory } from "../../../src/sync/interfaces.js";
import { SyncManager } from "../../../src/sync/sync-manager.js";
import type { ChannelConfig, SyncEnvelope } from "../../../src/sync/types.js";
import {
  createTestChannelFactory,
  createTestSyncStorage,
} from "../../factories.js";

describe("SyncManager Backfill", () => {
  let db: Kysely<Database>;
  let syncRemoteStorage: ISyncRemoteStorage;
  let syncCursorStorage: ISyncCursorStorage;
  let eventBus: IEventBus;
  let operationIndex: IOperationIndex;
  let mockReactor: IReactor;
  let sentEnvelopes: SyncEnvelope[];
  let channelFactory: IChannelFactory;
  let syncManager: SyncManager;

  beforeEach(async () => {
    const storage = await createTestSyncStorage();
    db = storage.db;
    syncRemoteStorage = storage.syncRemoteStorage;
    syncCursorStorage = storage.syncCursorStorage;

    eventBus = new EventBus();

    operationIndex = new KyselyOperationIndex(db);

    mockReactor = {
      load: vi.fn().mockResolvedValue({ status: "ok" }),
    } as any;

    sentEnvelopes = [];
    channelFactory = createTestChannelFactory(new Map(), sentEnvelopes);

    syncManager = new SyncManager(
      new ConsoleLogger(["SyncManager"]),
      syncRemoteStorage,
      syncCursorStorage,
      channelFactory,
      operationIndex,
      mockReactor,
      eventBus,
    );
  });

  afterEach(async () => {
    syncManager.shutdown();
    await db.destroy();
  });

  describe("historical operation backfill", () => {
    it("should backfill outbox with historical operations when adding a remote", async () => {
      await syncManager.startup();

      const driveId = "test-drive-1";
      const collectionId = driveCollectionId("main", driveId);

      const historicalOperation: Operation = {
        id: "op1",
        index: 0,
        skip: 0,
        hash: "hash1",
        timestampUtcMs: "2023-01-01T00:00:00.000Z",
        action: {
          type: "CREATE_DOCUMENT",
          scope: "global",
          id: "action1",
          timestampUtcMs: "2023-01-01T00:00:00.000Z",
          input: {},
        },
      };

      const txn = operationIndex.start();
      txn.write([
        {
          ...historicalOperation,
          documentId: driveId,
          documentType: "powerhouse/document-drive",
          branch: "main",
          scope: "global",
          sourceRemote: "",
        },
      ]);
      txn.createCollection(collectionId);
      txn.addToCollection(collectionId, driveId);
      await operationIndex.commit(txn);

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      const remote = await syncManager.add(
        "remote1",
        collectionId,
        channelConfig,
      );

      expect(sentEnvelopes).toHaveLength(1);
      expect(sentEnvelopes[0].operations).toHaveLength(1);
      expect(sentEnvelopes[0].operations![0].operation.id).toBe("op1");
      expect(remote.channel.outbox.items).toHaveLength(0);

      const outboxCursor = await syncCursorStorage.get("remote1", "outbox");
      expect(outboxCursor.cursorOrdinal).toBeGreaterThan(0);
    });

    it("should not backfill when collection has no operations", async () => {
      await syncManager.startup();

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      const remote = await syncManager.add(
        "remote1",
        "empty-collection",
        channelConfig,
      );

      expect(remote.channel.outbox.items).toHaveLength(0);
    });

    it("should filter backfilled operations by remote filter", async () => {
      await syncManager.startup();

      const driveId = "test-drive-2";
      const collectionId = driveCollectionId("main", driveId);

      const op1: Operation = {
        id: "op1",
        index: 0,
        skip: 0,
        hash: "hash1",
        timestampUtcMs: "2023-01-01T00:00:00.000Z",
        action: {
          type: "CREATE_DOCUMENT",
          scope: "global",
          id: "action1",
          timestampUtcMs: "2023-01-01T00:00:00.000Z",
          input: {},
        },
      };

      const op2: Operation = {
        id: "op2",
        index: 1,
        skip: 0,
        hash: "hash2",
        timestampUtcMs: "2023-01-01T00:00:01.000Z",
        action: {
          type: "UPDATE",
          scope: "local",
          id: "action2",
          timestampUtcMs: "2023-01-01T00:00:01.000Z",
          input: {},
        },
      };

      const txn = operationIndex.start();
      txn.write([
        {
          ...op1,
          documentId: driveId,
          documentType: "powerhouse/document-drive",
          branch: "main",
          scope: "global",
          sourceRemote: "",
        },
      ]);
      txn.createCollection(collectionId);
      txn.addToCollection(collectionId, driveId);
      await operationIndex.commit(txn);

      const txn2 = operationIndex.start();
      txn2.write([
        {
          ...op2,
          documentId: driveId,
          documentType: "powerhouse/document-drive",
          branch: "main",
          scope: "local",
          sourceRemote: "",
        },
      ]);
      await operationIndex.commit(txn2);

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      const remote = await syncManager.add(
        "remote1",
        collectionId,
        channelConfig,
        { documentId: [driveId], scope: ["global"], branch: "main" },
      );

      expect(sentEnvelopes).toHaveLength(1);
      expect(sentEnvelopes[0].operations).toHaveLength(1);
      expect(sentEnvelopes[0].operations![0].operation.id).toBe("op1");
      expect(remote.channel.outbox.items).toHaveLength(0);
    });

    it("should respect sinceTimestampUtcMs and persist backfill checkpoint", async () => {
      await syncManager.startup();

      const driveId = "test-drive-3";
      const collectionId = driveCollectionId("main", driveId);

      const olderOp: Operation = {
        id: "op-old",
        index: 0,
        skip: 0,
        hash: "hash-old",
        timestampUtcMs: "2023-01-01T00:00:00.000Z",
        action: {
          type: "CREATE_DOCUMENT",
          scope: "global",
          id: "action-old",
          timestampUtcMs: "2023-01-01T00:00:00.000Z",
          input: {},
        },
      };

      const newerOp: Operation = {
        id: "op-new",
        index: 1,
        skip: 0,
        hash: "hash-new",
        timestampUtcMs: "2023-01-01T00:00:02.000Z",
        action: {
          type: "UPDATE",
          scope: "global",
          id: "action-new",
          timestampUtcMs: "2023-01-01T00:00:02.000Z",
          input: {},
        },
      };

      const txn = operationIndex.start();
      txn.write([
        {
          ...olderOp,
          documentId: driveId,
          documentType: "powerhouse/document-drive",
          branch: "main",
          scope: "global",
          sourceRemote: "",
        },
      ]);
      txn.createCollection(collectionId);
      txn.addToCollection(collectionId, driveId);
      await operationIndex.commit(txn);

      const txn2 = operationIndex.start();
      txn2.write([
        {
          ...newerOp,
          documentId: driveId,
          documentType: "powerhouse/document-drive",
          branch: "main",
          scope: "global",
          sourceRemote: "",
        },
      ]);
      const newOrdinals = await operationIndex.commit(txn2);
      const newestOrdinal = newOrdinals[0];

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      const remote = await syncManager.add(
        "remote1",
        collectionId,
        channelConfig,
        undefined,
        { sinceTimestampUtcMs: "2023-01-01T00:00:01.000Z" },
      );

      expect(sentEnvelopes).toHaveLength(1);
      expect(sentEnvelopes[0].operations).toHaveLength(1);
      expect(sentEnvelopes[0].operations![0].operation.id).toBe("op-new");
      expect(remote.channel.outbox.items).toHaveLength(0);

      const outboxCursor = await syncCursorStorage.get("remote1", "outbox");
      expect(outboxCursor.cursorOrdinal).toBe(newestOrdinal);
    });
  });
});

import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PollingChannel } from "../../../../src/sync/channels/polling-channel.js";
import { SyncOperation } from "../../../../src/sync/sync-operation.js";
import type { ISyncCursorStorage } from "../../../../src/storage/interfaces.js";
import type { KyselySyncRemoteStorage } from "../../../../src/storage/kysely/sync-remote-storage.js";
import type { Database } from "../../../../src/storage/kysely/types.js";
import type { OperationContext } from "../../../../src/storage/interfaces.js";
import type { RemoteRecord } from "../../../../src/sync/types.js";
import { SyncOperationStatus } from "../../../../src/sync/types.js";
import { createTestSyncStorage } from "../../../factories.js";

describe("PollingChannel Integration", () => {
  let db: Kysely<Database>;
  let cursorStorage: ISyncCursorStorage;
  let remoteStorage: KyselySyncRemoteStorage;

  const createMockOperationContext = (
    ordinal: number = 0,
  ): OperationContext => ({
    documentId: "doc-1",
    documentType: "test/document",
    scope: "public",
    branch: "main",
    ordinal,
  });

  const createMockSyncOperation = (
    id: string,
    remoteName: string,
    ordinal: number,
  ): SyncOperation => {
    return new SyncOperation(id, remoteName, "doc-1", ["public"], "main", [
      {
        operation: {
          index: 0,
          skip: 0,
          id: `op-${ordinal}`,
          timestampUtcMs: new Date().toISOString(),
          hash: `hash-${ordinal}`,
          action: {
            type: "TEST_OP",
            id: `action-${ordinal}`,
            scope: "public",
            timestampUtcMs: new Date().toISOString(),
            input: {},
          },
        },
        context: createMockOperationContext(ordinal),
      },
    ]);
  };

  const createTestRemote = async (name: string): Promise<void> => {
    const remote: RemoteRecord = {
      id: "channel-1",
      name,
      collectionId: "collection-1",
      channelConfig: {
        type: "polling",
        parameters: {},
      },
      filter: {
        documentId: [],
        scope: [],
        branch: "main",
      },
      options: { sinceTimestampUtcMs: "0" },
      status: {
        push: { state: "idle", failureCount: 0 },
        pull: { state: "idle", failureCount: 0 },
      },
    };
    await remoteStorage.upsert(remote);
  };

  beforeEach(async () => {
    const setup = await createTestSyncStorage();
    db = setup.db;
    cursorStorage = setup.syncCursorStorage;
    remoteStorage = setup.syncRemoteStorage;
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe("outbox and polling behavior", () => {
    it("should keep operations in outbox until cursor is advanced", async () => {
      await createTestRemote("remote-a");

      const channel = new PollingChannel(
        "channel-a",
        "remote-a",
        cursorStorage,
      );

      const job1 = createMockSyncOperation("job-1", "remote-a", 1);
      const job2 = createMockSyncOperation("job-2", "remote-a", 2);
      const job3 = createMockSyncOperation("job-3", "remote-a", 3);

      channel.outbox.add(job1);
      channel.outbox.add(job2);
      channel.outbox.add(job3);

      expect(channel.outbox.items).toHaveLength(3);

      await channel.updateCursor(1);
      expect(channel.outbox.items).toHaveLength(2);

      await channel.updateCursor(2);
      expect(channel.outbox.items).toHaveLength(1);

      await channel.updateCursor(3);
      expect(channel.outbox.items).toHaveLength(0);
    });

    it("should mark operations as applied when acknowledged", async () => {
      await createTestRemote("remote-a");

      const channel = new PollingChannel(
        "channel-a",
        "remote-a",
        cursorStorage,
      );

      const job = createMockSyncOperation("job-1", "remote-a", 5);
      channel.outbox.add(job);

      expect(job.status).toBe(SyncOperationStatus.Unknown);

      await channel.updateCursor(5);

      expect(job.status).toBe(SyncOperationStatus.Applied);
    });

    it("should handle multiple operations with same ordinal", async () => {
      await createTestRemote("remote-a");

      const channel = new PollingChannel(
        "channel-a",
        "remote-a",
        cursorStorage,
      );

      const job1 = createMockSyncOperation("job-1", "remote-a", 5);
      const job2 = createMockSyncOperation("job-2", "remote-a", 5);

      channel.outbox.add(job1);
      channel.outbox.add(job2);

      expect(channel.outbox.items).toHaveLength(2);

      await channel.updateCursor(5);

      expect(channel.outbox.items).toHaveLength(0);
      expect(job1.status).toBe(SyncOperationStatus.Applied);
      expect(job2.status).toBe(SyncOperationStatus.Applied);
    });
  });

  describe("cursor persistence", () => {
    it("should persist cursor to storage", async () => {
      await createTestRemote("remote-a");

      const channel = new PollingChannel(
        "channel-a",
        "remote-a",
        cursorStorage,
      );

      await channel.updateCursor(42);

      const cursor = await cursorStorage.get("remote-a");
      expect(cursor.remoteName).toBe("remote-a");
      expect(cursor.cursorOrdinal).toBe(42);
      expect(cursor.lastSyncedAtUtcMs).toBeGreaterThan(0);
    });

    it("should load cursor from storage on restart", async () => {
      await createTestRemote("remote-a");

      const channel1 = new PollingChannel(
        "channel-a",
        "remote-a",
        cursorStorage,
      );
      await channel1.updateCursor(100);
      channel1.shutdown();

      const cursor = await cursorStorage.get("remote-a");
      expect(cursor.cursorOrdinal).toBe(100);

      const channel2 = new PollingChannel(
        "channel-a",
        "remote-a",
        cursorStorage,
      );
      const loadedCursor = await cursorStorage.get("remote-a");
      expect(loadedCursor.cursorOrdinal).toBe(100);
      channel2.shutdown();
    });

    it("should update cursor multiple times", async () => {
      await createTestRemote("remote-a");

      const channel = new PollingChannel(
        "channel-a",
        "remote-a",
        cursorStorage,
      );

      await channel.updateCursor(1);
      await channel.updateCursor(2);
      await channel.updateCursor(3);

      const cursor = await cursorStorage.get("remote-a");
      expect(cursor.cursorOrdinal).toBe(3);
    });

    it("should track lastSyncedAtUtcMs", async () => {
      await createTestRemote("remote-a");

      const channel = new PollingChannel(
        "channel-a",
        "remote-a",
        cursorStorage,
      );

      const before = Date.now();
      await channel.updateCursor(10);
      const after = Date.now();

      const cursor = await cursorStorage.get("remote-a");
      expect(cursor.lastSyncedAtUtcMs).toBeGreaterThanOrEqual(before);
      expect(cursor.lastSyncedAtUtcMs).toBeLessThanOrEqual(after);
    });
  });

  describe("inbox processing", () => {
    it("should process multiple jobs from inbox", async () => {
      await createTestRemote("remote-a");

      const channel = new PollingChannel(
        "channel-a",
        "remote-a",
        cursorStorage,
      );

      const envelope = {
        type: "operations" as const,
        channelMeta: { id: "channel-b" },
        operations: [
          {
            operation: {
              index: 1,
              skip: 0,
              id: "op-1",
              timestampUtcMs: new Date().toISOString(),
              hash: "hash-1",
              action: {
                type: "TEST_OP",
                id: "action-1",
                scope: "public",
                timestampUtcMs: new Date().toISOString(),
                input: {},
              },
            },
            context: createMockOperationContext(),
          },
        ],
      };

      channel.receive(envelope);

      expect(channel.inbox.items).toHaveLength(1);

      const job = channel.inbox.items[0];
      job.executed();
      channel.inbox.remove(job);

      expect(channel.inbox.items).toHaveLength(0);
    });

    it("should handle execution failure", async () => {
      await createTestRemote("remote-a");

      const channel = new PollingChannel(
        "channel-a",
        "remote-a",
        cursorStorage,
      );

      const envelope = {
        type: "operations" as const,
        channelMeta: { id: "channel-b" },
        operations: [
          {
            operation: {
              index: 1,
              skip: 0,
              id: "op-1",
              timestampUtcMs: new Date().toISOString(),
              hash: "hash-1",
              action: {
                type: "TEST_OP",
                id: "action-1",
                scope: "public",
                timestampUtcMs: new Date().toISOString(),
                input: {},
              },
            },
            context: createMockOperationContext(),
          },
        ],
      };

      channel.receive(envelope);

      expect(channel.inbox.items).toHaveLength(1);

      const receivedJob = channel.inbox.items[0];
      const error = new Error("Execution failed");
      const channelError = new (
        await import("../../../../src/sync/errors.js")
      ).ChannelError("inbox" as any, error);
      receivedJob.failed(channelError);

      channel.inbox.remove(receivedJob);
      channel.deadLetter.add(receivedJob);

      expect(channel.inbox.items).toHaveLength(0);
      expect(channel.deadLetter.items).toHaveLength(1);
      expect(channel.deadLetter.items[0].id).toBe(receivedJob.id);
      expect(receivedJob.status).toBe(SyncOperationStatus.Error);
    });
  });
});

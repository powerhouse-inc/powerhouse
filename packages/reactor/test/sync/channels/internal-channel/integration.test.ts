import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InternalChannel } from "../../../../src/sync/channels/internal-channel.js";
import { SyncOperation } from "../../../../src/sync/sync-operation.js";
import type { ISyncCursorStorage } from "../../../../src/storage/interfaces.js";
import type { KyselySyncRemoteStorage } from "../../../../src/storage/kysely/sync-remote-storage.js";
import type { Database } from "../../../../src/storage/kysely/types.js";
import type { OperationContext } from "../../../../src/storage/interfaces.js";
import type { RemoteRecord } from "../../../../src/sync/types.js";
import { SyncOperationStatus } from "../../../../src/sync/types.js";
import { createTestSyncStorage } from "../../../factories.js";

describe("InternalChannel Integration", () => {
  let db: Kysely<Database>;
  let cursorStorage: ISyncCursorStorage;
  let remoteStorage: KyselySyncRemoteStorage;

  const createMockOperationContext = (): OperationContext => ({
    documentId: "doc-1",
    documentType: "test/document",
    scope: "public",
    branch: "main",
  });

  const createMockSyncOperation = (
    id: string,
    remoteName: string,
    ordinal: number,
  ): SyncOperation => {
    return new SyncOperation(id, remoteName, "doc-1", ["public"], "main", [
      {
        operation: {
          index: ordinal,
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
        context: createMockOperationContext(),
      },
    ]);
  };

  const createTestRemote = async (name: string): Promise<void> => {
    const remote: RemoteRecord = {
      name,
      collectionId: "collection-1",
      channelConfig: {
        type: "internal",
        channelId: `channel-${name}`,
        remoteName: name,
        parameters: {},
      },
      filter: {
        documentId: [],
        scope: [],
        branch: "main",
      },
      options: {},
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

  describe("bidirectional communication", () => {
    it("should send operations from A to B and B to A", async () => {
      await createTestRemote("remote-a");
      await createTestRemote("remote-b");

      let channelA: InternalChannel;
      let channelB: InternalChannel;

      channelA = new InternalChannel(
        "channel-a",
        "remote-a",
        cursorStorage,
        (envelope) => channelB.receive(envelope),
      );
      channelB = new InternalChannel(
        "channel-b",
        "remote-b",
        cursorStorage,
        (envelope) => channelA.receive(envelope),
      );

      const jobFromA = createMockSyncOperation("job-a-1", "remote-a", 1);
      const jobFromB = createMockSyncOperation("job-b-1", "remote-b", 1);

      channelA.outbox.add(jobFromA);
      channelB.outbox.add(jobFromB);

      expect(channelB.inbox.items).toHaveLength(1);
      expect(channelB.inbox.items[0].remoteName).toBe("remote-b");
      expect(channelB.inbox.items[0].status).toBe(
        SyncOperationStatus.ExecutionPending,
      );

      expect(channelA.inbox.items).toHaveLength(1);
      expect(channelA.inbox.items[0].remoteName).toBe("remote-a");
      expect(channelA.inbox.items[0].status).toBe(
        SyncOperationStatus.ExecutionPending,
      );
    });

    it("should update cursors on both sides", async () => {
      await createTestRemote("remote-a");
      await createTestRemote("remote-b");

      let channelA: InternalChannel;
      let channelB: InternalChannel;

      channelA = new InternalChannel(
        "channel-a",
        "remote-a",
        cursorStorage,
        (envelope) => channelB.receive(envelope),
      );
      channelB = new InternalChannel(
        "channel-b",
        "remote-b",
        cursorStorage,
        (envelope) => channelA.receive(envelope),
      );

      await channelA.updateCursor(10);
      await channelB.updateCursor(20);

      const cursorA = await cursorStorage.get("remote-a");
      const cursorB = await cursorStorage.get("remote-b");

      expect(cursorA.remoteName).toBe("remote-a");
      expect(cursorA.cursorOrdinal).toBe(10);
      expect(cursorB.remoteName).toBe("remote-b");
      expect(cursorB.cursorOrdinal).toBe(20);
    });

    it("should handle operations in correct order", async () => {
      await createTestRemote("remote-a");
      await createTestRemote("remote-b");

      let channelA: InternalChannel;
      let channelB: InternalChannel;

      channelA = new InternalChannel(
        "channel-a",
        "remote-a",
        cursorStorage,
        (envelope) => channelB.receive(envelope),
      );
      channelB = new InternalChannel(
        "channel-b",
        "remote-b",
        cursorStorage,
        (envelope) => channelA.receive(envelope),
      );

      const job1 = createMockSyncOperation("job-1", "remote-a", 1);
      const job2 = createMockSyncOperation("job-2", "remote-a", 2);
      const job3 = createMockSyncOperation("job-3", "remote-a", 3);

      channelA.outbox.add(job1);
      channelA.outbox.add(job2);
      channelA.outbox.add(job3);

      expect(channelB.inbox.items).toHaveLength(3);
      expect(channelB.inbox.items[0].id).toContain("syncop-");
      expect(channelB.inbox.items[1].id).toContain("syncop-");
      expect(channelB.inbox.items[2].id).toContain("syncop-");
    });
  });

  describe("multi-job synchronization", () => {
    it("should process multiple jobs from A to B", async () => {
      await createTestRemote("remote-a");
      await createTestRemote("remote-b");

      let channelA: InternalChannel;
      let channelB: InternalChannel;

      channelA = new InternalChannel(
        "channel-a",
        "remote-a",
        cursorStorage,
        (envelope) => channelB.receive(envelope),
      );
      channelB = new InternalChannel(
        "channel-b",
        "remote-b",
        cursorStorage,
        (envelope) => channelA.receive(envelope),
      );

      const jobs = Array.from({ length: 5 }, (_, i) =>
        createMockSyncOperation(`job-${i}`, "remote-a", i),
      );

      jobs.forEach((job) => channelA.outbox.add(job));

      expect(channelB.inbox.items).toHaveLength(5);

      channelB.inbox.items.forEach((job) => {
        job.executed();
        channelB.inbox.remove(job);
      });

      expect(channelB.inbox.items).toHaveLength(0);
    });

    it("should advance cursor correctly after processing", async () => {
      await createTestRemote("remote-a");
      await createTestRemote("remote-b");

      let channelA: InternalChannel;
      let channelB: InternalChannel;

      channelA = new InternalChannel(
        "channel-a",
        "remote-a",
        cursorStorage,
        (envelope) => channelB.receive(envelope),
      );
      channelB = new InternalChannel(
        "channel-b",
        "remote-b",
        cursorStorage,
        (envelope) => channelA.receive(envelope),
      );

      const jobs = Array.from({ length: 3 }, (_, i) =>
        createMockSyncOperation(`job-${i}`, "remote-a", i + 1),
      );

      jobs.forEach((job) => channelA.outbox.add(job));

      await channelB.updateCursor(1);
      await channelB.updateCursor(2);
      await channelB.updateCursor(3);

      const cursor = await cursorStorage.get("remote-b");
      expect(cursor.cursorOrdinal).toBe(3);
    });

    it("should support ACK protocol clearing outbox", async () => {
      await createTestRemote("remote-a");
      await createTestRemote("remote-b");

      let channelA: InternalChannel;
      let channelB: InternalChannel;

      channelA = new InternalChannel(
        "channel-a",
        "remote-a",
        cursorStorage,
        (envelope) => channelB.receive(envelope),
      );
      channelB = new InternalChannel(
        "channel-b",
        "remote-b",
        cursorStorage,
        (envelope) => channelA.receive(envelope),
      );

      const job = createMockSyncOperation("job-1", "remote-a", 1);

      channelA.outbox.add(job);

      expect(channelA.outbox.items).toHaveLength(1);
      expect(channelB.inbox.items).toHaveLength(1);

      const receivedJob = channelB.inbox.items[0];
      receivedJob.executed();
      channelB.inbox.remove(receivedJob);

      channelA.outbox.remove(job);

      expect(channelA.outbox.items).toHaveLength(0);
      expect(channelB.inbox.items).toHaveLength(0);
    });
  });

  describe("error recovery", () => {
    it("should handle execution failure", async () => {
      await createTestRemote("remote-a");
      await createTestRemote("remote-b");

      let channelA: InternalChannel;
      let channelB: InternalChannel;

      channelA = new InternalChannel(
        "channel-a",
        "remote-a",
        cursorStorage,
        (envelope) => channelB.receive(envelope),
      );
      channelB = new InternalChannel(
        "channel-b",
        "remote-b",
        cursorStorage,
        (envelope) => channelA.receive(envelope),
      );

      const job = createMockSyncOperation("job-1", "remote-a", 1);

      channelA.outbox.add(job);

      expect(channelB.inbox.items).toHaveLength(1);

      const receivedJob = channelB.inbox.items[0];
      const error = new Error("Execution failed");
      const channelError = new (
        await import("../../../../src/sync/errors.js")
      ).ChannelError("inbox" as any, error);
      receivedJob.failed(channelError);

      channelB.inbox.remove(receivedJob);
      channelB.deadLetter.add(receivedJob);

      expect(channelB.inbox.items).toHaveLength(0);
      expect(channelB.deadLetter.items).toHaveLength(1);
      expect(channelB.deadLetter.items[0].id).toBe(receivedJob.id);
      expect(receivedJob.status).toBe(SyncOperationStatus.Error);
    });

    it("should not advance cursor on failure", async () => {
      await createTestRemote("remote-a");
      await createTestRemote("remote-b");

      let channelA: InternalChannel;
      let channelB: InternalChannel;

      channelA = new InternalChannel(
        "channel-a",
        "remote-a",
        cursorStorage,
        (envelope) => channelB.receive(envelope),
      );
      channelB = new InternalChannel(
        "channel-b",
        "remote-b",
        cursorStorage,
        (envelope) => channelA.receive(envelope),
      );

      await channelB.updateCursor(5);

      const job = createMockSyncOperation("job-1", "remote-a", 6);
      channelA.outbox.add(job);

      const receivedJob = channelB.inbox.items[0];
      const error = new Error("Execution failed");
      const channelError = new (
        await import("../../../../src/sync/errors.js")
      ).ChannelError("inbox" as any, error);
      receivedJob.failed(channelError);

      const cursor = await cursorStorage.get("remote-b");
      expect(cursor.cursorOrdinal).toBe(5);
    });
  });

  describe("cursor persistence", () => {
    it("should persist cursor to storage", async () => {
      await createTestRemote("remote-a");

      const channel = new InternalChannel(
        "channel-a",
        "remote-a",
        cursorStorage,
        () => {},
      );

      await channel.updateCursor(42);

      const cursor = await cursorStorage.get("remote-a");
      expect(cursor.remoteName).toBe("remote-a");
      expect(cursor.cursorOrdinal).toBe(42);
      expect(cursor.lastSyncedAtUtcMs).toBeGreaterThan(0);
    });

    it("should load cursor from storage on restart", async () => {
      await createTestRemote("remote-a");

      const channel1 = new InternalChannel(
        "channel-a",
        "remote-a",
        cursorStorage,
        () => {},
      );
      await channel1.updateCursor(100);
      channel1.shutdown();

      const cursor = await cursorStorage.get("remote-a");
      expect(cursor.cursorOrdinal).toBe(100);

      const channel2 = new InternalChannel(
        "channel-a",
        "remote-a",
        cursorStorage,
        () => {},
      );
      const loadedCursor = await cursorStorage.get("remote-a");
      expect(loadedCursor.cursorOrdinal).toBe(100);
      channel2.shutdown();
    });

    it("should update cursor multiple times", async () => {
      await createTestRemote("remote-a");

      const channel = new InternalChannel(
        "channel-a",
        "remote-a",
        cursorStorage,
        () => {},
      );

      await channel.updateCursor(1);
      await channel.updateCursor(2);
      await channel.updateCursor(3);

      const cursor = await cursorStorage.get("remote-a");
      expect(cursor.cursorOrdinal).toBe(3);
    });

    it("should track lastSyncedAtUtcMs", async () => {
      await createTestRemote("remote-a");

      const channel = new InternalChannel(
        "channel-a",
        "remote-a",
        cursorStorage,
        () => {},
      );

      const before = Date.now();
      await channel.updateCursor(10);
      const after = Date.now();

      const cursor = await cursorStorage.get("remote-a");
      expect(cursor.lastSyncedAtUtcMs).toBeGreaterThanOrEqual(before);
      expect(cursor.lastSyncedAtUtcMs).toBeLessThanOrEqual(after);
    });
  });
});

import type { OperationContext } from "shared/document-model";
import { describe, expect, it, vi } from "vitest";
import type { ISyncCursorStorage } from "../../../../src/storage/interfaces.js";
import { GqlResponseChannel } from "../../../../src/sync/channels/gql-res-channel.js";
import { SyncOperation } from "../../../../src/sync/sync-operation.js";
import { createMockLogger } from "../../../factories.js";

const createMockCursorStorage = (): ISyncCursorStorage => ({
  list: vi.fn().mockResolvedValue([]),
  get: vi.fn(),
  upsert: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn(),
});

const createMockOperationContext = (ordinal: number = 1): OperationContext => ({
  documentId: "doc-1",
  documentType: "test/document",
  scope: "public",
  branch: "main",
  ordinal,
});

const createMockSyncOperation = (
  id: string,
  remoteName: string,
  ordinal: number = 0,
): SyncOperation => {
  return new SyncOperation(
    id,
    "",
    [],
    remoteName,
    "doc-1",
    ["public"],
    "main",
    [
      {
        operation: {
          index: 0,
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
        context: createMockOperationContext(ordinal),
      },
    ],
  );
};

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

describe("GqlResponseChannel", () => {
  describe("constructor", () => {
    it("should initialize with empty mailboxes", () => {
      const channel = new GqlResponseChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        createMockCursorStorage(),
      );

      expect(channel.inbox.items).toEqual([]);
      expect(channel.outbox.items).toEqual([]);
      expect(channel.deadLetter.items).toEqual([]);
    });
  });

  describe("init", () => {
    it("should load cursors from storage", async () => {
      const cursorStorage = createMockCursorStorage();
      vi.mocked(cursorStorage.list).mockResolvedValue([
        {
          remoteName: "remote-1",
          cursorType: "inbox",
          cursorOrdinal: 10,
          lastSyncedAtUtcMs: Date.now(),
        },
        {
          remoteName: "remote-1",
          cursorType: "outbox",
          cursorOrdinal: 20,
          lastSyncedAtUtcMs: Date.now(),
        },
      ]);

      const channel = new GqlResponseChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
      );

      await channel.init();

      expect(cursorStorage.list).toHaveBeenCalledWith("remote-1");
      expect(channel.inbox.ackOrdinal).toBe(10);
      expect(channel.outbox.ackOrdinal).toBe(20);
    });

    it("should default cursors to 0 when no cursors stored", async () => {
      const cursorStorage = createMockCursorStorage();

      const channel = new GqlResponseChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
      );

      await channel.init();

      expect(channel.inbox.ackOrdinal).toBe(0);
      expect(channel.outbox.ackOrdinal).toBe(0);
    });

    it("should handle partial cursor data", async () => {
      const cursorStorage = createMockCursorStorage();
      vi.mocked(cursorStorage.list).mockResolvedValue([
        {
          remoteName: "remote-1",
          cursorType: "outbox",
          cursorOrdinal: 15,
          lastSyncedAtUtcMs: Date.now(),
        },
      ]);

      const channel = new GqlResponseChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
      );

      await channel.init();

      expect(channel.inbox.ackOrdinal).toBe(0);
      expect(channel.outbox.ackOrdinal).toBe(15);
    });
  });

  describe("outbox", () => {
    describe("add", () => {
      it("should store operations added to the outbox", () => {
        const channel = new GqlResponseChannel(
          createMockLogger(),
          "channel-1",
          "remote-1",
          createMockCursorStorage(),
        );

        const syncOp = createMockSyncOperation("syncop-1", "remote-1", 5);
        channel.outbox.add(syncOp);

        expect(channel.outbox.items).toHaveLength(1);
        expect(channel.outbox.items[0]).toBe(syncOp);
      });

      it("should track latestOrdinal from added operations", () => {
        const channel = new GqlResponseChannel(
          createMockLogger(),
          "channel-1",
          "remote-1",
          createMockCursorStorage(),
        );

        channel.outbox.add(createMockSyncOperation("syncop-1", "remote-1", 5));
        expect(channel.outbox.latestOrdinal).toBe(5);

        channel.outbox.add(createMockSyncOperation("syncop-2", "remote-1", 10));
        expect(channel.outbox.latestOrdinal).toBe(10);
      });
    });

    describe("remove", () => {
      it("should persist outbox cursor when applied operations are removed", () => {
        const cursorStorage = createMockCursorStorage();
        const channel = new GqlResponseChannel(
          createMockLogger(),
          "channel-1",
          "remote-1",
          cursorStorage,
        );

        const syncOp = createMockSyncOperation("syncop-1", "remote-1", 5);
        channel.outbox.add(syncOp);
        syncOp.executed();
        channel.outbox.remove(syncOp);

        expect(cursorStorage.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            remoteName: "remote-1",
            cursorType: "outbox",
            cursorOrdinal: 5,
          }),
        );
      });

      it("should not persist cursor when removed operations are not applied", () => {
        const cursorStorage = createMockCursorStorage();
        const channel = new GqlResponseChannel(
          createMockLogger(),
          "channel-1",
          "remote-1",
          cursorStorage,
        );

        const syncOp = createMockSyncOperation("syncop-1", "remote-1", 5);
        channel.outbox.add(syncOp);

        channel.outbox.remove(syncOp);

        expect(cursorStorage.upsert).not.toHaveBeenCalled();
      });

      it("should persist cursor with highest ordinal from batch", () => {
        const cursorStorage = createMockCursorStorage();
        const channel = new GqlResponseChannel(
          createMockLogger(),
          "channel-1",
          "remote-1",
          cursorStorage,
        );

        const syncOp1 = createMockSyncOperation("syncop-1", "remote-1", 3);
        const syncOp2 = createMockSyncOperation("syncop-2", "remote-1", 7);
        channel.outbox.add(syncOp1, syncOp2);
        syncOp1.executed();
        syncOp2.executed();
        channel.outbox.remove(syncOp1, syncOp2);

        expect(cursorStorage.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            cursorOrdinal: 7,
          }),
        );
      });

      it("should not persist cursor when ordinal matches last persisted", () => {
        const cursorStorage = createMockCursorStorage();
        const channel = new GqlResponseChannel(
          createMockLogger(),
          "channel-1",
          "remote-1",
          cursorStorage,
        );

        const syncOp1 = createMockSyncOperation("syncop-1", "remote-1", 5);
        channel.outbox.add(syncOp1);
        syncOp1.executed();
        channel.outbox.remove(syncOp1);

        expect(cursorStorage.upsert).toHaveBeenCalledTimes(1);

        const syncOp2 = createMockSyncOperation("syncop-2", "remote-1", 5);
        channel.outbox.add(syncOp2);
        syncOp2.executed();
        channel.outbox.remove(syncOp2);

        expect(cursorStorage.upsert).toHaveBeenCalledTimes(1);
      });

      it("should not persist cursor when ordinal is not greater than stored ack", async () => {
        const cursorStorage = createMockCursorStorage();
        vi.mocked(cursorStorage.list).mockResolvedValue([
          {
            remoteName: "remote-1",
            cursorType: "outbox",
            cursorOrdinal: 10,
            lastSyncedAtUtcMs: Date.now(),
          },
        ]);

        const channel = new GqlResponseChannel(
          createMockLogger(),
          "channel-1",
          "remote-1",
          cursorStorage,
        );
        await channel.init();

        const syncOp = createMockSyncOperation("syncop-1", "remote-1", 5);
        channel.outbox.add(syncOp);
        syncOp.executed();
        channel.outbox.remove(syncOp);

        expect(cursorStorage.upsert).not.toHaveBeenCalled();
      });
    });
  });

  describe("inbox", () => {
    describe("add", () => {
      it("should store operations added to the inbox", () => {
        const channel = new GqlResponseChannel(
          createMockLogger(),
          "channel-1",
          "remote-1",
          createMockCursorStorage(),
        );

        const syncOp = createMockSyncOperation("syncop-1", "remote-1", 5);
        channel.inbox.add(syncOp);

        expect(channel.inbox.items).toHaveLength(1);
        expect(channel.inbox.items[0]).toBe(syncOp);
      });

      it("should track latestOrdinal from added operations", () => {
        const channel = new GqlResponseChannel(
          createMockLogger(),
          "channel-1",
          "remote-1",
          createMockCursorStorage(),
        );

        channel.inbox.add(createMockSyncOperation("syncop-1", "remote-1", 3));
        expect(channel.inbox.latestOrdinal).toBe(3);

        channel.inbox.add(createMockSyncOperation("syncop-2", "remote-1", 8));
        expect(channel.inbox.latestOrdinal).toBe(8);
      });
    });

    describe("remove", () => {
      it("should persist inbox cursor when applied operations are removed", () => {
        const cursorStorage = createMockCursorStorage();
        const channel = new GqlResponseChannel(
          createMockLogger(),
          "channel-1",
          "remote-1",
          cursorStorage,
        );

        const syncOp = createMockSyncOperation("syncop-1", "remote-1", 5);
        channel.inbox.add(syncOp);
        syncOp.executed();
        channel.inbox.remove(syncOp);

        expect(cursorStorage.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            remoteName: "remote-1",
            cursorType: "inbox",
            cursorOrdinal: 5,
          }),
        );
      });

      it("should not persist cursor when removed operations are not applied", () => {
        const cursorStorage = createMockCursorStorage();
        const channel = new GqlResponseChannel(
          createMockLogger(),
          "channel-1",
          "remote-1",
          cursorStorage,
        );

        const syncOp = createMockSyncOperation("syncop-1", "remote-1", 5);
        channel.inbox.add(syncOp);

        channel.inbox.remove(syncOp);

        expect(cursorStorage.upsert).not.toHaveBeenCalled();
      });

      it("should persist cursor with highest ordinal from batch", () => {
        const cursorStorage = createMockCursorStorage();
        const channel = new GqlResponseChannel(
          createMockLogger(),
          "channel-1",
          "remote-1",
          cursorStorage,
        );

        const syncOp1 = createMockSyncOperation("syncop-1", "remote-1", 2);
        const syncOp2 = createMockSyncOperation("syncop-2", "remote-1", 9);
        channel.inbox.add(syncOp1, syncOp2);
        syncOp1.executed();
        syncOp2.executed();
        channel.inbox.remove(syncOp1, syncOp2);

        expect(cursorStorage.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            cursorOrdinal: 9,
          }),
        );
      });
    });
  });

  describe("shutdown", () => {
    it("should resolve without error", async () => {
      const channel = new GqlResponseChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        createMockCursorStorage(),
      );

      await expect(channel.shutdown()).resolves.toBeUndefined();
    });

    it("should preserve mailbox contents after shutdown", async () => {
      const channel = new GqlResponseChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        createMockCursorStorage(),
      );

      const syncOp = createMockSyncOperation("syncop-1", "remote-1", 5);
      channel.outbox.add(syncOp);

      await channel.shutdown();

      expect(channel.outbox.items).toHaveLength(1);
    });
  });

  describe("cursor persistence error handling", () => {
    it("should log error when outbox cursor persistence fails", async () => {
      const cursorStorage = createMockCursorStorage();
      vi.mocked(cursorStorage.upsert).mockRejectedValue(
        new Error("DB write failed"),
      );

      const logger = createMockLogger();
      logger.error = vi.fn();

      const channel = new GqlResponseChannel(
        logger,
        "channel-1",
        "remote-1",
        cursorStorage,
      );

      const syncOp = createMockSyncOperation("syncop-1", "remote-1", 5);
      channel.outbox.add(syncOp);
      syncOp.executed();
      channel.outbox.remove(syncOp);

      await flushMicrotasks();

      expect(logger.error).toHaveBeenCalled();
    });

    it("should log error when inbox cursor persistence fails", async () => {
      const cursorStorage = createMockCursorStorage();
      vi.mocked(cursorStorage.upsert).mockRejectedValue(
        new Error("DB write failed"),
      );

      const logger = createMockLogger();
      logger.error = vi.fn();

      const channel = new GqlResponseChannel(
        logger,
        "channel-1",
        "remote-1",
        cursorStorage,
      );

      const syncOp = createMockSyncOperation("syncop-1", "remote-1", 5);
      channel.inbox.add(syncOp);
      syncOp.executed();
      channel.inbox.remove(syncOp);

      await flushMicrotasks();

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("dead letter mailbox", () => {
    it("should accept operations added to dead letter", () => {
      const channel = new GqlResponseChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        createMockCursorStorage(),
      );

      const syncOp = createMockSyncOperation("syncop-1", "remote-1", 5);
      channel.deadLetter.add(syncOp);

      expect(channel.deadLetter.items).toHaveLength(1);
      expect(channel.deadLetter.items[0]).toBe(syncOp);
    });
  });

  describe("ack ordinal tracking", () => {
    it("should update outbox ackOrdinal when a sync operation transitions to Applied", () => {
      const channel = new GqlResponseChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        createMockCursorStorage(),
      );

      const syncOp = createMockSyncOperation("syncop-1", "remote-1", 5);
      channel.outbox.add(syncOp);

      expect(channel.outbox.ackOrdinal).toBe(0);

      syncOp.executed();

      expect(channel.outbox.ackOrdinal).toBe(5);
    });

    it("should update inbox ackOrdinal when a sync operation transitions to Applied", () => {
      const channel = new GqlResponseChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        createMockCursorStorage(),
      );

      const syncOp = createMockSyncOperation("syncop-1", "remote-1", 5);
      channel.inbox.add(syncOp);

      expect(channel.inbox.ackOrdinal).toBe(0);

      syncOp.executed();

      expect(channel.inbox.ackOrdinal).toBe(5);
    });

    it("should not update ackOrdinal for non-Applied transitions", () => {
      const channel = new GqlResponseChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        createMockCursorStorage(),
      );

      const syncOp = createMockSyncOperation("syncop-1", "remote-1", 5);
      channel.outbox.add(syncOp);

      syncOp.started();
      expect(channel.outbox.ackOrdinal).toBe(0);

      syncOp.transported();
      expect(channel.outbox.ackOrdinal).toBe(0);
    });
  });
});

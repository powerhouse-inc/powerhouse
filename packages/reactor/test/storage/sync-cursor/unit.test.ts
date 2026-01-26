import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KyselySyncCursorStorage } from "../../../src/storage/kysely/sync-cursor-storage.js";
import type { KyselySyncRemoteStorage } from "../../../src/storage/kysely/sync-remote-storage.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import type { RemoteCursor, RemoteRecord } from "../../../src/sync/types.js";
import { createTestSyncStorage } from "../../factories.js";

describe("KyselySyncCursorStorage", () => {
  let db: Kysely<Database>;
  let storage: KyselySyncCursorStorage;
  let remoteStorage: KyselySyncRemoteStorage;

  const createTestRemote = async (name: string): Promise<void> => {
    const remote: RemoteRecord = {
      id: `channel-${name}`,
      name,
      collectionId: "collection-1",
      channelConfig: {
        type: "internal",
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
    storage = setup.syncCursorStorage;
    remoteStorage = setup.syncRemoteStorage;
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe("list", () => {
    it("should return empty array when no cursors exist", async () => {
      const cursors = await storage.list("non-existent-remote");
      expect(cursors).toEqual([]);
    });

    it("should return cursor for specific remote", async () => {
      await createTestRemote("remote-1");
      await createTestRemote("remote-2");

      const cursor1: RemoteCursor = {
        remoteName: "remote-1",
        cursorOrdinal: 42,
        lastSyncedAtUtcMs: 1234567890,
      };

      const cursor2: RemoteCursor = {
        remoteName: "remote-2",
        cursorOrdinal: 100,
        lastSyncedAtUtcMs: 9876543210,
      };

      await storage.upsert(cursor1);
      await storage.upsert(cursor2);

      const cursors = await storage.list("remote-1");
      expect(cursors).toHaveLength(1);
      expect(cursors[0].remoteName).toBe("remote-1");
      expect(cursors[0].cursorOrdinal).toBe(42);
    });

    it("should handle abort signal", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        storage.list("test-remote", controller.signal),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("get", () => {
    it("should return default cursor when cursor does not exist", async () => {
      const cursor = await storage.get("non-existent-remote");
      expect(cursor).toEqual({
        remoteName: "non-existent-remote",
        cursorOrdinal: 0,
      });
    });

    it("should retrieve existing cursor", async () => {
      await createTestRemote("test-remote");

      const cursor: RemoteCursor = {
        remoteName: "test-remote",
        cursorOrdinal: 123,
        lastSyncedAtUtcMs: 1234567890,
      };

      await storage.upsert(cursor);

      const retrieved = await storage.get("test-remote");
      expect(retrieved).toEqual({
        remoteName: "test-remote",
        cursorOrdinal: 123,
        lastSyncedAtUtcMs: 1234567890,
      });
    });

    it("should handle cursor without lastSyncedAtUtcMs", async () => {
      await createTestRemote("test-remote");

      const cursor: RemoteCursor = {
        remoteName: "test-remote",
        cursorOrdinal: 50,
      };

      await storage.upsert(cursor);

      const retrieved = await storage.get("test-remote");
      expect(retrieved).toEqual({
        remoteName: "test-remote",
        cursorOrdinal: 50,
      });
      expect(retrieved.lastSyncedAtUtcMs).toBeUndefined();
    });

    it("should handle abort signal", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        storage.get("test-remote", controller.signal),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("upsert", () => {
    it("should insert new cursor", async () => {
      await createTestRemote("new-remote");

      const cursor: RemoteCursor = {
        remoteName: "new-remote",
        cursorOrdinal: 10,
        lastSyncedAtUtcMs: Date.now(),
      };

      await storage.upsert(cursor);

      const retrieved = await storage.get("new-remote");
      expect(retrieved.remoteName).toBe("new-remote");
      expect(retrieved.cursorOrdinal).toBe(10);
    });

    it("should update existing cursor", async () => {
      await createTestRemote("update-remote");

      const cursor: RemoteCursor = {
        remoteName: "update-remote",
        cursorOrdinal: 100,
        lastSyncedAtUtcMs: 1000,
      };

      await storage.upsert(cursor);

      const updated: RemoteCursor = {
        remoteName: "update-remote",
        cursorOrdinal: 200,
        lastSyncedAtUtcMs: 2000,
      };

      await storage.upsert(updated);

      const retrieved = await storage.get("update-remote");
      expect(retrieved.cursorOrdinal).toBe(200);
      expect(retrieved.lastSyncedAtUtcMs).toBe(2000);
    });

    it("should handle bigint ordinal conversions", async () => {
      await createTestRemote("bigint-remote");

      const largeOrdinal = 9007199254740991;
      const cursor: RemoteCursor = {
        remoteName: "bigint-remote",
        cursorOrdinal: largeOrdinal,
        lastSyncedAtUtcMs: Date.now(),
      };

      await storage.upsert(cursor);

      const retrieved = await storage.get("bigint-remote");
      expect(retrieved.cursorOrdinal).toBe(largeOrdinal);
    });

    it("should handle cursor with undefined lastSyncedAtUtcMs", async () => {
      await createTestRemote("no-timestamp-remote");

      const cursor: RemoteCursor = {
        remoteName: "no-timestamp-remote",
        cursorOrdinal: 42,
      };

      await storage.upsert(cursor);

      const retrieved = await storage.get("no-timestamp-remote");
      expect(retrieved.cursorOrdinal).toBe(42);
      expect(retrieved.lastSyncedAtUtcMs).toBeUndefined();
    });

    it("should handle abort signal", async () => {
      const controller = new AbortController();
      controller.abort();

      const cursor: RemoteCursor = {
        remoteName: "test-remote",
        cursorOrdinal: 0,
      };

      await expect(storage.upsert(cursor, controller.signal)).rejects.toThrow(
        "Operation aborted",
      );
    });
  });

  describe("remove", () => {
    it("should remove existing cursor", async () => {
      await createTestRemote("remove-remote");

      const cursor: RemoteCursor = {
        remoteName: "remove-remote",
        cursorOrdinal: 100,
        lastSyncedAtUtcMs: Date.now(),
      };

      await storage.upsert(cursor);
      const beforeRemove = await storage.get("remove-remote");
      expect(beforeRemove.cursorOrdinal).toBe(100);

      await storage.remove("remove-remote");

      const afterRemove = await storage.get("remove-remote");
      expect(afterRemove).toEqual({
        remoteName: "remove-remote",
        cursorOrdinal: 0,
      });
    });

    it("should not throw error when removing non-existent cursor", async () => {
      await expect(storage.remove("non-existent")).resolves.not.toThrow();
    });

    it("should handle abort signal", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        storage.remove("test-remote", controller.signal),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("cascade delete", () => {
    it("should cascade delete cursor when remote is removed", async () => {
      const remote: RemoteRecord = {
        id: "channel-cascade-remote",
        name: "cascade-remote",
        collectionId: "collection-1",
        channelConfig: {
          type: "internal",
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

      const cursor: RemoteCursor = {
        remoteName: "cascade-remote",
        cursorOrdinal: 42,
        lastSyncedAtUtcMs: Date.now(),
      };

      await storage.upsert(cursor);

      const beforeDelete = await storage.get("cascade-remote");
      expect(beforeDelete.cursorOrdinal).toBe(42);

      await remoteStorage.remove("cascade-remote");

      const afterDelete = await storage.get("cascade-remote");
      expect(afterDelete).toEqual({
        remoteName: "cascade-remote",
        cursorOrdinal: 0,
      });
    });
  });

  describe("transaction behavior", () => {
    it("should handle concurrent upserts correctly", async () => {
      await createTestRemote("concurrent-remote");

      const cursor1: RemoteCursor = {
        remoteName: "concurrent-remote",
        cursorOrdinal: 100,
      };

      const cursor2: RemoteCursor = {
        remoteName: "concurrent-remote",
        cursorOrdinal: 200,
      };

      await Promise.all([storage.upsert(cursor1), storage.upsert(cursor2)]);

      const retrieved = await storage.get("concurrent-remote");
      expect([100, 200]).toContain(retrieved.cursorOrdinal);
    });

    it("should handle rapid sequential updates", async () => {
      const remoteName = "rapid-remote";
      await createTestRemote(remoteName);

      for (let i = 0; i < 10; i++) {
        await storage.upsert({
          remoteName,
          cursorOrdinal: i,
          lastSyncedAtUtcMs: Date.now(),
        });
      }

      const final = await storage.get(remoteName);
      expect(final.cursorOrdinal).toBe(9);
    });
  });

  describe("ordinal progression", () => {
    it("should support monotonically increasing ordinals", async () => {
      const remoteName = "progression-remote";
      await createTestRemote(remoteName);

      const ordinals = [0, 10, 50, 100, 500, 1000];

      for (const ordinal of ordinals) {
        await storage.upsert({
          remoteName,
          cursorOrdinal: ordinal,
          lastSyncedAtUtcMs: Date.now(),
        });

        const cursor = await storage.get(remoteName);
        expect(cursor.cursorOrdinal).toBe(ordinal);
      }
    });

    it("should support large ordinal values", async () => {
      const remoteName = "large-ordinal-remote";
      await createTestRemote(remoteName);

      const largeOrdinal = Number.MAX_SAFE_INTEGER;

      await storage.upsert({
        remoteName,
        cursorOrdinal: largeOrdinal,
        lastSyncedAtUtcMs: Date.now(),
      });

      const cursor = await storage.get(remoteName);
      expect(cursor.cursorOrdinal).toBe(largeOrdinal);
    });
  });
});

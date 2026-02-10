import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KyselySyncCursorStorage } from "../../../src/storage/kysely/sync-cursor-storage.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import type { RemoteCursor } from "../../../src/sync/types.js";
import { createTestSyncStorage } from "../../factories.js";

describe("KyselySyncCursorStorage", () => {
  let db: Kysely<Database>;
  let storage: KyselySyncCursorStorage;

  beforeEach(async () => {
    const setup = await createTestSyncStorage();
    db = setup.db;
    storage = setup.syncCursorStorage;
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe("list", () => {
    it("should return empty array when no cursors exist", async () => {
      const cursors = await storage.list("non-existent-remote");
      expect(cursors).toEqual([]);
    });

    it("should return cursors for specific remote", async () => {
      const cursor1: RemoteCursor = {
        remoteName: "remote-1",
        cursorType: "inbox",
        cursorOrdinal: 42,
        lastSyncedAtUtcMs: 1234567890,
      };

      const cursor2: RemoteCursor = {
        remoteName: "remote-2",
        cursorType: "inbox",
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

    it("should return multiple cursor types for same remote", async () => {
      const inboxCursor: RemoteCursor = {
        remoteName: "remote-1",
        cursorType: "inbox",
        cursorOrdinal: 10,
      };

      const outboxCursor: RemoteCursor = {
        remoteName: "remote-1",
        cursorType: "outbox",
        cursorOrdinal: 20,
      };

      await storage.upsert(inboxCursor);
      await storage.upsert(outboxCursor);

      const cursors = await storage.list("remote-1");
      expect(cursors).toHaveLength(2);
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
      const cursor = await storage.get("non-existent-remote", "inbox");
      expect(cursor).toEqual({
        remoteName: "non-existent-remote",
        cursorType: "inbox",
        cursorOrdinal: 0,
      });
    });

    it("should retrieve existing cursor", async () => {
      const cursor: RemoteCursor = {
        remoteName: "test-remote",
        cursorType: "inbox",
        cursorOrdinal: 123,
        lastSyncedAtUtcMs: 1234567890,
      };

      await storage.upsert(cursor);

      const retrieved = await storage.get("test-remote", "inbox");
      expect(retrieved).toEqual({
        remoteName: "test-remote",
        cursorType: "inbox",
        cursorOrdinal: 123,
        lastSyncedAtUtcMs: 1234567890,
      });
    });

    it("should distinguish between cursor types", async () => {
      const inboxCursor: RemoteCursor = {
        remoteName: "test-remote",
        cursorType: "inbox",
        cursorOrdinal: 10,
      };

      const outboxCursor: RemoteCursor = {
        remoteName: "test-remote",
        cursorType: "outbox",
        cursorOrdinal: 20,
      };

      await storage.upsert(inboxCursor);
      await storage.upsert(outboxCursor);

      const inbox = await storage.get("test-remote", "inbox");
      expect(inbox.cursorOrdinal).toBe(10);

      const outbox = await storage.get("test-remote", "outbox");
      expect(outbox.cursorOrdinal).toBe(20);
    });

    it("should handle cursor without lastSyncedAtUtcMs", async () => {
      const cursor: RemoteCursor = {
        remoteName: "test-remote",
        cursorType: "inbox",
        cursorOrdinal: 50,
      };

      await storage.upsert(cursor);

      const retrieved = await storage.get("test-remote", "inbox");
      expect(retrieved).toEqual({
        remoteName: "test-remote",
        cursorType: "inbox",
        cursorOrdinal: 50,
      });
      expect(retrieved.lastSyncedAtUtcMs).toBeUndefined();
    });

    it("should handle abort signal", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        storage.get("test-remote", "inbox", controller.signal),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("upsert", () => {
    it("should insert new cursor", async () => {
      const cursor: RemoteCursor = {
        remoteName: "new-remote",
        cursorType: "inbox",
        cursorOrdinal: 10,
        lastSyncedAtUtcMs: Date.now(),
      };

      await storage.upsert(cursor);

      const retrieved = await storage.get("new-remote", "inbox");
      expect(retrieved.remoteName).toBe("new-remote");
      expect(retrieved.cursorOrdinal).toBe(10);
    });

    it("should update existing cursor", async () => {
      const cursor: RemoteCursor = {
        remoteName: "update-remote",
        cursorType: "inbox",
        cursorOrdinal: 100,
        lastSyncedAtUtcMs: 1000,
      };

      await storage.upsert(cursor);

      const updated: RemoteCursor = {
        remoteName: "update-remote",
        cursorType: "inbox",
        cursorOrdinal: 200,
        lastSyncedAtUtcMs: 2000,
      };

      await storage.upsert(updated);

      const retrieved = await storage.get("update-remote", "inbox");
      expect(retrieved.cursorOrdinal).toBe(200);
      expect(retrieved.lastSyncedAtUtcMs).toBe(2000);
    });

    it("should handle bigint ordinal conversions", async () => {
      const largeOrdinal = 9007199254740991;
      const cursor: RemoteCursor = {
        remoteName: "bigint-remote",
        cursorType: "inbox",
        cursorOrdinal: largeOrdinal,
        lastSyncedAtUtcMs: Date.now(),
      };

      await storage.upsert(cursor);

      const retrieved = await storage.get("bigint-remote", "inbox");
      expect(retrieved.cursorOrdinal).toBe(largeOrdinal);
    });

    it("should handle cursor with undefined lastSyncedAtUtcMs", async () => {
      const cursor: RemoteCursor = {
        remoteName: "no-timestamp-remote",
        cursorType: "inbox",
        cursorOrdinal: 42,
      };

      await storage.upsert(cursor);

      const retrieved = await storage.get("no-timestamp-remote", "inbox");
      expect(retrieved.cursorOrdinal).toBe(42);
      expect(retrieved.lastSyncedAtUtcMs).toBeUndefined();
    });

    it("should handle abort signal", async () => {
      const controller = new AbortController();
      controller.abort();

      const cursor: RemoteCursor = {
        remoteName: "test-remote",
        cursorType: "inbox",
        cursorOrdinal: 0,
      };

      await expect(storage.upsert(cursor, controller.signal)).rejects.toThrow(
        "Operation aborted",
      );
    });
  });

  describe("remove", () => {
    it("should remove all cursors for a remote", async () => {
      const inboxCursor: RemoteCursor = {
        remoteName: "remove-remote",
        cursorType: "inbox",
        cursorOrdinal: 100,
        lastSyncedAtUtcMs: Date.now(),
      };

      const outboxCursor: RemoteCursor = {
        remoteName: "remove-remote",
        cursorType: "outbox",
        cursorOrdinal: 50,
      };

      await storage.upsert(inboxCursor);
      await storage.upsert(outboxCursor);

      const beforeRemove = await storage.list("remove-remote");
      expect(beforeRemove).toHaveLength(2);

      await storage.remove("remove-remote");

      const afterRemove = await storage.get("remove-remote", "inbox");
      expect(afterRemove).toEqual({
        remoteName: "remove-remote",
        cursorType: "inbox",
        cursorOrdinal: 0,
      });

      const afterRemoveOutbox = await storage.get("remove-remote", "outbox");
      expect(afterRemoveOutbox).toEqual({
        remoteName: "remove-remote",
        cursorType: "outbox",
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

  describe("transaction behavior", () => {
    it("should handle concurrent upserts correctly", async () => {
      const cursor1: RemoteCursor = {
        remoteName: "concurrent-remote",
        cursorType: "inbox",
        cursorOrdinal: 100,
      };

      const cursor2: RemoteCursor = {
        remoteName: "concurrent-remote",
        cursorType: "inbox",
        cursorOrdinal: 200,
      };

      await Promise.all([storage.upsert(cursor1), storage.upsert(cursor2)]);

      const retrieved = await storage.get("concurrent-remote", "inbox");
      expect([100, 200]).toContain(retrieved.cursorOrdinal);
    });

    it("should handle rapid sequential updates", async () => {
      const remoteName = "rapid-remote";

      for (let i = 0; i < 10; i++) {
        await storage.upsert({
          remoteName,
          cursorType: "inbox",
          cursorOrdinal: i,
          lastSyncedAtUtcMs: Date.now(),
        });
      }

      const final = await storage.get(remoteName, "inbox");
      expect(final.cursorOrdinal).toBe(9);
    });
  });

  describe("ordinal progression", () => {
    it("should support monotonically increasing ordinals", async () => {
      const remoteName = "progression-remote";

      const ordinals = [0, 10, 50, 100, 500, 1000];

      for (const ordinal of ordinals) {
        await storage.upsert({
          remoteName,
          cursorType: "inbox",
          cursorOrdinal: ordinal,
          lastSyncedAtUtcMs: Date.now(),
        });

        const cursor = await storage.get(remoteName, "inbox");
        expect(cursor.cursorOrdinal).toBe(ordinal);
      }
    });

    it("should support large ordinal values", async () => {
      const remoteName = "large-ordinal-remote";

      const largeOrdinal = Number.MAX_SAFE_INTEGER;

      await storage.upsert({
        remoteName,
        cursorType: "inbox",
        cursorOrdinal: largeOrdinal,
        lastSyncedAtUtcMs: Date.now(),
      });

      const cursor = await storage.get(remoteName, "inbox");
      expect(cursor.cursorOrdinal).toBe(largeOrdinal);
    });
  });
});

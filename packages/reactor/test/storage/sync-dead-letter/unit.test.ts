import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KyselySyncDeadLetterStorage } from "../../../src/storage/kysely/sync-dead-letter-storage.js";
import type { KyselySyncRemoteStorage } from "../../../src/storage/kysely/sync-remote-storage.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import type { DeadLetterRecord } from "../../../src/storage/interfaces.js";
import { ChannelErrorSource } from "../../../src/sync/types.js";
import { createTestSyncStorage } from "../../factories.js";

describe("KyselySyncDeadLetterStorage", () => {
  let db: Kysely<Database>;
  let storage: KyselySyncDeadLetterStorage;
  let remoteStorage: KyselySyncRemoteStorage;

  const testRemote = {
    id: "remote-id-1",
    name: "remote-1",
    collectionId: "collection-1",
    channelConfig: { type: "internal", parameters: {} },
    filter: { documentId: [], scope: [], branch: "main" },
    options: { sinceTimestampUtcMs: "0" },
    status: {
      push: { state: "idle" as const, failureCount: 0 },
      pull: { state: "idle" as const, failureCount: 0 },
    },
  };

  const testRemote2 = {
    ...testRemote,
    id: "remote-id-2",
    name: "remote-2",
  };

  function createDeadLetter(
    overrides: Partial<DeadLetterRecord> = {},
  ): DeadLetterRecord {
    return {
      id: "dl-1",
      jobId: "job-1",
      jobDependencies: [],
      remoteName: "remote-1",
      documentId: "doc-1",
      scopes: ["global"],
      branch: "main",
      operations: [],
      errorSource: ChannelErrorSource.Inbox,
      errorMessage: "test error",
      ...overrides,
    };
  }

  beforeEach(async () => {
    const setup = await createTestSyncStorage();
    db = setup.db;
    storage = setup.syncDeadLetterStorage;
    remoteStorage = setup.syncRemoteStorage;

    await remoteStorage.upsert(testRemote);
    await remoteStorage.upsert(testRemote2);
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe("list", () => {
    it("should return empty array when no dead letters exist", async () => {
      const results = await storage.list("remote-1");
      expect(results).toEqual([]);
    });

    it("should return dead letters filtered by remote name", async () => {
      const dl1 = createDeadLetter({
        id: "dl-1",
        remoteName: "remote-1",
      });
      const dl2 = createDeadLetter({
        id: "dl-2",
        remoteName: "remote-2",
      });

      await storage.add(dl1);
      await storage.add(dl2);

      const results = await storage.list("remote-1");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("dl-1");
      expect(results[0].remoteName).toBe("remote-1");
    });

    it("should return multiple dead letters for same remote", async () => {
      const dl1 = createDeadLetter({ id: "dl-1", remoteName: "remote-1" });
      const dl2 = createDeadLetter({ id: "dl-2", remoteName: "remote-1" });

      await storage.add(dl1);
      await storage.add(dl2);

      const results = await storage.list("remote-1");
      expect(results).toHaveLength(2);
    });

    it("should handle abort signal", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(storage.list("remote-1", controller.signal)).rejects.toThrow(
        "Operation aborted",
      );
    });
  });

  describe("add", () => {
    it("should insert a dead letter", async () => {
      const dl = createDeadLetter();
      await storage.add(dl);

      const results = await storage.list("remote-1");
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(
        expect.objectContaining({
          id: "dl-1",
          jobId: "job-1",
          jobDependencies: [],
          remoteName: "remote-1",
          documentId: "doc-1",
          scopes: ["global"],
          branch: "main",
          errorSource: ChannelErrorSource.Inbox,
          errorMessage: "test error",
        }),
      );
    });

    it("should be idempotent on duplicate id", async () => {
      const dl = createDeadLetter();
      await storage.add(dl);
      await storage.add(dl);

      const results = await storage.list("remote-1");
      expect(results).toHaveLength(1);
    });

    it("should preserve operations as JSON", async () => {
      const dl = createDeadLetter({
        operations: [
          {
            operation: {
              id: "op-1",
              index: 0,
              skip: 0,
              hash: "hash-1",
              timestampUtcMs: "1000",
              action: { type: "CREATE", scope: "global" } as any,
            },
            context: {
              documentId: "doc-1",
              documentType: "test",
              scope: "global",
              branch: "main",
              ordinal: 1,
            },
          },
        ],
      });

      await storage.add(dl);

      const results = await storage.list("remote-1");
      expect(results[0].operations).toHaveLength(1);
      expect(results[0].operations[0].operation.id).toBe("op-1");
    });

    it("should handle abort signal", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        storage.add(createDeadLetter(), controller.signal),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("remove", () => {
    it("should remove a dead letter by id", async () => {
      const dl = createDeadLetter();
      await storage.add(dl);

      await storage.remove("dl-1");

      const results = await storage.list("remote-1");
      expect(results).toHaveLength(0);
    });

    it("should not throw when removing non-existent id", async () => {
      await expect(storage.remove("non-existent")).resolves.not.toThrow();
    });

    it("should handle abort signal", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(storage.remove("dl-1", controller.signal)).rejects.toThrow(
        "Operation aborted",
      );
    });
  });

  describe("removeByRemote", () => {
    it("should remove all dead letters for a remote", async () => {
      const dl1 = createDeadLetter({ id: "dl-1", remoteName: "remote-1" });
      const dl2 = createDeadLetter({ id: "dl-2", remoteName: "remote-1" });
      const dl3 = createDeadLetter({ id: "dl-3", remoteName: "remote-2" });

      await storage.add(dl1);
      await storage.add(dl2);
      await storage.add(dl3);

      await storage.removeByRemote("remote-1");

      const remote1Results = await storage.list("remote-1");
      expect(remote1Results).toHaveLength(0);

      const remote2Results = await storage.list("remote-2");
      expect(remote2Results).toHaveLength(1);
    });

    it("should not throw when no dead letters exist for remote", async () => {
      await expect(
        storage.removeByRemote("non-existent"),
      ).resolves.not.toThrow();
    });

    it("should handle abort signal", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        storage.removeByRemote("remote-1", controller.signal),
      ).rejects.toThrow("Operation aborted");
    });
  });

  describe("FK cascade", () => {
    it("should cascade delete dead letters when remote is deleted", async () => {
      const dl1 = createDeadLetter({ id: "dl-1", remoteName: "remote-1" });
      const dl2 = createDeadLetter({ id: "dl-2", remoteName: "remote-1" });

      await storage.add(dl1);
      await storage.add(dl2);

      await remoteStorage.remove("remote-1");

      const results = await storage.list("remote-1");
      expect(results).toHaveLength(0);
    });
  });
});

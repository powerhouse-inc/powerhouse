import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KyselySyncRemoteStorage } from "../../../src/storage/kysely/sync-remote-storage.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import type { RemoteRecord } from "../../../src/sync/types.js";
import { createTestSyncStorage } from "../../factories.js";

describe("KyselySyncRemoteStorage", () => {
  let db: Kysely<Database>;
  let storage: KyselySyncRemoteStorage;

  beforeEach(async () => {
    const setup = await createTestSyncStorage();
    db = setup.db;
    storage = setup.syncRemoteStorage;
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe("list", () => {
    it("should return empty array when no remotes exist", async () => {
      const remotes = await storage.list();
      expect(remotes).toEqual([]);
    });

    it("should return all remotes", async () => {
      const remote1: RemoteRecord = {
        id: "test-id",
        name: "remote-1",
        collectionId: "collection-1",
        channelConfig: {
          type: "gql",
          parameters: { url: "https://api.example.com/graphql" },
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

      const remote2: RemoteRecord = {
        id: "test-id",
        name: "remote-2",
        collectionId: "collection-2",
        channelConfig: {
          type: "internal",
          parameters: {},
        },
        filter: {
          documentId: ["doc-1", "doc-2"],
          scope: ["global"],
          branch: "develop",
        },
        options: {},
        status: {
          push: { state: "running", failureCount: 0 },
          pull: { state: "error", failureCount: 3 },
        },
      };

      await storage.upsert(remote1);
      await storage.upsert(remote2);

      const remotes = await storage.list();
      expect(remotes).toHaveLength(2);
      expect(remotes.map((r) => r.name)).toEqual(
        expect.arrayContaining(["remote-1", "remote-2"]),
      );
    });

    it("should handle abort signal", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(storage.list(controller.signal)).rejects.toThrow(
        "Operation aborted",
      );
    });
  });

  describe("get", () => {
    it("should throw error when remote does not exist", async () => {
      await expect(storage.get("non-existent")).rejects.toThrow(
        "Remote not found: non-existent",
      );
    });

    it("should retrieve existing remote", async () => {
      const remote: RemoteRecord = {
        id: "test-id",
        name: "test-remote",
        collectionId: "main:drive-123",
        channelConfig: {
          type: "gql",
          parameters: {
            url: "https://api.example.com/graphql",
            token: "secret-token",
          },
        },
        filter: {
          documentId: ["doc-1"],
          scope: ["public", "protected"],
          branch: "main",
        },
        options: {},
        status: {
          push: {
            state: "idle",
            lastSuccessUtcMs: 1234567890,
            failureCount: 0,
          },
          pull: {
            state: "error",
            lastFailureUtcMs: 9876543210,
            failureCount: 5,
          },
        },
      };

      await storage.upsert(remote);

      const retrieved = await storage.get("test-remote");
      expect(retrieved).toMatchObject({
        name: "test-remote",
        collectionId: "main:drive-123",
        channelConfig: {
          type: "gql",
          parameters: {
            url: "https://api.example.com/graphql",
            token: "secret-token",
          },
        },
        filter: {
          documentId: ["doc-1"],
          scope: ["public", "protected"],
          branch: "main",
        },
        status: {
          push: {
            state: "idle",
            lastSuccessUtcMs: 1234567890,
            failureCount: 0,
          },
          pull: {
            state: "error",
            lastFailureUtcMs: 9876543210,
            failureCount: 5,
          },
        },
      });
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
    it("should insert new remote", async () => {
      const remote: RemoteRecord = {
        id: "test-id",
        name: "new-remote",
        collectionId: "collection-1",
        channelConfig: {
          type: "gql",
          parameters: { url: "https://api.example.com" },
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

      await storage.upsert(remote);

      const retrieved = await storage.get("new-remote");
      expect(retrieved.name).toBe("new-remote");
      expect(retrieved.collectionId).toBe("collection-1");
    });

    it("should update existing remote", async () => {
      const remote: RemoteRecord = {
        id: "test-id",
        name: "update-remote",
        collectionId: "collection-1",
        channelConfig: {
          type: "gql",
          parameters: { url: "https://api.example.com" },
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

      await storage.upsert(remote);

      const updated: RemoteRecord = {
        ...remote,
        collectionId: "collection-2",
        status: {
          push: { state: "running", failureCount: 0 },
          pull: { state: "error", failureCount: 3 },
        },
      };

      await storage.upsert(updated);

      const retrieved = await storage.get("update-remote");
      expect(retrieved.collectionId).toBe("collection-2");
      expect(retrieved.status.push.state).toBe("running");
      expect(retrieved.status.pull.state).toBe("error");
      expect(retrieved.status.pull.failureCount).toBe(3);
    });

    it("should handle empty arrays in filter", async () => {
      const remote: RemoteRecord = {
        id: "test-id",
        name: "empty-filter-remote",
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
        options: {},
        status: {
          push: { state: "idle", failureCount: 0 },
          pull: { state: "idle", failureCount: 0 },
        },
      };

      await storage.upsert(remote);

      const retrieved = await storage.get("empty-filter-remote");
      expect(retrieved.filter.documentId).toEqual([]);
      expect(retrieved.filter.scope).toEqual([]);
    });

    it("should handle JSONB parameters correctly", async () => {
      const remote: RemoteRecord = {
        id: "test-id",
        name: "jsonb-remote",
        collectionId: "collection-1",
        channelConfig: {
          type: "gql",
          parameters: {
            url: "https://api.example.com",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer token",
            },
            timeout: 5000,
            retries: 3,
          },
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

      await storage.upsert(remote);

      const retrieved = await storage.get("jsonb-remote");
      expect(retrieved.channelConfig.parameters).toEqual({
        url: "https://api.example.com",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token",
        },
        timeout: 5000,
        retries: 3,
      });
    });

    it("should handle bigint timestamp conversions", async () => {
      const now = Date.now();
      const remote: RemoteRecord = {
        id: "test-id",
        name: "timestamp-remote",
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
        options: {},
        status: {
          push: {
            state: "idle",
            lastSuccessUtcMs: now,
            lastFailureUtcMs: now - 1000,
            failureCount: 2,
          },
          pull: {
            state: "error",
            lastSuccessUtcMs: now - 2000,
            lastFailureUtcMs: now - 500,
            failureCount: 5,
          },
        },
      };

      await storage.upsert(remote);

      const retrieved = await storage.get("timestamp-remote");
      expect(retrieved.status.push.lastSuccessUtcMs).toBe(now);
      expect(retrieved.status.push.lastFailureUtcMs).toBe(now - 1000);
      expect(retrieved.status.pull.lastSuccessUtcMs).toBe(now - 2000);
      expect(retrieved.status.pull.lastFailureUtcMs).toBe(now - 500);
    });

    it("should handle abort signal", async () => {
      const controller = new AbortController();
      controller.abort();

      const remote: RemoteRecord = {
        id: "test-id",
        name: "abort-remote",
        collectionId: "collection-1",
        channelConfig: {
          type: "internal",
          parameters: {},
        },
        filter: { documentId: [], scope: [], branch: "main" },
        options: {},
        status: {
          push: { state: "idle", failureCount: 0 },
          pull: { state: "idle", failureCount: 0 },
        },
      };

      await expect(storage.upsert(remote, controller.signal)).rejects.toThrow(
        "Operation aborted",
      );
    });
  });

  describe("remove", () => {
    it("should remove existing remote", async () => {
      const remote: RemoteRecord = {
        id: "test-id",
        name: "remove-remote",
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
        options: {},
        status: {
          push: { state: "idle", failureCount: 0 },
          pull: { state: "idle", failureCount: 0 },
        },
      };

      await storage.upsert(remote);
      expect(await storage.get("remove-remote")).toBeDefined();

      await storage.remove("remove-remote");

      await expect(storage.get("remove-remote")).rejects.toThrow(
        "Remote not found",
      );
    });

    it("should not throw error when removing non-existent remote", async () => {
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
      const remote: RemoteRecord = {
        id: "test-id",
        name: "concurrent-remote",
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
        options: {},
        status: {
          push: { state: "idle", failureCount: 0 },
          pull: { state: "idle", failureCount: 0 },
        },
      };

      await Promise.all([storage.upsert(remote), storage.upsert(remote)]);

      const remotes = await storage.list();
      expect(remotes).toHaveLength(1);
      expect(remotes[0].name).toBe("concurrent-remote");
    });
  });
});

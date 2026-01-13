import type { Operation } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import type { IOperationIndex } from "../../../src/cache/operation-index-types.js";
import type { IReactor } from "../../../src/core/types.js";
import { EventBus } from "../../../src/events/event-bus.js";
import type { IEventBus } from "../../../src/events/interfaces.js";
import { OperationEventTypes } from "../../../src/events/types.js";
import { ConsoleLogger } from "../../../src/logging/console.js";
import type {
  ISyncCursorStorage,
  ISyncRemoteStorage,
  OperationWithContext,
} from "../../../src/storage/interfaces.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import type { IChannelFactory } from "../../../src/sync/interfaces.js";
import { SyncManager } from "../../../src/sync/sync-manager.js";
import type { ChannelConfig, SyncEnvelope } from "../../../src/sync/types.js";
import { SyncOperationStatus } from "../../../src/sync/types.js";
import {
  createTestChannelFactory,
  createTestSyncStorage,
} from "../../factories.js";
import type { TestChannel } from "../channels/test-channel.js";

describe("SyncManager Integration", () => {
  let db: Kysely<Database>;
  let syncRemoteStorage: ISyncRemoteStorage;
  let syncCursorStorage: ISyncCursorStorage;
  let eventBus: IEventBus;
  let operationIndex: IOperationIndex;
  let mockReactor: IReactor;
  let channelRegistry: Map<string, TestChannel>;
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

    channelRegistry = new Map();
    sentEnvelopes = [];
    channelFactory = createTestChannelFactory(channelRegistry, sentEnvelopes);

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

  describe("startup and shutdown", () => {
    it("should start up with no remotes", async () => {
      await syncManager.startup();

      const remotes = syncManager.list();
      expect(remotes).toHaveLength(0);
    });

    it("should load existing remotes on startup", async () => {
      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncRemoteStorage.upsert({
        id: "channel1",
        name: "remote1",
        collectionId: "collection1",
        channelConfig,
        filter: { documentId: [], scope: [], branch: "main" },
        options: {},
        status: {
          push: { state: "idle", failureCount: 0 },
          pull: { state: "idle", failureCount: 0 },
        },
      });

      await syncManager.startup();

      const remotes = syncManager.list();
      expect(remotes).toHaveLength(1);
      expect(remotes[0].name).toBe("remote1");
      expect(remotes[0].collectionId).toBe("collection1");
    });

    it("should shutdown cleanly", async () => {
      await syncManager.startup();

      const status = syncManager.shutdown();

      expect(status.isShutdown).toBe(true);
    });
  });

  describe("remote management", () => {
    it("should add a new remote", async () => {
      await syncManager.startup();

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      const remote = await syncManager.add(
        "remote1",
        "collection1",
        channelConfig,
        { documentId: ["doc1"], scope: ["global"], branch: "main" },
        {},
      );

      expect(remote.name).toBe("remote1");
      expect(remote.collectionId).toBe("collection1");
      expect(remote.filter.documentId).toContain("doc1");

      const storedRemote = await syncRemoteStorage.get("remote1");
      expect(storedRemote.name).toBe("remote1");
    });

    it("should remove a remote", async () => {
      await syncManager.startup();

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add("remote1", "collection1", channelConfig);

      await syncManager.remove("remote1");

      expect(syncManager.list()).toHaveLength(0);

      await expect(syncRemoteStorage.get("remote1")).rejects.toThrow();
    });

    it("should get a remote by name", async () => {
      await syncManager.startup();

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add("remote1", "collection1", channelConfig);

      const remote = syncManager.getByName("remote1");

      expect(remote.name).toBe("remote1");
    });

    it("should list all remotes", async () => {
      await syncManager.startup();

      const config1: ChannelConfig = {
        type: "internal",

        parameters: {},
      };

      const config2: ChannelConfig = {
        type: "internal",

        parameters: {},
      };

      await syncManager.add("remote1", "collection1", config1);
      await syncManager.add("remote2", "collection2", config2);

      const remotes = syncManager.list();

      expect(remotes).toHaveLength(2);
    });
  });

  describe("operation routing", () => {
    it("should route operations to matching remotes", async () => {
      await syncManager.startup();

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add("remote1", "collection1", channelConfig, {
        documentId: ["doc1"],
        scope: ["global"],
        branch: "main",
      });

      const operations: OperationWithContext[] = [
        {
          operation: {
            id: "op1",
            index: 0,
            skip: 0,
            hash: "hash1",
            timestampUtcMs: "2023-01-01T00:00:00.000Z",
            action: {
              type: "CREATE",
              scope: "global",
              id: "action1",
              timestampUtcMs: "2023-01-01T00:00:00.000Z",
              input: {},
            },
          } as Operation,
          context: {
            documentId: "doc1",
            documentType: "test",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
        },
      ];

      await eventBus.emit(OperationEventTypes.OPERATION_WRITTEN, {
        operations,
      });

      expect(sentEnvelopes).toHaveLength(1);
      expect(sentEnvelopes[0].operations).toHaveLength(1);
      expect(sentEnvelopes[0].operations![0].operation.id).toBe("op1");
      const remote = syncManager.getByName("remote1");
      expect(remote.channel.outbox.items).toHaveLength(0);
    });

    it("should not route operations that do not match filter", async () => {
      await syncManager.startup();

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add("remote1", "collection1", channelConfig, {
        documentId: ["doc1"],
        scope: ["global"],
        branch: "main",
      });

      const operations: OperationWithContext[] = [
        {
          operation: {
            id: "op1",
            index: 0,
            skip: 0,
            hash: "hash1",
            timestampUtcMs: "2023-01-01T00:00:00.000Z",
            action: {
              type: "CREATE",
              scope: "global",
              id: "action1",
              timestampUtcMs: "2023-01-01T00:00:00.000Z",
              input: {},
            },
          } as Operation,
          context: {
            documentId: "doc2",
            documentType: "test",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
        },
      ];

      await eventBus.emit(OperationEventTypes.OPERATION_WRITTEN, {
        operations,
      });

      const remote = syncManager.getByName("remote1");
      expect(remote.channel.outbox.items).toHaveLength(0);
    });

    it("should route operations to multiple remotes", async () => {
      await syncManager.startup();

      const config1: ChannelConfig = {
        type: "internal",

        parameters: {},
      };

      const config2: ChannelConfig = {
        type: "internal",

        parameters: {},
      };

      await syncManager.add("remote1", "collection1", config1, {
        documentId: ["doc1"],
        scope: [],
        branch: "main",
      });

      await syncManager.add("remote2", "collection2", config2, {
        documentId: ["doc1"],
        scope: [],
        branch: "main",
      });

      const operations: OperationWithContext[] = [
        {
          operation: {
            id: "op1",
            index: 0,
            skip: 0,
            hash: "hash1",
            timestampUtcMs: "2023-01-01T00:00:00.000Z",
            action: {
              type: "CREATE",
              scope: "global",
              id: "action1",
              timestampUtcMs: "2023-01-01T00:00:00.000Z",
              input: {},
            },
          } as Operation,
          context: {
            documentId: "doc1",
            documentType: "test",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
        },
      ];

      await eventBus.emit(OperationEventTypes.OPERATION_WRITTEN, {
        operations,
      });

      expect(sentEnvelopes).toHaveLength(2);
      const remote1 = syncManager.getByName("remote1");
      const remote2 = syncManager.getByName("remote2");
      expect(remote1.channel.outbox.items).toHaveLength(0);
      expect(remote2.channel.outbox.items).toHaveLength(0);
    });
  });

  describe("inbox processing", () => {
    it("should apply operations from inbox using reactor", async () => {
      await syncManager.startup();

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      const remote = await syncManager.add(
        "remote1",
        "collection1",
        channelConfig,
      );

      const operations: OperationWithContext[] = [
        {
          operation: {
            id: "op1",
            index: 0,
            skip: 0,
            hash: "hash1",
            timestampUtcMs: "2023-01-01T00:00:00.000Z",
            action: {
              type: "CREATE",
              scope: "global",
              id: "action1",
              timestampUtcMs: "2023-01-01T00:00:00.000Z",
              input: {},
            },
          } as Operation,
          context: {
            documentId: "doc1",
            documentType: "test",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
        },
      ];

      const channel = channelRegistry.get(remote.id);
      expect(channel).toBeDefined();

      channel!.receive({
        type: "operations",
        channelMeta: { id: remote.id },
        operations,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockReactor.load).toHaveBeenCalledWith(
        "doc1",
        "main",
        [operations[0].operation],
        undefined,
        { sourceRemote: "remote1" },
      );
    });

    it("should handle reactor errors and move to dead letter", async () => {
      const { JobStatus } = await import("../../../src/shared/types.js");
      vi.mocked(mockReactor.load).mockResolvedValue({
        status: JobStatus.FAILED,
        error: { message: "Test error", stack: "" },
      } as any);

      await syncManager.startup();

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      const remote = await syncManager.add(
        "remote1",
        "collection1",
        channelConfig,
      );

      const operations: OperationWithContext[] = [
        {
          operation: {
            id: "op1",
            index: 0,
            skip: 0,
            hash: "hash1",
            timestampUtcMs: "2023-01-01T00:00:00.000Z",
            action: {
              type: "CREATE",
              scope: "global",
              id: "action1",
              timestampUtcMs: "2023-01-01T00:00:00.000Z",
              input: {},
            },
          } as Operation,
          context: {
            documentId: "doc1",
            documentType: "test",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
        },
      ];

      const channel = channelRegistry.get(remote.id);
      channel!.receive({
        type: "operations",
        channelMeta: { id: remote.id },
        operations,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const remoteRecord = syncManager.getByName("remote1");
      expect(remoteRecord.channel.deadLetter.items).toHaveLength(1);
      expect(remoteRecord.channel.deadLetter.items[0].status).toBe(
        SyncOperationStatus.Error,
      );
    });
  });

  describe("outbox processing", () => {
    it("should automatically remove jobs from outbox after successful send", async () => {
      await syncManager.startup();

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add("remote1", "collection1", channelConfig);

      const operations: OperationWithContext[] = [
        {
          operation: {
            id: "op1",
            index: 0,
            skip: 0,
            hash: "hash1",
            timestampUtcMs: "2023-01-01T00:00:00.000Z",
            action: {
              type: "CREATE",
              scope: "global",
              id: "action1",
              timestampUtcMs: "2023-01-01T00:00:00.000Z",
              input: {},
            },
          } as Operation,
          context: {
            documentId: "doc1",
            documentType: "test",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
        },
      ];

      await eventBus.emit(OperationEventTypes.OPERATION_WRITTEN, {
        operations,
      });

      expect(sentEnvelopes).toHaveLength(1);
      expect(sentEnvelopes[0].operations![0].operation.id).toBe("op1");

      const remote = syncManager.getByName("remote1");
      expect(remote.channel.outbox.items).toHaveLength(0);
    });
  });
});

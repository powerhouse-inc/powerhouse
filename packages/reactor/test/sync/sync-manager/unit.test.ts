import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IOperationIndex } from "../../../src/cache/operation-index-types.js";
import type { IReactor } from "../../../src/core/types.js";
import type { IEventBus } from "../../../src/events/interfaces.js";
import { OperationEventTypes } from "../../../src/events/types.js";
import type {
  ISyncCursorStorage,
  ISyncRemoteStorage,
  OperationWithContext,
} from "../../../src/storage/interfaces.js";
import type {
  IChannel,
  IChannelFactory,
} from "../../../src/sync/interfaces.js";
import { SyncManager } from "../../../src/sync/sync-manager.js";
import type { ChannelConfig, RemoteRecord } from "../../../src/sync/types.js";

describe("SyncManager - Unit Tests", () => {
  let syncManager: SyncManager;
  let mockRemoteStorage: ISyncRemoteStorage;
  let mockCursorStorage: ISyncCursorStorage;
  let mockChannelFactory: IChannelFactory;
  let mockOperationIndex: IOperationIndex;
  let mockReactor: IReactor;
  let mockEventBus: IEventBus;
  let mockChannel: IChannel;
  let eventSubscribers: Map<number, (type: number, data: any) => void>;

  beforeEach(() => {
    eventSubscribers = new Map();

    mockChannel = {
      inbox: {
        add: vi.fn(),
        remove: vi.fn(),
        get: vi.fn(),
        onAdded: vi.fn(),
        onRemoved: vi.fn(),
      },
      outbox: {
        add: vi.fn(),
        remove: vi.fn(),
        get: vi.fn(),
        onAdded: vi.fn(),
        onRemoved: vi.fn(),
      },
      deadLetter: {
        add: vi.fn(),
        remove: vi.fn(),
        get: vi.fn(),
        onAdded: vi.fn(),
        onRemoved: vi.fn(),
      },
      init: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn(),
    } as any;

    mockRemoteStorage = {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };

    mockCursorStorage = {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue({ remoteName: "", cursorOrdinal: 0 }),
      upsert: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };

    mockChannelFactory = {
      instance: vi.fn().mockReturnValue(mockChannel),
    };

    mockOperationIndex = {
      start: vi.fn(),
      commit: vi.fn(),
      find: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };

    mockReactor = {
      load: vi.fn().mockResolvedValue({ status: "ok" }),
    } as any;

    mockEventBus = {
      subscribe: vi.fn((type, callback) => {
        eventSubscribers.set(type, callback);
        return () => {
          eventSubscribers.delete(type);
        };
      }),
      emit: vi.fn(),
    };

    syncManager = new SyncManager(
      mockRemoteStorage,
      mockCursorStorage,
      mockChannelFactory,
      mockOperationIndex,
      mockReactor,
      mockEventBus,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("startup", () => {
    it("should load remotes from storage and recreate channels", async () => {
      const remoteRecords: RemoteRecord[] = [
        {
          id: "channel1",
          name: "remote1",
          collectionId: "collection1",
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
        },
      ];

      vi.mocked(mockRemoteStorage.list).mockResolvedValue(remoteRecords);

      await syncManager.startup();

      expect(mockRemoteStorage.list).toHaveBeenCalled();
      expect(mockChannelFactory.instance).toHaveBeenCalledWith(
        remoteRecords[0].id,
        remoteRecords[0].name,
        remoteRecords[0].channelConfig,
        mockCursorStorage,
        remoteRecords[0].collectionId,
        remoteRecords[0].filter,
      );
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        OperationEventTypes.OPERATION_WRITTEN,
        expect.any(Function),
      );
    });

    it("should wire up channel callbacks for each remote", async () => {
      const remoteRecords: RemoteRecord[] = [
        {
          id: "channel1",
          name: "remote1",
          collectionId: "collection1",
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
        },
      ];

      vi.mocked(mockRemoteStorage.list).mockResolvedValue(remoteRecords);

      await syncManager.startup();

      expect(mockChannel.inbox.onAdded).toHaveBeenCalled();
      expect(mockChannel.outbox.onAdded).toHaveBeenCalled();
    });

    it("should throw error if already shutdown", async () => {
      syncManager.shutdown();

      await expect(syncManager.startup()).rejects.toThrow(
        "SyncManager is already shutdown and cannot be started",
      );
    });
  });

  describe("shutdown", () => {
    it("should shutdown all channels and clear remotes", async () => {
      const remoteRecords: RemoteRecord[] = [
        {
          id: "channel1",
          name: "remote1",
          collectionId: "collection1",
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
        },
      ];

      vi.mocked(mockRemoteStorage.list).mockResolvedValue(remoteRecords);
      await syncManager.startup();

      const status = syncManager.shutdown();

      expect(status.isShutdown).toBe(true);
      expect(mockChannel.shutdown).toHaveBeenCalled();
      expect(syncManager.list()).toHaveLength(0);
    });

    it("should unsubscribe from event bus", async () => {
      await syncManager.startup();

      expect(eventSubscribers.size).toBe(3);

      syncManager.shutdown();

      expect(eventSubscribers.size).toBe(0);
    });
  });

  describe("add", () => {
    it("should create a new remote and persist to storage", async () => {
      await syncManager.startup();

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      const remote = await syncManager.add(
        "remote1",
        "collection1",
        channelConfig,
        { documentId: [], scope: [], branch: "main" },
        {},
      );

      expect(remote.name).toBe("remote1");
      expect(remote.collectionId).toBe("collection1");
      expect(mockRemoteStorage.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "remote1",
          collectionId: "collection1",
          channelConfig,
        }),
      );
      expect(mockChannelFactory.instance).toHaveBeenCalledWith(
        expect.any(String),
        "remote1",
        channelConfig,
        mockCursorStorage,
        "collection1",
        { documentId: [], scope: [], branch: "main" },
      );
    });

    it("should throw error if remote name already exists", async () => {
      await syncManager.startup();

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add("remote1", "collection1", channelConfig);

      await expect(
        syncManager.add("remote1", "collection2", channelConfig),
      ).rejects.toThrow("Remote with name 'remote1' already exists");
    });

    it("should throw error if manager is shutdown", async () => {
      await syncManager.startup();
      syncManager.shutdown();

      await expect(
        syncManager.add("remote1", "collection1", {
          type: "internal",

          parameters: {},
        }),
      ).rejects.toThrow("SyncManager is shutdown and cannot add remotes");
    });

    it("should use default filter and options if not provided", async () => {
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

      expect(remote.filter).toEqual({ documentId: [], scope: [], branch: "" });
      expect(remote.options).toEqual({});
    });
  });

  describe("remove", () => {
    it("should shutdown channel and remove from storage", async () => {
      await syncManager.startup();

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add("remote1", "collection1", channelConfig);

      await syncManager.remove("remote1");

      expect(mockChannel.shutdown).toHaveBeenCalled();
      expect(mockRemoteStorage.remove).toHaveBeenCalledWith("remote1");
      expect(syncManager.list()).toHaveLength(0);
    });

    it("should throw error if remote does not exist", async () => {
      await syncManager.startup();

      await expect(syncManager.remove("nonexistent")).rejects.toThrow(
        "Remote with name 'nonexistent' does not exist",
      );
    });
  });

  describe("get", () => {
    it("should return remote by name", async () => {
      await syncManager.startup();

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add("remote1", "collection1", channelConfig);

      const remote = syncManager.getByName("remote1");

      expect(remote.name).toBe("remote1");
      expect(remote.collectionId).toBe("collection1");
    });

    it("should throw error if remote does not exist", async () => {
      await syncManager.startup();

      expect(() => syncManager.getByName("nonexistent")).toThrow(
        "Remote with name 'nonexistent' does not exist",
      );
    });
  });

  describe("list", () => {
    it("should return all remotes", async () => {
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
      expect(remotes[0].name).toBe("remote1");
      expect(remotes[1].name).toBe("remote2");
    });

    it("should return empty array when no remotes exist", async () => {
      await syncManager.startup();

      const remotes = syncManager.list();

      expect(remotes).toHaveLength(0);
    });
  });

  describe("operation routing", () => {
    it("should route operations to matching remotes on OPERATION_WRITTEN event", async () => {
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
            action: { type: "CREATE", scope: "global" } as any,
          },
          context: {
            documentId: "doc1",
            documentType: "test",
            scope: "global",
            branch: "main",
          },
        },
      ];

      const subscriber = eventSubscribers.get(
        OperationEventTypes.OPERATION_WRITTEN,
      );
      expect(subscriber).toBeDefined();

      subscriber!(OperationEventTypes.OPERATION_WRITTEN, { operations });

      expect(mockChannel.outbox.add).toHaveBeenCalled();
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
            action: { type: "CREATE", scope: "global" } as any,
          },
          context: {
            documentId: "doc2",
            documentType: "test",
            scope: "global",
            branch: "main",
          },
        },
      ];

      const subscriber = eventSubscribers.get(
        OperationEventTypes.OPERATION_WRITTEN,
      );
      subscriber!(OperationEventTypes.OPERATION_WRITTEN, { operations });

      expect(mockChannel.outbox.add).not.toHaveBeenCalled();
    });

    it("should not route operations when shutdown", async () => {
      await syncManager.startup();

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add("remote1", "collection1", channelConfig);

      syncManager.shutdown();

      const operations: OperationWithContext[] = [
        {
          operation: {
            id: "op1",
            index: 0,
            skip: 0,
            hash: "hash1",
            timestampUtcMs: "2023-01-01T00:00:00.000Z",
            action: { type: "CREATE", scope: "global" } as any,
          },
          context: {
            documentId: "doc1",
            documentType: "test",
            scope: "global",
            branch: "main",
          },
        },
      ];

      const subscriber = eventSubscribers.get(
        OperationEventTypes.OPERATION_WRITTEN,
      );
      if (subscriber) {
        subscriber(OperationEventTypes.OPERATION_WRITTEN, { operations });
      }

      expect(mockChannel.outbox.add).not.toHaveBeenCalled();
    });
  });
});

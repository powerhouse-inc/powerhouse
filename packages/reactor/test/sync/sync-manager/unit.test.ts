import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IOperationIndex } from "../../../src/cache/operation-index-types.js";
import type { IReactor } from "../../../src/core/types.js";
import type { IEventBus } from "../../../src/events/interfaces.js";
import { ReactorEventTypes } from "../../../src/events/types.js";
import { ConsoleLogger } from "../../../src/logging/console.js";
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
import { SyncOperation } from "../../../src/sync/sync-operation.js";
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
  let eventSubscribers: Map<
    number,
    Array<(type: number, data: any) => void | Promise<void>>
  >;

  function createMockMailbox() {
    let _latestOrdinal = 0;
    let _ackOrdinal = 0;
    const _items: SyncOperation[] = [];

    return {
      get items() {
        return _items;
      },
      get latestOrdinal() {
        return _latestOrdinal;
      },
      get ackOrdinal() {
        return _ackOrdinal;
      },
      init: vi.fn((ordinal: number) => {
        _ackOrdinal = _latestOrdinal = ordinal;
      }),
      add: vi.fn((...items: SyncOperation[]) => {
        for (const item of items) {
          _items.push(item);
          if (item.operations) {
            for (const op of item.operations) {
              _latestOrdinal = Math.max(_latestOrdinal, op.context.ordinal);
            }
          }
        }
      }),
      remove: vi.fn(),
      get: vi.fn(),
      onAdded: vi.fn(),
      onRemoved: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      isPaused: vi.fn().mockReturnValue(false),
      flush: vi.fn(),
    };
  }

  function createFindResult(
    entries: Array<{
      id: string;
      documentId: string;
      scope: string;
      branch: string;
      ordinal: number;
      action?: any;
    }>,
  ) {
    return {
      results: entries.map((e) => ({
        id: e.id,
        index: 0,
        skip: 0,
        hash: `hash-${e.id}`,
        timestampUtcMs: String(e.ordinal * 1000),
        action: e.action ?? {
          id: `action-${e.id}`,
          type: "CREATE",
          scope: e.scope,
          timestampUtcMs: String(e.ordinal * 1000),
          input: {},
        },
        documentId: e.documentId,
        documentType: "test",
        scope: e.scope,
        branch: e.branch,
        sourceRemote: "",
        ordinal: e.ordinal,
      })),
      options: { cursor: "0", limit: 500 },
    };
  }

  function getTotalSubscriberCount(): number {
    let count = 0;
    for (const subs of eventSubscribers.values()) {
      count += subs.length;
    }
    return count;
  }

  beforeEach(() => {
    eventSubscribers = new Map();

    const inbox = createMockMailbox();
    const outbox = createMockMailbox();
    const deadLetter = createMockMailbox();

    mockChannel = {
      inbox,
      outbox,
      deadLetter,
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
      get: vi.fn().mockResolvedValue({
        remoteName: "",
        cursorType: "outbox",
        cursorOrdinal: 0,
      }),
      upsert: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };

    mockChannelFactory = {
      instance: vi.fn().mockReturnValue(mockChannel),
    };

    mockOperationIndex = {
      start: vi.fn(),
      commit: vi.fn().mockResolvedValue([]),
      find: vi.fn().mockResolvedValue({
        results: [],
        options: { cursor: "0", limit: 500 },
      }),
      get: vi.fn().mockResolvedValue({
        results: [],
        options: { cursor: "0", limit: 100 },
      }),
      getSinceOrdinal: vi.fn().mockResolvedValue({
        results: [],
        options: { cursor: "0", limit: 100 },
        nextCursor: undefined,
      }),
      getLatestTimestampForCollection: vi.fn().mockResolvedValue(null),
      getCollectionsForDocuments: vi.fn().mockResolvedValue({}),
    };

    mockReactor = {
      load: vi.fn().mockResolvedValue({ status: "ok" }),
      getJobStatus: vi.fn().mockResolvedValue({ id: "", status: "READ_READY" }),
      loadBatch: vi.fn().mockResolvedValue({ jobs: {} }),
    } as any;

    mockEventBus = {
      subscribe: vi.fn(
        (
          type: number,
          callback: (type: number, data: any) => void | Promise<void>,
        ) => {
          if (!eventSubscribers.has(type)) {
            eventSubscribers.set(type, []);
          }
          eventSubscribers.get(type)!.push(callback);
          return () => {
            const subs = eventSubscribers.get(type);
            if (subs) {
              const idx = subs.indexOf(callback);
              if (idx !== -1) {
                subs.splice(idx, 1);
              }
            }
          };
        },
      ),
      emit: vi.fn(async (type: number, data: any) => {
        const subs = eventSubscribers.get(type);
        if (subs) {
          for (const sub of [...subs]) {
            await sub(type, data);
          }
        }
      }),
    };

    syncManager = new SyncManager(
      new ConsoleLogger(["SyncManager"]),
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

  const emitWriteReady = async (data: any): Promise<void> => {
    await mockEventBus.emit(ReactorEventTypes.JOB_WRITE_READY, data);
    await new Promise((resolve) => setTimeout(resolve, 10));
  };

  const emitJobFailed = async (data: any): Promise<void> => {
    await mockEventBus.emit(ReactorEventTypes.JOB_FAILED, data);
    await new Promise((resolve) => setTimeout(resolve, 10));
  };

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
          options: { sinceTimestampUtcMs: "0" },
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
        mockOperationIndex,
      );
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        ReactorEventTypes.JOB_WRITE_READY,
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
          options: { sinceTimestampUtcMs: "0" },
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
          options: { sinceTimestampUtcMs: "0" },
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

      expect(getTotalSubscriberCount()).toBe(7);

      syncManager.shutdown();

      expect(getTotalSubscriberCount()).toBe(0);
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
        { sinceTimestampUtcMs: "0" },
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
        mockOperationIndex,
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
      expect(remote.options).toEqual({ sinceTimestampUtcMs: "0" });
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
      expect(mockCursorStorage.remove).toHaveBeenCalledWith("remote1");
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

      vi.mocked(mockOperationIndex.find).mockResolvedValueOnce(
        createFindResult([
          {
            id: "op1",
            documentId: "doc1",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
        ]),
      );

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
            ordinal: 1,
          },
        },
      ];

      await emitWriteReady({
        jobId: "auto-job-1",
        operations,
        collectionMemberships: { doc1: ["collection1"] },
        jobMeta: { batchId: "auto-1", batchJobIds: ["auto-job-1"] },
      });

      expect(mockChannel.outbox.add).toHaveBeenCalled();
    });

    it("should query index for affected remotes and enqueue indexed operations", async () => {
      await syncManager.startup();

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add("remote1", "collection1", channelConfig, {
        documentId: ["doc1", "doc2"],
        scope: ["global"],
        branch: "main",
      });

      vi.mocked(mockOperationIndex.find).mockClear();
      vi.mocked(mockCursorStorage.get).mockClear();
      vi.mocked(mockCursorStorage.upsert).mockClear();
      vi.mocked(mockChannel.outbox.add).mockClear();

      vi.mocked(mockOperationIndex.find).mockResolvedValueOnce({
        results: [
          {
            id: "index-missed-op",
            index: 0,
            skip: 0,
            hash: "hash-index-missed",
            timestampUtcMs: "1000",
            action: {
              id: "action-index-missed",
              type: "CREATE",
              scope: "global",
              timestampUtcMs: "1000",
              input: {},
            },
            documentId: "doc1",
            documentType: "test",
            scope: "global",
            sourceRemote: "",
            branch: "main",
            ordinal: 1,
          },
          {
            id: "index-trigger-op",
            index: 1,
            skip: 0,
            hash: "hash-index-trigger",
            timestampUtcMs: "2000",
            action: {
              id: "action-index-trigger",
              type: "UPDATE",
              scope: "global",
              timestampUtcMs: "2000",
              input: {},
            },
            documentId: "doc2",
            documentType: "test",
            scope: "global",
            sourceRemote: "",
            branch: "main",
            ordinal: 2,
          },
        ],
        options: { cursor: "0", limit: 500 },
      });

      await emitWriteReady({
        jobId: "job-index-enqueue",
        operations: [
          {
            operation: {
              id: "payload-only-op",
              index: 0,
              skip: 0,
              hash: "hash-payload-only",
              timestampUtcMs: "2000",
              action: { type: "UPDATE", scope: "global" } as any,
            },
            context: {
              documentId: "doc2",
              documentType: "test",
              scope: "global",
              branch: "main",
              ordinal: 2,
            },
          },
        ],
        collectionMemberships: { doc2: ["collection1"] },
        jobMeta: {
          batchId: "auto-job-index-enqueue",
          batchJobIds: ["job-index-enqueue"],
        },
      });

      expect(mockOperationIndex.find).toHaveBeenCalledWith("collection1", 0, {
        excludeSourceRemote: "remote1",
      });

      const enqueuedOperationIds = vi
        .mocked(mockChannel.outbox.add)
        .mock.calls.flatMap((args) =>
          args.flatMap((syncOp) =>
            (syncOp as any).operations.map(
              (operation: OperationWithContext) => operation.operation.id,
            ),
          ),
        );

      expect(enqueuedOperationIds).toContain("index-missed-op");
      expect(enqueuedOperationIds).toContain("index-trigger-op");
      expect(enqueuedOperationIds).not.toContain("payload-only-op");
    });

    it("should anchor index query from max persisted cursor and outbox tail", async () => {
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

      // Pre-populate outbox with a SyncOperation at ordinal 9
      const tailSyncOp = new SyncOperation(
        "tail-syncop",
        "tail-job",
        [],
        "remote1",
        "doc1",
        ["global"],
        "main",
        [
          {
            operation: {
              id: "tail-op",
              index: 0,
              skip: 0,
              hash: "tail-hash",
              timestampUtcMs: "9000",
              action: { type: "CREATE", scope: "global" } as any,
            },
            context: {
              documentId: "doc1",
              documentType: "test",
              scope: "global",
              branch: "main",
              ordinal: 9,
            },
          },
        ],
      );
      mockChannel.outbox.add(tailSyncOp);
      vi.mocked(mockChannel.outbox.add).mockClear();

      vi.mocked(mockOperationIndex.find).mockClear();

      vi.mocked(mockOperationIndex.find).mockResolvedValueOnce({
        results: [
          {
            id: "index-op-10",
            index: 0,
            skip: 0,
            hash: "hash-index-10",
            timestampUtcMs: "10000",
            action: {
              id: "action-index-10",
              type: "UPDATE",
              scope: "global",
              timestampUtcMs: "10000",
              input: {},
            },
            documentId: "doc1",
            documentType: "test",
            scope: "global",
            sourceRemote: "",
            branch: "main",
            ordinal: 10,
          },
        ],
        options: { cursor: "0", limit: 500 },
      });

      await emitWriteReady({
        jobId: "job-checkpoint-max",
        operations: [
          {
            operation: {
              id: "event-op-10",
              index: 0,
              skip: 0,
              hash: "hash-event-10",
              timestampUtcMs: "10000",
              action: { type: "UPDATE", scope: "global" } as any,
            },
            context: {
              documentId: "doc1",
              documentType: "test",
              scope: "global",
              branch: "main",
              ordinal: 10,
            },
          },
        ],
        collectionMemberships: { doc1: ["collection1"] },
        jobMeta: {
          batchId: "auto-job-checkpoint-max",
          batchJobIds: ["job-checkpoint-max"],
        },
      });

      expect(mockOperationIndex.find).toHaveBeenCalledWith("collection1", 9, {
        excludeSourceRemote: "remote1",
      });
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
            ordinal: 1,
          },
        },
      ];

      await emitWriteReady({
        jobId: "auto-job-1",
        operations,
        jobMeta: { batchId: "auto-1", batchJobIds: ["auto-job-1"] },
      });

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
            ordinal: 1,
          },
        },
      ];

      await emitWriteReady({
        jobId: "auto-job-1",
        operations,
        jobMeta: { batchId: "auto-1", batchJobIds: ["auto-job-1"] },
      });

      expect(mockChannel.outbox.add).not.toHaveBeenCalled();
    });

    it("should call find with excludeSourceRemote matching remote name", async () => {
      await syncManager.startup();

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add(
        "my-remote",
        "collection1",
        channelConfig,
        { documentId: [], scope: [], branch: "main" },
        { sinceTimestampUtcMs: "0" },
      );

      vi.mocked(mockOperationIndex.find).mockClear();
      vi.mocked(mockOperationIndex.find).mockResolvedValueOnce(
        createFindResult([
          {
            id: "op1",
            documentId: "doc1",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
        ]),
      );

      await emitWriteReady({
        jobId: "job-exclude",
        operations: [
          {
            operation: {
              id: "op1",
              index: 0,
              skip: 0,
              hash: "hash1",
              timestampUtcMs: "1000",
              action: { type: "CREATE", scope: "global" } as any,
            },
            context: {
              documentId: "doc1",
              documentType: "test",
              scope: "global",
              branch: "main",
              ordinal: 1,
            },
          },
        ],
        collectionMemberships: { doc1: ["collection1"] },
        jobMeta: {
          batchId: "auto-job-exclude",
          batchJobIds: ["job-exclude"],
        },
      });

      expect(mockOperationIndex.find).toHaveBeenCalledWith("collection1", 0, {
        excludeSourceRemote: "my-remote",
      });
    });

    it("should use outbox.latestOrdinal as anchor for index query", async () => {
      await syncManager.startup();

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add(
        "remote1",
        "collection1",
        channelConfig,
        { documentId: [], scope: [], branch: "main" },
        { sinceTimestampUtcMs: "0" },
      );

      // Pre-populate outbox to ordinal 5
      const preSyncOp = new SyncOperation(
        "pre-syncop",
        "pre-job",
        [],
        "remote1",
        "doc1",
        ["global"],
        "main",
        [
          {
            operation: {
              id: "pre-op",
              index: 0,
              skip: 0,
              hash: "pre-hash",
              timestampUtcMs: "5000",
              action: { type: "CREATE", scope: "global" } as any,
            },
            context: {
              documentId: "doc1",
              documentType: "test",
              scope: "global",
              branch: "main",
              ordinal: 5,
            },
          },
        ],
      );
      mockChannel.outbox.add(preSyncOp);

      vi.mocked(mockOperationIndex.find).mockClear();
      vi.mocked(mockChannel.outbox.add).mockClear();
      vi.mocked(mockOperationIndex.find).mockResolvedValueOnce(
        createFindResult([
          {
            id: "op6",
            documentId: "doc1",
            scope: "global",
            branch: "main",
            ordinal: 6,
          },
        ]),
      );

      await emitWriteReady({
        jobId: "job-anchor",
        operations: [
          {
            operation: {
              id: "op6",
              index: 0,
              skip: 0,
              hash: "hash6",
              timestampUtcMs: "6000",
              action: { type: "UPDATE", scope: "global" } as any,
            },
            context: {
              documentId: "doc1",
              documentType: "test",
              scope: "global",
              branch: "main",
              ordinal: 6,
            },
          },
        ],
        collectionMemberships: { doc1: ["collection1"] },
        jobMeta: {
          batchId: "auto-job-anchor",
          batchJobIds: ["job-anchor"],
        },
      });

      expect(mockOperationIndex.find).toHaveBeenCalledWith("collection1", 5, {
        excludeSourceRemote: "remote1",
      });
    });
  });

  describe("ADD_RELATIONSHIP membership derivation", () => {
    it("should derive collection membership from ADD_RELATIONSHIP and route ops", async () => {
      await syncManager.startup();

      const driveId = "drive-1";
      const targetDocId = "new-doc-1";
      const collectionId = `drive.main.${driveId}`;

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add(
        "remote1",
        collectionId,
        channelConfig,
        { documentId: [], scope: [], branch: "main" },
        { sinceTimestampUtcMs: "0" },
      );

      vi.mocked(mockOperationIndex.find).mockResolvedValueOnce(
        createFindResult([
          {
            id: "op-create",
            documentId: targetDocId,
            scope: "document",
            branch: "main",
            ordinal: 1,
          },
          {
            id: "op-add-rel",
            documentId: driveId,
            scope: "document",
            branch: "main",
            ordinal: 2,
          },
        ]),
      );

      const batchId = "batch-membership";
      const batchJobIds = ["j1", "j2"];

      // Event 1: CREATE_DOCUMENT for the target doc
      const event1Operations: OperationWithContext[] = [
        {
          operation: {
            id: "op-create",
            index: 0,
            skip: 0,
            hash: "hash-create",
            timestampUtcMs: "1000",
            action: {
              id: "action-create",
              type: "CREATE_DOCUMENT",
              scope: "document",
              timestampUtcMs: "1000",
              input: {},
            } as any,
          },
          context: {
            documentId: targetDocId,
            documentType: "powerhouse/document-model",
            scope: "document",
            branch: "main",
            ordinal: 1,
          },
        },
      ];

      // Event 2: ADD_RELATIONSHIP on the drive (establishes membership)
      const event2Operations: OperationWithContext[] = [
        {
          operation: {
            id: "op-add-rel",
            index: 0,
            skip: 0,
            hash: "hash-rel",
            timestampUtcMs: "2000",
            action: {
              id: "action-add-rel",
              type: "ADD_RELATIONSHIP",
              scope: "document",
              timestampUtcMs: "2000",
              input: {
                sourceId: driveId,
                targetId: targetDocId,
                relationshipType: "child",
              },
            } as any,
          },
          context: {
            documentId: driveId,
            documentType: "powerhouse/document-drive",
            scope: "document",
            branch: "main",
            ordinal: 2,
          },
        },
      ];

      await emitWriteReady({
        jobId: "j1",
        operations: event1Operations,
        jobMeta: { batchId, batchJobIds },
        collectionMemberships: { [targetDocId]: [collectionId] },
      });

      await emitWriteReady({
        jobId: "j2",
        operations: event2Operations,
        jobMeta: { batchId, batchJobIds },
        collectionMemberships: { [driveId]: [collectionId] },
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      // No backfill should occur
      expect(mockOperationIndex.get).not.toHaveBeenCalled();

      // Both events should be routed (membership derived from ADD_RELATIONSHIP in pre-pass)
      expect(mockChannel.outbox.add).toHaveBeenCalled();
    });

    it("should not route operations to non-matching collections", async () => {
      await syncManager.startup();

      const driveId = "drive-3";
      const targetDocId = "new-doc-3";
      const collectionId = `drive.main.${driveId}`;

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add(
        "remote-other-collection",
        "other-collection",
        channelConfig,
        { documentId: [], scope: [], branch: "main" },
        { sinceTimestampUtcMs: "0" },
      );

      vi.mocked(mockChannel.outbox.add).mockClear();

      const addRelationshipOps: OperationWithContext[] = [
        {
          operation: {
            id: "op-add-rel",
            index: 0,
            skip: 0,
            hash: "hash-2",
            timestampUtcMs: "1704067201000",
            action: {
              id: "action-add-rel",
              type: "ADD_RELATIONSHIP",
              scope: "document",
              timestampUtcMs: "1704067201000",
              input: {
                sourceId: driveId,
                targetId: targetDocId,
                relationshipType: "child",
              },
            } as any,
          },
          context: {
            documentId: driveId,
            documentType: "powerhouse/document-drive",
            scope: "document",
            branch: "main",
            ordinal: 2,
          },
        },
      ];

      await emitWriteReady({
        jobId: "test-job",
        operations: addRelationshipOps,
        jobMeta: { batchId: "auto-test-job", batchJobIds: ["test-job"] },
        collectionMemberships: { [driveId]: [collectionId] },
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const outboxCalls = vi.mocked(mockChannel.outbox.add).mock.calls;
      const retroactiveSyncCalls = outboxCalls.filter((call) => {
        return call.some((syncOp: any) => syncOp.documentId === targetDocId);
      });
      expect(retroactiveSyncCalls).toHaveLength(0);
    });
  });

  describe("serial event processing", () => {
    it("should process events serially, one at a time", async () => {
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

      vi.mocked(mockOperationIndex.find).mockResolvedValueOnce(
        createFindResult([
          {
            id: "op1",
            documentId: "doc1",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
        ]),
      );
      vi.mocked(mockOperationIndex.find).mockResolvedValueOnce(
        createFindResult([
          {
            id: "op2",
            documentId: "doc1",
            scope: "global",
            branch: "main",
            ordinal: 2,
          },
        ]),
      );

      const event1Operations: OperationWithContext[] = [
        {
          operation: {
            id: "op1",
            index: 0,
            skip: 0,
            hash: "hash1",
            timestampUtcMs: "1000",
            action: { type: "CREATE", scope: "global" } as any,
          },
          context: {
            documentId: "doc1",
            documentType: "test",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
        },
      ];

      const event2Operations: OperationWithContext[] = [
        {
          operation: {
            id: "op2",
            index: 0,
            skip: 0,
            hash: "hash2",
            timestampUtcMs: "2000",
            action: { type: "UPDATE", scope: "global" } as any,
          },
          context: {
            documentId: "doc1",
            documentType: "test",
            scope: "global",
            branch: "main",
            ordinal: 2,
          },
        },
      ];

      // Emit both events quickly
      await emitWriteReady({
        jobId: "job1",
        operations: event1Operations,
        collectionMemberships: { doc1: ["collection1"] },
        jobMeta: { batchId: "auto-job1", batchJobIds: ["job1"] },
      });
      await emitWriteReady({
        jobId: "job2",
        operations: event2Operations,
        collectionMemberships: { doc1: ["collection1"] },
        jobMeta: { batchId: "auto-job2", batchJobIds: ["job2"] },
      });

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Both events should have been processed
      expect(mockChannel.outbox.add).toHaveBeenCalledTimes(2);
    });

    it("should clear queue on shutdown and not process remaining events", async () => {
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
            timestampUtcMs: "1000",
            action: { type: "CREATE", scope: "global" } as any,
          },
          context: {
            documentId: "doc1",
            documentType: "test",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
        },
      ];

      // Shutdown immediately after emitting event
      // Shutdown first, then emit - the event should not be processed
      syncManager.shutdown();

      // Clear the mock to track only post-shutdown calls
      vi.mocked(mockChannel.outbox.add).mockClear();

      // This event should not be processed since we're shutdown
      await emitWriteReady({
        jobId: "post-shutdown-job",
        operations,
        jobMeta: {
          batchId: "auto-post-shutdown-job",
          batchJobIds: ["post-shutdown-job"],
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      // No operations should have been added after shutdown
      expect(mockChannel.outbox.add).not.toHaveBeenCalled();
    });
  });

  describe("batch-aware processing", () => {
    it("should buffer first event and process on batch completion", async () => {
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

      vi.mocked(mockOperationIndex.find).mockResolvedValueOnce(
        createFindResult([
          {
            id: "op1",
            documentId: "doc1",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
          {
            id: "op2",
            documentId: "doc1",
            scope: "global",
            branch: "main",
            ordinal: 2,
          },
        ]),
      );

      const batchId = "batch-1";
      const batchJobIds = ["j1", "j2"];

      const event1Operations: OperationWithContext[] = [
        {
          operation: {
            id: "op1",
            index: 0,
            skip: 0,
            hash: "hash1",
            timestampUtcMs: "1000",
            action: { type: "CREATE", scope: "global" } as any,
          },
          context: {
            documentId: "doc1",
            documentType: "test",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
        },
      ];

      const event2Operations: OperationWithContext[] = [
        {
          operation: {
            id: "op2",
            index: 1,
            skip: 0,
            hash: "hash2",
            timestampUtcMs: "2000",
            action: { type: "UPDATE", scope: "global" } as any,
          },
          context: {
            documentId: "doc1",
            documentType: "test",
            scope: "global",
            branch: "main",
            ordinal: 2,
          },
        },
      ];

      await emitWriteReady({
        jobId: "j1",
        operations: event1Operations,
        collectionMemberships: { doc1: ["collection1"] },
        jobMeta: { batchId, batchJobIds },
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockChannel.outbox.add).not.toHaveBeenCalled();

      await emitWriteReady({
        jobId: "j2",
        operations: event2Operations,
        collectionMemberships: { doc1: ["collection1"] },
        jobMeta: { batchId, batchJobIds },
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      // updateOutbox calls outbox.add once with all SyncOps spread
      expect(mockChannel.outbox.add).toHaveBeenCalledTimes(1);
    });

    it("should treat single-job batch as non-batch", async () => {
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

      vi.mocked(mockOperationIndex.find).mockResolvedValueOnce(
        createFindResult([
          {
            id: "op1",
            documentId: "doc1",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
        ]),
      );

      const operations: OperationWithContext[] = [
        {
          operation: {
            id: "op1",
            index: 0,
            skip: 0,
            hash: "hash1",
            timestampUtcMs: "1000",
            action: { type: "CREATE", scope: "global" } as any,
          },
          context: {
            documentId: "doc1",
            documentType: "test",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
        },
      ];

      await emitWriteReady({
        jobId: "j1",
        operations,
        collectionMemberships: { doc1: ["collection1"] },
        jobMeta: { batchId: "batch-single", batchJobIds: ["j1"] },
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockChannel.outbox.add).toHaveBeenCalledTimes(1);
    });

    it("should treat single-job batchJobIds as non-batch", async () => {
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

      vi.mocked(mockOperationIndex.find).mockResolvedValueOnce(
        createFindResult([
          {
            id: "op1",
            documentId: "doc1",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
        ]),
      );

      const operations: OperationWithContext[] = [
        {
          operation: {
            id: "op1",
            index: 0,
            skip: 0,
            hash: "hash1",
            timestampUtcMs: "1000",
            action: { type: "CREATE", scope: "global" } as any,
          },
          context: {
            documentId: "doc1",
            documentType: "test",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
        },
      ];

      await emitWriteReady({
        jobId: "j1",
        operations,
        collectionMemberships: { doc1: ["collection1"] },
        jobMeta: { batchId: "auto-1", batchJobIds: ["j1"] },
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockChannel.outbox.add).toHaveBeenCalledTimes(1);
    });

    it("should clear pending batches on shutdown", async () => {
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

      const batchId = "batch-incomplete";
      const batchJobIds = ["j1", "j2"];

      const operations: OperationWithContext[] = [
        {
          operation: {
            id: "op1",
            index: 0,
            skip: 0,
            hash: "hash1",
            timestampUtcMs: "1000",
            action: { type: "CREATE", scope: "global" } as any,
          },
          context: {
            documentId: "doc1",
            documentType: "test",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
        },
      ];

      await emitWriteReady({
        jobId: "j1",
        operations,
        jobMeta: { batchId, batchJobIds },
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockChannel.outbox.add).not.toHaveBeenCalled();

      syncManager.shutdown();

      // After shutdown, the second event should not trigger processing
      // (the subscriber is removed, and even if called, isShutdown prevents processing)
    });

    it("should skip backfill when target document ops are in the batch", async () => {
      await syncManager.startup();

      const driveId = "drive-batch";
      const targetDocId = "new-doc-batch";
      const collectionId = `drive.main.${driveId}`;

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add(
        "remote1",
        collectionId,
        channelConfig,
        { documentId: [], scope: [], branch: "main" },
        { sinceTimestampUtcMs: "0" },
      );

      vi.mocked(mockOperationIndex.find).mockResolvedValueOnce(
        createFindResult([
          {
            id: "op-create",
            documentId: targetDocId,
            scope: "document",
            branch: "main",
            ordinal: 1,
          },
          {
            id: "op-add-rel",
            documentId: driveId,
            scope: "document",
            branch: "main",
            ordinal: 2,
          },
        ]),
      );

      const batchId = "batch-with-create";
      const batchJobIds = ["j1", "j2"];

      // Event 1: CREATE_DOCUMENT for the target doc
      const event1Operations: OperationWithContext[] = [
        {
          operation: {
            id: "op-create",
            index: 0,
            skip: 0,
            hash: "hash-create",
            timestampUtcMs: "1000",
            action: {
              id: "action-create",
              type: "CREATE_DOCUMENT",
              scope: "document",
              timestampUtcMs: "1000",
              input: {},
            } as any,
          },
          context: {
            documentId: targetDocId,
            documentType: "powerhouse/document-model",
            scope: "document",
            branch: "main",
            ordinal: 1,
          },
        },
      ];

      // Event 2: ADD_RELATIONSHIP on the drive
      const event2Operations: OperationWithContext[] = [
        {
          operation: {
            id: "op-add-rel",
            index: 0,
            skip: 0,
            hash: "hash-rel",
            timestampUtcMs: "2000",
            action: {
              id: "action-add-rel",
              type: "ADD_RELATIONSHIP",
              scope: "document",
              timestampUtcMs: "2000",
              input: {
                sourceId: driveId,
                targetId: targetDocId,
                relationshipType: "child",
              },
            } as any,
          },
          context: {
            documentId: driveId,
            documentType: "powerhouse/document-drive",
            scope: "document",
            branch: "main",
            ordinal: 2,
          },
        },
      ];

      await emitWriteReady({
        jobId: "j1",
        operations: event1Operations,
        jobMeta: { batchId, batchJobIds },
        collectionMemberships: { [targetDocId]: [collectionId] },
      });

      await emitWriteReady({
        jobId: "j2",
        operations: event2Operations,
        jobMeta: { batchId, batchJobIds },
        collectionMemberships: { [driveId]: [collectionId] },
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      // operationIndex.get should NOT be called because backfill is skipped
      expect(mockOperationIndex.get).not.toHaveBeenCalled();

      // Both events' operations should be in the outbox
      expect(mockChannel.outbox.add).toHaveBeenCalled();
    });

    it("should merge collection memberships from all batch events", async () => {
      await syncManager.startup();

      const collectionId = "merged-collection";
      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add(
        "remote1",
        collectionId,
        channelConfig,
        { documentId: [], scope: [], branch: "main" },
        { sinceTimestampUtcMs: "0" },
      );

      vi.mocked(mockOperationIndex.find).mockResolvedValueOnce(
        createFindResult([
          {
            id: "op1",
            documentId: "doc-a",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
          {
            id: "op2",
            documentId: "doc-b",
            scope: "global",
            branch: "main",
            ordinal: 2,
          },
        ]),
      );

      const batchId = "batch-merge";
      const batchJobIds = ["j1", "j2"];

      // Event 1: doc-a is in collection
      const event1Operations: OperationWithContext[] = [
        {
          operation: {
            id: "op1",
            index: 0,
            skip: 0,
            hash: "hash1",
            timestampUtcMs: "1000",
            action: { type: "CREATE", scope: "global" } as any,
          },
          context: {
            documentId: "doc-a",
            documentType: "test",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
        },
      ];

      // Event 2: doc-b is in collection
      const event2Operations: OperationWithContext[] = [
        {
          operation: {
            id: "op2",
            index: 0,
            skip: 0,
            hash: "hash2",
            timestampUtcMs: "2000",
            action: { type: "CREATE", scope: "global" } as any,
          },
          context: {
            documentId: "doc-b",
            documentType: "test",
            scope: "global",
            branch: "main",
            ordinal: 2,
          },
        },
      ];

      // Event 1 only knows about doc-a's membership
      await emitWriteReady({
        jobId: "j1",
        operations: event1Operations,
        jobMeta: { batchId, batchJobIds },
        collectionMemberships: { "doc-a": [collectionId] },
      });

      // Event 2 only knows about doc-b's membership
      await emitWriteReady({
        jobId: "j2",
        operations: event2Operations,
        jobMeta: { batchId, batchJobIds },
        collectionMemberships: { "doc-b": [collectionId] },
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      // updateOutbox calls outbox.add once with all SyncOps (2 documents = 2 SyncOps)
      expect(mockChannel.outbox.add).toHaveBeenCalledTimes(1);
      const args = vi.mocked(mockChannel.outbox.add).mock.calls[0];
      expect(args).toHaveLength(2);
    });

    it("should populate jobDependencies for SyncOps from later batch events", async () => {
      await syncManager.startup();

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add(
        "remote1",
        "collection1",
        channelConfig,
        { documentId: [], scope: [], branch: "main" },
        { sinceTimestampUtcMs: "0" },
      );

      // Return 2 operations for different documents so batchOperationsByDocument
      // produces 2 SyncOps with chained dependencies
      vi.mocked(mockOperationIndex.find).mockResolvedValueOnce(
        createFindResult([
          {
            id: "op1",
            documentId: "doc1",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
          {
            id: "op2",
            documentId: "doc2",
            scope: "global",
            branch: "main",
            ordinal: 2,
          },
        ]),
      );

      const batchId = "batch-deps";
      const batchJobIds = ["j1", "j2"];

      const event1Operations: OperationWithContext[] = [
        {
          operation: {
            id: "op1",
            index: 0,
            skip: 0,
            hash: "hash1",
            timestampUtcMs: "1000",
            action: { type: "CREATE", scope: "global" } as any,
          },
          context: {
            documentId: "doc1",
            documentType: "test",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
        },
      ];

      const event2Operations: OperationWithContext[] = [
        {
          operation: {
            id: "op2",
            index: 0,
            skip: 0,
            hash: "hash2",
            timestampUtcMs: "2000",
            action: { type: "CREATE", scope: "global" } as any,
          },
          context: {
            documentId: "doc2",
            documentType: "test",
            scope: "global",
            branch: "main",
            ordinal: 2,
          },
        },
      ];

      const addedSyncOps: any[] = [];
      vi.mocked(mockChannel.outbox.add).mockImplementation(
        (...syncOps: any[]) => {
          addedSyncOps.push(...syncOps);
        },
      );

      await emitWriteReady({
        jobId: "j1",
        operations: event1Operations,
        collectionMemberships: { doc1: ["collection1"] },
        jobMeta: { batchId, batchJobIds },
      });

      await emitWriteReady({
        jobId: "j2",
        operations: event2Operations,
        collectionMemberships: { doc2: ["collection1"] },
        jobMeta: { batchId, batchJobIds },
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(addedSyncOps).toHaveLength(2);
      // First SyncOp should have empty prevJobId dependency
      expect(addedSyncOps[0].jobDependencies).toEqual([""]);
      // Second SyncOp should depend on the first SyncOp's jobId
      expect(addedSyncOps[1].jobDependencies).toEqual([addedSyncOps[0].jobId]);
    });

    it("should flush partial batch on JOB_FAILED", async () => {
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

      vi.mocked(mockOperationIndex.find).mockResolvedValueOnce(
        createFindResult([
          {
            id: "op1",
            documentId: "doc1",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
        ]),
      );

      const batchId = "batch-fail";
      const batchJobIds = ["j1", "j2"];

      const event1Operations: OperationWithContext[] = [
        {
          operation: {
            id: "op1",
            index: 0,
            skip: 0,
            hash: "hash1",
            timestampUtcMs: "1000",
            action: { type: "CREATE", scope: "global" } as any,
          },
          context: {
            documentId: "doc1",
            documentType: "test",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
        },
      ];

      // Send first event of the batch
      await emitWriteReady({
        jobId: "j1",
        operations: event1Operations,
        collectionMemberships: { doc1: ["collection1"] },
        jobMeta: { batchId, batchJobIds },
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockChannel.outbox.add).not.toHaveBeenCalled();

      // Simulate JOB_FAILED for the second job
      await emitJobFailed({
        jobId: "j2",
        error: new Error("Job failed"),
        job: { meta: { batchId, batchJobIds } },
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      // The partial batch should have been flushed with the one event we had
      expect(mockChannel.outbox.add).toHaveBeenCalledTimes(1);
    });
  });

  describe("inbox batch processing", () => {
    it("should call reactor.loadBatch for keyed SyncOps", async () => {
      await syncManager.startup();

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      const mockChannel2 = {
        inbox: {
          items: [] as any[],
          add: vi.fn(),
          remove: vi.fn(),
          get: vi.fn(),
          onAdded: vi.fn(),
          onRemoved: vi.fn(),
          pause: vi.fn(),
          resume: vi.fn(),
          isPaused: vi.fn().mockReturnValue(false),
          flush: vi.fn(),
        },
        outbox: {
          items: [] as any[],
          add: vi.fn(),
          remove: vi.fn(),
          get: vi.fn(),
          onAdded: vi.fn(),
          onRemoved: vi.fn(),
          pause: vi.fn(),
          resume: vi.fn(),
          isPaused: vi.fn().mockReturnValue(false),
          flush: vi.fn(),
        },
        deadLetter: {
          items: [] as any[],
          add: vi.fn(),
          remove: vi.fn(),
          get: vi.fn(),
          onAdded: vi.fn(),
          onRemoved: vi.fn(),
          pause: vi.fn(),
          resume: vi.fn(),
          isPaused: vi.fn().mockReturnValue(false),
          flush: vi.fn(),
        },
        init: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn(),
        updateCursor: vi.fn(),
        getHealth: vi.fn(),
        poller: {} as any,
        config: {} as any,
      } as any;

      vi.mocked(mockChannelFactory.instance).mockReturnValue(mockChannel2);

      await syncManager.add("remote-inbox", "collection1", channelConfig, {
        documentId: ["doc1"],
        scope: ["global"],
        branch: "main",
      });

      const { SyncOperation: SyncOp } = await import(
        "../../../src/sync/sync-operation.js"
      );

      const syncOp1 = new SyncOp(
        "syncop-1",
        "key-0",
        [],
        "remote-inbox",
        "doc1",
        ["global"],
        "main",
        [
          {
            operation: {
              id: "op1",
              index: 0,
              skip: 0,
              hash: "h1",
              timestampUtcMs: "1000",
              action: { type: "CREATE", scope: "global" } as any,
            },
            context: {
              documentId: "doc1",
              documentType: "test",
              scope: "global",
              branch: "main",
              ordinal: 1,
            },
          },
        ],
      );

      const syncOp2 = new SyncOp(
        "syncop-2",
        "key-1",
        ["key-0"],
        "remote-inbox",
        "doc1",
        ["global"],
        "main",
        [
          {
            operation: {
              id: "op2",
              index: 1,
              skip: 0,
              hash: "h2",
              timestampUtcMs: "2000",
              action: { type: "UPDATE", scope: "global" } as any,
            },
            context: {
              documentId: "doc1",
              documentType: "test",
              scope: "global",
              branch: "main",
              ordinal: 2,
            },
          },
        ],
      );

      vi.mocked(mockReactor as any).loadBatch = vi.fn().mockResolvedValue({
        jobs: {
          "key-0": { id: "reactor-job-0", status: "PENDING" },
          "key-1": { id: "reactor-job-1", status: "PENDING" },
        },
      });

      // Get the inbox onAdded callback
      const inboxCallback = vi.mocked(mockChannel2.inbox.onAdded).mock
        .calls[0][0];

      // Simulate batch arrival (multiple items at once)
      inboxCallback([syncOp1, syncOp2]);

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect((mockReactor as any).loadBatch).toHaveBeenCalledWith(
        {
          jobs: [
            expect.objectContaining({
              key: "key-0",
              documentId: "doc1",
              dependsOn: [],
            }),
            expect.objectContaining({
              key: "key-1",
              documentId: "doc1",
              dependsOn: ["key-0"],
            }),
          ],
        },
        undefined,
        { sourceRemote: "remote-inbox" },
      );
    });

    it("should call reactor.load for non-keyed SyncOps individually", async () => {
      await syncManager.startup();

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      const mockChannel2 = {
        inbox: {
          items: [] as any[],
          add: vi.fn(),
          remove: vi.fn(),
          get: vi.fn(),
          onAdded: vi.fn(),
          onRemoved: vi.fn(),
          pause: vi.fn(),
          resume: vi.fn(),
          isPaused: vi.fn().mockReturnValue(false),
          flush: vi.fn(),
        },
        outbox: {
          items: [] as any[],
          add: vi.fn(),
          remove: vi.fn(),
          get: vi.fn(),
          onAdded: vi.fn(),
          onRemoved: vi.fn(),
          pause: vi.fn(),
          resume: vi.fn(),
          isPaused: vi.fn().mockReturnValue(false),
          flush: vi.fn(),
        },
        deadLetter: {
          items: [] as any[],
          add: vi.fn(),
          remove: vi.fn(),
          get: vi.fn(),
          onAdded: vi.fn(),
          onRemoved: vi.fn(),
          pause: vi.fn(),
          resume: vi.fn(),
          isPaused: vi.fn().mockReturnValue(false),
          flush: vi.fn(),
        },
        init: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn(),
        updateCursor: vi.fn(),
        getHealth: vi.fn(),
        poller: {} as any,
        config: {} as any,
      } as any;

      vi.mocked(mockChannelFactory.instance).mockReturnValue(mockChannel2);

      await syncManager.add("remote-inbox2", "collection1", channelConfig, {
        documentId: ["doc1"],
        scope: ["global"],
        branch: "main",
      });

      const { SyncOperation: SyncOp } = await import(
        "../../../src/sync/sync-operation.js"
      );

      // Non-keyed SyncOp (empty jobId)
      const syncOp = new SyncOp(
        "syncop-1",
        "",
        [],
        "remote-inbox2",
        "doc1",
        ["global"],
        "main",
        [
          {
            operation: {
              id: "op1",
              index: 0,
              skip: 0,
              hash: "h1",
              timestampUtcMs: "1000",
              action: { type: "CREATE", scope: "global" } as any,
            },
            context: {
              documentId: "doc1",
              documentType: "test",
              scope: "global",
              branch: "main",
              ordinal: 1,
            },
          },
        ],
      );

      // Get the inbox onAdded callback
      const inboxCallback = vi.mocked(mockChannel2.inbox.onAdded).mock
        .calls[0][0];

      // Simulate single non-keyed item arrival
      inboxCallback([syncOp]);

      await new Promise((resolve) => setTimeout(resolve, 20));

      // Should call reactor.load (not loadBatch)
      expect(mockReactor.load).toHaveBeenCalledWith(
        "doc1",
        "main",
        expect.any(Array),
        undefined,
        { sourceRemote: "remote-inbox2" },
      );
    });

    it("should handle loadBatch failure by marking all SyncOps as failed", async () => {
      await syncManager.startup();

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      const mockChannel2 = {
        inbox: {
          items: [] as any[],
          add: vi.fn(),
          remove: vi.fn(),
          get: vi.fn(),
          onAdded: vi.fn(),
          onRemoved: vi.fn(),
          pause: vi.fn(),
          resume: vi.fn(),
          isPaused: vi.fn().mockReturnValue(false),
          flush: vi.fn(),
        },
        outbox: {
          items: [] as any[],
          add: vi.fn(),
          remove: vi.fn(),
          get: vi.fn(),
          onAdded: vi.fn(),
          onRemoved: vi.fn(),
          pause: vi.fn(),
          resume: vi.fn(),
          isPaused: vi.fn().mockReturnValue(false),
          flush: vi.fn(),
        },
        deadLetter: {
          items: [] as any[],
          add: vi.fn(),
          remove: vi.fn(),
          get: vi.fn(),
          onAdded: vi.fn(),
          onRemoved: vi.fn(),
          pause: vi.fn(),
          resume: vi.fn(),
          isPaused: vi.fn().mockReturnValue(false),
          flush: vi.fn(),
        },
        init: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn(),
        updateCursor: vi.fn(),
        getHealth: vi.fn(),
        poller: {} as any,
        config: {} as any,
      } as any;

      vi.mocked(mockChannelFactory.instance).mockReturnValue(mockChannel2);

      await syncManager.add("remote-inbox3", "collection1", channelConfig, {
        documentId: ["doc1"],
        scope: ["global"],
        branch: "main",
      });

      const { SyncOperation: SyncOp } = await import(
        "../../../src/sync/sync-operation.js"
      );

      const syncOp1 = new SyncOp(
        "syncop-1",
        "key-0",
        [],
        "remote-inbox3",
        "doc1",
        ["global"],
        "main",
        [
          {
            operation: {
              id: "op1",
              index: 0,
              skip: 0,
              hash: "h1",
              timestampUtcMs: "1000",
              action: { type: "CREATE", scope: "global" } as any,
            },
            context: {
              documentId: "doc1",
              documentType: "test",
              scope: "global",
              branch: "main",
              ordinal: 1,
            },
          },
        ],
      );

      const syncOp2 = new SyncOp(
        "syncop-2",
        "key-1",
        ["key-0"],
        "remote-inbox3",
        "doc1",
        ["global"],
        "main",
        [
          {
            operation: {
              id: "op2",
              index: 1,
              skip: 0,
              hash: "h2",
              timestampUtcMs: "2000",
              action: { type: "UPDATE", scope: "global" } as any,
            },
            context: {
              documentId: "doc1",
              documentType: "test",
              scope: "global",
              branch: "main",
              ordinal: 2,
            },
          },
        ],
      );

      vi.mocked(mockReactor as any).loadBatch = vi
        .fn()
        .mockRejectedValue(new Error("Batch load failed"));

      const inboxCallback = vi.mocked(mockChannel2.inbox.onAdded).mock
        .calls[0][0];

      inboxCallback([syncOp1, syncOp2]);

      await new Promise((resolve) => setTimeout(resolve, 20));

      // Both SyncOps should be moved to dead letter
      expect(mockChannel2.deadLetter.add).toHaveBeenCalledTimes(2);
      expect(mockChannel2.inbox.remove).toHaveBeenCalledTimes(2);

      // Both SyncOps should be in error state
      const { SyncOperationStatus } = await import(
        "../../../src/sync/types.js"
      );
      expect(syncOp1.status).toBe(SyncOperationStatus.Error);
      expect(syncOp2.status).toBe(SyncOperationStatus.Error);
    });
  });
});

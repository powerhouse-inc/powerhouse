import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IOperationIndex } from "../../../src/cache/operation-index-types.js";
import { driveCollectionId } from "../../../src/cache/operation-index-types.js";
import type { IReactor } from "../../../src/core/types.js";
import type { IEventBus } from "../../../src/events/interfaces.js";
import { ReactorEventTypes } from "../../../src/events/types.js";
import { ChannelErrorSource, SyncEventTypes } from "../../../src/sync/types.js";
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
import type { SyncOperation } from "../../../src/sync/sync-operation.js";
import { ChannelError } from "../../../src/sync/errors.js";
import type { ChannelConfig } from "../../../src/sync/types.js";

describe("SyncManager - Event Tests", () => {
  let syncManager: SyncManager;
  let mockRemoteStorage: ISyncRemoteStorage;
  let mockCursorStorage: ISyncCursorStorage;
  let mockChannelFactory: IChannelFactory;
  let mockOperationIndex: IOperationIndex;
  let mockReactor: IReactor;
  let mockEventBus: IEventBus;
  let mockChannel: IChannel;
  let eventSubscribers: Map<number, (type: number, data: unknown) => void>;
  let emittedEvents: Array<{ type: number; data: unknown }>;

  beforeEach(() => {
    eventSubscribers = new Map();
    emittedEvents = [];

    mockChannel = {
      inbox: {
        items: [],
        add: vi.fn(),
        remove: vi.fn(),
        get: vi.fn(),
        onAdded: vi.fn(),
        onRemoved: vi.fn(),
      },
      outbox: {
        items: [],
        add: vi.fn(),
        remove: vi.fn(),
        get: vi.fn(),
        onAdded: vi.fn(),
        onRemoved: vi.fn(),
      },
      deadLetter: {
        items: [],
        add: vi.fn(),
        remove: vi.fn(),
        get: vi.fn(),
        onAdded: vi.fn(),
        onRemoved: vi.fn(),
      },
      init: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn(),
    } as unknown as IChannel;

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
        options: { cursor: "0", limit: 100 },
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
    } as unknown as IReactor;

    mockEventBus = {
      subscribe: vi.fn((type, callback) => {
        eventSubscribers.set(type, callback);
        return () => {
          eventSubscribers.delete(type);
        };
      }),
      emit: vi.fn((type, data) => {
        emittedEvents.push({ type, data });
        return Promise.resolve();
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

  const createOperation = (
    documentId: string,
    opId: string,
  ): OperationWithContext => ({
    operation: {
      id: opId,
      index: 0,
      skip: 0,
      hash: `hash-${opId}`,
      timestampUtcMs: "2023-01-01T00:00:00.000Z",
      action: { type: "CREATE", scope: "global" } as unknown as never,
    },
    context: {
      documentId,
      documentType: "test",
      scope: "global",
      branch: "main",
      ordinal: 1,
    },
  });

  const triggerWriteReady = async (
    jobId: string,
    operations: OperationWithContext[],
  ): Promise<void> => {
    const subscriber = eventSubscribers.get(ReactorEventTypes.JOB_WRITE_READY);
    if (subscriber) {
      subscriber(ReactorEventTypes.JOB_WRITE_READY, {
        jobId,
        operations,
        jobMeta: { batchId: `auto-${jobId}`, batchJobIds: [jobId] },
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  const getLastSyncOpFromOutbox = (): unknown => {
    const addCalls = vi.mocked(mockChannel.outbox.add).mock.calls;
    if (addCalls.length === 0) {
      return undefined;
    }
    return addCalls[addCalls.length - 1][0];
  };

  describe("Basic Emission", () => {
    it("SYNC_PENDING emits with correct jobId, syncOperationCount, remoteNames", async () => {
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

      const operations = [createOperation("doc1", "op1")];
      await triggerWriteReady("job-1", operations);

      const pendingEvents = emittedEvents.filter(
        (e) => e.type === SyncEventTypes.SYNC_PENDING,
      );
      expect(pendingEvents).toHaveLength(1);

      const pendingEvent = pendingEvents[0].data as {
        jobId: string;
        syncOperationCount: number;
        remoteNames: string[];
      };
      expect(pendingEvent.jobId).toBe("job-1");
      expect(pendingEvent.syncOperationCount).toBe(1);
      expect(pendingEvent.remoteNames).toEqual(["remote1"]);
    });

    it("SYNC_SUCCEEDED emits when all ops complete", async () => {
      await syncManager.startup();

      let outboxCallback: ((syncOps: SyncOperation[]) => void) | undefined;
      vi.mocked(mockChannel.outbox.onAdded).mockImplementation((cb) => {
        outboxCallback = cb;
      });

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add("remote1", "collection1", channelConfig, {
        documentId: ["doc1"],
        scope: ["global"],
        branch: "main",
      });

      vi.mocked(mockChannel.outbox.add).mockImplementation((syncOp) => {
        if (outboxCallback) {
          outboxCallback([syncOp]);
        }
      });

      const operations = [createOperation("doc1", "op1")];
      await triggerWriteReady("job-2", operations);

      const syncOp = getLastSyncOpFromOutbox() as { executed: () => void };
      expect(syncOp).toBeDefined();
      syncOp.executed();

      const succeededEvents = emittedEvents.filter(
        (e) => e.type === SyncEventTypes.SYNC_SUCCEEDED,
      );
      expect(succeededEvents).toHaveLength(1);

      const succeededEvent = succeededEvents[0].data as {
        jobId: string;
        syncOperationCount: number;
      };
      expect(succeededEvent.jobId).toBe("job-2");
      expect(succeededEvent.syncOperationCount).toBe(1);
    });

    it("SYNC_FAILED emits when any op fails with correct successCount, failureCount, errors", async () => {
      await syncManager.startup();

      let outboxCallback: ((syncOps: SyncOperation[]) => void) | undefined;
      vi.mocked(mockChannel.outbox.onAdded).mockImplementation((cb) => {
        outboxCallback = cb;
      });

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add("remote1", "collection1", channelConfig, {
        documentId: ["doc1"],
        scope: ["global"],
        branch: "main",
      });

      vi.mocked(mockChannel.outbox.add).mockImplementation((syncOp) => {
        if (outboxCallback) {
          outboxCallback([syncOp]);
        }
      });

      const operations = [createOperation("doc1", "op1")];
      await triggerWriteReady("job-3", operations);

      const syncOp = getLastSyncOpFromOutbox() as {
        failed: (err: ChannelError) => void;
      };
      expect(syncOp).toBeDefined();

      const error = new ChannelError(
        ChannelErrorSource.Outbox,
        new Error("Network error"),
      );
      syncOp.failed(error);

      const failedEvents = emittedEvents.filter(
        (e) => e.type === SyncEventTypes.SYNC_FAILED,
      );
      expect(failedEvents).toHaveLength(1);

      const failedEvent = failedEvents[0].data as {
        jobId: string;
        successCount: number;
        failureCount: number;
        errors: Array<{
          remoteName: string;
          documentId: string;
          error: string;
        }>;
      };
      expect(failedEvent.jobId).toBe("job-3");
      expect(failedEvent.successCount).toBe(0);
      expect(failedEvent.failureCount).toBe(1);
      expect(failedEvent.errors).toHaveLength(1);
      expect(failedEvent.errors[0].remoteName).toBe("remote1");
      expect(failedEvent.errors[0].documentId).toBe("doc1");
      expect(failedEvent.errors[0].error).toContain("Network error");
    });
  });

  describe("Event Lifecycle", () => {
    it("PENDING fires before SUCCEEDED", async () => {
      await syncManager.startup();

      let outboxCallback: ((syncOps: SyncOperation[]) => void) | undefined;
      vi.mocked(mockChannel.outbox.onAdded).mockImplementation((cb) => {
        outboxCallback = cb;
      });

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add("remote1", "collection1", channelConfig, {
        documentId: ["doc1"],
        scope: ["global"],
        branch: "main",
      });

      vi.mocked(mockChannel.outbox.add).mockImplementation((syncOp) => {
        if (outboxCallback) {
          outboxCallback([syncOp]);
        }
      });

      const operations = [createOperation("doc1", "op1")];
      await triggerWriteReady("job-lifecycle-1", operations);

      const syncOp = getLastSyncOpFromOutbox() as { executed: () => void };
      syncOp.executed();

      const jobEvents = emittedEvents.filter((e) => {
        const data = e.data as { jobId: string };
        return data.jobId === "job-lifecycle-1";
      });

      expect(jobEvents).toHaveLength(2);
      expect(jobEvents[0].type).toBe(SyncEventTypes.SYNC_PENDING);
      expect(jobEvents[1].type).toBe(SyncEventTypes.SYNC_SUCCEEDED);
    });

    it("PENDING fires before FAILED", async () => {
      await syncManager.startup();

      let outboxCallback: ((syncOps: SyncOperation[]) => void) | undefined;
      vi.mocked(mockChannel.outbox.onAdded).mockImplementation((cb) => {
        outboxCallback = cb;
      });

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add("remote1", "collection1", channelConfig, {
        documentId: ["doc1"],
        scope: ["global"],
        branch: "main",
      });

      vi.mocked(mockChannel.outbox.add).mockImplementation((syncOp) => {
        if (outboxCallback) {
          outboxCallback([syncOp]);
        }
      });

      const operations = [createOperation("doc1", "op1")];
      await triggerWriteReady("job-lifecycle-2", operations);

      const syncOp = getLastSyncOpFromOutbox() as {
        failed: (err: ChannelError) => void;
      };
      const error = new ChannelError(
        ChannelErrorSource.Outbox,
        new Error("Failure"),
      );
      syncOp.failed(error);

      const jobEvents = emittedEvents.filter((e) => {
        const data = e.data as { jobId: string };
        return data.jobId === "job-lifecycle-2";
      });

      expect(jobEvents).toHaveLength(2);
      expect(jobEvents[0].type).toBe(SyncEventTypes.SYNC_PENDING);
      expect(jobEvents[1].type).toBe(SyncEventTypes.SYNC_FAILED);
    });

    it("Only one terminal event per job (never both SUCCEEDED and FAILED)", async () => {
      await syncManager.startup();

      let outboxCallback: ((syncOps: SyncOperation[]) => void) | undefined;
      vi.mocked(mockChannel.outbox.onAdded).mockImplementation((cb) => {
        outboxCallback = cb;
      });

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add("remote1", "collection1", channelConfig, {
        documentId: ["doc1", "doc2"],
        scope: ["global"],
        branch: "main",
      });

      const syncOps: Array<{
        executed: () => void;
        failed: (err: ChannelError) => void;
      }> = [];
      vi.mocked(mockChannel.outbox.add).mockImplementation((syncOp) => {
        syncOps.push(
          syncOp as {
            executed: () => void;
            failed: (err: ChannelError) => void;
          },
        );
        if (outboxCallback) {
          outboxCallback([syncOp]);
        }
      });

      const operations = [
        createOperation("doc1", "op1"),
        createOperation("doc2", "op2"),
      ];
      await triggerWriteReady("job-terminal", operations);

      expect(syncOps).toHaveLength(2);

      syncOps[0].executed();
      const error = new ChannelError(
        ChannelErrorSource.Outbox,
        new Error("Fail"),
      );
      syncOps[1].failed(error);

      const terminalEvents = emittedEvents.filter(
        (e) =>
          e.type === SyncEventTypes.SYNC_SUCCEEDED ||
          e.type === SyncEventTypes.SYNC_FAILED,
      );
      expect(terminalEvents).toHaveLength(1);
      expect(terminalEvents[0].type).toBe(SyncEventTypes.SYNC_FAILED);
    });
  });

  describe("Multi-Remote Scenarios", () => {
    it("Multiple ops to multiple remotes - SUCCEEDED after all complete", async () => {
      await syncManager.startup();

      let channel1OutboxCallback:
        | ((syncOps: SyncOperation[]) => void)
        | undefined;
      let channel2OutboxCallback:
        | ((syncOps: SyncOperation[]) => void)
        | undefined;

      const mockChannel1 = {
        inbox: { items: [], onAdded: vi.fn() },
        outbox: {
          items: [],
          add: vi.fn(),
          remove: vi.fn(),
          onAdded: vi.fn((cb) => {
            channel1OutboxCallback = cb;
          }),
        },
        init: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn(),
      } as unknown as IChannel;

      const mockChannel2 = {
        inbox: { items: [], onAdded: vi.fn() },
        outbox: {
          items: [],
          add: vi.fn(),
          remove: vi.fn(),
          onAdded: vi.fn((cb) => {
            channel2OutboxCallback = cb;
          }),
        },
        init: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn(),
      } as unknown as IChannel;

      let channelIndex = 0;
      vi.mocked(mockChannelFactory.instance).mockImplementation(() => {
        channelIndex++;
        return channelIndex === 1 ? mockChannel1 : mockChannel2;
      });

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add("remote1", "collection1", channelConfig, {
        documentId: ["doc1"],
        scope: ["global"],
        branch: "main",
      });

      await syncManager.add("remote2", "collection1", channelConfig, {
        documentId: ["doc1"],
        scope: ["global"],
        branch: "main",
      });

      const syncOps1: SyncOperation[] = [];
      const syncOps2: SyncOperation[] = [];

      vi.mocked(mockChannel1.outbox.add).mockImplementation((syncOp) => {
        syncOps1.push(syncOp);
        if (channel1OutboxCallback) {
          channel1OutboxCallback([syncOp]);
        }
      });

      vi.mocked(mockChannel2.outbox.add).mockImplementation((syncOp) => {
        syncOps2.push(syncOp);
        if (channel2OutboxCallback) {
          channel2OutboxCallback([syncOp]);
        }
      });

      const operations = [createOperation("doc1", "op1")];
      await triggerWriteReady("job-multi-remote", operations);

      expect(syncOps1).toHaveLength(1);
      expect(syncOps2).toHaveLength(1);

      let succeededEvents = emittedEvents.filter(
        (e) => e.type === SyncEventTypes.SYNC_SUCCEEDED,
      );
      expect(succeededEvents).toHaveLength(0);

      syncOps1[0].executed();

      succeededEvents = emittedEvents.filter(
        (e) => e.type === SyncEventTypes.SYNC_SUCCEEDED,
      );
      expect(succeededEvents).toHaveLength(0);

      syncOps2[0].executed();

      succeededEvents = emittedEvents.filter(
        (e) => e.type === SyncEventTypes.SYNC_SUCCEEDED,
      );
      expect(succeededEvents).toHaveLength(1);

      const succeededEvent = succeededEvents[0].data as {
        jobId: string;
        syncOperationCount: number;
      };
      expect(succeededEvent.jobId).toBe("job-multi-remote");
      expect(succeededEvent.syncOperationCount).toBe(2);
    });

    it("Partial failure - FAILED with correct counts", async () => {
      await syncManager.startup();

      let channel1OutboxCallback:
        | ((syncOps: SyncOperation[]) => void)
        | undefined;
      let channel2OutboxCallback:
        | ((syncOps: SyncOperation[]) => void)
        | undefined;

      const mockChannel1 = {
        inbox: { items: [], onAdded: vi.fn() },
        outbox: {
          items: [],
          add: vi.fn(),
          remove: vi.fn(),
          onAdded: vi.fn((cb) => {
            channel1OutboxCallback = cb;
          }),
        },
        init: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn(),
      } as unknown as IChannel;

      const mockChannel2 = {
        inbox: { items: [], onAdded: vi.fn() },
        outbox: {
          items: [],
          add: vi.fn(),
          remove: vi.fn(),
          onAdded: vi.fn((cb) => {
            channel2OutboxCallback = cb;
          }),
        },
        init: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn(),
      } as unknown as IChannel;

      let channelIndex = 0;
      vi.mocked(mockChannelFactory.instance).mockImplementation(() => {
        channelIndex++;
        return channelIndex === 1 ? mockChannel1 : mockChannel2;
      });

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add("remote1", "collection1", channelConfig, {
        documentId: ["doc1"],
        scope: ["global"],
        branch: "main",
      });

      await syncManager.add("remote2", "collection1", channelConfig, {
        documentId: ["doc1"],
        scope: ["global"],
        branch: "main",
      });

      const syncOps1: SyncOperation[] = [];
      const syncOps2: SyncOperation[] = [];

      vi.mocked(mockChannel1.outbox.add).mockImplementation((syncOp) => {
        syncOps1.push(syncOp);
        if (channel1OutboxCallback) {
          channel1OutboxCallback([syncOp]);
        }
      });

      vi.mocked(mockChannel2.outbox.add).mockImplementation((syncOp) => {
        syncOps2.push(syncOp);
        if (channel2OutboxCallback) {
          channel2OutboxCallback([syncOp]);
        }
      });

      const operations = [createOperation("doc1", "op1")];
      await triggerWriteReady("job-partial-fail", operations);

      syncOps1[0].executed();
      const error = new ChannelError(
        ChannelErrorSource.Outbox,
        new Error("Remote2 failed"),
      );
      syncOps2[0].failed(error);

      const failedEvents = emittedEvents.filter(
        (e) => e.type === SyncEventTypes.SYNC_FAILED,
      );
      expect(failedEvents).toHaveLength(1);

      const failedEvent = failedEvents[0].data as {
        jobId: string;
        successCount: number;
        failureCount: number;
        errors: Array<{
          remoteName: string;
          documentId: string;
          error: string;
        }>;
      };
      expect(failedEvent.jobId).toBe("job-partial-fail");
      expect(failedEvent.successCount).toBe(1);
      expect(failedEvent.failureCount).toBe(1);
      expect(failedEvent.errors).toHaveLength(1);
      expect(failedEvent.errors[0].remoteName).toBe("remote2");
    });
  });

  describe("Collection-based routing", () => {
    const driveA = "drive-a-id";
    const driveB = "drive-b-id";
    const collectionA = driveCollectionId("main", driveA);
    const collectionB = driveCollectionId("main", driveB);

    const createMockChannelForCollection = () => {
      return {
        inbox: {
          items: [],
          add: vi.fn(),
          remove: vi.fn(),
          get: vi.fn(),
          onAdded: vi.fn(),
          onRemoved: vi.fn(),
        },
        outbox: {
          items: [],
          add: vi.fn(),
          remove: vi.fn(),
          get: vi.fn(),
          onAdded: vi.fn(),
          onRemoved: vi.fn(),
        },
        deadLetter: {
          items: [],
          add: vi.fn(),
          remove: vi.fn(),
          get: vi.fn(),
          onAdded: vi.fn(),
          onRemoved: vi.fn(),
        },
        init: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn(),
      } as unknown as IChannel;
    };

    const triggerWriteReadyWithCollections = async (
      jobId: string,
      operations: OperationWithContext[],
      collectionMemberships: Record<string, string[]>,
    ): Promise<void> => {
      const subscriber = eventSubscribers.get(
        ReactorEventTypes.JOB_WRITE_READY,
      );
      if (subscriber) {
        subscriber(ReactorEventTypes.JOB_WRITE_READY, {
          jobId,
          operations,
          collectionMemberships,
          jobMeta: { batchId: `auto-${jobId}`, batchJobIds: [jobId] },
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    };

    it("should route operations only to remotes whose collection contains the document", async () => {
      await syncManager.startup();

      const channelA = createMockChannelForCollection();
      const channelB = createMockChannelForCollection();

      let channelIndex = 0;
      vi.mocked(mockChannelFactory.instance).mockImplementation(() => {
        channelIndex++;
        return channelIndex === 1 ? channelA : channelB;
      });

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      // Remote A: syncs driveA's collection with empty documentId filter (sync all in collection)
      await syncManager.add("remoteA", collectionA, channelConfig, {
        documentId: [],
        scope: [],
        branch: "main",
      });

      // Remote B: syncs driveB's collection with empty documentId filter
      await syncManager.add("remoteB", collectionB, channelConfig, {
        documentId: [],
        scope: [],
        branch: "main",
      });

      // Emit an operation for a document that belongs to driveA's collection
      const docInDriveA = "doc-in-driveA";
      const operationsForDriveA = [createOperation(docInDriveA, "op1")];
      await triggerWriteReadyWithCollections("job-1", operationsForDriveA, {
        [docInDriveA]: [collectionA],
      });

      // EXPECTED: Only channelA.outbox should have the operation
      expect(channelA.outbox.add).toHaveBeenCalled();
      expect(channelB.outbox.add).not.toHaveBeenCalled();
    });

    it("should not route operations for documents not in any synced collection", async () => {
      await syncManager.startup();

      const channelA = createMockChannelForCollection();
      vi.mocked(mockChannelFactory.instance).mockReturnValue(channelA);

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add("remoteA", collectionA, channelConfig, {
        documentId: [],
        scope: [],
        branch: "main",
      });

      // Emit operation for a new standalone drive (not in driveA's collection)
      const newDriveId = "new-drive-id";
      const newDriveCollection = driveCollectionId("main", newDriveId);
      const operationsForNewDrive = [createOperation(newDriveId, "op1")];
      await triggerWriteReadyWithCollections("job-2", operationsForNewDrive, {
        [newDriveId]: [newDriveCollection],
      });

      // EXPECTED: channelA should NOT receive this
      expect(channelA.outbox.add).not.toHaveBeenCalled();
    });

    it("should route operations to multiple remotes if document is in multiple collections", async () => {
      await syncManager.startup();

      const channelA = createMockChannelForCollection();
      const channelB = createMockChannelForCollection();

      let channelIndex = 0;
      vi.mocked(mockChannelFactory.instance).mockImplementation(() => {
        channelIndex++;
        return channelIndex === 1 ? channelA : channelB;
      });

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add("remoteA", collectionA, channelConfig, {
        documentId: [],
        scope: [],
        branch: "main",
      });

      await syncManager.add("remoteB", collectionB, channelConfig, {
        documentId: [],
        scope: [],
        branch: "main",
      });

      // Document is in both collections
      const sharedDocId = "shared-doc";
      const operations = [createOperation(sharedDocId, "op1")];
      await triggerWriteReadyWithCollections("job-3", operations, {
        [sharedDocId]: [collectionA, collectionB],
      });

      // EXPECTED: Both channels should receive the operation
      expect(channelA.outbox.add).toHaveBeenCalled();
      expect(channelB.outbox.add).toHaveBeenCalled();
    });

    it("should handle missing collectionMemberships by not routing to any remote with empty documentId filter", async () => {
      await syncManager.startup();

      const channelA = createMockChannelForCollection();
      vi.mocked(mockChannelFactory.instance).mockReturnValue(channelA);

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add("remoteA", collectionA, channelConfig, {
        documentId: [],
        scope: [],
        branch: "main",
      });

      // Emit without collectionMemberships (old behavior / legacy events)
      const operations = [createOperation("some-doc", "op1")];
      await triggerWriteReady("job-4", operations);

      // EXPECTED: channelA should NOT receive this since we can't verify membership
      expect(channelA.outbox.add).not.toHaveBeenCalled();
    });
  });

  describe("Edge Cases", () => {
    it("No events when jobId is missing", async () => {
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

      const operations = [createOperation("doc1", "op1")];

      const subscriber = eventSubscribers.get(
        ReactorEventTypes.JOB_WRITE_READY,
      );
      if (subscriber) {
        subscriber(ReactorEventTypes.JOB_WRITE_READY, {
          operations,
          jobMeta: { batchId: "auto-1", batchJobIds: ["auto-job-1"] },
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 0));

      const syncEvents = emittedEvents.filter(
        (e) =>
          e.type === SyncEventTypes.SYNC_PENDING ||
          e.type === SyncEventTypes.SYNC_SUCCEEDED ||
          e.type === SyncEventTypes.SYNC_FAILED,
      );
      expect(syncEvents).toHaveLength(0);
    });

    it("No events when no operations match filters", async () => {
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

      const operations = [createOperation("doc-no-match", "op1")];
      await triggerWriteReady("job-no-match", operations);

      const syncEvents = emittedEvents.filter(
        (e) =>
          e.type === SyncEventTypes.SYNC_PENDING ||
          e.type === SyncEventTypes.SYNC_SUCCEEDED ||
          e.type === SyncEventTypes.SYNC_FAILED,
      );
      expect(syncEvents).toHaveLength(0);
    });

    it("Synchronous channel completion (like TestChannel) emits events correctly", async () => {
      await syncManager.startup();

      let outboxCallback: ((syncOps: SyncOperation[]) => void) | undefined;
      vi.mocked(mockChannel.outbox.onAdded).mockImplementation((cb) => {
        outboxCallback = cb;
      });

      const channelConfig: ChannelConfig = {
        type: "internal",
        parameters: {},
      };

      await syncManager.add("remote1", "collection1", channelConfig, {
        documentId: ["doc1"],
        scope: ["global"],
        branch: "main",
      });

      vi.mocked(mockChannel.outbox.add).mockImplementation((syncOp) => {
        if (outboxCallback) {
          outboxCallback([syncOp]);
        }
        (syncOp as { executed: () => void }).executed();
      });

      const operations = [createOperation("doc1", "op1")];
      await triggerWriteReady("job-sync-channel", operations);

      const pendingEvents = emittedEvents.filter(
        (e) => e.type === SyncEventTypes.SYNC_PENDING,
      );
      const succeededEvents = emittedEvents.filter(
        (e) => e.type === SyncEventTypes.SYNC_SUCCEEDED,
      );

      expect(pendingEvents).toHaveLength(1);
      expect(succeededEvents).toHaveLength(1);

      const pendingIdx = emittedEvents.findIndex(
        (e) => e.type === SyncEventTypes.SYNC_PENDING,
      );
      const succeededIdx = emittedEvents.findIndex(
        (e) => e.type === SyncEventTypes.SYNC_SUCCEEDED,
      );

      expect(pendingIdx).toBeLessThan(succeededIdx);
    });
  });
});

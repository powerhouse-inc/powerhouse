import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IOperationIndex } from "../../../src/cache/operation-index-types.js";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../../src/core/drive-container-types.js";
import type { IReactor } from "../../../src/core/types.js";
import type { IEventBus } from "../../../src/events/interfaces.js";
import type {
  DeadLetterRecord,
  ISyncCursorStorage,
  ISyncDeadLetterStorage,
  ISyncRemoteStorage,
} from "../../../src/storage/interfaces.js";
import type {
  IChannel,
  IChannelFactory,
} from "../../../src/sync/interfaces.js";
import { GraphQLRequestError } from "../../../src/sync/errors.js";
import { SyncManager } from "../../../src/sync/sync-manager.js";
import { SyncOperation } from "../../../src/sync/sync-operation.js";
import {
  ChannelErrorSource,
  type ConnectionStateSnapshot,
} from "../../../src/sync/types.js";
import { settledAtHead } from "../../catch-up/helpers.js";

const CONNECTED: ConnectionStateSnapshot = {
  state: "connected",
  failureCount: 0,
  lastSuccessUtcMs: 0,
  lastFailureUtcMs: 0,
  pushBlocked: false,
  pushFailureCount: 0,
  receivingPages: false,
  requiresAuth: false,
};

function deadLetterOp(id: string, documentId: string): SyncOperation {
  const op = new SyncOperation(
    id,
    `job-${id}`,
    [],
    "accounts",
    documentId,
    ["global"],
    "main",
    [] as OperationWithContext[],
  );
  return op;
}

function mailbox(items: SyncOperation[] = []) {
  const map = new Map(items.map((i) => [i.id, i]));
  let ack = 0;
  let latest = 0;
  return {
    get items() {
      return [...map.values()];
    },
    get ackOrdinal() {
      return ack;
    },
    get latestOrdinal() {
      return latest;
    },
    init: vi.fn((ordinal: number) => {
      ack = latest = ordinal;
    }),
    advanceOrdinal: vi.fn((ordinal: number) => {
      latest = Math.max(latest, ordinal);
    }),
    add: vi.fn((...added: SyncOperation[]) => {
      for (const a of added) map.set(a.id, a);
    }),
    remove: vi.fn((...removed: SyncOperation[]) => {
      for (const r of removed) map.delete(r.id);
    }),
    get: vi.fn((id: string) => map.get(id)),
    onAdded: vi.fn(),
    onRemoved: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    isPaused: vi.fn().mockReturnValue(false),
    flush: vi.fn(),
  };
}

describe("SyncManager - repair levers (ISyncAdmin)", () => {
  let syncManager: SyncManager;
  let mockRemoteStorage: ISyncRemoteStorage;
  let mockCursorStorage: ISyncCursorStorage;
  let mockDeadLetterStorage: ISyncDeadLetterStorage;
  let mockChannelFactory: IChannelFactory;
  let mockOperationIndex: IOperationIndex;
  let mockReactor: IReactor;
  let mockEventBus: IEventBus;
  let channels: ReturnType<typeof createChannel>[];

  function createChannel() {
    return {
      inbox: mailbox(),
      outbox: mailbox(),
      deadLetter: mailbox(),
      init: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
      getConnectionState: vi.fn().mockReturnValue(CONNECTED),
      onConnectionStateChange: vi.fn().mockReturnValue(() => {}),
      setLocalManifest: vi.fn(),
      onPeerManifest: vi.fn().mockReturnValue(() => {}),
      triggerPull: vi.fn(),
      notePoll: vi.fn(),
      lastHolderPollUtcMs: vi.fn().mockReturnValue(undefined),
    };
  }

  beforeEach(() => {
    channels = [];

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

    mockDeadLetterStorage = {
      list: vi.fn().mockResolvedValue({
        results: [],
        options: { cursor: "0", limit: 100 },
      }),
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      removeByRemote: vi.fn().mockResolvedValue(undefined),
      listQuarantinedDocumentIds: vi.fn().mockResolvedValue([]),
    };

    mockChannelFactory = {
      instance: vi.fn(() => {
        const channel = createChannel();
        channels.push(channel);
        return channel as unknown as IChannel;
      }),
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
      getGroupReferencers: vi.fn().mockResolvedValue([]),
      getOrdinalsByOpIds: vi.fn().mockResolvedValue(new Map()),
      getCollectionsInRange: vi.fn().mockResolvedValue([]),
      getOrdinalsInRange: vi.fn().mockResolvedValue([]),
      getByOrdinals: vi.fn().mockResolvedValue([]),
      getStreamAfter: vi.fn().mockResolvedValue([]),
    } as unknown as IOperationIndex;

    mockReactor = {
      load: vi.fn().mockResolvedValue({ id: "job", status: "READ_READY" }),
      getJobStatus: vi.fn().mockResolvedValue({ id: "", status: "READ_READY" }),
      loadBatch: vi.fn().mockResolvedValue({ jobs: {} }),
    } as unknown as IReactor;

    const subscribers = new Map<
      number,
      Array<(type: number, data: unknown) => void | Promise<void>>
    >();
    mockEventBus = {
      subscribe: vi.fn((type: number, callback) => {
        const list = subscribers.get(type) ?? [];
        list.push(callback);
        subscribers.set(type, list);
        return () => undefined;
      }),
      emit: vi.fn(async (type: number, data: unknown) => {
        for (const sub of subscribers.get(type) ?? []) {
          await sub(type, data);
        }
      }),
    } as unknown as IEventBus;

    syncManager = new SyncManager(
      new ConsoleLogger(["SyncManager"]),
      mockRemoteStorage,
      mockCursorStorage,
      mockDeadLetterStorage,
      mockChannelFactory,
      mockOperationIndex,
      mockReactor,
      mockEventBus,
      DEFAULT_DRIVE_CONTAINER_TYPES,
      settledAtHead(),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function addAccounts() {
    return syncManager.add(
      "accounts",
      DriveCollectionId.forDrive("drive-1"),
      { type: "gql", parameters: { url: "https://x/graphql" } },
      { documentId: [], scope: [], branch: "main" },
      { sinceTimestampUtcMs: "0" },
    );
  }

  it("rejects a lever on an unknown remote", async () => {
    await expect(syncManager.resetChannel("nope")).rejects.toThrow(
      /does not exist/,
    );
    await expect(syncManager.clearDeadLetter("nope", "d1")).rejects.toThrow(
      /does not exist/,
    );
    await expect(syncManager.requeueDeadLetter("nope", "d1")).rejects.toThrow(
      /does not exist/,
    );
  });

  it("requeues a dead letter back into the inbox and clears quarantine", async () => {
    await addAccounts();
    const dl = deadLetterOp("d1", "doc-b");
    channels[0].deadLetter.add(dl);

    await syncManager.requeueDeadLetter("accounts", "d1");

    // The row stays until the retry succeeds; the mock never drives the apply.
    expect(mockDeadLetterStorage.remove).not.toHaveBeenCalled();
    expect(channels[0].deadLetter.remove).toHaveBeenCalled();
    const added = channels[0].inbox.add.mock.calls.at(-1)?.[0] as SyncOperation;
    expect(added.id).toBe("d1");
    expect(added.documentId).toBe("doc-b");
  });

  it("requeues a dead letter the capped mailbox evicted from storage", async () => {
    const record: DeadLetterRecord = {
      id: "d9",
      jobId: "job-d9",
      jobDependencies: [],
      remoteName: "accounts",
      documentId: "doc-z",
      scopes: ["global"],
      branch: "main",
      operations: [],
      errorSource: ChannelErrorSource.Inbox,
      errorMessage: "Document not found",
      errorType: "MISSING_OPERATIONS",
    };
    await addAccounts();
    vi.mocked(mockDeadLetterStorage.list)
      .mockResolvedValueOnce({
        results: [],
        options: { cursor: "0", limit: 100 },
        nextCursor: "1",
      })
      .mockResolvedValueOnce({
        results: [record],
        options: { cursor: "1", limit: 100 },
      });

    await syncManager.requeueDeadLetter("accounts", "d9");

    const added = channels[0].inbox.add.mock.calls.at(-1)?.[0] as SyncOperation;
    expect(added.id).toBe("d9");
    expect(added.documentId).toBe("doc-z");
    expect(mockDeadLetterStorage.remove).not.toHaveBeenCalled();
  });

  it("treats requeue of an unknown dead letter as a no-op", async () => {
    await addAccounts();
    channels[0].inbox.add.mockClear();

    await syncManager.requeueDeadLetter("accounts", "missing");

    expect(channels[0].inbox.add).not.toHaveBeenCalled();
    expect(mockDeadLetterStorage.remove).not.toHaveBeenCalled();
  });

  it("clears a dead letter without re-queuing it", async () => {
    await addAccounts();
    const dl = deadLetterOp("d2", "doc-c");
    channels[0].deadLetter.add(dl);
    channels[0].inbox.add.mockClear();

    await syncManager.clearDeadLetter("accounts", "d2");

    expect(mockDeadLetterStorage.remove).toHaveBeenCalledWith("d2");
    expect(channels[0].deadLetter.remove).toHaveBeenCalled();
    expect(channels[0].inbox.add).not.toHaveBeenCalled();
  });

  it("resets a single channel by tearing it down and re-creating it", async () => {
    await addAccounts();
    expect(channels).toHaveLength(1);
    const first = channels[0];

    await syncManager.resetChannel("accounts");

    expect(first.shutdown).toHaveBeenCalled();
    // A fresh channel was built from the stored meta and re-initialized.
    expect(channels).toHaveLength(2);
    expect(channels[1].init).toHaveBeenCalled();
    // The remote still exists and now points at the new channel.
    expect(syncManager.getByName("accounts").channel).toBe(
      channels[1] as unknown,
    );
  });

  it("backfills a reset channel from its stored outbox cursor, not from zero", async () => {
    await addAccounts();
    vi.mocked(mockChannelFactory.instance).mockImplementationOnce(() => {
      const channel = createChannel();
      channel.init = vi.fn(() => {
        channel.outbox.init(500);
        return Promise.resolve();
      });
      channels.push(channel);
      return channel as unknown as IChannel;
    });
    await vi.waitFor(() => expect(mockOperationIndex.find).toHaveBeenCalled());
    vi.mocked(mockOperationIndex.find).mockClear();

    await syncManager.resetChannel("accounts");

    await vi.waitFor(() => expect(mockOperationIndex.find).toHaveBeenCalled());
    expect(mockOperationIndex.find).not.toHaveBeenCalledWith(
      expect.anything(),
      0,
      expect.anything(),
      undefined,
      expect.anything(),
    );
    expect(mockOperationIndex.find).toHaveBeenCalledWith(
      expect.anything(),
      500,
      expect.anything(),
      undefined,
      expect.anything(),
    );
  });

  it("leaves no torn-down remote registered when the channel factory throws", async () => {
    await addAccounts();
    const first = channels[0];
    vi.mocked(mockChannelFactory.instance).mockImplementationOnce(() => {
      throw new Error("factory broken");
    });

    await expect(syncManager.resetChannel("accounts")).rejects.toThrow(
      "factory broken",
    );

    expect(first.shutdown).toHaveBeenCalled();
    expect(() => syncManager.getByName("accounts")).toThrow(/does not exist/);
    expect(syncManager.list()).toHaveLength(0);
    expect(mockRemoteStorage.remove).not.toHaveBeenCalled();

    await syncManager.resetChannel("accounts");

    expect(channels).toHaveLength(2);
    expect(channels[1].init).toHaveBeenCalled();
    expect(syncManager.getByName("accounts").channel).toBe(
      channels[1] as unknown,
    );
  });

  it("drops the fresh channel when wiring it fails before init", async () => {
    await addAccounts();
    vi.mocked(mockChannelFactory.instance).mockImplementationOnce(() => {
      const channel = createChannel();
      channel.onConnectionStateChange = vi.fn(() => {
        throw new Error("wire broken");
      });
      channels.push(channel);
      return channel as unknown as IChannel;
    });

    await expect(syncManager.resetChannel("accounts")).rejects.toThrow(
      "wire broken",
    );

    expect(channels).toHaveLength(2);
    expect(channels[1].shutdown).toHaveBeenCalled();
    expect(channels[1].init).not.toHaveBeenCalled();
    expect(() => syncManager.getByName("accounts")).toThrow(/does not exist/);
    expect(mockRemoteStorage.remove).not.toHaveBeenCalled();

    await syncManager.resetChannel("accounts");

    expect(syncManager.getByName("accounts").channel).toBe(
      channels[2] as unknown,
    );
  });

  it("keeps the stored record when reset's re-init fails on any error", async () => {
    await addAccounts();
    vi.mocked(mockChannelFactory.instance).mockImplementationOnce(() => {
      const channel = createChannel();
      channel.init = vi.fn().mockRejectedValue(new Error("config broken"));
      channels.push(channel);
      return channel as unknown as IChannel;
    });

    await expect(syncManager.resetChannel("accounts")).rejects.toThrow(
      "config broken",
    );

    expect(channels[1].shutdown).toHaveBeenCalled();
    expect(() => syncManager.getByName("accounts")).toThrow(/does not exist/);
    expect(mockRemoteStorage.remove).not.toHaveBeenCalled();

    await syncManager.resetChannel("accounts");

    expect(syncManager.getByName("accounts").channel).toBe(
      channels[2] as unknown,
    );
  });

  it("keeps the stored record when reset's re-init fails on a network error", async () => {
    await addAccounts();
    vi.mocked(mockChannelFactory.instance).mockImplementationOnce(() => {
      const channel = createChannel();
      channel.init = vi
        .fn()
        .mockRejectedValue(new GraphQLRequestError("down", "network"));
      channels.push(channel);
      return channel as unknown as IChannel;
    });

    await expect(syncManager.resetChannel("accounts")).rejects.toThrow("down");

    expect(() => syncManager.getByName("accounts")).toThrow(/does not exist/);
    expect(mockRemoteStorage.remove).not.toHaveBeenCalled();
  });

  it("gives resets requested during a running one a single follow-up rebuild", async () => {
    await addAccounts();
    let releaseInit: (() => void) | undefined;
    vi.mocked(mockChannelFactory.instance).mockImplementationOnce(() => {
      const channel = createChannel();
      channel.init = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            releaseInit = resolve;
          }),
      );
      channels.push(channel);
      return channel as unknown as IChannel;
    });

    const running = syncManager.resetChannel("accounts");
    await vi.waitFor(() => expect(releaseInit).toBeDefined());
    const second = syncManager.resetChannel("accounts");
    const third = syncManager.resetChannel("accounts");
    expect(third).toBe(second);
    await expect(syncManager.remove("accounts")).rejects.toThrow(/being reset/);

    releaseInit?.();
    await Promise.all([running, second, third]);

    expect(channels).toHaveLength(3);
    expect(channels[1].shutdown).toHaveBeenCalledTimes(1);
    expect(syncManager.getByName("accounts").channel).toBe(
      channels[2] as unknown,
    );
  });

  it("starts a reset requested after the last one settled afresh", async () => {
    await addAccounts();

    await syncManager.resetChannel("accounts");
    await syncManager.resetChannel("accounts");

    expect(channels).toHaveLength(3);
  });

  it("refuses to remove a remote while it is being reset", async () => {
    await addAccounts();
    let releaseInit: (() => void) | undefined;
    vi.mocked(mockChannelFactory.instance).mockImplementationOnce(() => {
      const channel = createChannel();
      channel.init = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            releaseInit = resolve;
          }),
      );
      channels.push(channel);
      return channel as unknown as IChannel;
    });

    const reset = syncManager.resetChannel("accounts");
    await vi.waitFor(() => expect(releaseInit).toBeDefined());
    await expect(syncManager.remove("accounts")).rejects.toThrow(/being reset/);
    releaseInit?.();
    await reset;

    expect(channels[1].shutdown).not.toHaveBeenCalled();
    expect(syncManager.getByName("accounts").channel).toBe(
      channels[1] as unknown,
    );

    await syncManager.remove("accounts");
    expect(channels[1].shutdown).toHaveBeenCalled();
  });

  it("builds no channel when the manager shuts down during a reset", async () => {
    await addAccounts();
    let releaseShutdown: (() => void) | undefined;
    const shutdownGate = new Promise<void>((resolve) => {
      releaseShutdown = resolve;
    });
    channels[0].shutdown = vi.fn(() => shutdownGate);

    const reset = syncManager.resetChannel("accounts");
    await vi.waitFor(() => expect(channels[0].shutdown).toHaveBeenCalled());
    syncManager.shutdown();
    releaseShutdown?.();

    await expect(reset).rejects.toThrow(/shut down/);
    expect(channels).toHaveLength(1);
  });

  it("refuses to reset a remote that is being removed", async () => {
    await addAccounts();
    let releaseShutdown: (() => void) | undefined;
    channels[0].shutdown = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseShutdown = resolve;
        }),
    );

    const removal = syncManager.remove("accounts");
    await expect(syncManager.resetChannel("accounts")).rejects.toThrow(
      /being removed/,
    );
    releaseShutdown?.();
    await removal;

    expect(channels).toHaveLength(1);
    expect(() => syncManager.getByName("accounts")).toThrow(/does not exist/);
  });
});

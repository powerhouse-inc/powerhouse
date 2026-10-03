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
  type RemoteCursor,
} from "../../../src/sync/types.js";
import { settledAtHead } from "../../catch-up/helpers.js";

const CONNECTED_NEVER_SUCCEEDED: ConnectionStateSnapshot = {
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

describe("SyncManager - sync inspection + repair (W0.5)", () => {
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
      getConnectionState: vi.fn().mockReturnValue(CONNECTED_NEVER_SUCCEEDED),
      onConnectionStateChange: vi.fn().mockReturnValue(() => {}),
      setLocalManifest: vi.fn(),
      onPeerManifest: vi.fn().mockReturnValue(() => {}),
      triggerPull: vi.fn(),
      rewindInboxCursor: vi.fn().mockResolvedValue(undefined),
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

  it("reports cursors, mailbox depths and the neverSucceeded flag", async () => {
    const cursors: RemoteCursor[] = [
      {
        remoteName: "accounts",
        cursorType: "inbox",
        cursorOrdinal: 9770,
        lastSyncedAtUtcMs: 500,
      },
      {
        remoteName: "accounts",
        cursorType: "outbox",
        cursorOrdinal: 42,
        lastSyncedAtUtcMs: 501,
      },
    ];
    vi.mocked(mockCursorStorage.list).mockResolvedValue(cursors);

    await addAccounts();
    // Seed inbox and dead-letter depth on the live channel.
    channels[0].inbox.add(deadLetterOp("i1", "doc-a"));
    channels[0].deadLetter.add(deadLetterOp("d1", "doc-b"));

    const inspection = await syncManager.inspectRemote("accounts");

    expect(inspection.remoteName).toBe("accounts");
    expect(inspection.inboxCursor.cursorOrdinal).toBe(9770);
    expect(inspection.inboxCursor.lastSyncedAtUtcMs).toBe(500);
    expect(inspection.outboxCursor.cursorOrdinal).toBe(42);
    expect(inspection.mailboxDepths.inbox).toBe(1);
    expect(inspection.mailboxDepths.deadLetter).toBe(1);
    expect(inspection.connection.neverSucceeded).toBe(true);
    expect(inspection.connection.stalenessMs).toBeUndefined();
  });

  it("lists dead letters for a remote", async () => {
    const record: DeadLetterRecord = {
      id: "d1",
      jobId: "job-d1",
      jobDependencies: [],
      remoteName: "accounts",
      documentId: "doc-b",
      scopes: ["global"],
      branch: "main",
      operations: [],
      errorSource: ChannelErrorSource.Inbox,
      errorMessage: "Document not found",
      errorType: "MISSING_OPERATIONS",
    };
    vi.mocked(mockDeadLetterStorage.list).mockResolvedValue({
      results: [record],
      options: { cursor: "0", limit: 25 },
      nextCursor: "next",
    });

    await addAccounts();
    const page = await syncManager.listDeadLetters("accounts", undefined, 25);

    expect(page.remoteName).toBe("accounts");
    expect(page.results).toHaveLength(1);
    expect(page.results[0].errorType).toBe("MISSING_OPERATIONS");
    expect(page.nextCursor).toBe("next");
  });

  it("rewinds the inbox cursor through the channel", async () => {
    vi.mocked(mockCursorStorage.list).mockResolvedValue([
      {
        remoteName: "accounts",
        cursorType: "inbox",
        cursorOrdinal: 9770,
        lastSyncedAtUtcMs: 1,
      },
    ]);
    await addAccounts();
    await syncManager.rewindInboxCursor("accounts", 100);

    expect(channels[0].rewindInboxCursor).toHaveBeenCalledWith(100);
  });

  it("refuses to rewind the inbox cursor above the current cursor", async () => {
    vi.mocked(mockCursorStorage.list).mockResolvedValue([
      {
        remoteName: "accounts",
        cursorType: "inbox",
        cursorOrdinal: 50,
        lastSyncedAtUtcMs: 1,
      },
    ]);
    await addAccounts();

    await expect(
      syncManager.rewindInboxCursor("accounts", 100),
    ).rejects.toThrow(/above the current cursor 50/);
    expect(channels[0].rewindInboxCursor).not.toHaveBeenCalled();
  });

  it("requeues a dead letter back into the inbox and clears quarantine", async () => {
    await addAccounts();
    const dl = deadLetterOp("d1", "doc-b");
    channels[0].deadLetter.add(dl);

    await syncManager.requeueDeadLetter("accounts", "d1");

    // The durable row is kept until the retry is durably enqueued, so it is NOT
    // removed synchronously here (the mock channel never drives the apply path).
    expect(mockDeadLetterStorage.remove).not.toHaveBeenCalled();
    expect(channels[0].deadLetter.remove).toHaveBeenCalled();
    const added = channels[0].inbox.add.mock.calls.at(-1)?.[0] as SyncOperation;
    expect(added.id).toBe("d1");
    expect(added.documentId).toBe("doc-b");
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

  it("drops a half-wired remote when reset's re-init fails (non-credential)", async () => {
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

    // No half-wired remote is left serving inspect/triggerPull, and a
    // non-credential failure drops the stored record too, exactly as add() does.
    expect(() => syncManager.getByName("accounts")).toThrow(/does not exist/);
    expect(mockRemoteStorage.remove).toHaveBeenCalledWith("accounts");
  });

  it("keeps the stored record when reset's re-init fails on a network error", async () => {
    await addAccounts();
    vi.mocked(mockRemoteStorage.remove).mockClear();
    vi.mocked(mockChannelFactory.instance).mockImplementationOnce(() => {
      const channel = createChannel();
      channel.init = vi
        .fn()
        .mockRejectedValue(new GraphQLRequestError("down", "network"));
      channels.push(channel);
      return channel as unknown as IChannel;
    });

    await expect(syncManager.resetChannel("accounts")).rejects.toThrow("down");

    // The broken channel is dropped from the registry, but the record stays so a
    // retry after the network recovers can re-add it (add()'s classification).
    expect(() => syncManager.getByName("accounts")).toThrow(/does not exist/);
    expect(mockRemoteStorage.remove).not.toHaveBeenCalled();
  });
});

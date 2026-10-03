/**
 * Finding 2, the sync half, of the W0.8 redesign round in
 * docs/bugs/2026-10-03-pglite-aborted-transaction-bricks-worker-reactor.md.
 *
 * A storage recreate falls the store back to its last FLUSHED snapshot. The
 * persisted cursors are safe - durability boundary 1 means no cursor row was
 * ever written ahead of a flush covering its operations - but the channels'
 * IN-MEMORY cursors are not: they remember acking operations that have just
 * ceased to exist. Left alone, the next poll asks for the tail after them, the
 * remote answers "caught up", and the gap is permanent, with every later
 * operation on those documents dead-lettering on a missing ancestor. That is
 * the live incident's mechanism, and until this round nothing rewound sync
 * state when the storage healed.
 *
 * The sync manager now subscribes to STORAGE_SESSION_RECREATED and resets every
 * channel, which re-initialises each one from the persisted cursors and
 * re-pulls what the fallback lost.
 */
import { ConsoleLogger } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IOperationIndex } from "../../../src/cache/operation-index-types.js";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../../src/core/drive-container-types.js";
import type { IReactor } from "../../../src/core/types.js";
import type { IEventBus } from "../../../src/events/interfaces.js";
import {
  ReactorEventTypes,
  type StorageSessionRecreatedEvent,
} from "../../../src/events/types.js";
import type {
  ISyncCursorStorage,
  ISyncDeadLetterStorage,
  ISyncRemoteStorage,
} from "../../../src/storage/interfaces.js";
import { FlushGuardedSyncCursorStorage } from "../../../src/storage/flush-guarded-sync-cursor-storage.js";
import type { IStorageFlusher } from "../../../src/storage/storage-flush.js";
import { StorageEpochSupersededError } from "../../../src/storage/storage-flush.js";
import type {
  IChannel,
  IChannelFactory,
} from "../../../src/sync/interfaces.js";
import { SyncManager } from "../../../src/sync/sync-manager.js";
import type { SyncOperation } from "../../../src/sync/sync-operation.js";
import type {
  ConnectionStateSnapshot,
  RemoteCursor,
} from "../../../src/sync/types.js";
import { settledAtHead } from "../../catch-up/helpers.js";

const CONNECTED: ConnectionStateSnapshot = {
  state: "connected",
  failureCount: 0,
  lastSuccessUtcMs: 1,
  lastFailureUtcMs: 0,
  pushBlocked: false,
  pushFailureCount: 0,
  receivingPages: false,
  requiresAuth: false,
};

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
    /** What applying an operation does: the in-memory cursor moves forward. */
    ackTo: (ordinal: number) => {
      ack = ordinal;
      latest = Math.max(latest, ordinal);
    },
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

/** A barrier whose epoch the test advances to model a completed recreate. */
class TestFlusher implements IStorageFlusher {
  readonly deferringStatementFlush = true;
  storageEpoch = 0;

  flush(): Promise<void> {
    return Promise.resolve();
  }
}

describe("SyncManager - rewinding sync state after a storage recreate", () => {
  let syncManager: SyncManager;
  let cursorStorage: FlushGuardedSyncCursorStorage;
  let flusher: TestFlusher;
  let channels: ReturnType<typeof createChannel>[];
  let eventBus: IEventBus;
  /** The cursor rows that survived the fallback, keyed by remote and type. */
  let persisted: RemoteCursor[];
  /** Fired inside the next channel `init`, to write from inside the reset. */
  let duringReset: (() => Promise<void>) | undefined;

  /**
   * A channel that models the one property this test is about: `init` reads the
   * persisted inbox cursor and seeds its in-memory mailbox from it, which is why
   * rebuilding the channel is what rewinds sync state.
   */
  function createChannel(remoteName: string) {
    const channel = {
      remoteName,
      inbox: mailbox(),
      outbox: mailbox(),
      deadLetter: mailbox(),
      init: vi.fn(async () => {
        const hook = duringReset;
        duringReset = undefined;
        if (hook) {
          await hook();
        }
        const cursor = await cursorStorage.get(remoteName, "inbox");
        channel.inbox.init(cursor.cursorOrdinal);
      }),
      shutdown: vi.fn().mockResolvedValue(undefined),
      getConnectionState: vi.fn().mockReturnValue(CONNECTED),
      onConnectionStateChange: vi.fn().mockReturnValue(() => {}),
      setLocalManifest: vi.fn(),
      onPeerManifest: vi.fn().mockReturnValue(() => {}),
      triggerPull: vi.fn(),
      notePoll: vi.fn(),
      lastHolderPollUtcMs: vi.fn().mockReturnValue(undefined),
    };
    return channel;
  }

  beforeEach(async () => {
    channels = [];
    duringReset = undefined;
    persisted = [
      { remoteName: "accounts", cursorType: "inbox", cursorOrdinal: 9770 },
      { remoteName: "accounts", cursorType: "outbox", cursorOrdinal: 10 },
    ];

    const remoteStorage: ISyncRemoteStorage = {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };

    // The durable rows, which only an upsert that is allowed to stand changes.
    const innerCursorStorage: ISyncCursorStorage = {
      list: vi.fn(() => Promise.resolve(persisted.map((c) => ({ ...c })))),
      get: vi.fn((remoteName: string, cursorType: "inbox" | "outbox") =>
        Promise.resolve(
          persisted.find(
            (c) => c.remoteName === remoteName && c.cursorType === cursorType,
          ) ?? { remoteName, cursorType, cursorOrdinal: 0 },
        ),
      ),
      upsert: vi.fn((cursor: RemoteCursor) => {
        const row = persisted.find(
          (c) =>
            c.remoteName === cursor.remoteName &&
            c.cursorType === cursor.cursorType,
        );
        if (row) {
          row.cursorOrdinal = cursor.cursorOrdinal;
        } else {
          persisted.push({ ...cursor });
        }
        return Promise.resolve();
      }),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    flusher = new TestFlusher();
    cursorStorage = new FlushGuardedSyncCursorStorage(
      innerCursorStorage,
      flusher,
    );

    const deadLetterStorage: ISyncDeadLetterStorage = {
      list: vi.fn().mockResolvedValue({
        results: [],
        options: { cursor: "0", limit: 100 },
      }),
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      removeByRemote: vi.fn().mockResolvedValue(undefined),
      listQuarantinedDocumentIds: vi.fn().mockResolvedValue([]),
    } as unknown as ISyncDeadLetterStorage;

    const channelFactory: IChannelFactory = {
      instance: vi.fn((_id: string, name: string) => {
        const channel = createChannel(name);
        channels.push(channel);
        return channel as unknown as IChannel;
      }),
    };

    const operationIndex = {
      start: vi.fn(),
      commit: vi.fn().mockResolvedValue([]),
      find: vi.fn().mockResolvedValue({
        results: [],
        options: { cursor: "0", limit: 500 },
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

    const reactor = {
      load: vi.fn().mockResolvedValue({ id: "job", status: "READ_READY" }),
      getJobStatus: vi.fn().mockResolvedValue({ id: "", status: "READ_READY" }),
      loadBatch: vi.fn().mockResolvedValue({ jobs: {} }),
    } as unknown as IReactor;

    const subscribers = new Map<
      number,
      Array<(type: number, data: unknown) => void | Promise<void>>
    >();
    eventBus = {
      subscribe: vi.fn((type: number, callback) => {
        const list = subscribers.get(type) ?? [];
        list.push(callback);
        subscribers.set(type, list);
        return () => {
          subscribers.set(
            type,
            (subscribers.get(type) ?? []).filter((cb) => cb !== callback),
          );
        };
      }),
      emit: vi.fn(async (type: number, data: unknown) => {
        for (const sub of subscribers.get(type) ?? []) {
          await sub(type, data);
        }
      }),
    } as unknown as IEventBus;

    syncManager = new SyncManager(
      new ConsoleLogger(["SyncManager"]),
      remoteStorage,
      cursorStorage,
      deadLetterStorage,
      channelFactory,
      operationIndex,
      reactor,
      eventBus,
      DEFAULT_DRIVE_CONTAINER_TYPES,
      settledAtHead(),
    );
    await syncManager.startup();
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

  function recreated(): StorageSessionRecreatedEvent {
    return {
      reason: 'cannot drop active portal ""',
      timestampUtcMs: Date.now(),
      attempt: 1,
    };
  }

  it("rebuilds every channel so its cursor comes back from durable storage", async () => {
    await addAccounts();
    expect(channels).toHaveLength(1);
    const before = channels[0];

    // The live channel has applied operations up to 16796 in memory - the state
    // the fallback invalidates.
    before.inbox.ackTo(16796);
    expect(before.inbox.ackOrdinal).toBe(16796);

    await eventBus.emit(
      ReactorEventTypes.STORAGE_SESSION_RECREATED,
      recreated(),
    );

    expect(before.shutdown).toHaveBeenCalled();
    expect(channels).toHaveLength(2);
    const after = channels[1];
    expect(after.init).toHaveBeenCalled();
    // Re-initialised from the persisted, flush-gated cursor: the in-memory
    // advance over data that no longer exists is gone, so the next poll
    // re-pulls the tail instead of reporting itself caught up.
    expect(after.inbox.ackOrdinal).toBe(9770);
    expect(syncManager.getByName("accounts").channel).toBe(after as unknown);
  });

  /**
   * Finding 2 of the adversarial review. The reset is not instantaneous, and a
   * cursor write landing inside it brackets entirely within the fresh epoch -
   * flush trivially satisfied, pre/post epoch reads equal - so it used to be
   * durably stored. What it stores is the pre-fallback in-memory ordinal, and
   * the reset that follows seeds the rebuilt channel from exactly that row: the
   * lost tail is then never re-pulled, which is the permanent gap the whole
   * boundary exists to prevent. Both halves of the window are closed - after
   * the epoch advanced, and from inside the reset itself - and writes resume
   * only once the sync manager acknowledges the new epoch.
   */
  it("refuses a stale-high cursor write racing the reset, and lets writes through once the resets are acknowledged", async () => {
    await addAccounts();
    const before = channels[0];
    before.inbox.ackTo(16796);

    const staleHigh = {
      remoteName: "accounts",
      cursorType: "inbox" as const,
      cursorOrdinal: 16796,
      lastSyncedAtUtcMs: Date.now(),
    };

    // The recreate has completed: the store fell back to its last flushed
    // snapshot and the epoch advanced before the event reached the manager.
    flusher.storageEpoch = 1;

    await expect(cursorStorage.upsert(staleHigh)).rejects.toBeInstanceOf(
      StorageEpochSupersededError,
    );

    let fromInsideTheReset: unknown;
    duringReset = async () => {
      fromInsideTheReset = await cursorStorage
        .upsert(staleHigh)
        .then(() => undefined)
        .catch((error: unknown) => error);
    };

    await eventBus.emit(
      ReactorEventTypes.STORAGE_SESSION_RECREATED,
      recreated(),
    );

    expect(fromInsideTheReset).toBeInstanceOf(StorageEpochSupersededError);
    // Nothing poisoned the row, so the rebuilt channel came back to the cursor
    // that is at or behind durable data and re-pulls the tail.
    expect(persisted.find((c) => c.cursorType === "inbox")?.cursorOrdinal).toBe(
      9770,
    );
    expect(channels[1].inbox.ackOrdinal).toBe(9770);

    // The resets are done and acknowledged, so the rebuilt channel's own
    // advances - which start from 9770 - are written again.
    await cursorStorage.upsert({
      remoteName: "accounts",
      cursorType: "inbox",
      cursorOrdinal: 9800,
      lastSyncedAtUtcMs: Date.now(),
    });
    expect(persisted.find((c) => c.cursorType === "inbox")?.cursorOrdinal).toBe(
      9800,
    );
  });

  /**
   * The fence is opened by the recovery round, so a round with nothing to reset
   * still has to run it: otherwise a reactor whose remotes are added after the
   * recreate would have every cursor write refused forever.
   */
  it("acknowledges the new epoch even when no channel needed resetting", async () => {
    flusher.storageEpoch = 1;

    await eventBus.emit(
      ReactorEventTypes.STORAGE_SESSION_RECREATED,
      recreated(),
    );

    expect(channels).toHaveLength(0);
    await cursorStorage.upsert({
      remoteName: "accounts",
      cursorType: "inbox",
      cursorOrdinal: 9770,
      lastSyncedAtUtcMs: Date.now(),
    });
  });

  it("resets every remote, and one failure does not stop the others", async () => {
    await addAccounts();
    await syncManager.add(
      "ledger",
      DriveCollectionId.forDrive("drive-2"),
      { type: "gql", parameters: { url: "https://y/graphql" } },
      { documentId: [], scope: [], branch: "main" },
      { sinceTimestampUtcMs: "0" },
    );
    expect(channels).toHaveLength(2);

    // The first remote's fresh channel refuses to initialise; a credential
    // failure keeps the stored record, so the second must still be reset.
    const factory = vi.mocked(
      (syncManager as unknown as { channelFactory: IChannelFactory })
        .channelFactory.instance,
    );
    const originalImplementation = factory.getMockImplementation()!;
    let built = 0;
    factory.mockImplementation(
      (...args: Parameters<typeof originalImplementation>) => {
        const channel = originalImplementation(...args) as unknown as {
          init: ReturnType<typeof vi.fn>;
        };
        built += 1;
        if (built === 1) {
          channel.init = vi
            .fn()
            .mockRejectedValue(new Error("401 Unauthorized"));
        }
        return channel as unknown as IChannel;
      },
    );

    await eventBus.emit(
      ReactorEventTypes.STORAGE_SESSION_RECREATED,
      recreated(),
    );

    // Four channels built in total: two at add, two at reset.
    expect(channels).toHaveLength(4);
    expect(channels[3].init).toHaveBeenCalled();
  });

  it("does nothing when no remote is registered", async () => {
    await eventBus.emit(
      ReactorEventTypes.STORAGE_SESSION_RECREATED,
      recreated(),
    );
    expect(channels).toHaveLength(0);
  });

  it("stops listening after shutdown", async () => {
    await addAccounts();
    syncManager.shutdown();
    channels.length = 1;

    await eventBus.emit(
      ReactorEventTypes.STORAGE_SESSION_RECREATED,
      recreated(),
    );

    expect(channels).toHaveLength(1);
  });
});

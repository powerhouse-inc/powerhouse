/**
 * requeueDeadLetter must not remove the durable dead-letter row before the retry
 * is durably written. The inbox is in-memory and its cursor has already advanced
 * past the op's ordinal (that is why it dead-lettered), and the retry enqueues a
 * PENDING job on an in-memory queue, so a crash before that job reaches terminal
 * success would lose the op forever. This proves the row is kept while the retry
 * is only pending, dropped only once its load job reaches terminal success, and
 * never dropped when the retry fails terminally.
 */
import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IOperationIndex } from "../../../src/cache/operation-index-types.js";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../../src/core/drive-container-types.js";
import type { BatchLoadRequest, IReactor } from "../../../src/core/types.js";
import type { IEventBus } from "../../../src/events/interfaces.js";
import { JobStatus } from "../../../src/shared/types.js";
import type {
  ISyncCursorStorage,
  ISyncDeadLetterStorage,
  ISyncRemoteStorage,
} from "../../../src/storage/interfaces.js";
import type {
  IChannel,
  IChannelFactory,
} from "../../../src/sync/interfaces.js";
import { ChannelError } from "../../../src/sync/errors.js";
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
  lastSuccessUtcMs: 1,
  lastFailureUtcMs: 0,
  pushBlocked: false,
  pushFailureCount: 0,
  receivingPages: false,
  requiresAuth: false,
};

/** A nonkeyed sync op, so handleInboxAdded drives it through reactor.load. */
function nonKeyedOp(id: string, documentId: string): SyncOperation {
  return failedHere(
    new SyncOperation(
      id,
      "",
      [],
      "accounts",
      documentId,
      ["global"],
      "main",
      [] as OperationWithContext[],
    ),
  );
}

function failedHere(syncOp: SyncOperation): SyncOperation {
  syncOp.failed(new ChannelError(ChannelErrorSource.Inbox, new Error("boom")));
  return syncOp;
}

/** A keyed sync op, so handleInboxAdded drives it through reactor.loadBatch. */
function keyedOp(
  id: string,
  jobKey: string,
  documentId: string,
): SyncOperation {
  return failedHere(
    new SyncOperation(
      id,
      jobKey,
      [],
      "accounts",
      documentId,
      ["global"],
      "main",
      [] as OperationWithContext[],
    ),
  );
}

/** A mailbox that actually fires its onAdded/onRemoved listeners. */
function firingMailbox() {
  const map = new Map<string, SyncOperation>();
  let ack = 0;
  let latest = 0;
  const addedListeners: Array<(ops: SyncOperation[]) => void> = [];
  const removedListeners: Array<(ops: SyncOperation[]) => void> = [];
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
      for (const listener of addedListeners) listener(added);
    }),
    remove: vi.fn((...removed: SyncOperation[]) => {
      for (const r of removed) map.delete(r.id);
      for (const listener of removedListeners) listener(removed);
    }),
    get: vi.fn((id: string) => map.get(id)),
    onAdded: vi.fn((cb: (ops: SyncOperation[]) => void) => {
      addedListeners.push(cb);
    }),
    onRemoved: vi.fn((cb: (ops: SyncOperation[]) => void) => {
      removedListeners.push(cb);
    }),
    pause: vi.fn(),
    resume: vi.fn(),
    isPaused: vi.fn().mockReturnValue(false),
    flush: vi.fn(),
  };
}

describe("SyncManager.requeueDeadLetter durable ordering", () => {
  let syncManager: SyncManager;
  let mockDeadLetterStorage: ISyncDeadLetterStorage;
  let mockReactor: IReactor;
  let channels: ReturnType<typeof createChannel>[];

  function createChannel() {
    return {
      inbox: firingMailbox(),
      outbox: firingMailbox(),
      deadLetter: firingMailbox(),
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

  function makeManager(reactor: IReactor): SyncManager {
    const remoteStorage: ISyncRemoteStorage = {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const cursorStorage: ISyncCursorStorage = {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(undefined),
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
    const channelFactory: IChannelFactory = {
      instance: vi.fn(() => {
        const channel = createChannel();
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
    const subscribers = new Map<
      number,
      Array<(type: number, data: unknown) => void | Promise<void>>
    >();
    const eventBus = {
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

    return new SyncManager(
      new ConsoleLogger(["SyncManager"]),
      remoteStorage,
      cursorStorage,
      mockDeadLetterStorage,
      channelFactory,
      operationIndex,
      reactor,
      eventBus,
      DEFAULT_DRIVE_CONTAINER_TYPES,
      settledAtHead(),
    );
  }

  beforeEach(() => {
    channels = [];
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

  it("keeps the durable row while the retry is only pending, before terminal success", async () => {
    // reactor.load resolves a PENDING job on the in-memory queue, but the job
    // never reaches terminal success (getJobStatus stays PENDING and no event
    // fires): the crash window the fix must survive without losing the op.
    mockReactor = {
      load: vi
        .fn()
        .mockResolvedValue({ id: "job-x", status: JobStatus.PENDING }),
      getJobStatus: vi
        .fn()
        .mockResolvedValue({ id: "job-x", status: JobStatus.PENDING }),
      loadBatch: vi.fn().mockResolvedValue({ jobs: {} }),
    } as unknown as IReactor;
    syncManager = makeManager(mockReactor);

    await addAccounts();
    channels[0].deadLetter.add(nonKeyedOp("d1", "doc-b"));

    await syncManager.requeueDeadLetter("accounts", "d1");

    await vi.waitFor(() => expect(mockReactor.load).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockDeadLetterStorage.remove).not.toHaveBeenCalled();
  });

  it("drops the durable row only after the retry reaches terminal success, not at the pending enqueue", async () => {
    let releaseTerminal: (() => void) | undefined;
    const terminalGate = new Promise<void>((resolve) => {
      releaseTerminal = resolve;
    });
    // The job is enqueued PENDING; terminal success is withheld until the gate
    // opens, so the drop cannot happen at the PENDING enqueue boundary.
    mockReactor = {
      load: vi
        .fn()
        .mockResolvedValue({ id: "job-x", status: JobStatus.PENDING }),
      getJobStatus: vi.fn(() =>
        terminalGate.then(() => ({
          id: "job-x",
          status: JobStatus.READ_READY,
        })),
      ),
      loadBatch: vi.fn().mockResolvedValue({ jobs: {} }),
    } as unknown as IReactor;
    syncManager = makeManager(mockReactor);

    await addAccounts();
    channels[0].deadLetter.add(nonKeyedOp("d1", "doc-b"));

    await syncManager.requeueDeadLetter("accounts", "d1");

    await vi.waitFor(() => expect(mockReactor.load).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockDeadLetterStorage.remove).not.toHaveBeenCalled();

    releaseTerminal?.();
    await vi.waitFor(() =>
      expect(mockDeadLetterStorage.remove).toHaveBeenCalledWith("d1"),
    );
  });

  it("keeps the durable row when the retry fails terminally, so loadDeadLetters can restore it", async () => {
    mockReactor = {
      load: vi
        .fn()
        .mockResolvedValue({ id: "job-x", status: JobStatus.PENDING }),
      getJobStatus: vi.fn().mockResolvedValue({
        id: "job-x",
        status: JobStatus.FAILED,
        error: { name: "Error", message: "boom" },
      }),
      loadBatch: vi.fn().mockResolvedValue({ jobs: {} }),
    } as unknown as IReactor;
    syncManager = makeManager(mockReactor);

    await addAccounts();
    channels[0].deadLetter.add(nonKeyedOp("d1", "doc-b"));

    await syncManager.requeueDeadLetter("accounts", "d1");

    // The op is re-dead-lettered (deadLetter.add fires a second time); the
    // durable row must survive so a restart can restore it.
    await vi.waitFor(() =>
      expect(channels[0].deadLetter.add).toHaveBeenCalledTimes(2),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockDeadLetterStorage.remove).not.toHaveBeenCalled();
  });

  it("drops only the successful op's row when a requeued op succeeds and another fails", async () => {
    mockReactor = {
      load: vi
        .fn()
        .mockResolvedValue({ id: "job-x", status: JobStatus.PENDING }),
      getJobStatus: vi.fn((jobId: string) =>
        jobId === "job-kA"
          ? Promise.resolve({ id: jobId, status: JobStatus.READ_READY })
          : Promise.resolve({
              id: jobId,
              status: JobStatus.FAILED,
              error: { name: "Error", message: "boom" },
            }),
      ),
      loadBatch: vi.fn((request: BatchLoadRequest) => {
        const jobs: Record<string, { id: string; status: JobStatus }> = {};
        for (const job of request.jobs) {
          jobs[job.key] = { id: `job-${job.key}`, status: JobStatus.PENDING };
        }
        return Promise.resolve({ jobs });
      }),
    } as unknown as IReactor;
    syncManager = makeManager(mockReactor);

    await addAccounts();
    channels[0].deadLetter.add(keyedOp("dA", "kA", "doc-a"));
    channels[0].deadLetter.add(keyedOp("dB", "kB", "doc-b"));

    await syncManager.requeueDeadLetter("accounts", "dA");
    await syncManager.requeueDeadLetter("accounts", "dB");

    // The successful op's row is dropped; the failed op's row is kept.
    await vi.waitFor(() =>
      expect(mockDeadLetterStorage.remove).toHaveBeenCalledWith("dA"),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockDeadLetterStorage.remove).not.toHaveBeenCalledWith("dB");
  });
});

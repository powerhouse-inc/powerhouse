import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IOperationIndex } from "../../src/cache/operation-index-types.js";
import { DriveCollectionId } from "../../src/cache/operation-index-types.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../src/core/drive-container-types.js";
import type { IReactor } from "../../src/core/types.js";
import type { IEventBus } from "../../src/events/interfaces.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import type {
  ISyncCursorStorage,
  ISyncDeadLetterStorage,
  ISyncRemoteStorage,
} from "../../src/storage/interfaces.js";
import type { IChannel, IChannelFactory } from "../../src/sync/interfaces.js";
import { Mailbox } from "../../src/sync/mailbox.js";
import { SyncManager } from "../../src/sync/sync-manager.js";
import { SyncOperation } from "../../src/sync/sync-operation.js";
import {
  SyncOperationStatus,
  type ChannelConfig,
} from "../../src/sync/types.js";
import { settledAtHead } from "../catch-up/helpers.js";

const REMOTE = "remote-1";
const COLLECTION = DriveCollectionId.forDrive("collection-1");

function inboxItem(
  id: string,
  documentId: string,
  ordinal: number,
  actionType: string,
  jobId = `key-${id}`,
): SyncOperation {
  const operations: OperationWithContext[] = [
    {
      operation: {
        id: `op-${id}`,
        index: ordinal,
        skip: 0,
        hash: `h-${id}`,
        timestampUtcMs: String(ordinal * 1000),
        action: {
          id: `action-${id}`,
          type: actionType,
          scope: "global",
          timestampUtcMs: String(ordinal * 1000),
          input: {},
        },
      },
      context: {
        documentId,
        documentType: "test",
        scope: "global",
        branch: "main",
        ordinal,
      },
    } as OperationWithContext,
  ];
  return new SyncOperation(
    id,
    jobId,
    [],
    REMOTE,
    documentId,
    ["global"],
    "main",
    operations,
  );
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

function jobInfo(id: string, status: JobStatus, error?: Error): JobInfo {
  return {
    id,
    documentId: "",
    status,
    createdAtUtcIso: new Date(0).toISOString(),
    error:
      error === undefined
        ? undefined
        : {
            name: error.name,
            message: error.message,
            stack: error.stack ?? "",
            source: error,
          },
    consistencyToken: "" as unknown as JobInfo["consistencyToken"],
    meta: {} as unknown as JobInfo["meta"],
  };
}

describe("the inbox ack across documents applying out of order", () => {
  let syncManager: SyncManager;
  let reactor: IReactor;
  let inbox: Mailbox;
  let deadLetter: Mailbox;
  let statuses: Map<string, JobInfo>;

  function createChannel(): IChannel {
    inbox = new Mailbox({ holdAckBelowMarkers: true });
    deadLetter = new Mailbox();
    return {
      inbox,
      outbox: new Mailbox({ holdAckBelowUnapplied: false }),
      deadLetter,
      init: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
      getConnectionState: vi.fn().mockReturnValue({
        state: "connected",
        failureCount: 0,
        lastSuccessUtcMs: 0,
        lastFailureUtcMs: 0,
        pushBlocked: false,
        pushFailureCount: 0,
        receivingPages: false,
        requiresAuth: false,
      }),
      onConnectionStateChange: vi.fn().mockReturnValue(() => {}),
      triggerPull: vi.fn(),
      notePoll: vi.fn(),
      lastHolderPollUtcMs: vi.fn().mockReturnValue(undefined),
    } as IChannel;
  }

  beforeEach(async () => {
    statuses = new Map();
    const channel = createChannel();

    const remoteStorage: ISyncRemoteStorage = {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const cursorStorage: ISyncCursorStorage = {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue({
        remoteName: REMOTE,
        cursorType: "inbox",
        cursorOrdinal: 0,
      }),
      upsert: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const deadLetterStorage: ISyncDeadLetterStorage = {
      list: vi.fn().mockResolvedValue({
        results: [],
        options: { cursor: "0", limit: 10 },
      }),
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      removeByRemote: vi.fn().mockResolvedValue(undefined),
      listQuarantinedDocumentIds: vi.fn().mockResolvedValue([]),
    };
    const channelFactory: IChannelFactory = {
      instance: vi.fn().mockReturnValue(channel),
    };
    const operationIndex = {
      start: vi.fn(),
      commit: vi.fn().mockResolvedValue([]),
      find: vi
        .fn()
        .mockResolvedValue({ results: [], options: { cursor: "0", limit: 1 } }),
      get: vi
        .fn()
        .mockResolvedValue({ results: [], options: { cursor: "0", limit: 1 } }),
      getSinceOrdinal: vi.fn().mockResolvedValue({
        results: [],
        options: { cursor: "0", limit: 1 },
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

    reactor = {
      load: vi.fn((documentId: string) =>
        Promise.resolve(jobInfo(`job-load-${documentId}`, JobStatus.PENDING)),
      ),
      getJobStatus: vi.fn((jobId: string) =>
        Promise.resolve(
          statuses.get(jobId) ?? jobInfo(jobId, JobStatus.RUNNING),
        ),
      ),
      loadBatch: vi.fn((request: { jobs: Array<{ key: string }> }) => {
        const jobs: Record<string, JobInfo> = {};
        for (const job of request.jobs) {
          jobs[job.key] = jobInfo(`job-${job.key}`, JobStatus.PENDING);
        }
        return Promise.resolve({ jobs });
      }),
    } as unknown as IReactor;

    const eventBus: IEventBus = {
      subscribe: vi.fn().mockReturnValue(() => {}),
      emit: vi.fn().mockResolvedValue(undefined),
    } as unknown as IEventBus;

    syncManager = new SyncManager(
      new ConsoleLogger(["head-of-line"]),
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
    const config: ChannelConfig = { type: "internal", parameters: {} };
    await syncManager.add(REMOTE, COLLECTION, config, {
      documentId: [],
      scope: ["global"],
      branch: "main",
    });
  });

  afterEach(() => {
    syncManager.shutdown();
  });

  /**
   * Unkeyed items load beside one another, so a later document can apply while
   * an earlier one is still loading. The ack is the highest applied ordinal and
   * used to pass the earlier item, which a restart then never asked for again.
   */
  it("holds the ack below an unkeyed load still running", async () => {
    const stalled = inboxItem("osq", "osq-doc", 10, "ADD_ENTRY", "");
    const rename = inboxItem("kbc", "kbc-ledger", 11, "SET_NAME", "");
    statuses.set(
      "job-load-kbc-ledger",
      jobInfo("job-load-kbc-ledger", JobStatus.READ_READY),
    );

    inbox.add(stalled, rename);
    await settle();

    expect(rename.status).toBe(SyncOperationStatus.Applied);
    expect(inbox.get(stalled.id)).toBe(stalled);
    expect(inbox.ackOrdinal).toBe(9);
  });
});

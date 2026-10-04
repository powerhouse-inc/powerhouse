import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IOperationIndex } from "../../src/cache/operation-index-types.js";
import { DriveCollectionId } from "../../src/cache/operation-index-types.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../src/core/drive-container-types.js";
import type { IReactor } from "../../src/core/types.js";
import type { IEventBus } from "../../src/events/interfaces.js";
import { JobStatus, type JobInfo } from "../../src/shared/types.js";
import type {
  DeadLetterRecord,
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
const DOC = "quarantined-doc";

function inboxItem(ordinal: number, documentId = DOC): SyncOperation {
  const operations: OperationWithContext[] = [
    {
      operation: {
        id: `op-${ordinal}`,
        index: ordinal,
        skip: 0,
        hash: `h-${ordinal}`,
        timestampUtcMs: String(ordinal * 1000),
        action: {
          id: `action-${ordinal}`,
          type: "ADD_ENTRY",
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
    `s${ordinal}`,
    `key-${ordinal}`,
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
    documentId: DOC,
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

function hashMismatch(): Error {
  const error = new Error("operation hash does not match");
  error.name = "HashMismatchError";
  return error;
}

/**
 * Operations arriving for a quarantined document were acknowledged and dropped.
 * The ack floor released and the cursor advanced past them with no durable
 * record anywhere, so requeuing the dead letter that caused the quarantine
 * restored that one operation and the whole quarantine window was gone -- every
 * later operation then dead-lettered MISSING_OPERATIONS forever.
 */
describe("operations arriving while a document is quarantined", () => {
  let syncManager: SyncManager;
  let inbox: Mailbox;
  let deadLetter: Mailbox;
  let statuses: Map<string, JobInfo>;
  let stored: DeadLetterRecord[];
  let removed: string[];
  let loadedOrdinals: number[];

  async function addRemote(): Promise<void> {
    const config: ChannelConfig = { type: "internal", parameters: {} };
    await syncManager.add(REMOTE, COLLECTION, config, {
      documentId: [],
      scope: ["global"],
      branch: "main",
    });
  }

  beforeEach(async () => {
    statuses = new Map();
    stored = [];
    removed = [];
    loadedOrdinals = [];
    inbox = new Mailbox({ holdAckBelowMarkers: true });
    deadLetter = new Mailbox();

    const channel = {
      inbox,
      outbox: new Mailbox({ holdAckBelowUnapplied: false }),
      deadLetter,
      init: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn(),
      getConnectionState: vi.fn().mockReturnValue({
        state: "connected",
        failureCount: 0,
        lastSuccessUtcMs: 0,
        lastFailureUtcMs: 0,
        pushBlocked: false,
        pushFailureCount: 0,
        receivingPages: false,
      }),
      onConnectionStateChange: vi.fn().mockReturnValue(() => {}),
      setLocalManifest: vi.fn(),
      onPeerManifest: vi.fn().mockReturnValue(() => {}),
      triggerPull: vi.fn(),
    } as unknown as IChannel;

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
      list: vi.fn(() =>
        Promise.resolve({
          results: [...stored].reverse(),
          options: { cursor: "0", limit: 100 },
        }),
      ),
      add: vi.fn((record: DeadLetterRecord) => {
        stored.push(record);
        return Promise.resolve(undefined);
      }),
      remove: vi.fn((id: string) => {
        removed.push(id);
        return Promise.resolve(undefined);
      }),
      removeByRemote: vi.fn().mockResolvedValue(undefined),
      listQuarantinedDocumentIds: vi.fn().mockResolvedValue([]),
    } as unknown as ISyncDeadLetterStorage;
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

    const reactor = {
      load: vi.fn().mockResolvedValue({ id: "job-load", status: "PENDING" }),
      getJobStatus: vi.fn((jobId: string) =>
        Promise.resolve(
          statuses.get(jobId) ?? jobInfo(jobId, JobStatus.RUNNING),
        ),
      ),
      loadBatch: vi.fn(
        (request: {
          jobs: Array<{ key: string; operations: Array<{ index: number }> }>;
        }) => {
          const jobs: Record<string, JobInfo> = {};
          for (const job of request.jobs) {
            for (const operation of job.operations) {
              loadedOrdinals.push(operation.index);
            }
            jobs[job.key] = jobInfo(`job-${job.key}`, JobStatus.PENDING);
          }
          return Promise.resolve({ jobs });
        },
      ),
    } as unknown as IReactor;

    const eventBus: IEventBus = {
      subscribe: vi.fn().mockReturnValue(() => {}),
      emit: vi.fn().mockResolvedValue(undefined),
    } as unknown as IEventBus;

    syncManager = new SyncManager(
      new ConsoleLogger(["quarantine-window"]),
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
    await addRemote();
  });

  /** Quarantines the document on the operation at ordinal 10. */
  async function quarantine(): Promise<void> {
    statuses.set(
      "job-key-10",
      jobInfo("job-key-10", JobStatus.FAILED, hashMismatch()),
    );
    inbox.add(inboxItem(10));
    await settle();
    expect(stored.map((record) => record.id)).toEqual(["s10"]);
    expect(stored[0].errorType).toBe("HASH_MISMATCH");
  }

  it("dead-letters them instead of dropping them, and lets the cursor past", async () => {
    await quarantine();

    const gap = [inboxItem(11), inboxItem(12), inboxItem(13)];
    inbox.add(...gap);
    await settle();

    // Each one has a durable record standing for it, classified as its own kind
    // so the row does not itself quarantine the document.
    expect(stored.map((record) => record.id)).toEqual([
      "s10",
      "s11",
      "s12",
      "s13",
    ]);
    for (const record of stored.slice(1)) {
      expect(record.errorType).toBe("QUARANTINED_GAP");
      expect(record.operations).toHaveLength(1);
    }
    expect(deadLetter.items.map((item) => item.id)).toEqual([
      "s10",
      "s11",
      "s12",
      "s13",
    ]);

    // The quarantine window was never handed to the reactor.
    expect(loadedOrdinals).toEqual([10]);
    expect(inbox.items).toEqual([]);

    // A dead letter does let the cursor past it: nothing of the window holds
    // the ack floor, so a later document's apply carries the cursor over it.
    statuses.set("job-key-20", jobInfo("job-key-20", JobStatus.READ_READY));
    inbox.add(inboxItem(20, "healthy-doc"));
    await settle();

    expect(inbox.ackOrdinal).toBe(20);
  });

  it("restores the document when the window is requeued oldest-first", async () => {
    await quarantine();
    inbox.add(inboxItem(11), inboxItem(12), inboxItem(13));
    await settle();

    for (const ordinal of [10, 11, 12, 13]) {
      statuses.set(
        `job-key-${ordinal}`,
        jobInfo(`job-key-${ordinal}`, JobStatus.READ_READY),
      );
      await syncManager.requeueDeadLetter(REMOTE, `s${ordinal}`);
      await settle();
    }

    // Every operation of the window reached the reactor, in order, and nothing
    // is left held or dead-lettered.
    expect(loadedOrdinals).toEqual([10, 10, 11, 12, 13]);
    expect(removed).toEqual(["s10", "s11", "s12", "s13"]);
    expect(deadLetter.items).toEqual([]);
    expect(inbox.items).toEqual([]);
  });

  it("re-parks a window operation that arrives while the quarantine stands", async () => {
    await quarantine();

    const late = inboxItem(11);
    inbox.add(late);
    await settle();

    expect(late.status).toBe(SyncOperationStatus.Error);
    expect(late.error?.errorType).toBe("QUARANTINED_GAP");
    expect(deadLetter.get("s11")).toBe(late);
  });
});

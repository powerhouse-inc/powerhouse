import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IOperationIndex } from "../../src/cache/operation-index-types.js";
import { DriveCollectionId } from "../../src/cache/operation-index-types.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../src/core/drive-container-types.js";
import type { IReactor } from "../../src/core/types.js";
import type { IEventBus } from "../../src/events/interfaces.js";
import { ExcessiveReshuffleError } from "../../src/shared/errors.js";
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
    `key-${id}`,
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

/**
 * One document's failing or stalled load used to stop the channel: the inbox
 * apply ran as a single chain and awaited each item's job in turn, so an
 * unrelated document's operations queued behind it never applied at all. See
 * docs/bugs/2026-10-04-excessive-shuffle-analysis.md.
 */
describe("inbox head-of-line blocking across documents", () => {
  let syncManager: SyncManager;
  let channel: IChannel;
  let inbox: Mailbox;
  let deadLetter: Mailbox;
  let statuses: Map<string, JobInfo>;

  function createChannel(): IChannel {
    inbox = new Mailbox({
      holdAckBelowMarkers: true,
      holdAckBelowUnapplied: true,
    });
    deadLetter = new Mailbox();
    return {
      inbox,
      outbox: new Mailbox(),
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
  }

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
    channel = createChannel();

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

    const reactor = {
      load: vi.fn().mockResolvedValue({ id: "job-load", status: "PENDING" }),
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
    await addRemote();
  });

  /**
   * One batch, two documents, the stalled one first: the field's shape, where
   * the renames queued behind a stuck document never applied.
   */
  it("applies an unrelated document's rename from behind a stalled load", async () => {
    const stalled = inboxItem("osq", "osq-doc", 10, "ADD_ENTRY");
    const rename = inboxItem("kbc", "kbc-ledger", 11, "SET_NAME");

    statuses.set("job-key-kbc", jobInfo("job-key-kbc", JobStatus.READ_READY));

    inbox.add(stalled, rename);
    await settle();

    expect(rename.status).toBe(SyncOperationStatus.Applied);
    expect(inbox.get(rename.id)).toBeUndefined();

    expect(stalled.status).not.toBe(SyncOperationStatus.Applied);
    expect(stalled.status).not.toBe(SyncOperationStatus.Error);
    expect(inbox.get(stalled.id)).toBe(stalled);

    // Not past the load that is still running, however far the applied ordinal
    // reached.
    expect(inbox.ackOrdinal).toBe(9);
  });

  /**
   * A dead letter does let the cursor past it: there is a durable record
   * standing for the operation, and holding for it would re-pull the same
   * failure forever.
   */
  it("advances the cursor past a dead-lettered operation", async () => {
    const failing = inboxItem("osc", "osc-doc", 10, "ADD_SOURCE");
    const rename = inboxItem("kbc", "kbc-ledger", 11, "SET_NAME");

    statuses.set(
      "job-key-osc",
      jobInfo(
        "job-key-osc",
        JobStatus.FAILED,
        new ExcessiveReshuffleError("osc-doc", "global", 1612, 1000),
      ),
    );
    statuses.set("job-key-kbc", jobInfo("job-key-kbc", JobStatus.READ_READY));

    inbox.add(failing, rename);
    await settle();

    expect(deadLetter.items.map((item) => item.id)).toEqual(["osc"]);
    expect(inbox.get(failing.id)).toBeUndefined();
    expect(rename.status).toBe(SyncOperationStatus.Applied);
    expect(inbox.ackOrdinal).toBe(11);
  });

  /**
   * The same isolation across batches: a second arrival for a healthy document
   * does not wait for the first arrival's stalled document.
   */
  it("applies a later batch for a document the stalled one does not touch", async () => {
    const stalled = inboxItem("osq", "osq-doc", 10, "ADD_ENTRY");
    inbox.add(stalled);
    await settle();

    const rename = inboxItem("kbc", "kbc-ledger", 11, "SET_NAME");
    statuses.set("job-key-kbc", jobInfo("job-key-kbc", JobStatus.READ_READY));
    inbox.add(rename);
    await settle();

    expect(rename.status).toBe(SyncOperationStatus.Applied);
    expect(inbox.get(rename.id)).toBeUndefined();
    expect(inbox.get(stalled.id)).toBe(stalled);
    // Held at the stalled item, which is neither applied nor dead-lettered.
    expect(inbox.ackOrdinal).toBe(9);
  });

  /**
   * A document's loads still reach the queue in order even when the first one
   * never finishes, because that is what the FIFO dependency the plan injects
   * reads. Only the enqueue is ordered; the queue orders the writes.
   */
  it("keeps one document's loads in enqueue order behind a stalled load", async () => {
    const stalled = inboxItem("osq-1", "osq-doc", 10, "ADD_ENTRY");
    inbox.add(stalled);
    await settle();

    const later = inboxItem("osq-2", "osq-doc", 11, "ADD_ENTRY");
    statuses.set(
      "job-key-osq-2",
      jobInfo("job-key-osq-2", JobStatus.READ_READY),
    );
    inbox.add(later);
    await settle();

    const loadBatch = vi.mocked(
      (syncManager as unknown as { reactor: IReactor }).reactor.loadBatch,
    );
    expect(loadBatch.mock.calls[1][0].jobs[0].externalDeps).toEqual([
      "job-key-osq-1",
    ]);
    expect(inbox.ackOrdinal).toBe(9);
  });
});

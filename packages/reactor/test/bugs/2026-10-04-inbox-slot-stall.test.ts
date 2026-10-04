import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IOperationIndex } from "../../src/cache/operation-index-types.js";
import { DriveCollectionId } from "../../src/cache/operation-index-types.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../src/core/drive-container-types.js";
import type { IReactor } from "../../src/core/types.js";
import type { IEventBus } from "../../src/events/interfaces.js";
import { ReactorEventTypes } from "../../src/events/types.js";
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
const SLOTS = 8;

type EventHandler = (type: number, event: unknown) => unknown;

function inboxItem(documentId: string, ordinal: number): SyncOperation {
  const operations: OperationWithContext[] = [
    {
      operation: {
        id: `op-${documentId}-${ordinal}`,
        index: ordinal,
        skip: 0,
        hash: `h-${ordinal}`,
        timestampUtcMs: String(ordinal * 1000),
        action: {
          id: `action-${documentId}-${ordinal}`,
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
    `s-${documentId}-${ordinal}`,
    `key-${documentId}-${ordinal}`,
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

function jobInfo(id: string, status: JobStatus): JobInfo {
  return {
    id,
    documentId: "",
    status,
    createdAtUtcIso: new Date(0).toISOString(),
    consistencyToken: "" as unknown as JobInfo["consistencyToken"],
    meta: {} as unknown as JobInfo["meta"],
  };
}

/**
 * A chunk held its concurrency slot through the whole resolution, deferral waits
 * included, so eight chunks awaiting a missing ancestor's 30s time-to-live held
 * every slot and nothing else could even reach the queue -- the missing CREATE
 * among them, which is the one arrival that would have resolved them all.
 */
describe("inbox chunks deferred on a missing ancestor", () => {
  let syncManager: SyncManager;
  let inbox: Mailbox;
  let statuses: Map<string, JobInfo>;
  let enqueuedKeys: string[];
  let handlers: Map<number, EventHandler[]>;
  let eventBus: IEventBus;

  async function addRemote(): Promise<void> {
    const config: ChannelConfig = { type: "internal", parameters: {} };
    await syncManager.add(REMOTE, COLLECTION, config, {
      documentId: [],
      scope: ["global"],
      branch: "main",
    });
  }

  /** Marks a plan key's job terminal and wakes whoever is awaiting it. */
  async function complete(key: string): Promise<void> {
    statuses.set(`job-${key}`, jobInfo(`job-${key}`, JobStatus.READ_READY));
    await eventBus.emit(ReactorEventTypes.JOB_READ_READY, {
      jobId: `job-${key}`,
    });
    await settle();
  }

  beforeEach(async () => {
    statuses = new Map();
    enqueuedKeys = [];
    handlers = new Map();
    inbox = new Mailbox({ holdAckBelowMarkers: true });

    const channel = {
      inbox,
      outbox: new Mailbox({ holdAckBelowUnapplied: false }),
      deadLetter: new Mailbox(),
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
          enqueuedKeys.push(job.key);
          jobs[job.key] = jobInfo(`job-${job.key}`, JobStatus.PENDING);
        }
        return Promise.resolve({ jobs });
      }),
    } as unknown as IReactor;

    eventBus = {
      subscribe: vi.fn((type: number, handler: EventHandler) => {
        const existing = handlers.get(type) ?? [];
        existing.push(handler);
        handlers.set(type, existing);
        return () => {
          handlers.set(
            type,
            (handlers.get(type) ?? []).filter((h) => h !== handler),
          );
        };
      }),
      emit: vi.fn(async (type: number, event: unknown) => {
        for (const handler of [...(handlers.get(type) ?? [])]) {
          await handler(type, event);
        }
      }),
    } as unknown as IEventBus;

    syncManager = new SyncManager(
      new ConsoleLogger(["inbox-slot-stall"]),
      remoteStorage,
      cursorStorage,
      deadLetterStorage,
      channelFactory,
      operationIndex,
      reactor,
      eventBus,
      DEFAULT_DRIVE_CONTAINER_TYPES,
      settledAtHead(),
      { maxConcurrentInboxChunks: SLOTS },
    );

    await syncManager.startup();
    await addRemote();
  });

  /** Fills every slot with a chunk whose job never reaches a terminal status. */
  async function fillWithDeferring(): Promise<void> {
    for (let i = 0; i < SLOTS; i++) {
      inbox.add(inboxItem(`deferred-${i}`, 10 + i));
      await settle();
    }
    expect(enqueuedKeys).toHaveLength(SLOTS);
  }

  it("enqueues a later chunk while every slot's chunk is still deferring", async () => {
    await fillWithDeferring();

    inbox.add(inboxItem("later-doc", 100));
    await settle();

    expect(enqueuedKeys).toContain("key-later-doc-100");
    expect(enqueuedKeys).toHaveLength(SLOTS + 1);
  });

  it("enqueues a late ancestor and resolves the chunks deferred on it", async () => {
    await fillWithDeferring();

    // The arrival the deferred chunks are all waiting for.
    inbox.add(inboxItem("ancestor-doc", 200));
    await settle();
    expect(enqueuedKeys).toContain("key-ancestor-doc-200");

    await complete("key-ancestor-doc-200");

    for (let i = 0; i < SLOTS; i++) {
      await complete(`key-deferred-${i}-${10 + i}`);
    }

    expect(inbox.items).toEqual([]);
    expect(inbox.ackOrdinal).toBe(200);
  });

  it("still bounds concurrent enqueue work to the configured slots", async () => {
    let inFlight = 0;
    let peak = 0;
    const release: Array<() => void> = [];
    const reactor = (
      syncManager as unknown as { reactor: { loadBatch: unknown } }
    ).reactor;
    const original = reactor.loadBatch as (
      request: unknown,
    ) => Promise<unknown>;
    reactor.loadBatch = async (request: unknown) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise<void>((resolve) => release.push(resolve));
      inFlight--;
      return original(request);
    };

    for (let i = 0; i < SLOTS + 4; i++) {
      inbox.add(inboxItem(`doc-${i}`, 10 + i));
    }
    await settle();

    expect(peak).toBe(SLOTS);

    for (const resolve of [...release]) resolve();
    await settle();
    for (const resolve of [...release]) resolve();
    await settle();

    expect(enqueuedKeys).toHaveLength(SLOTS + 4);
    for (const item of inbox.items) {
      expect(item.status).not.toBe(SyncOperationStatus.Applied);
    }
  });
});

import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import { describe, expect, it, vi } from "vitest";
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
import { Mailbox } from "../../../src/sync/mailbox.js";
import { SyncManager } from "../../../src/sync/sync-manager.js";
import type { SyncOperationErrorType } from "../../../src/sync/types.js";
import { ChannelErrorSource } from "../../../src/sync/types.js";
import { settledAtHead } from "../../catch-up/helpers.js";

const REMOTE = "accounts";

/** A CREATE_DOCUMENT at base-reducer 2, which every reactor runs. */
function creation(documentId: string): OperationWithContext[] {
  return [
    {
      operation: {
        index: 0,
        skip: 0,
        id: `op-${documentId}`,
        timestampUtcMs: "2026-01-01T00:00:00.000Z",
        hash: "h",
        action: {
          id: `a-${documentId}`,
          type: "CREATE_DOCUMENT",
          scope: "document",
          timestampUtcMs: "2026-01-01T00:00:00.000Z",
          input: {
            documentId,
            model: "powerhouse/document-drive",
            version: 0,
            protocolVersions: { "base-reducer": 2 },
          },
        },
      },
      context: {
        documentId,
        documentType: "powerhouse/document-drive",
        scope: "document",
        branch: "main",
        ordinal: 1,
      },
    },
  ] as unknown as OperationWithContext[];
}

function record(
  id: string,
  errorType: SyncOperationErrorType,
): DeadLetterRecord {
  return {
    id,
    jobId: `job-${id}`,
    jobDependencies: [],
    remoteName: REMOTE,
    documentId: `doc-${id}`,
    scopes: ["document"],
    branch: "main",
    operations: creation(`doc-${id}`),
    errorSource: ChannelErrorSource.Inbox,
    errorMessage: "stored",
    errorType,
  };
}

/** Pages by offset, newest first, as the Kysely store does. */
function storage(rows: DeadLetterRecord[]): ISyncDeadLetterStorage {
  return {
    list: vi.fn((_name: string, paging?: { cursor: string; limit: number }) => {
      const start = Number(paging?.cursor ?? "0");
      const limit = paging?.limit ?? 100;
      const results = rows.slice(start, start + limit);
      return Promise.resolve({
        results,
        options: { cursor: String(start), limit },
        nextCursor:
          start + limit < rows.length ? String(start + limit) : undefined,
      });
    }),
    add: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    removeByRemote: vi.fn().mockResolvedValue(undefined),
    listQuarantinedDocumentIds: vi.fn().mockResolvedValue([]),
  };
}

function manager(deadLetters: ISyncDeadLetterStorage, limit: number) {
  let channel: IChannel | undefined;
  const channelFactory: IChannelFactory = {
    instance: vi.fn(() => {
      channel = {
        inbox: new Mailbox(),
        outbox: new Mailbox(),
        deadLetter: new Mailbox(),
        init: vi.fn().mockResolvedValue(undefined),
        shutdown: vi.fn().mockResolvedValue(undefined),
        getConnectionState: vi.fn().mockReturnValue({
          state: "connected",
          failureCount: 0,
          lastSuccessUtcMs: 1,
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
      } as unknown as IChannel;
      return channel;
    }),
  };
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
  const empty = { results: [], options: { cursor: "0", limit: 100 } };
  const operationIndex = {
    start: vi.fn(),
    commit: vi.fn().mockResolvedValue([]),
    find: vi.fn().mockResolvedValue(empty),
    get: vi.fn().mockResolvedValue(empty),
    getSinceOrdinal: vi.fn().mockResolvedValue(empty),
    getLatestTimestampForCollection: vi.fn().mockResolvedValue(null),
    getCollectionsForDocuments: vi.fn().mockResolvedValue({}),
    getGroupReferencers: vi.fn().mockResolvedValue([]),
    getOrdinalsByOpIds: vi.fn().mockResolvedValue(new Map()),
    getCollectionsInRange: vi.fn().mockResolvedValue([]),
    getOrdinalsInRange: vi.fn().mockResolvedValue([]),
    getByOrdinals: vi.fn().mockResolvedValue([]),
    getStreamAfter: vi.fn().mockResolvedValue([]),
  } as unknown as IOperationIndex;
  const eventBus = {
    subscribe: vi.fn(() => () => undefined),
    emit: vi.fn().mockResolvedValue(undefined),
  } as unknown as IEventBus;
  const reactor = {
    load: vi.fn(),
    loadBatch: vi.fn().mockResolvedValue({ jobs: {} }),
    getJobStatus: vi.fn(),
  } as unknown as IReactor;

  const syncManager = new SyncManager(
    new ConsoleLogger(["SyncManager"]),
    remoteStorage,
    cursorStorage,
    deadLetters,
    channelFactory,
    operationIndex,
    reactor,
    eventBus,
    DEFAULT_DRIVE_CONTAINER_TYPES,
    settledAtHead(),
    { maxDeadLettersPerRemote: limit },
    undefined,
    undefined,
    { listPurged: () => Promise.resolve([]) },
  );
  return { syncManager, channel: () => channel! };
}

describe("loading dead letters past stale refusals", () => {
  it("drops stale refusals before the limit and awaits their deletes", async () => {
    // Newest first: two refusals of documents this reactor runs, then a real one.
    const deadLetters = storage([
      record("r1", "UNSUPPORTED_PROTOCOL"),
      record("r2", "UNSUPPORTED_PROTOCOL"),
      record("d1", "UNCLASSIFIED"),
    ]);
    const { syncManager, channel } = manager(deadLetters, 2);

    await syncManager.add(
      REMOTE,
      DriveCollectionId.forDrive("drive-1"),
      { type: "gql", parameters: { url: "https://x/graphql" } },
      { documentId: [], scope: [], branch: "main" },
      { sinceTimestampUtcMs: "0" },
    );

    expect(channel().deadLetter.items.map((item) => item.id)).toEqual(["d1"]);
    expect(vi.mocked(deadLetters.remove).mock.calls.map(([id]) => id)).toEqual([
      "r1",
      "r2",
    ]);
  });
});

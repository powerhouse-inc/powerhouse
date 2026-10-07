import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IOperationIndex } from "../../../src/cache/operation-index-types.js";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../../src/core/drive-container-types.js";
import type { IReactor } from "../../../src/core/types.js";
import type { IEventBus } from "../../../src/events/interfaces.js";
import { JobStatus } from "../../../src/shared/types.js";
import type {
  DeadLetterRecord,
  ISyncCursorStorage,
  ISyncDeadLetterStorage,
  ISyncRemoteStorage,
} from "../../../src/storage/interfaces.js";
import type {
  ConnectionStateChangeCallback,
  IChannel,
  IChannelFactory,
} from "../../../src/sync/interfaces.js";
import { Mailbox } from "../../../src/sync/mailbox.js";
import { SyncManager } from "../../../src/sync/sync-manager.js";
import { SyncOperation } from "../../../src/sync/sync-operation.js";
import {
  ChannelErrorSource,
  type ConnectionStateSnapshot,
  type RemoteRecord,
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

function served(id: string, documentId: string, ordinal: number) {
  const syncOp = new SyncOperation(
    id,
    "",
    [],
    "remote",
    documentId,
    ["global"],
    "main",
    [
      {
        operation: {
          index: 0,
          skip: 0,
          id: `op-${id}`,
          timestampUtcMs: new Date().toISOString(),
          hash: "h",
          action: {
            type: "TEST_OP",
            id: `a-${id}`,
            scope: "global",
            timestampUtcMs: new Date().toISOString(),
            input: {},
          },
        },
        context: {
          documentId,
          documentType: "test/doc",
          scope: "global",
          branch: "main",
          ordinal,
        },
      },
    ] as unknown as OperationWithContext[],
  );
  syncOp.transported();
  return syncOp;
}

/** Pulls everything above its stored inbox cursor on init, as a poller would. */
class PullingChannel {
  readonly inbox = new Mailbox({ holdAckBelowMarkers: true });
  readonly outbox = new Mailbox();
  readonly deadLetter = new Mailbox();

  constructor(
    private readonly name: string,
    private readonly cursors: Map<string, number>,
  ) {
    this.inbox.onRemoved(() => {
      const ack = this.inbox.ackOrdinal;
      if (ack > (this.cursors.get(this.name) ?? 0)) {
        this.cursors.set(this.name, ack);
      }
    });
  }

  init(): Promise<void> {
    const from = this.cursors.get(this.name) ?? 0;
    this.inbox.init(from);
    const pulled = [served("p", "doc-b", 10), served("q", "doc-c", 20)].filter(
      (syncOp) => syncOp.operations[0].context.ordinal > from,
    );
    if (pulled.length > 0) this.inbox.add(...pulled);
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  getConnectionState(): ConnectionStateSnapshot {
    return CONNECTED;
  }

  onConnectionStateChange(_callback: ConnectionStateChangeCallback) {
    return () => {};
  }

  triggerPull(): void {}

  notePoll(): void {}

  lastHolderPollUtcMs(): number | undefined {
    return undefined;
  }
}

describe("an inbox item parked by a quarantine", () => {
  const cursors = new Map<string, number>();
  let records: RemoteRecord[];
  let rows: DeadLetterRecord[];
  let reactor: IReactor;
  let managers: SyncManager[];

  function storages() {
    const remoteStorage: ISyncRemoteStorage = {
      list: vi.fn(() => Promise.resolve([...records])),
      get: vi.fn(),
      upsert: vi.fn((record: RemoteRecord) => {
        records = [...records.filter((r) => r.name !== record.name), record];
        return Promise.resolve();
      }),
      remove: vi.fn(() => Promise.resolve()),
    } as unknown as ISyncRemoteStorage;
    const cursorStorage: ISyncCursorStorage = {
      list: vi.fn(() => Promise.resolve([])),
      get: vi.fn(),
      upsert: vi.fn(() => Promise.resolve()),
      remove: vi.fn(() => Promise.resolve()),
    } as unknown as ISyncCursorStorage;
    const deadLetterStorage: ISyncDeadLetterStorage = {
      list: vi.fn((remoteName: string) =>
        Promise.resolve({
          results: rows.filter((row) => row.remoteName === remoteName),
          options: { cursor: "0", limit: 100 },
        }),
      ),
      add: vi.fn(() => Promise.resolve()),
      remove: vi.fn((id: string) => {
        rows = rows.filter((row) => row.id !== id);
        return Promise.resolve();
      }),
      removeByRemote: vi.fn(() => Promise.resolve()),
      listQuarantinedDocumentIds: vi.fn(
        (_signal?: AbortSignal, exceptIds: readonly string[] = []) =>
          Promise.resolve(
            rows
              .filter((row) => !exceptIds.includes(row.id))
              .map((row) => row.documentId),
          ),
      ),
    };
    return { remoteStorage, cursorStorage, deadLetterStorage };
  }

  function makeManager(): SyncManager {
    const { remoteStorage, cursorStorage, deadLetterStorage } = storages();
    const channelFactory: IChannelFactory = {
      instance: (_id, name) =>
        new PullingChannel(name, cursors) as unknown as IChannel,
    };
    const operationIndex = {
      find: vi.fn().mockResolvedValue({
        results: [],
        options: { cursor: "0", limit: 500 },
      }),
      getCollectionsInRange: vi.fn().mockResolvedValue([]),
    } as unknown as IOperationIndex;
    const eventBus = {
      subscribe: vi.fn(() => () => undefined),
      emit: vi.fn(() => Promise.resolve()),
    } as unknown as IEventBus;
    const manager = new SyncManager(
      new ConsoleLogger(["quarantine-cursor-hold"]),
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
    managers.push(manager);
    return manager;
  }

  function loadedDocuments(): string[] {
    return vi
      .mocked(reactor.load)
      .mock.calls.map(([documentId]) => documentId as string);
  }

  beforeEach(() => {
    cursors.clear();
    records = [];
    rows = [
      {
        id: "d1",
        jobId: "",
        jobDependencies: [],
        remoteName: "remote",
        documentId: "doc-b",
        scopes: ["global"],
        branch: "main",
        operations: [],
        errorSource: ChannelErrorSource.Inbox,
        errorMessage: "broken",
        errorType: "UNCLASSIFIED",
      },
    ];
    managers = [];
    reactor = {
      load: vi.fn((documentId: string) =>
        Promise.resolve({ id: `job-${documentId}`, status: JobStatus.PENDING }),
      ),
      getJobStatus: vi.fn((id: string) =>
        Promise.resolve({ id, status: JobStatus.READ_READY }),
      ),
      loadBatch: vi.fn().mockResolvedValue({ jobs: {} }),
    } as unknown as IReactor;
  });

  afterEach(() => {
    for (const manager of managers) manager.shutdown();
  });

  async function pullAndApplyLaterOps(manager: SyncManager): Promise<void> {
    await manager.startup();
    await manager.add(
      "remote",
      DriveCollectionId.forDrive("drive-1"),
      { type: "pull", parameters: {} },
      { documentId: [], scope: [], branch: "main" },
      { sinceTimestampUtcMs: "0" },
    );
    await vi.waitFor(() => expect(loadedDocuments()).toContain("doc-c"));
    await vi.waitFor(() => expect(cursors.get("remote")).toBeDefined());
    expect(loadedDocuments()).not.toContain("doc-b");
  }

  it("is pulled again after a reset and applied once the quarantine lifts", async () => {
    const manager = makeManager();
    await pullAndApplyLaterOps(manager);

    await manager.resetChannel("remote");
    await manager.clearDeadLetter("remote", "d1");

    await vi.waitFor(() => expect(loadedDocuments()).toContain("doc-b"));
  });

  it("is pulled again after a restart and applied once the quarantine lifts", async () => {
    const first = makeManager();
    await pullAndApplyLaterOps(first);
    first.shutdown();

    const second = makeManager();
    await second.startup();
    await second.clearDeadLetter("remote", "d1");

    await vi.waitFor(() => expect(loadedDocuments()).toContain("doc-b"));
  });
});

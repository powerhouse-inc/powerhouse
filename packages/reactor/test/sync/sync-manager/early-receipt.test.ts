import { settledAtHead } from "../../catch-up/helpers.js";
import { ConsoleLogger } from "document-model";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../../src/core/drive-container-types.js";
import type { IReactor } from "../../../src/core/types.js";
import { EventBus } from "../../../src/events/event-bus.js";
import type { ISyncCursorStorage } from "../../../src/storage/interfaces.js";
import { GqlResponseChannel } from "../../../src/sync/channels/gql-res-channel.js";
import type { IChannelFactory } from "../../../src/sync/interfaces.js";
import { SyncManager } from "../../../src/sync/sync-manager.js";
import { SyncOperation } from "../../../src/sync/sync-operation.js";
import {
  createTestOperation,
  testSyncStorageBackends,
  type TestSyncStorage,
} from "../../factories.js";

const COLLECTION = DriveCollectionId.forDrive("drive");
const FILTER = { documentId: [], scope: [], branch: "main" };

function received(remoteName: string): SyncOperation {
  return new SyncOperation(
    "sync-1",
    "job-1",
    [],
    remoteName,
    "drive",
    ["document"],
    "main",
    [
      {
        operation: createTestOperation("drive", { index: 0 }),
        context: {
          documentId: "drive",
          documentType: "powerhouse/document-drive",
          scope: "document",
          branch: "main",
          ordinal: 1,
        },
      },
    ],
  );
}

describe("a push that reaches a remote before its inbox is wired", () => {
  let storage: TestSyncStorage;
  let manager: SyncManager;
  let reactor: { load: Mock; getJobStatus: Mock; loadBatch: Mock };

  function build(): SyncManager {
    return new SyncManager(
      new ConsoleLogger(["SyncManager"]),
      storage.syncRemoteStorage,
      storage.syncCursorStorage,
      storage.syncDeadLetterStorage,
      {
        instance: (
          remoteId: string,
          remoteName: string,
          _config: unknown,
          cursorStorage: ISyncCursorStorage,
        ) =>
          new GqlResponseChannel(
            new ConsoleLogger(["GqlResponseChannel"]),
            remoteId,
            remoteName,
            cursorStorage,
          ),
      } as unknown as IChannelFactory,
      new KyselyOperationIndex(storage.db),
      reactor as unknown as IReactor,
      new EventBus(),
      DEFAULT_DRIVE_CONTAINER_TYPES,
      settledAtHead(),
    );
  }

  // The remote is reachable by name while its dead letters load.
  function pushDuringDeadLetterLoad(): void {
    const list = storage.syncDeadLetterStorage.list.bind(
      storage.syncDeadLetterStorage,
    );
    vi.spyOn(storage.syncDeadLetterStorage, "list").mockImplementation(
      async (name, paging) => {
        manager.getByName(name).channel.inbox.add(received(name));
        return list(name, paging);
      },
    );
  }

  beforeEach(async () => {
    storage = await testSyncStorageBackends[0].create();
    reactor = {
      load: vi.fn(),
      getJobStatus: vi.fn(),
      loadBatch: vi.fn().mockResolvedValue({ jobs: {} }),
    };
    manager = build();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await manager.shutdown().completed;
    await storage.cleanup();
  });

  it("loads it once the remote is added", async () => {
    await manager.startup();
    pushDuringDeadLetterLoad();

    await manager.add(
      "client",
      COLLECTION,
      { type: "polling", parameters: {} },
      FILTER,
      {},
      "client-1",
      null,
    );

    await vi.waitFor(() => expect(reactor.loadBatch).toHaveBeenCalledOnce());
  });

  it("loads it once a stored remote is restored at startup", async () => {
    await manager.startup();
    await manager.add(
      "client",
      COLLECTION,
      { type: "polling", parameters: {} },
      FILTER,
      {},
      "client-1",
      null,
    );
    await manager.shutdown().completed;

    manager = build();
    pushDuringDeadLetterLoad();
    await manager.startup();

    await vi.waitFor(() => expect(reactor.loadBatch).toHaveBeenCalledOnce());
  });
});

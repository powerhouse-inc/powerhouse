import { settledAtHead } from "../../catch-up/helpers.js";
import {
  mergePeerCapabilities,
  PEER_CAPABILITIES,
  type PeerCapability,
} from "@powerhousedao/shared/document-model";
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
import { syncOperationErrorType } from "../../../src/sync/utils.js";
import {
  createTestOperation,
  testSyncStorageBackends,
  type TestSyncStorage,
} from "../../factories.js";

const COLLECTION = DriveCollectionId.forDrive("stored");
const FILTER = { documentId: [], scope: [], branch: "main" };

const NARROWED: PeerCapability = {
  kind: "protocol",
  name: "test-protocol",
  baseline: [1],
  supported: () => [1],
  optional: true,
};

describe("receipt into a stored document this reactor no longer runs", () => {
  let storage: TestSyncStorage;
  let manager: SyncManager;
  let reactor: { load: Mock; getJobStatus: Mock; loadBatch: Mock };

  beforeEach(async () => {
    storage = await testSyncStorageBackends[0].create();
    reactor = {
      load: vi.fn(),
      getJobStatus: vi.fn(),
      loadBatch: vi.fn().mockResolvedValue({ jobs: {} }),
    };
    manager = new SyncManager(
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
      {},
      {
        capabilities: mergePeerCapabilities(PEER_CAPABILITIES, [NARROWED]),
        flags: {},
        protocolVersionsOf: () => Promise.resolve({ "test-protocol": 2 }),
      },
    );
    await manager.startup();
  });

  afterEach(async () => {
    await manager.shutdown().completed;
    await storage.cleanup();
  });

  it("refuses a write from a peer whose record covers the local set", async () => {
    // A silent peer's baselines cover what this narrowed reactor runs.
    await manager.add(
      "client",
      COLLECTION,
      { type: "polling", parameters: {} },
      FILTER,
      {},
      "client-1",
      null,
    );
    const channel = manager.getByName("client").channel;
    const operation = createTestOperation("stored", { index: 1 });
    const syncOp = new SyncOperation(
      "sync-1",
      "job-1",
      [],
      "client",
      "stored",
      ["global"],
      "main",
      [
        {
          operation,
          context: {
            documentId: "stored",
            documentType: "powerhouse/document-drive",
            scope: "global",
            branch: "main",
            ordinal: 1,
          },
        },
      ],
    );

    channel.inbox.add(syncOp);

    await vi.waitFor(() => expect(channel.deadLetter.items).toHaveLength(1));
    expect(syncOperationErrorType(channel.deadLetter.items[0].error)).toBe(
      "UNSUPPORTED_PROTOCOL",
    );
    expect(reactor.load).not.toHaveBeenCalled();
    expect(reactor.loadBatch).not.toHaveBeenCalled();
  });
});

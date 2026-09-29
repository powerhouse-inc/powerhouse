import {
  deriveOperationId,
  mergePeerCapabilities,
  PEER_CAPABILITIES,
  type PeerCapability,
} from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../../src/core/drive-container-types.js";
import type { IReactor } from "../../../src/core/types.js";
import { EventBus } from "../../../src/events/event-bus.js";
import type { ISyncCursorStorage } from "../../../src/storage/interfaces.js";
import { KyselySyncHoldStorage } from "../../../src/storage/kysely/sync-hold-storage.js";
import { GqlResponseChannel } from "../../../src/sync/channels/gql-res-channel.js";
import type { IChannelFactory } from "../../../src/sync/interfaces.js";
import { SyncManager } from "../../../src/sync/sync-manager.js";
import {
  testSyncStorageBackends,
  type TestSyncStorage,
} from "../../factories.js";
import { manifestFor, WIDE } from "../peer-agreement/fleet.js";

const COLLECTION = DriveCollectionId.forDrive("drive-held");
const FILTER = { documentId: [], scope: [], branch: "main" };

const WIDE_PROTOCOL: PeerCapability = {
  kind: "protocol",
  name: "test-protocol",
  baseline: [1],
  supported: () => [1, 2],
  optional: true,
};

describe.each(testSyncStorageBackends)(
  "a hold across a restart ($name)",
  ({ create }) => {
    let storage: TestSyncStorage;
    const managers: SyncManager[] = [];

    const factory = {
      instance: (
        remoteId: string,
        remoteName: string,
        _config: unknown,
        cursorStorage: ISyncCursorStorage,
      ) =>
        new GqlResponseChannel(
          new ConsoleLogger(["test"]),
          remoteId,
          remoteName,
          cursorStorage,
        ),
    } as unknown as IChannelFactory;

    async function start(): Promise<SyncManager> {
      const manager = new SyncManager(
        new ConsoleLogger(["SyncManager"]),
        storage.syncRemoteStorage,
        storage.syncCursorStorage,
        storage.syncDeadLetterStorage,
        factory,
        new KyselyOperationIndex(storage.db),
        {
          load: vi.fn(),
          getJobStatus: vi.fn(),
          loadBatch: vi.fn().mockResolvedValue({ jobs: {} }),
        } as unknown as IReactor,
        new EventBus(),
        DEFAULT_DRIVE_CONTAINER_TYPES,
        {},
        {
          capabilities: mergePeerCapabilities(PEER_CAPABILITIES, [
            WIDE_PROTOCOL,
          ]),
          flags: {},
        },
        new KyselySyncHoldStorage(storage.db),
      );
      managers.push(manager);
      await manager.startup();
      return manager;
    }

    async function indexDocumentAtVersion2(documentId: string): Promise<void> {
      const index = new KyselyOperationIndex(storage.db);
      const actionId = `create-${documentId}`;
      const txn = index.start();
      txn.write([
        {
          id: deriveOperationId(documentId, "document", "main", actionId),
          index: 0,
          skip: 0,
          hash: "h0",
          timestampUtcMs: "2026-09-25T00:00:00.000Z",
          action: {
            id: actionId,
            type: "CREATE_DOCUMENT",
            scope: "document",
            timestampUtcMs: "2026-09-25T00:00:00.000Z",
            input: {
              documentId,
              model: "powerhouse/document-drive",
              protocolVersions: { "base-reducer": 2, "test-protocol": 2 },
            },
          },
          documentId,
          documentType: "powerhouse/document-drive",
          branch: "main",
          scope: "document",
          sourceRemote: "",
        },
      ]);
      txn.createCollection(COLLECTION.key);
      txn.addToCollection(COLLECTION.key, documentId);
      await index.commit(txn);
    }

    beforeEach(async () => {
      storage = await create();
      await indexDocumentAtVersion2("held-doc");
    });

    afterEach(async () => {
      for (const manager of managers.splice(0)) {
        await manager.shutdown().completed;
      }
      await storage.cleanup();
    });

    it("keeps the hold, and releases it when the peer widens after the restart", async () => {
      const first = await start();
      await first.add(
        "client",
        COLLECTION,
        { type: "polling", parameters: {} },
        FILTER,
        {},
        "c1",
        null,
      );
      await vi.waitFor(async () =>
        expect(await first.listHolds()).toHaveLength(1),
      );
      expect(first.getByName("client").channel.outbox.items).toHaveLength(0);
      await first.shutdown().completed;
      managers.splice(0);

      const second = await start();
      expect(await second.listHolds()).toEqual([
        expect.objectContaining({
          remoteName: "client",
          documentId: "held-doc",
          reason: { protocol: "test-protocol", version: 2, peerSupports: [1] },
        }),
      ]);

      await second.setPeerManifest("c1", manifestFor(WIDE));
      expect(await second.listHolds()).toEqual([]);
      const outbox = second.getByName("client").channel.outbox.items;
      expect(outbox.map((item) => item.documentId)).toEqual(["held-doc"]);
    });
  },
);

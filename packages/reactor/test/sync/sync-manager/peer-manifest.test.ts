import {
  localPeerManifest,
  PEER_CAPABILITIES,
  type PeerCapability,
  type PeerManifest,
} from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../../src/core/drive-container-types.js";
import type { IReactor } from "../../../src/core/types.js";
import { EventBus } from "../../../src/events/event-bus.js";
import type { ISyncCursorStorage } from "../../../src/storage/interfaces.js";
import { GqlResponseChannel } from "../../../src/sync/channels/gql-res-channel.js";
import { GraphQLRequestError } from "../../../src/sync/errors.js";
import type {
  IChannel,
  IChannelFactory,
} from "../../../src/sync/interfaces.js";
import { SyncManager } from "../../../src/sync/sync-manager.js";
import {
  testSyncStorageBackends,
  type TestSyncStorage,
} from "../../factories.js";
import { TestChannel } from "../channels/test-channel.js";

const COLLECTION = DriveCollectionId.forDrive("drive-peer");
const FILTER = { documentId: [], scope: [], branch: "main" };
const CONFIG = { type: "internal", parameters: {} };

const WIDE: PeerCapability = {
  kind: "protocol",
  name: "test-protocol",
  baseline: [1],
  supported: () => [1, 2],
  optional: true,
};
const PEER = localPeerManifest([...PEER_CAPABILITIES, WIDE], {});

type ChannelMode = "served" | "handshake" | "offline";

describe.each(testSyncStorageBackends)(
  "peer manifests on remotes ($name)",
  ({ create }) => {
    let storage: TestSyncStorage;
    let mode: ChannelMode;
    const managers: SyncManager[] = [];

    function factory(): IChannelFactory {
      return {
        instance(
          remoteId: string,
          remoteName: string,
          _config: unknown,
          cursorStorage: ISyncCursorStorage,
        ): IChannel {
          if (mode === "offline") {
            const channel = new TestChannel(
              remoteId,
              remoteName,
              cursorStorage,
              () => {},
            );
            channel.init = () =>
              Promise.reject(new GraphQLRequestError("unreachable", "network"));
            return channel;
          }
          if (mode === "handshake") {
            const peer = new TestChannel(
              "peer",
              "peer",
              cursorStorage,
              () => {},
              {
                announce: () => PEER,
              },
            );
            return new TestChannel(
              remoteId,
              remoteName,
              cursorStorage,
              () => {},
              {
                peer: () => peer,
              },
            );
          }
          return new GqlResponseChannel(
            new ConsoleLogger(["GqlResponseChannel"]),
            remoteId,
            remoteName,
            cursorStorage,
          );
        },
      } as unknown as IChannelFactory;
    }

    async function start(
      operationIndex = new KyselyOperationIndex(storage.db),
    ): Promise<SyncManager> {
      const manager = new SyncManager(
        new ConsoleLogger(["SyncManager"]),
        storage.syncRemoteStorage,
        storage.syncCursorStorage,
        storage.syncDeadLetterStorage,
        factory(),
        operationIndex,
        {
          load: vi.fn(),
          getJobStatus: vi.fn(),
          loadBatch: vi.fn().mockResolvedValue({ jobs: {} }),
        } as unknown as IReactor,
        new EventBus(),
        DEFAULT_DRIVE_CONTAINER_TYPES,
      );
      managers.push(manager);
      await manager.startup();
      return manager;
    }

    beforeEach(async () => {
      storage = await create();
      mode = "served";
    });

    afterEach(async () => {
      for (const manager of managers.splice(0)) {
        await manager.shutdown().completed;
      }
      await storage.cleanup();
    });

    it("records what a served client announced, then its silence", async () => {
      const manager = await start();
      await manager.add("client", COLLECTION, CONFIG, FILTER, {}, "c1", PEER);

      expect(manager.getByName("client").meta.peer?.manifest).toEqual(PEER);
      expect(
        (await storage.syncRemoteStorage.get("client")).peer?.manifest,
      ).toEqual(PEER);

      // A re-touch without a manifest: the client no longer has the feature.
      await manager.setPeerManifest("c1", null);
      const stored = await storage.syncRemoteStorage.get("client");
      expect(stored.peer).toMatchObject({ manifest: null });
      expect(stored.peer?.receivedAtUtcMs).toBeGreaterThan(0);
    });

    it("leaves a remote never heard from without a peer", async () => {
      const manager = await start();
      await manager.add("client", COLLECTION, CONFIG, FILTER, {}, "c1");

      expect(manager.getByName("client").meta.peer).toBeUndefined();
      expect(
        (await storage.syncRemoteStorage.get("client")).peer,
      ).toBeUndefined();
    });

    it("persists the handshake's manifest before the first backfill derives", async () => {
      mode = "handshake";
      const operationIndex = new KyselyOperationIndex(storage.db);
      const seen: Array<PeerManifest | null | undefined> = [];
      const find = operationIndex.find.bind(operationIndex);
      operationIndex.find = async (...args) => {
        seen.push(
          (await storage.syncRemoteStorage.get("upstream")).peer?.manifest,
        );
        return find(...args);
      };
      const manager = await start(operationIndex);

      await manager.add("upstream", COLLECTION, CONFIG, FILTER);
      await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0));

      expect(seen[0]).toEqual(PEER);
    });

    it("keeps the last manifest across a restart with the channel offline", async () => {
      const first = await start();
      await first.add("client", COLLECTION, CONFIG, FILTER, {}, "c1", PEER);
      await first.shutdown().completed;
      managers.splice(0);

      mode = "offline";
      const second = await start();

      expect(() => second.getByName("client")).toThrow();
      const stored = await storage.syncRemoteStorage.get("client");
      expect(stored.peer?.manifest).toEqual(PEER);
    });

    it("announces the local manifest to the channel", async () => {
      const manager = await start();
      expect(manager.localManifest()).toEqual(
        localPeerManifest(PEER_CAPABILITIES, {}),
      );
    });
  },
);

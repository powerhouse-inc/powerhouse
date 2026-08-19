import { ConsoleLogger } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import { DriveCollectionId } from "../../../src/cache/operation-index-types.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../../src/core/drive-container-types.js";
import type { IReactor } from "../../../src/core/types.js";
import { EventBus } from "../../../src/events/event-bus.js";
import type {
  ISyncCursorStorage,
  ISyncDeadLetterStorage,
  ISyncRemoteStorage,
} from "../../../src/storage/interfaces.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import { GqlResponseChannel } from "../../../src/sync/channels/gql-res-channel.js";
import type {
  IChannel,
  IChannelFactory,
} from "../../../src/sync/interfaces.js";
import { SyncManager } from "../../../src/sync/sync-manager.js";
import { createTestSyncStorage } from "../../factories.js";

const COLLECTION = DriveCollectionId.forDrive("drive-bind");
const CHANNEL_ID = "channel-bind";

function passiveChannelFactory(): IChannelFactory {
  return {
    instance(
      remoteId: string,
      remoteName: string,
      _config: unknown,
      cursorStorage: ISyncCursorStorage,
    ): IChannel {
      return new GqlResponseChannel(
        new ConsoleLogger(["GqlResponseChannel"]),
        remoteId,
        remoteName,
        cursorStorage,
      );
    },
  } as unknown as IChannelFactory;
}

describe("binding a sync channel to an address", () => {
  let db: Kysely<Database>;
  let remoteStorage: ISyncRemoteStorage;
  let cursorStorage: ISyncCursorStorage;
  let deadLetterStorage: ISyncDeadLetterStorage;
  let syncManager: SyncManager;

  function build(): SyncManager {
    return new SyncManager(
      new ConsoleLogger(["SyncManager"]),
      remoteStorage,
      cursorStorage,
      deadLetterStorage,
      passiveChannelFactory(),
      new KyselyOperationIndex(db),
      {
        load: vi.fn().mockResolvedValue({ status: "ok" }),
        getJobStatus: vi
          .fn()
          .mockResolvedValue({ id: "", status: "READ_READY" }),
        loadBatch: vi.fn().mockResolvedValue({ jobs: {} }),
      } as unknown as IReactor,
      new EventBus(),
      DEFAULT_DRIVE_CONTAINER_TYPES,
    );
  }

  beforeEach(async () => {
    const storage = await createTestSyncStorage();
    db = storage.db;
    remoteStorage = storage.syncRemoteStorage;
    cursorStorage = storage.syncCursorStorage;
    deadLetterStorage = storage.syncDeadLetterStorage;

    syncManager = build();
    await syncManager.startup();
    await syncManager.add(
      "remote-bind",
      COLLECTION,
      { type: "internal", parameters: {} },
      undefined,
      undefined,
      CHANNEL_ID,
    );
  });

  afterEach(async () => {
    syncManager.shutdown();
    await db.destroy();
  });

  it("starts unbound, so an anonymously created channel is adoptable", () => {
    expect(syncManager.getById(CHANNEL_ID).meta.options.boundAddress).toBe(
      undefined,
    );
  });

  it("records the address that claims it", async () => {
    await syncManager.bindRemote(CHANNEL_ID, "0xowner");

    expect(syncManager.getById(CHANNEL_ID).meta.options.boundAddress).toBe(
      "0xowner",
    );
  });

  it("keeps the binding across a restart", async () => {
    await syncManager.bindRemote(CHANNEL_ID, "0xowner");
    syncManager.shutdown();

    syncManager = build();
    await syncManager.startup();

    expect(syncManager.getById(CHANNEL_ID).meta.options.boundAddress).toBe(
      "0xowner",
    );
  });

  it("accepts the same address again, so a repeat poll is not an error", async () => {
    await syncManager.bindRemote(CHANNEL_ID, "0xowner");

    await expect(
      syncManager.bindRemote(CHANNEL_ID, "0xowner"),
    ).resolves.toBeUndefined();
  });

  it("refuses to hand a bound channel to another address", async () => {
    await syncManager.bindRemote(CHANNEL_ID, "0xowner");

    await expect(syncManager.bindRemote(CHANNEL_ID, "0xother")).rejects.toThrow(
      "already bound",
    );
    expect(syncManager.getById(CHANNEL_ID).meta.options.boundAddress).toBe(
      "0xowner",
    );
  });

  it("refuses a channel it does not have", async () => {
    await expect(syncManager.bindRemote("nope", "0xowner")).rejects.toThrow(
      "does not exist",
    );
  });
});

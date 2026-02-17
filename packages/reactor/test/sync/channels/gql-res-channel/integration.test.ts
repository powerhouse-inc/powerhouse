import type { OperationContext } from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ISyncCursorStorage } from "../../../../src/storage/interfaces.js";
import type { KyselySyncRemoteStorage } from "../../../../src/storage/kysely/sync-remote-storage.js";
import type { Database } from "../../../../src/storage/kysely/types.js";
import { GqlResponseChannel } from "../../../../src/sync/channels/gql-res-channel.js";
import { SyncOperation } from "../../../../src/sync/sync-operation.js";
import type { RemoteRecord } from "../../../../src/sync/types.js";
import { createMockLogger, createTestSyncStorage } from "../../../factories.js";

async function waitForCursor(
  storage: ISyncCursorStorage,
  remoteName: string,
  cursorType: "inbox" | "outbox",
  expectedOrdinal: number,
  timeoutMs: number = 2000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const cursor = await storage.get(remoteName, cursorType);
    if (cursor.cursorOrdinal === expectedOrdinal) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const final = await storage.get(remoteName, cursorType);
  throw new Error(
    `Timed out waiting for cursor ${remoteName}/${cursorType} to reach ${expectedOrdinal} (got ${final.cursorOrdinal})`,
  );
}

describe("GqlResponseChannel Integration", () => {
  let db: Kysely<Database>;
  let cursorStorage: ISyncCursorStorage;
  let remoteStorage: KyselySyncRemoteStorage;

  const createMockOperationContext = (
    ordinal: number = 0,
  ): OperationContext => ({
    documentId: "doc-1",
    documentType: "test/document",
    scope: "public",
    branch: "main",
    ordinal,
  });

  const createMockSyncOperation = (
    id: string,
    remoteName: string,
    ordinal: number,
  ): SyncOperation => {
    return new SyncOperation(
      id,
      "",
      [],
      remoteName,
      "doc-1",
      ["public"],
      "main",
      [
        {
          operation: {
            index: 0,
            skip: 0,
            id: `op-${ordinal}`,
            timestampUtcMs: new Date().toISOString(),
            hash: `hash-${ordinal}`,
            action: {
              type: "TEST_OP",
              id: `action-${ordinal}`,
              scope: "public",
              timestampUtcMs: new Date().toISOString(),
              input: {},
            },
          },
          context: createMockOperationContext(ordinal),
        },
      ],
    );
  };

  let remoteCounter = 0;
  const createTestRemote = async (name: string): Promise<void> => {
    remoteCounter++;
    const remote: RemoteRecord = {
      id: `channel-${remoteCounter}`,
      name,
      collectionId: "collection-1",
      channelConfig: {
        type: "polling",
        parameters: {},
      },
      filter: {
        documentId: [],
        scope: [],
        branch: "main",
      },
      options: { sinceTimestampUtcMs: "0" },
      status: {
        push: { state: "idle", failureCount: 0 },
        pull: { state: "idle", failureCount: 0 },
      },
    };
    await remoteStorage.upsert(remote);
  };

  const createChannel = (
    remoteName: string,
    channelId: string = "channel-1",
  ): GqlResponseChannel => {
    return new GqlResponseChannel(
      createMockLogger(),
      channelId,
      remoteName,
      cursorStorage,
    );
  };

  beforeEach(async () => {
    const setup = await createTestSyncStorage();
    db = setup.db;
    cursorStorage = setup.syncCursorStorage;
    remoteStorage = setup.syncRemoteStorage;
    remoteCounter = 0;
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("should persist and recover cursors across channel restarts", async () => {
    await createTestRemote("remote-1");

    const channel1 = createChannel("remote-1");
    await channel1.init();

    const syncOp = createMockSyncOperation("syncop-1", "remote-1", 5);
    channel1.outbox.add(syncOp);
    syncOp.executed();
    channel1.outbox.remove(syncOp);

    await waitForCursor(cursorStorage, "remote-1", "outbox", 5);

    const channel2 = createChannel("remote-1");
    await channel2.init();

    expect(channel2.outbox.ackOrdinal).toBe(5);
  });

  it("should persist inbox and outbox cursors independently", async () => {
    await createTestRemote("remote-1");

    const channel = createChannel("remote-1");
    await channel.init();

    const inboxOp = createMockSyncOperation("syncop-inbox", "remote-1", 3);
    channel.inbox.add(inboxOp);
    inboxOp.executed();
    channel.inbox.remove(inboxOp);

    const outboxOp = createMockSyncOperation("syncop-outbox", "remote-1", 7);
    channel.outbox.add(outboxOp);
    outboxOp.executed();
    channel.outbox.remove(outboxOp);

    await waitForCursor(cursorStorage, "remote-1", "inbox", 3);
    await waitForCursor(cursorStorage, "remote-1", "outbox", 7);

    const channel2 = createChannel("remote-1");
    await channel2.init();

    expect(channel2.inbox.ackOrdinal).toBe(3);
    expect(channel2.outbox.ackOrdinal).toBe(7);
  });

  it("should isolate cursors between remotes", async () => {
    await createTestRemote("remote-A");
    await createTestRemote("remote-B");

    const channelA = createChannel("remote-A", "channel-A");
    await channelA.init();

    const channelB = createChannel("remote-B", "channel-B");
    await channelB.init();

    const opA = createMockSyncOperation("syncop-A", "remote-A", 10);
    channelA.outbox.add(opA);
    opA.executed();
    channelA.outbox.remove(opA);

    const opB = createMockSyncOperation("syncop-B", "remote-B", 20);
    channelB.outbox.add(opB);
    opB.executed();
    channelB.outbox.remove(opB);

    await waitForCursor(cursorStorage, "remote-A", "outbox", 10);
    await waitForCursor(cursorStorage, "remote-B", "outbox", 20);

    const channelA2 = createChannel("remote-A", "channel-A");
    await channelA2.init();
    expect(channelA2.outbox.ackOrdinal).toBe(10);

    const channelB2 = createChannel("remote-B", "channel-B");
    await channelB2.init();
    expect(channelB2.outbox.ackOrdinal).toBe(20);
  });

  it("should advance cursor monotonically across multiple batches", async () => {
    await createTestRemote("remote-1");

    const channel = createChannel("remote-1");
    await channel.init();

    const op1 = createMockSyncOperation("syncop-1", "remote-1", 5);
    channel.outbox.add(op1);
    op1.executed();
    channel.outbox.remove(op1);

    await waitForCursor(cursorStorage, "remote-1", "outbox", 5);

    const op2 = createMockSyncOperation("syncop-2", "remote-1", 12);
    channel.outbox.add(op2);
    op2.executed();
    channel.outbox.remove(op2);

    await waitForCursor(cursorStorage, "remote-1", "outbox", 12);

    const channel2 = createChannel("remote-1");
    await channel2.init();
    expect(channel2.outbox.ackOrdinal).toBe(12);
  });
});

import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IOperationIndex } from "../../../../src/cache/operation-index-types.js";
import type { OperationContext } from "shared/document-model";
import type { ISyncCursorStorage } from "../../../../src/storage/interfaces.js";
import type { KyselySyncRemoteStorage } from "../../../../src/storage/kysely/sync-remote-storage.js";
import type { Database } from "../../../../src/storage/kysely/types.js";
import {
  GqlRequestChannel,
  type GqlChannelConfig,
} from "../../../../src/sync/channels/gql-req-channel.js";
import type { IPollTimer } from "../../../../src/sync/channels/poll-timer.js";
import { SyncOperation } from "../../../../src/sync/sync-operation.js";
import type {
  RemoteFilter,
  RemoteRecord,
  SyncEnvelope,
} from "../../../../src/sync/types.js";
import { createMockLogger, createTestSyncStorage } from "../../../factories.js";

class ManualPollTimer implements IPollTimer {
  private delegate: (() => Promise<void>) | undefined;
  private running = false;

  setDelegate(delegate: () => Promise<void>): void {
    this.delegate = delegate;
  }

  start(): void {
    this.running = true;
    if (this.delegate) {
      void this.delegate();
    }
  }

  stop(): void {
    this.running = false;
  }

  async tick(): Promise<void> {
    if (this.running && this.delegate) {
      await this.delegate();
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}

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

const TEST_FILTER: RemoteFilter = {
  documentId: [],
  scope: [],
  branch: "main",
};

describe("GqlRequestChannel Integration", () => {
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

  const createMockOperationIndex = (): IOperationIndex => ({
    start: vi.fn(),
    commit: vi.fn().mockResolvedValue([]),
    find: vi
      .fn()
      .mockResolvedValue({ items: [], nextCursor: undefined, hasMore: false }),
    get: vi
      .fn()
      .mockResolvedValue({ results: [], options: { cursor: "0", limit: 100 } }),
    getSinceOrdinal: vi
      .fn()
      .mockResolvedValue({ items: [], nextCursor: undefined, hasMore: false }),
    getLatestTimestampForCollection: vi.fn().mockResolvedValue(null),
    getCollectionsForDocuments: vi.fn().mockResolvedValue({}),
  });

  const createTestConfig = (
    overrides: Partial<GqlChannelConfig> = {},
  ): GqlChannelConfig => ({
    url: "https://example.com/graphql",
    collectionId: "test-collection",
    filter: TEST_FILTER,
    ...overrides,
  });

  /**
   * Creates a mock fetch that handles touchChannel and pollSyncEnvelopes.
   * The poll response can be customized via pollResponse.
   */
  const createMockFetch = (
    pollResponse: {
      envelopes?: SyncEnvelope[];
      ackOrdinal?: number;
    } = {},
  ) => {
    return vi.fn().mockImplementation((_url: string, options: RequestInit) => {
      const body = JSON.parse(options.body as string);

      if (body.query.includes("touchChannel")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { touchChannel: true } }),
        });
      }

      if (body.query.includes("pushSyncEnvelopes")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { pushSyncEnvelopes: true } }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              pollSyncEnvelopes: {
                envelopes: pollResponse.envelopes ?? [],
                ackOrdinal: pollResponse.ackOrdinal ?? 0,
              },
            },
          }),
      });
    });
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
    mockFetch: ReturnType<typeof createMockFetch>,
    channelId: string = "channel-1",
  ): { channel: GqlRequestChannel; pollTimer: ManualPollTimer } => {
    const pollTimer = new ManualPollTimer();
    const channel = new GqlRequestChannel(
      createMockLogger(),
      channelId,
      remoteName,
      cursorStorage,
      createTestConfig({ fetchFn: mockFetch }),
      createMockOperationIndex(),
      pollTimer,
    );
    return { channel, pollTimer };
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

  it("should persist and recover outbox cursors across channel restarts", async () => {
    await createTestRemote("remote-1");

    const mockFetch = createMockFetch();
    const { channel: channel1 } = createChannel("remote-1", mockFetch);
    await channel1.init();

    const syncOp = createMockSyncOperation("syncop-1", "remote-1", 5);
    channel1.outbox.add(syncOp);
    syncOp.executed();
    channel1.outbox.remove(syncOp);

    await waitForCursor(cursorStorage, "remote-1", "outbox", 5);

    await channel1.shutdown();

    const mockFetch2 = createMockFetch();
    const { channel: channel2 } = createChannel("remote-1", mockFetch2);
    await channel2.init();

    expect(channel2.outbox.ackOrdinal).toBe(5);

    const cursor = await cursorStorage.get("remote-1", "outbox");
    expect(cursor.cursorOrdinal).toBe(5);

    await channel2.shutdown();
  });

  it("should persist inbox and outbox cursors independently", async () => {
    await createTestRemote("remote-1");

    const mockFetch = createMockFetch();
    const { channel } = createChannel("remote-1", mockFetch);
    await channel.init();

    // Inbox uses plain Mailbox — onRemoved fires synchronously
    const inboxOp = createMockSyncOperation("syncop-inbox", "remote-1", 3);
    channel.inbox.add(inboxOp);
    inboxOp.executed();
    channel.inbox.remove(inboxOp);

    // Outbox uses BufferedMailbox — onRemoved fires after 500ms buffer.
    const outboxOp = createMockSyncOperation("syncop-outbox", "remote-1", 7);
    channel.outbox.add(outboxOp);
    outboxOp.executed();
    channel.outbox.remove(outboxOp);

    await waitForCursor(cursorStorage, "remote-1", "inbox", 3);
    await waitForCursor(cursorStorage, "remote-1", "outbox", 7);

    await channel.shutdown();

    const mockFetch2 = createMockFetch();
    const { channel: channel2 } = createChannel("remote-1", mockFetch2);
    await channel2.init();

    expect(channel2.inbox.ackOrdinal).toBe(3);
    expect(channel2.outbox.ackOrdinal).toBe(7);

    await channel2.shutdown();
  });

  it("should load persisted cursor and pass it to poll query variables", async () => {
    await createTestRemote("remote-1");

    // Seed cursor directly into DB
    await cursorStorage.upsert({
      remoteName: "remote-1",
      cursorType: "inbox",
      cursorOrdinal: 42,
      lastSyncedAtUtcMs: Date.now(),
    });

    const mockFetch = createMockFetch();
    const { channel, pollTimer } = createChannel("remote-1", mockFetch);
    await channel.init();

    // Wait for the initial poll triggered by start()
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Trigger an explicit poll
    await pollTimer.tick();

    // Find poll calls (not touchChannel)
    const pollCalls = (
      mockFetch.mock.calls as Array<[string, RequestInit]>
    ).filter((call) => {
      const body = JSON.parse(call[1].body as string);
      return body.query.includes("pollSyncEnvelopes");
    });

    expect(pollCalls.length).toBeGreaterThan(0);

    const lastPollBody = JSON.parse(
      pollCalls[pollCalls.length - 1][1].body as string,
    );
    expect(lastPollBody.variables.outboxAck).toBe(42);
    expect(lastPollBody.variables.outboxLatest).toBe(42);

    await channel.shutdown();
  });

  it("should persist cursor after poll-triggered outbox trim", async () => {
    await createTestRemote("remote-1");

    const mockFetch = createMockFetch();
    const { channel, pollTimer } = createChannel("remote-1", mockFetch);
    await channel.init();

    // Wait for initial poll to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Add outbox syncOp (ordinal 10) — simulating a locally-created operation
    const syncOp = createMockSyncOperation("syncop-1", "remote-1", 10);
    channel.outbox.add(syncOp);

    // Wait for the BufferedMailbox add flush (triggers push via onAdded)
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Now configure mock fetch to return ackOrdinal: 10 on next poll
    // This simulates the remote acknowledging our outbox operations
    mockFetch.mockImplementation((_url: string, options: RequestInit) => {
      const body = JSON.parse(options.body as string);
      if (body.query.includes("touchChannel")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { touchChannel: true } }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              pollSyncEnvelopes: {
                envelopes: [],
                ackOrdinal: 10,
              },
            },
          }),
      });
    });

    // Trigger poll — this calls trimMailboxFromAckOrdinal which calls
    // executed() + remove() on the syncOp internally
    await pollTimer.tick();

    // Wait for BufferedMailbox removed flush + DB write
    await waitForCursor(cursorStorage, "remote-1", "outbox", 10);

    await channel.shutdown();

    // Verify cursor persisted by creating a new channel
    const mockFetch2 = createMockFetch();
    const { channel: channel2 } = createChannel("remote-1", mockFetch2);
    await channel2.init();

    expect(channel2.outbox.ackOrdinal).toBe(10);

    await channel2.shutdown();
  });

  it("should isolate cursors between remotes", async () => {
    await createTestRemote("remote-A");
    await createTestRemote("remote-B");

    const mockFetchA = createMockFetch();
    const { channel: channelA } = createChannel(
      "remote-A",
      mockFetchA,
      "channel-A",
    );
    await channelA.init();

    const mockFetchB = createMockFetch();
    const { channel: channelB } = createChannel(
      "remote-B",
      mockFetchB,
      "channel-B",
    );
    await channelB.init();

    const opA = createMockSyncOperation("syncop-A", "remote-A", 10);
    channelA.outbox.add(opA);

    const opB = createMockSyncOperation("syncop-B", "remote-B", 20);
    channelB.outbox.add(opB);

    opA.executed();
    channelA.outbox.remove(opA);

    opB.executed();
    channelB.outbox.remove(opB);

    await waitForCursor(cursorStorage, "remote-A", "outbox", 10);
    await waitForCursor(cursorStorage, "remote-B", "outbox", 20);

    await channelA.shutdown();
    await channelB.shutdown();

    const mockFetchA2 = createMockFetch();
    const { channel: channelA2 } = createChannel(
      "remote-A",
      mockFetchA2,
      "channel-A",
    );
    await channelA2.init();
    expect(channelA2.outbox.ackOrdinal).toBe(10);

    const mockFetchB2 = createMockFetch();
    const { channel: channelB2 } = createChannel(
      "remote-B",
      mockFetchB2,
      "channel-B",
    );
    await channelB2.init();
    expect(channelB2.outbox.ackOrdinal).toBe(20);

    await channelA2.shutdown();
    await channelB2.shutdown();
  });
});

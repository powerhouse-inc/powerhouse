import type { OperationContext } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IOperationIndex } from "../../../../src/cache/operation-index-types.js";
import type { ISyncCursorStorage } from "../../../../src/storage/interfaces.js";
import {
  GqlRequestChannel,
  type GqlChannelConfig,
} from "../../../../src/sync/channels/gql-req-channel.js";
import type { IPollTimer } from "../../../../src/sync/channels/poll-timer.js";
import { SyncOperation } from "../../../../src/sync/sync-operation.js";
import type {
  ConnectionStateSnapshot,
  RemoteFilter,
} from "../../../../src/sync/types.js";
import { createMockLogger } from "../../../factories.js";

class ManualPollTimer implements IPollTimer {
  private delegate: (() => Promise<void>) | undefined;
  private running = false;

  setDelegate(delegate: () => Promise<void>): void {
    this.delegate = delegate;
  }

  start(): void {
    this.running = true;
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

const TEST_FILTER: RemoteFilter = {
  documentId: [],
  scope: [],
  branch: "main",
};

const createTestConfig = (
  overrides: Partial<GqlChannelConfig> = {},
): GqlChannelConfig => ({
  url: "https://example.com/graphql",
  collectionId: "test-collection",
  filter: TEST_FILTER,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 300000,
  ...overrides,
});

const createMockCursorStorage = (): ISyncCursorStorage => ({
  list: vi.fn().mockResolvedValue([]),
  get: vi.fn().mockResolvedValue({
    remoteName: "remote-1",
    cursorType: "inbox",
    cursorOrdinal: 0,
  }),
  upsert: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
});

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

const createMockOperationContext = (ordinal: number = 1): OperationContext => ({
  documentId: "doc-1",
  documentType: "test/document",
  scope: "public",
  branch: "main",
  ordinal,
});

const createMockSyncOperation = (
  id: string,
  remoteName: string,
  ordinal: number = 0,
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
          id: "op-1",
          timestampUtcMs: new Date().toISOString(),
          hash: "hash-1",
          action: {
            type: "TEST_OP",
            id: "action-1",
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

function createMockFetch(
  handler: (body: { query: string }) => {
    ok: boolean;
    json: () => Promise<unknown>;
  },
) {
  return vi.fn().mockImplementation((_url: string, options: RequestInit) => {
    const body = JSON.parse(options.body as string) as { query: string };
    return Promise.resolve(handler(body));
  });
}

function successFetch() {
  return createMockFetch((body) => {
    if (body.query.includes("touchChannel")) {
      return {
        ok: true,
        json: () => Promise.resolve({ data: { touchChannel: true } }),
      };
    }
    if (body.query.includes("pushSyncEnvelopes")) {
      return {
        ok: true,
        json: () => Promise.resolve({ data: { pushSyncEnvelopes: true } }),
      };
    }
    return {
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            pollSyncEnvelopes: {
              envelopes: [],
              ackOrdinal: 0,
              deadLetters: [],
            },
          },
        }),
    };
  });
}

describe("GqlRequestChannel Connection State", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("starts in connecting state", () => {
    global.fetch = successFetch() as unknown as typeof global.fetch;

    const channel = new GqlRequestChannel(
      createMockLogger(),
      "channel-1",
      "remote-1",
      createMockCursorStorage(),
      createTestConfig(),
      createMockOperationIndex(),
      new ManualPollTimer(),
    );

    expect(channel.getConnectionState().state).toBe("connecting");
  });

  it("transitions to connected after init", async () => {
    global.fetch = successFetch() as unknown as typeof global.fetch;

    const channel = new GqlRequestChannel(
      createMockLogger(),
      "channel-1",
      "remote-1",
      createMockCursorStorage(),
      createTestConfig(),
      createMockOperationIndex(),
      new ManualPollTimer(),
    );

    await channel.init();
    expect(channel.getConnectionState().state).toBe("connected");
  });

  it("transitions to connected after successful poll", async () => {
    global.fetch = successFetch() as unknown as typeof global.fetch;
    const manualTimer = new ManualPollTimer();

    const channel = new GqlRequestChannel(
      createMockLogger(),
      "channel-1",
      "remote-1",
      createMockCursorStorage(),
      createTestConfig(),
      createMockOperationIndex(),
      manualTimer,
    );

    await channel.init();
    await manualTimer.tick();
    expect(channel.getConnectionState().state).toBe("connected");
  });

  it("transitions to error on poll error", async () => {
    let callCount = 0;
    const mockFetch = createMockFetch((body) => {
      if (body.query.includes("touchChannel")) {
        return {
          ok: true,
          json: () => Promise.resolve({ data: { touchChannel: true } }),
        };
      }
      callCount++;
      if (callCount >= 1) {
        return {
          ok: false,
          json: () => Promise.resolve({}),
        };
      }
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              pollSyncEnvelopes: {
                envelopes: [],
                ackOrdinal: 0,
                deadLetters: [],
              },
            },
          }),
      };
    });
    global.fetch = mockFetch as unknown as typeof global.fetch;

    const manualTimer = new ManualPollTimer();
    const channel = new GqlRequestChannel(
      createMockLogger(),
      "channel-1",
      "remote-1",
      createMockCursorStorage(),
      createTestConfig(),
      createMockOperationIndex(),
      manualTimer,
    );

    await channel.init();
    expect(channel.getConnectionState().state).toBe("connected");

    await manualTimer.tick().catch(() => {});
    expect(channel.getConnectionState().state).toBe("error");
    await channel.shutdown();
  });

  it("transitions to reconnecting on channel-not-found", async () => {
    let callCount = 0;
    const mockFetch = createMockFetch((body) => {
      if (body.query.includes("touchChannel")) {
        return {
          ok: true,
          json: () => Promise.resolve({ data: { touchChannel: true } }),
        };
      }
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              errors: [{ message: "Channel not found" }],
            }),
        };
      }
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              pollSyncEnvelopes: {
                envelopes: [],
                ackOrdinal: 0,
                deadLetters: [],
              },
            },
          }),
      };
    });
    global.fetch = mockFetch as unknown as typeof global.fetch;

    const manualTimer = new ManualPollTimer();
    const channel = new GqlRequestChannel(
      createMockLogger(),
      "channel-1",
      "remote-1",
      createMockCursorStorage(),
      createTestConfig(),
      createMockOperationIndex(),
      manualTimer,
    );

    await channel.init();

    // poll triggers channel-not-found
    await manualTimer.tick();
    expect(channel.getConnectionState().state).toBe("reconnecting");

    // recovery runs async via void - advance timers to let it resolve
    await vi.advanceTimersByTimeAsync(100);
    expect(channel.getConnectionState().state).toBe("connected");
    await channel.shutdown();
  });

  it("transitions to error on failed recovery", async () => {
    let callCount = 0;
    const mockFetch = createMockFetch((body) => {
      if (body.query.includes("touchChannel")) {
        callCount++;
        if (callCount > 1) {
          // second touchChannel (recovery) fails
          return {
            ok: false,
            json: () => Promise.resolve({}),
          };
        }
        return {
          ok: true,
          json: () => Promise.resolve({ data: { touchChannel: true } }),
        };
      }
      // poll returns channel-not-found
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            errors: [{ message: "Channel not found" }],
          }),
      };
    });
    global.fetch = mockFetch as unknown as typeof global.fetch;

    const manualTimer = new ManualPollTimer();
    const channel = new GqlRequestChannel(
      createMockLogger(),
      "channel-1",
      "remote-1",
      createMockCursorStorage(),
      createTestConfig(),
      createMockOperationIndex(),
      manualTimer,
    );

    await channel.init();
    await manualTimer.tick();
    expect(channel.getConnectionState().state).toBe("reconnecting");

    await vi.advanceTimersByTimeAsync(100);
    expect(channel.getConnectionState().state).toBe("error");
    await channel.shutdown();
  });

  it("transitions to error on dead letter added", async () => {
    global.fetch = successFetch() as unknown as typeof global.fetch;
    const manualTimer = new ManualPollTimer();

    const channel = new GqlRequestChannel(
      createMockLogger(),
      "channel-1",
      "remote-1",
      createMockCursorStorage(),
      createTestConfig(),
      createMockOperationIndex(),
      manualTimer,
    );

    await channel.init();
    expect(channel.getConnectionState().state).toBe("connected");

    const syncOp = createMockSyncOperation("op-1", "remote-1", 1);
    channel.deadLetter.add(syncOp);
    expect(channel.getConnectionState().state).toBe("error");
    await channel.shutdown();
  });

  it("transitions to disconnected on shutdown", async () => {
    global.fetch = successFetch() as unknown as typeof global.fetch;

    const channel = new GqlRequestChannel(
      createMockLogger(),
      "channel-1",
      "remote-1",
      createMockCursorStorage(),
      createTestConfig(),
      createMockOperationIndex(),
      new ManualPollTimer(),
    );

    await channel.init();
    expect(channel.getConnectionState().state).toBe("connected");

    await channel.shutdown();
    expect(channel.getConnectionState().state).toBe("disconnected");
  });

  it("invokes callbacks with correct snapshot on transition", async () => {
    global.fetch = successFetch() as unknown as typeof global.fetch;

    const channel = new GqlRequestChannel(
      createMockLogger(),
      "channel-1",
      "remote-1",
      createMockCursorStorage(),
      createTestConfig(),
      createMockOperationIndex(),
      new ManualPollTimer(),
    );

    const snapshots: ConnectionStateSnapshot[] = [];
    channel.onConnectionStateChange((snapshot) => {
      snapshots.push({ ...snapshot });
    });

    await channel.init();

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].state).toBe("connected");

    await channel.shutdown();
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1].state).toBe("disconnected");
  });

  it("unsubscribe prevents further callbacks", async () => {
    global.fetch = successFetch() as unknown as typeof global.fetch;

    const channel = new GqlRequestChannel(
      createMockLogger(),
      "channel-1",
      "remote-1",
      createMockCursorStorage(),
      createTestConfig(),
      createMockOperationIndex(),
      new ManualPollTimer(),
    );

    const snapshots: ConnectionStateSnapshot[] = [];
    const unsubscribe = channel.onConnectionStateChange((snapshot) => {
      snapshots.push({ ...snapshot });
    });

    await channel.init();
    expect(snapshots).toHaveLength(1);

    unsubscribe();

    await channel.shutdown();
    // no new callback after unsubscribe
    expect(snapshots).toHaveLength(1);
  });

  it("no-op transitions do not fire callbacks", async () => {
    global.fetch = successFetch() as unknown as typeof global.fetch;
    const manualTimer = new ManualPollTimer();

    const channel = new GqlRequestChannel(
      createMockLogger(),
      "channel-1",
      "remote-1",
      createMockCursorStorage(),
      createTestConfig(),
      createMockOperationIndex(),
      manualTimer,
    );

    const snapshots: ConnectionStateSnapshot[] = [];
    channel.onConnectionStateChange((snapshot) => {
      snapshots.push({ ...snapshot });
    });

    await channel.init();
    expect(snapshots).toHaveLength(1);

    // poll success while already connected should not fire callback
    await manualTimer.tick();
    expect(snapshots).toHaveLength(1);
  });

  it("push recoverable error transitions to reconnecting", async () => {
    let pushCount = 0;
    const mockFetch = createMockFetch((body) => {
      if (body.query.includes("touchChannel")) {
        return {
          ok: true,
          json: () => Promise.resolve({ data: { touchChannel: true } }),
        };
      }
      if (body.query.includes("pushSyncEnvelopes")) {
        pushCount++;
        if (pushCount === 1) {
          // Recoverable error (network failure)
          throw new Error("Network timeout");
        }
        return {
          ok: true,
          json: () => Promise.resolve({ data: { pushSyncEnvelopes: true } }),
        };
      }
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              pollSyncEnvelopes: {
                envelopes: [],
                ackOrdinal: 0,
                deadLetters: [],
              },
            },
          }),
      };
    });
    global.fetch = mockFetch as unknown as typeof global.fetch;

    const manualTimer = new ManualPollTimer();
    const channel = new GqlRequestChannel(
      createMockLogger(),
      "channel-1",
      "remote-1",
      createMockCursorStorage(),
      createTestConfig({ retryBaseDelayMs: 100, retryMaxDelayMs: 200 }),
      createMockOperationIndex(),
      manualTimer,
    );

    await channel.init();
    expect(channel.getConnectionState().state).toBe("connected");

    const syncOp = createMockSyncOperation("op-1", "remote-1", 1);
    channel.outbox.add(syncOp);

    // Wait for the async push to settle (fire-and-forget promise chain)
    await vi.waitFor(() => {
      expect(channel.getConnectionState().state).toBe("reconnecting");
    });
    expect(channel.getConnectionState().pushBlocked).toBe(true);

    await channel.shutdown();
  });

  it("push unrecoverable error transitions to error", async () => {
    const mockFetch = createMockFetch((body) => {
      if (body.query.includes("touchChannel")) {
        return {
          ok: true,
          json: () => Promise.resolve({ data: { touchChannel: true } }),
        };
      }
      if (body.query.includes("pushSyncEnvelopes")) {
        // Unrecoverable error (GraphQL server rejection)
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              errors: [{ message: "Validation failed" }],
            }),
        };
      }
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              pollSyncEnvelopes: {
                envelopes: [],
                ackOrdinal: 0,
                deadLetters: [],
              },
            },
          }),
      };
    });
    global.fetch = mockFetch as unknown as typeof global.fetch;

    const manualTimer = new ManualPollTimer();
    const channel = new GqlRequestChannel(
      createMockLogger(),
      "channel-1",
      "remote-1",
      createMockCursorStorage(),
      createTestConfig(),
      createMockOperationIndex(),
      manualTimer,
    );

    await channel.init();
    expect(channel.getConnectionState().state).toBe("connected");

    const syncOp = createMockSyncOperation("op-1", "remote-1", 1);
    channel.outbox.add(syncOp);

    await vi.waitFor(() => {
      expect(channel.getConnectionState().state).toBe("error");
    });
    await channel.shutdown();
  });

  it("snapshot includes correct failure counts", async () => {
    const mockFetch = createMockFetch((body) => {
      if (body.query.includes("touchChannel")) {
        return {
          ok: true,
          json: () => Promise.resolve({ data: { touchChannel: true } }),
        };
      }
      return {
        ok: false,
        json: () => Promise.resolve({}),
      };
    });
    global.fetch = mockFetch as unknown as typeof global.fetch;

    const manualTimer = new ManualPollTimer();
    const channel = new GqlRequestChannel(
      createMockLogger(),
      "channel-1",
      "remote-1",
      createMockCursorStorage(),
      createTestConfig(),
      createMockOperationIndex(),
      manualTimer,
    );

    await channel.init();

    await manualTimer.tick().catch(() => {});
    const snapshot = channel.getConnectionState();
    expect(snapshot.state).toBe("error");
    expect(snapshot.failureCount).toBe(1);
    expect(snapshot.lastFailureUtcMs).toBeGreaterThan(0);
    await channel.shutdown();
  });
});

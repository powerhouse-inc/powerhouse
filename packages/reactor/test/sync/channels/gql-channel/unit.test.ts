import type { OperationContext } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IOperationIndex } from "../../../../src/cache/operation-index-types.js";
import type { ISyncCursorStorage } from "../../../../src/storage/interfaces.js";
import {
  GqlChannel,
  type GqlChannelConfig,
} from "../../../../src/sync/channels/gql-channel.js";
import { IntervalPollTimer } from "../../../../src/sync/channels/interval-poll-timer.js";
import type { IPollTimer } from "../../../../src/sync/channels/poll-timer.js";
import { SyncOperation } from "../../../../src/sync/sync-operation.js";
import {
  SyncOperationStatus,
  type RemoteFilter,
  type SyncEnvelope,
} from "../../../../src/sync/types.js";
import { createMockLogger } from "../../../factories.js";

/**
 * Manual poll timer for testing that allows explicit control over when polling occurs.
 */
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
  ...overrides,
});

const createMockCursorStorage = (
  remoteName = "remote-1",
): ISyncCursorStorage => {
  const mockGet = vi.fn();
  mockGet.mockResolvedValue({
    remoteName,
    cursorOrdinal: 0,
  });
  return {
    list: vi.fn(),
    get: mockGet,
    upsert: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };
};

const createMockOperationContext = (): OperationContext => ({
  documentId: "doc-1",
  documentType: "test/document",
  scope: "public",
  branch: "main",
  ordinal: 1,
});

const createMockSyncOperation = (
  id: string,
  remoteName: string,
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
        context: createMockOperationContext(),
      },
    ],
  );
};

const createMockFetch = (response: any = {}) => {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: response }),
  });
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

const createPollTimer = (intervalMs = 2000): IPollTimer =>
  new IntervalPollTimer(intervalMs);

describe("GqlChannel", () => {
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

  describe("constructor and initialization", () => {
    it("should create channel with config", () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({ pollSyncEnvelopes: [] });
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(),
      );

      expect(channel.inbox.items).toHaveLength(0);
      expect(channel.outbox.items).toHaveLength(0);
      expect(channel.deadLetter.items).toHaveLength(0);
    });

    it("should initialize empty mailboxes", () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({ pollSyncEnvelopes: [] });
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(),
      );

      expect(channel.inbox.items).toEqual([]);
      expect(channel.outbox.items).toEqual([]);
      expect(channel.deadLetter.items).toEqual([]);
    });

    it("should use default config values", () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({ pollSyncEnvelopes: [] });
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(),
      );

      const health = channel.getHealth();
      expect(health.state).toBe("idle");
      expect(health.failureCount).toBe(0);
    });

    it("should start polling after init is called", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        touchChannel: true,
      });
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(5000),
      );

      // Before init, no polling should happen
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockFetch).not.toHaveBeenCalled();

      // After init, polling should start immediately (async)
      await channel.init();
      // init() calls touchChannel synchronously, poll is async
      // Wait for the immediate poll to complete
      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      // Fast-forward time to trigger next poll
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      channel.shutdown();
    });
  });

  describe("polling", () => {
    it("should poll remote for operations at configured interval", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        touchChannel: true,
      });
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(3000),
      );
      await channel.init();

      // init() calls touchChannel synchronously, poll is async
      // Wait for the immediate poll to complete
      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      // After first poll interval
      await vi.advanceTimersByTimeAsync(3000);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // After second poll interval
      await vi.advanceTimersByTimeAsync(3000);
      expect(mockFetch).toHaveBeenCalledTimes(4);

      channel.shutdown();
    });

    it("should query with correct GraphQL syntax", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        touchChannel: true,
      });
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(),
      );
      await channel.init();

      await vi.advanceTimersByTimeAsync(5000);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/graphql",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
          body: expect.stringContaining("pollSyncEnvelopes"),
        }),
      );
      channel.shutdown();
    });

    it("should include auth token in headers when jwtHandler provided", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        touchChannel: true,
      });
      global.fetch = mockFetch;

      const jwtHandler = vi.fn().mockResolvedValue("secret-token");

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig({
          jwtHandler,
        }),
        createMockOperationIndex(),
        createPollTimer(),
      );
      await channel.init();

      await vi.advanceTimersByTimeAsync(5000);

      expect(jwtHandler).toHaveBeenCalledWith("https://example.com/graphql");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/graphql",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer secret-token",
          }),
        }),
      );
    });

    it("should not include auth header when jwtHandler returns undefined", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        touchChannel: true,
      });
      global.fetch = mockFetch;

      const jwtHandler = vi.fn().mockResolvedValue(undefined);

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig({
          jwtHandler,
        }),
        createMockOperationIndex(),
        createPollTimer(),
      );
      await channel.init();

      await vi.advanceTimersByTimeAsync(5000);

      expect(jwtHandler).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/graphql",
        expect.objectContaining({
          headers: {
            "Content-Type": "application/json",
          },
        }),
      );
    });

    it("should handle jwtHandler errors gracefully", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        touchChannel: true,
      });
      global.fetch = mockFetch;

      const jwtHandler = vi.fn().mockRejectedValue(new Error("JWT error"));

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig({
          jwtHandler,
        }),
        createMockOperationIndex(),
        createPollTimer(),
      );
      await channel.init();

      await vi.advanceTimersByTimeAsync(5000);

      expect(jwtHandler).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/graphql",
        expect.objectContaining({
          headers: {
            "Content-Type": "application/json",
          },
        }),
      );
    });

    it("should use cursor from storage when polling", async () => {
      const cursorStorage = createMockCursorStorage();
      vi.mocked(cursorStorage.get).mockResolvedValue({
        remoteName: "remote-1",
        cursorOrdinal: 42,
        lastSyncedAtUtcMs: Date.now(),
      });

      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        touchChannel: true,
      });
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(),
      );
      await channel.init();

      await vi.advanceTimersByTimeAsync(5000);

      // Second call is the poll (first is touchChannel)
      const callBody = JSON.parse(mockFetch.mock.calls[1][1]?.body as string);
      expect(callBody.variables.cursorOrdinal).toBe(42);
      channel.shutdown();
    });

    it("should use cursor 0 when cursor is at beginning", async () => {
      const cursorStorage = createMockCursorStorage();
      vi.mocked(cursorStorage.get).mockResolvedValue({
        remoteName: "remote-1",
        cursorOrdinal: 0,
      });

      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        touchChannel: true,
      });
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(),
      );
      await channel.init();

      await vi.advanceTimersByTimeAsync(5000);

      // Second call is the poll (first is touchChannel)
      const callBody = JSON.parse(mockFetch.mock.calls[1][1]?.body as string);
      expect(callBody.variables.cursorOrdinal).toBe(0);
      channel.shutdown();
    });

    it("should add received operations to inbox", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockEnvelope: SyncEnvelope = {
        type: "operations",
        channelMeta: { id: "channel-1" },
        operations: [
          {
            operation: {
              index: 1,
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
            context: createMockOperationContext(),
          },
        ],
      };

      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [mockEnvelope],
        touchChannel: true,
      });
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(5000),
      );
      await channel.init();

      // Wait for immediate poll to complete and add item to inbox
      await vi.waitFor(() => {
        expect(channel.inbox.items).toHaveLength(1);
      });
      expect(channel.inbox.items[0].status).toBe(
        SyncOperationStatus.ExecutionPending,
      );

      // After 5 seconds, another poll adds another item
      await vi.advanceTimersByTimeAsync(5000);
      expect(channel.inbox.items).toHaveLength(2);

      channel.shutdown();
    });
  });

  describe("outbox to transport", () => {
    it("should send envelope via GraphQL mutation when job added to outbox", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        pushSyncEnvelopes: true,
      });
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(),
      );

      const job = createMockSyncOperation("job-1", "remote-1");
      channel.outbox.add(job);

      // Wait for async push to complete
      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "https://example.com/graphql",
          expect.objectContaining({
            body: expect.stringContaining("pushSyncEnvelopes"),
          }),
        );
      });
    });

    it("should transition job status during transport", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        pushSyncEnvelopes: true,
      });
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(),
      );

      const job = createMockSyncOperation("job-1", "remote-1");
      const statusCallback = vi.fn();
      job.on(statusCallback);

      expect(job.status).toBe(SyncOperationStatus.Unknown);

      channel.outbox.add(job);

      await vi.waitFor(() => {
        expect(job.status).toBe(SyncOperationStatus.TransportPending);
      });
    });

    it("should include channel metadata in envelope", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        pushSyncEnvelopes: true,
      });
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(),
      );

      const job = createMockSyncOperation("job-1", "remote-1");
      channel.outbox.add(job);

      await vi.waitFor(() => {
        const pushCall = mockFetch.mock.calls.find((call) =>
          (call[1]?.body as string).includes("pushSyncEnvelopes"),
        );
        expect(pushCall).toBeDefined();

        const body = JSON.parse(pushCall![1]?.body as string);
        expect(body.variables.envelopes[0].channelMeta.id).toBe("channel-1");
      });
    });

    it("should move failed push to dead letter", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(),
      );

      const job = createMockSyncOperation("job-1", "remote-1");
      channel.outbox.add(job);

      await vi.waitFor(() => {
        expect(channel.deadLetter.items).toHaveLength(1);
        expect(channel.outbox.items).toHaveLength(0);
      });
    });
  });

  describe("error handling", () => {
    it("should handle network errors during poll", async () => {
      const cursorStorage = createMockCursorStorage();
      // First call (touchChannel) succeeds, subsequent calls (poll) fail
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: { touchChannel: true } }),
        })
        .mockRejectedValue(new Error("Network error"));
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig({
          maxFailures: 3,
        }),
        createMockOperationIndex(),
        createPollTimer(5000),
      );
      await channel.init();

      // Wait for the immediate poll to complete and fail
      await vi.waitFor(() => {
        expect(channel.getHealth().failureCount).toBe(1);
      });

      await vi.advanceTimersByTimeAsync(5000);

      const health = channel.getHealth();
      // After another poll failure, failureCount is 2
      expect(health.failureCount).toBe(2);
      expect(health.state).toBe("running");
      channel.shutdown();
    });

    it("should stop polling after max failures", async () => {
      const cursorStorage = createMockCursorStorage();
      // First call (touchChannel) succeeds, subsequent calls (poll) fail
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: { touchChannel: true } }),
        })
        .mockRejectedValue(new Error("Network error"));
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig({
          maxFailures: 3,
        }),
        createMockOperationIndex(),
        createPollTimer(1000),
      );
      await channel.init();

      // Wait for the immediate poll to complete (1 failure)
      await vi.waitFor(() => {
        expect(channel.getHealth().failureCount).toBe(1);
      });

      // Trigger 2 more failures to reach maxFailures=3
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);

      const health = channel.getHealth();
      expect(health.failureCount).toBe(3);
      expect(health.state).toBe("error");

      // Should not poll anymore
      mockFetch.mockClear();
      await vi.advanceTimersByTimeAsync(10000);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should reset failure count on success", async () => {
      const cursorStorage = createMockCursorStorage();
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        // First call is touchChannel (init), then polling starts immediately
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: { touchChannel: true } }),
          });
        }
        // Call 2 (immediate poll) and call 3 fail, call 4 succeeds
        if (callCount <= 3) {
          throw new Error("Network error");
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { pollSyncEnvelopes: [] } }),
        });
      });
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(1000),
      );
      await channel.init();

      // Wait for immediate poll which fails (call 2)
      await vi.waitFor(() => {
        expect(channel.getHealth().failureCount).toBe(1);
      });

      // After 1000ms, call 3 fails
      await vi.advanceTimersByTimeAsync(1000);
      expect(channel.getHealth().failureCount).toBe(2);

      // After 1000ms, call 4 succeeds - failureCount resets
      await vi.advanceTimersByTimeAsync(1000);
      expect(channel.getHealth().failureCount).toBe(0);
      expect(channel.getHealth().state).toBe("idle");
      channel.shutdown();
    });

    it("should handle GraphQL errors", async () => {
      const cursorStorage = createMockCursorStorage();
      // First call (touchChannel) succeeds, subsequent calls return GraphQL errors
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: { touchChannel: true } }),
        })
        .mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              errors: [{ message: "GraphQL error" }],
            }),
        });
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(5000),
      );
      await channel.init();

      // Wait for the immediate poll to complete
      await vi.waitFor(() => {
        expect(channel.getHealth().failureCount).toBe(1);
      });

      // After 5000ms, another poll failure
      await vi.advanceTimersByTimeAsync(5000);
      expect(channel.getHealth().failureCount).toBe(2);
      channel.shutdown();
    });

    it("should handle HTTP errors", async () => {
      const cursorStorage = createMockCursorStorage();
      // First call (touchChannel) succeeds, subsequent calls (poll) fail with HTTP 500
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: { touchChannel: true } }),
        })
        .mockResolvedValue({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        });
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(5000),
      );
      await channel.init();

      // Wait for the immediate poll to complete
      await vi.waitFor(() => {
        expect(channel.getHealth().failureCount).toBe(1);
      });

      // After 5000ms, another poll failure
      await vi.advanceTimersByTimeAsync(5000);
      expect(channel.getHealth().failureCount).toBe(2);
      channel.shutdown();
    });

    it("should re-register channel when 'Channel not found' error occurs", async () => {
      const cursorStorage = createMockCursorStorage();
      let pollCount = 0;
      const mockFetch = vi.fn().mockImplementation((_url, options) => {
        const body = JSON.parse(options?.body as string);

        // touchChannel mutation - always succeeds
        if (body.query.includes("touchChannel")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: { touchChannel: true } }),
          });
        }

        // pollSyncEnvelopes query
        pollCount++;
        if (pollCount === 1) {
          // First poll returns "Channel not found" error
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                errors: [{ message: "Channel not found" }],
              }),
          });
        }
        // Subsequent polls succeed
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { pollSyncEnvelopes: [] } }),
        });
      });
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(1000),
      );
      await channel.init();

      // After init: 1 touchChannel + 1 poll (which fails with "Channel not found")
      // Should trigger re-registration: another touchChannel
      await vi.waitFor(() => {
        const touchChannelCalls = mockFetch.mock.calls.filter((call) =>
          (call[1]?.body as string).includes("touchChannel"),
        );
        expect(touchChannelCalls.length).toBe(2); // Initial + recovery
      });

      // Polling should resume after recovery
      await vi.advanceTimersByTimeAsync(1000);

      // Failure count should be reset after successful recovery
      expect(channel.getHealth().failureCount).toBe(0);
      expect(channel.getHealth().state).toBe("idle");

      channel.shutdown();
    });
  });

  describe("cursor updates", () => {
    it("should update cursor with correct parameters", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({ pollSyncEnvelopes: [] });
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(),
      );

      await channel.updateCursor(42);

      expect(cursorStorage.upsert).toHaveBeenCalledTimes(1);
      const call = vi.mocked(cursorStorage.upsert).mock.calls[0];
      expect(call[0]).toMatchObject({
        cursorOrdinal: 42,
      });
      expect(call[0].lastSyncedAtUtcMs).toBeGreaterThan(0);
    });
  });

  describe("shutdown", () => {
    it("should stop polling after shutdown", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        touchChannel: true,
      });
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(1000),
      );
      await channel.init();

      // init() calls touchChannel synchronously, poll is async
      // Wait for the immediate poll to complete
      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      await vi.advanceTimersByTimeAsync(1000);
      // After 1000ms, another poll = 3 calls
      expect(mockFetch).toHaveBeenCalledTimes(3);

      channel.shutdown();
      mockFetch.mockClear();

      await vi.advanceTimersByTimeAsync(10000);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should allow shutdown with no issues", () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({ pollSyncEnvelopes: [] });
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(),
      );

      expect(() => channel.shutdown()).not.toThrow();
    });

    it("should preserve existing jobs in mailboxes after shutdown", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        pushSyncEnvelopes: true,
      });
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(),
      );

      const job = createMockSyncOperation("job-1", "remote-1");
      channel.outbox.add(job);

      // Wait for push to start
      await vi.waitFor(() => {
        expect(job.status).toBe(SyncOperationStatus.TransportPending);
      });

      channel.shutdown();

      // Job should still be in outbox
      expect(channel.outbox.items.length).toBeGreaterThan(0);
    });
  });

  describe("health monitoring", () => {
    it("should track last success timestamp", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        touchChannel: true,
      });
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(),
      );
      await channel.init();

      const beforePoll = Date.now();
      await vi.advanceTimersByTimeAsync(5000);

      const health = channel.getHealth();
      expect(health.lastSuccessUtcMs).toBeGreaterThanOrEqual(beforePoll);
      channel.shutdown();
    });

    it("should track last failure timestamp", async () => {
      const cursorStorage = createMockCursorStorage();
      // First call (touchChannel) succeeds, subsequent calls (poll) fail
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: { touchChannel: true } }),
        })
        .mockRejectedValue(new Error("Network error"));
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(),
      );
      await channel.init();

      const beforePoll = Date.now();
      await vi.advanceTimersByTimeAsync(5000);

      const health = channel.getHealth();
      expect(health.lastFailureUtcMs).toBeGreaterThanOrEqual(beforePoll);
      channel.shutdown();
    });

    it("should return correct health state transitions", async () => {
      const cursorStorage = createMockCursorStorage();
      let shouldFail = false;
      const mockFetch = vi.fn().mockImplementation(() => {
        if (shouldFail) {
          throw new Error("Network error");
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { pollSyncEnvelopes: [], touchChannel: true },
            }),
        });
      });
      global.fetch = mockFetch;

      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(1000),
      );
      await channel.init();

      // Initial state after init: idle
      expect(channel.getHealth().state).toBe("idle");

      // After success: idle
      await vi.advanceTimersByTimeAsync(1000);
      expect(channel.getHealth().state).toBe("idle");

      // After failure: running (has failures but under threshold)
      shouldFail = true;
      await vi.advanceTimersByTimeAsync(1000);
      expect(channel.getHealth().state).toBe("running");
    });
  });

  describe("with ManualPollTimer", () => {
    it("should allow manual control of polling", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        touchChannel: true,
      });
      global.fetch = mockFetch;

      const manualTimer = new ManualPollTimer();
      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        manualTimer,
      );

      await channel.init();

      // init() calls touchChannel synchronously, poll is triggered async by ManualPollTimer.start()
      // Wait for the immediate poll to complete
      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      await manualTimer.tick();
      expect(mockFetch).toHaveBeenCalledTimes(3);

      await manualTimer.tick();
      expect(mockFetch).toHaveBeenCalledTimes(4);

      channel.shutdown();
      expect(manualTimer.isRunning()).toBe(false);
    });

    it("should not poll after stop is called", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        touchChannel: true,
      });
      global.fetch = mockFetch;

      const manualTimer = new ManualPollTimer();
      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        manualTimer,
      );

      await channel.init();

      // init() calls touchChannel synchronously, poll is triggered async by ManualPollTimer.start()
      // Wait for the immediate poll to complete
      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      channel.shutdown();

      await manualTimer.tick();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should work with channel recovery flow", async () => {
      const cursorStorage = createMockCursorStorage();
      let pollCount = 0;
      const mockFetch = vi.fn().mockImplementation((_url, options) => {
        const body = JSON.parse(options?.body as string);

        if (body.query.includes("touchChannel")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: { touchChannel: true } }),
          });
        }

        pollCount++;
        if (pollCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                errors: [{ message: "Channel not found" }],
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { pollSyncEnvelopes: [] } }),
        });
      });
      global.fetch = mockFetch;

      const manualTimer = new ManualPollTimer();
      const channel = new GqlChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        manualTimer,
      );

      await channel.init();

      await vi.waitFor(() => {
        const touchChannelCalls = mockFetch.mock.calls.filter((call) =>
          (call[1]?.body as string).includes("touchChannel"),
        );
        expect(touchChannelCalls.length).toBe(2);
      });

      expect(manualTimer.isRunning()).toBe(true);

      await manualTimer.tick();
      expect(channel.getHealth().failureCount).toBe(0);

      channel.shutdown();
    });
  });
});

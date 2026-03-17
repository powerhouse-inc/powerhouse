import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IQueue } from "../../../../src/queue/interfaces.js";
import { GqlRequestChannel } from "../../../../src/sync/channels/gql-req-channel.js";
import { IntervalPollTimer } from "../../../../src/sync/channels/interval-poll-timer.js";
import type { IPollTimer } from "../../../../src/sync/channels/poll-timer.js";
import { GraphQLRequestError } from "../../../../src/sync/errors.js";
import {
  SyncOperationStatus,
  type SyncEnvelope,
} from "../../../../src/sync/types.js";
import {
  ManualPollTimer,
  createMockCursorStorage,
  createMockLogger,
  createMockOperationContext,
  createMockOperationIndex,
  createMockSyncOperation,
  createTestConfig,
} from "./test-helpers.js";

const createMockFetch = (
  response: {
    pollSyncEnvelopes?: SyncEnvelope[];
    ackOrdinal?: number;
    deadLetters?: Array<{ documentId: string; error: string }>;
    touchChannel?: boolean;
    pushSyncEnvelopes?: boolean;
  } = {},
) => {
  return vi.fn().mockImplementation((_url: string, options: RequestInit) => {
    const body = JSON.parse(options.body as string);

    if (body.query.includes("touchChannel")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { touchChannel: { success: true, ackOrdinal: 0 } },
          }),
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
              envelopes: response.pollSyncEnvelopes ?? [],
              ackOrdinal: response.ackOrdinal ?? 0,
              deadLetters: response.deadLetters ?? [],
            },
          },
        }),
    });
  });
};

const createMockQueue = (): IQueue =>
  ({
    totalSize: vi.fn().mockResolvedValue(0),
  }) as unknown as IQueue;

const createPollTimer = (intervalMs = 2000): IPollTimer =>
  new IntervalPollTimer(createMockQueue(), { intervalMs });

describe("GqlRequestChannel", () => {
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
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
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
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
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
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(),
      );

      const health = channel.getConnectionState();
      expect(health.state).toBe("connecting");
      expect(health.failureCount).toBe(0);
    });

    it("should start polling after init is called", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        touchChannel: true,
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
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

      await channel.shutdown();
    });
  });

  describe("polling", () => {
    it("should poll remote for operations at configured interval", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        touchChannel: true,
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
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

      await channel.shutdown();
    });

    it("should query with correct GraphQL syntax", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        touchChannel: true,
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
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
      await channel.shutdown();
    });

    it("should include auth token in headers when jwtHandler provided", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        touchChannel: true,
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const jwtHandler = vi.fn().mockResolvedValue("secret-token");

      const channel = new GqlRequestChannel(
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
      await channel.shutdown();
    });

    it("should not include auth header when jwtHandler returns undefined", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        touchChannel: true,
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const jwtHandler = vi.fn().mockResolvedValue(undefined);

      const channel = new GqlRequestChannel(
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
      await channel.shutdown();
    });

    it("should handle jwtHandler errors gracefully", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        touchChannel: true,
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const jwtHandler = vi.fn().mockRejectedValue(new Error("JWT error"));

      const channel = new GqlRequestChannel(
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
      await channel.shutdown();
    });

    it("should use cursor from storage when polling", async () => {
      const cursorStorage = createMockCursorStorage();
      vi.mocked(cursorStorage.list).mockResolvedValue([
        {
          remoteName: "remote-1",
          cursorType: "inbox",
          cursorOrdinal: 42,
          lastSyncedAtUtcMs: Date.now(),
        },
      ]);

      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        ackOrdinal: 42,
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
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
      expect(callBody.variables.outboxAck).toBe(42);
      expect(callBody.variables.outboxLatest).toBe(42);
      await channel.shutdown();
    });

    it("should use cursor 0 when cursor is at beginning", async () => {
      const cursorStorage = createMockCursorStorage();
      vi.mocked(cursorStorage.get).mockResolvedValue({
        remoteName: "remote-1",
        cursorType: "inbox",
        cursorOrdinal: 0,
      });

      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        ackOrdinal: 0,
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
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
      expect(callBody.variables.outboxAck).toBe(0);
      expect(callBody.variables.outboxLatest).toBe(0);
      await channel.shutdown();
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
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
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

      await channel.shutdown();
    });
  });

  describe("outbox to transport", () => {
    it("should send envelope via GraphQL mutation when job added to outbox", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        pushSyncEnvelopes: true,
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
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
      await channel.shutdown();
    });

    it("should transition job status during transport", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        pushSyncEnvelopes: true,
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
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
      await channel.shutdown();
    });

    it("should include channel metadata in envelope", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        pushSyncEnvelopes: true,
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
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
      await channel.shutdown();
    });

    it("should move unrecoverable push errors to dead letter", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            errors: [{ message: "Validation failed" }],
          }),
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
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
      await channel.shutdown();
    });

    it("should retry recoverable push errors instead of dead-lettering", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig({
          retryBaseDelayMs: 10,
          retryMaxDelayMs: 50,
        }),
        createMockOperationIndex(),
        createPollTimer(),
      );

      const job = createMockSyncOperation("job-1", "remote-1");
      channel.outbox.add(job);

      // Wait for BufferedMailbox flush (500ms) + push attempt + backoff
      await vi.waitFor(
        () => {
          expect(mockFetch).toHaveBeenCalled();
        },
        { timeout: 2000 },
      );

      // Recoverable error: stays in outbox, not dead-lettered
      expect(channel.deadLetter.items).toHaveLength(0);
      expect(channel.outbox.items).toHaveLength(1);
      await channel.shutdown();
    }, 10000);

    it("should not send concurrent push mutations when multiple flushes fire", async () => {
      const cursorStorage = createMockCursorStorage();
      let pushCallCount = 0;
      let resolvePush: (() => void) | undefined;

      const mockFetch = vi
        .fn()
        .mockImplementation((_url: string, options: RequestInit) => {
          const body = JSON.parse(options.body as string);

          if (body.query.includes("touchChannel")) {
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  data: { touchChannel: { success: true, ackOrdinal: 0 } },
                }),
            });
          }

          if (body.query.includes("pushSyncEnvelopes")) {
            pushCallCount++;
            if (pushCallCount === 1) {
              // First push: delay resolution to keep it in-flight
              return new Promise<unknown>((resolve) => {
                resolvePush = () =>
                  resolve({
                    ok: true,
                    json: () =>
                      Promise.resolve({ data: { pushSyncEnvelopes: true } }),
                  });
              });
            }
            // Subsequent pushes resolve immediately
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({ data: { pushSyncEnvelopes: true } }),
            });
          }

          return Promise.resolve({
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
          });
        });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(),
      );

      // Add first batch - triggers flush + push
      const job1 = createMockSyncOperation("job-1", "remote-1", 1);
      channel.outbox.add(job1);

      // Wait for the first push to start
      await vi.waitFor(() => {
        expect(pushCallCount).toBe(1);
      });

      // Add second batch while first push is in-flight
      const job2 = createMockSyncOperation("job-2", "remote-1", 2);
      channel.outbox.add(job2);

      // Advance timers to trigger flush of second batch
      await vi.advanceTimersByTimeAsync(600);

      // Still only one push call - second batch was blocked by isPushing
      expect(pushCallCount).toBe(1);

      // Complete the first push - should trigger drain for pending items
      resolvePush!();
      await vi.waitFor(() => {
        expect(pushCallCount).toBe(2);
      });

      await channel.shutdown();
    }, 10000);
  });

  describe("error handling", () => {
    it("should handle network errors during poll", async () => {
      const cursorStorage = createMockCursorStorage();
      const manualTimer = new ManualPollTimer(true);
      // First call (touchChannel) succeeds, subsequent calls (poll) fail
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { touchChannel: { success: true, ackOrdinal: 0 } },
            }),
        })
        .mockRejectedValue(new Error("Network error"));
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        manualTimer,
      );
      await channel.init();

      // Wait for the immediate poll to complete and fail
      await vi.waitFor(() => {
        expect(channel.getConnectionState().failureCount).toBe(1);
      });

      await manualTimer.tick().catch(() => {});

      const health = channel.getConnectionState();
      expect(health.failureCount).toBe(2);
      expect(health.state).toBe("error");
      await channel.shutdown();
    });

    it("should propagate poll errors so timer can back off", async () => {
      const cursorStorage = createMockCursorStorage();
      const manualTimer = new ManualPollTimer(true);
      // First call (touchChannel) succeeds, subsequent calls (poll) fail
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { touchChannel: { success: true, ackOrdinal: 0 } },
            }),
        })
        .mockRejectedValue(new Error("Network error"));
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        manualTimer,
      );
      await channel.init();

      // Wait for the immediate poll to complete (1 failure)
      await vi.waitFor(() => {
        expect(channel.getConnectionState().failureCount).toBe(1);
      });

      // Manual tick should reject (error propagated to timer)
      await expect(manualTimer.tick()).rejects.toThrow("Network error");
      expect(channel.getConnectionState().failureCount).toBe(2);
    });

    it("should reset failure count on success", async () => {
      const cursorStorage = createMockCursorStorage();
      const manualTimer = new ManualPollTimer(true);
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        // First call is touchChannel (init), then polling starts immediately
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: { touchChannel: { success: true, ackOrdinal: 0 } },
              }),
          });
        }
        // Call 2 (immediate poll) and call 3 fail, call 4 succeeds
        if (callCount <= 3) {
          throw new Error("Network error");
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                pollSyncEnvelopes: { envelopes: [], ackOrdinal: 0 },
              },
            }),
        });
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        manualTimer,
      );
      await channel.init();

      // Wait for immediate poll which fails (call 2)
      await vi.waitFor(() => {
        expect(channel.getConnectionState().failureCount).toBe(1);
      });

      // Call 3 fails
      await manualTimer.tick().catch(() => {});
      expect(channel.getConnectionState().failureCount).toBe(2);

      // Call 4 succeeds - failureCount resets
      await manualTimer.tick();
      expect(channel.getConnectionState().failureCount).toBe(0);
      expect(channel.getConnectionState().state).toBe("connected");
      await channel.shutdown();
    });

    it("should handle GraphQL errors as unrecoverable", async () => {
      const cursorStorage = createMockCursorStorage();
      const manualTimer = new ManualPollTimer(true);
      // First call (touchChannel) succeeds, subsequent calls return GraphQL errors
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { touchChannel: { success: true, ackOrdinal: 0 } },
            }),
        })
        .mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              errors: [{ message: "GraphQL error" }],
            }),
        });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        manualTimer,
      );
      await channel.init();

      // Wait for the immediate poll to complete
      await vi.waitFor(() => {
        expect(channel.getConnectionState().failureCount).toBe(1);
      });

      // Timer is stopped for unrecoverable errors, so further ticks do nothing
      await manualTimer.tick().catch(() => {});
      expect(channel.getConnectionState().failureCount).toBe(1);
      expect(manualTimer.isRunning()).toBe(false);
      await channel.shutdown();
    });

    it("should handle HTTP errors", async () => {
      const cursorStorage = createMockCursorStorage();
      const manualTimer = new ManualPollTimer(true);
      // First call (touchChannel) succeeds, subsequent calls (poll) fail with HTTP 500
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { touchChannel: { success: true, ackOrdinal: 0 } },
            }),
        })
        .mockResolvedValue({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        manualTimer,
      );
      await channel.init();

      // Wait for the immediate poll to complete
      await vi.waitFor(() => {
        expect(channel.getConnectionState().failureCount).toBe(1);
      });

      // Another poll failure
      await manualTimer.tick().catch(() => {});
      expect(channel.getConnectionState().failureCount).toBe(2);
      await channel.shutdown();
    });

    it("should not propagate 'Channel not found' errors to timer", async () => {
      const cursorStorage = createMockCursorStorage();
      const manualTimer = new ManualPollTimer(true);
      let pollCount = 0;
      const mockFetch = vi.fn().mockImplementation((_url, options) => {
        const body = JSON.parse(options.body as string);
        if (body.query.includes("touchChannel")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: { touchChannel: { success: true, ackOrdinal: 0 } },
              }),
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
          json: () =>
            Promise.resolve({
              data: {
                pollSyncEnvelopes: { envelopes: [], ackOrdinal: 0 },
              },
            }),
        });
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        manualTimer,
      );
      await channel.init();

      // Wait for the "Channel not found" recovery to complete
      await vi.waitFor(() => {
        const touchChannelCalls = mockFetch.mock.calls.filter((call) =>
          (call[1]?.body as string).includes("touchChannel"),
        );
        expect(touchChannelCalls.length).toBe(2);
      });

      // Timer should NOT have received a rejection (poll returned, didn't throw)
      // Verify by checking that manual tick resolves (not rejects)
      await expect(manualTimer.tick()).resolves.toBeUndefined();
      expect(channel.getConnectionState().failureCount).toBe(0);
      await channel.shutdown();
    });

    it("should re-register channel when 'Channel not found' error occurs", async () => {
      const cursorStorage = createMockCursorStorage();
      let pollCount = 0;
      const mockFetch = vi.fn().mockImplementation((_url, options) => {
        const body = JSON.parse(options.body as string);

        // touchChannel mutation - always succeeds
        if (body.query.includes("touchChannel")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: { touchChannel: { success: true, ackOrdinal: 0 } },
              }),
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
          json: () =>
            Promise.resolve({
              data: {
                pollSyncEnvelopes: { envelopes: [], ackOrdinal: 0 },
              },
            }),
        });
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
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
      expect(channel.getConnectionState().failureCount).toBe(0);
      expect(channel.getConnectionState().state).toBe("connected");

      await channel.shutdown();
    });
  });

  describe("GraphQLRequestError", () => {
    it("carries correct category and status code", () => {
      const networkErr = new GraphQLRequestError("Network error", "network");
      expect(networkErr.category).toBe("network");
      expect(networkErr.statusCode).toBeUndefined();
      expect(networkErr.name).toBe("GraphQLRequestError");

      const httpErr = new GraphQLRequestError("HTTP 401", "http", 401);
      expect(httpErr.category).toBe("http");
      expect(httpErr.statusCode).toBe(401);

      const graphqlErr = new GraphQLRequestError(
        "Validation failed",
        "graphql",
      );
      expect(graphqlErr.category).toBe("graphql");
      expect(graphqlErr.statusCode).toBeUndefined();
    });

    it("is thrown from executeGraphQL with correct categories", async () => {
      const cursorStorage = createMockCursorStorage();
      const manualTimer = new ManualPollTimer(true);

      // Network error: fetch throws on all poll attempts
      const mockFetch = vi.fn().mockImplementation((_url, options) => {
        const body = JSON.parse(options.body as string);
        if (body.query.includes("touchChannel")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: { touchChannel: { success: true, ackOrdinal: 0 } },
              }),
          });
        }
        return Promise.reject(new Error("Connection refused"));
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        manualTimer,
      );
      await channel.init();

      // Wait for the initial poll (from start()) to settle
      await vi.waitFor(() => {
        expect(channel.getConnectionState().failureCount).toBe(1);
      });

      try {
        await manualTimer.tick();
      } catch (error) {
        expect(error).toBeInstanceOf(GraphQLRequestError);
        expect((error as GraphQLRequestError).category).toBe("network");
      }
      await channel.shutdown();
    });
  });

  describe("touchRemoteChannel", () => {
    it("returns ackOrdinal from server response", async () => {
      const cursorStorage = createMockCursorStorage();
      const manualTimer = new ManualPollTimer(true);
      const mockFetch = vi.fn().mockImplementation((_url, options) => {
        const body = JSON.parse(options.body as string);
        if (body.query.includes("touchChannel")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: { touchChannel: { success: true, ackOrdinal: 5 } },
              }),
          });
        }
        return Promise.resolve({
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
        });
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        manualTimer,
      );

      // init calls touchRemoteChannel which returns ackOrdinal
      await channel.init();
      expect(channel.getConnectionState().state).toBe("connected");

      // Verify the touchChannel mutation requests the new fields
      const touchCall = mockFetch.mock.calls.find(
        (call: unknown[]) =>
          (call[1] as RequestInit).body &&
          ((call[1] as RequestInit).body as string).includes("touchChannel"),
      );
      expect(touchCall).toBeDefined();
      const body = JSON.parse((touchCall![1] as RequestInit).body as string);
      expect(body.query).toContain("ackOrdinal");
      expect(body.query).toContain("success");
      await channel.shutdown();
    });
  });

  describe("recovery loop", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("does not restart poll timer on recovery failure", async () => {
      const cursorStorage = createMockCursorStorage();
      const manualTimer = new ManualPollTimer(true);
      let touchCount = 0;
      const mockFetch = vi.fn().mockImplementation((_url, options) => {
        const body = JSON.parse(options.body as string);
        if (body.query.includes("touchChannel")) {
          touchCount++;
          if (touchCount > 1) {
            // Recovery touch fails with network error (recoverable)
            throw new Error("Network error");
          }
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: { touchChannel: { success: true, ackOrdinal: 0 } },
              }),
          });
        }
        // Poll returns channel not found
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              errors: [{ message: "Channel not found" }],
            }),
        });
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        manualTimer,
      );
      await channel.init();

      // init fires: touchChannel(1) succeeds, start() auto-fires poll which
      // returns "Channel not found", triggering recovery touchChannel(2) which
      // fails with network error. Wait for that recovery chain to settle.
      await vi.waitFor(() => {
        expect(touchCount).toBeGreaterThanOrEqual(2);
      });

      // Timer should NOT have been restarted (recovery failed but is recoverable,
      // so it schedules a retry via setTimeout, NOT pollTimer.start())
      expect(manualTimer.isRunning()).toBe(false);
      expect(channel.getConnectionState().state).toBe("reconnecting");
      await channel.shutdown();
    });
  });

  describe("shutdown", () => {
    it("should stop polling after shutdown", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        touchChannel: true,
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
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

      await channel.shutdown();
      mockFetch.mockClear();

      await vi.advanceTimersByTimeAsync(10000);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should allow shutdown with no issues", () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({ pollSyncEnvelopes: [] });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
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
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
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

      await channel.shutdown();

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
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
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

      const health = channel.getConnectionState();
      expect(health.lastSuccessUtcMs).toBeGreaterThanOrEqual(beforePoll);
      await channel.shutdown();
    });

    it("should track last failure timestamp", async () => {
      const cursorStorage = createMockCursorStorage();
      // First call (touchChannel) succeeds, subsequent calls (poll) fail
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { touchChannel: { success: true, ackOrdinal: 0 } },
            }),
        })
        .mockRejectedValue(new Error("Network error"));
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
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

      const health = channel.getConnectionState();
      expect(health.lastFailureUtcMs).toBeGreaterThanOrEqual(beforePoll);
      await channel.shutdown();
    });

    it("should return correct health state transitions", async () => {
      const cursorStorage = createMockCursorStorage();
      let shouldFail = false;
      const mockFetch = vi
        .fn()
        .mockImplementation((_url: string, options: RequestInit) => {
          if (shouldFail) {
            throw new Error("Network error");
          }
          const body = JSON.parse(options.body as string);
          if (body.query.includes("touchChannel")) {
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  data: { touchChannel: { success: true, ackOrdinal: 0 } },
                }),
            });
          }
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: {
                  pollSyncEnvelopes: { envelopes: [], ackOrdinal: 0 },
                },
              }),
          });
        });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
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
      expect(channel.getConnectionState().state).toBe("connected");

      // After success: idle
      await vi.advanceTimersByTimeAsync(1000);
      expect(channel.getConnectionState().state).toBe("connected");

      // After failure: error (has failures)
      shouldFail = true;
      await vi.advanceTimersByTimeAsync(1000);
      expect(channel.getConnectionState().state).toBe("error");
    });
  });

  describe("cursor persistence", () => {
    it("should persist outbox cursor when applied operations are removed", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        pushSyncEnvelopes: true,
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(),
      );

      const syncOp = createMockSyncOperation("syncop-1", "remote-1", 5);
      channel.outbox.add(syncOp);

      // Flush add buffer to trigger push (which calls started())
      await vi.advanceTimersByTimeAsync(500);
      await vi.waitFor(() => {
        expect(syncOp.status).toBe(SyncOperationStatus.TransportPending);
      });

      syncOp.executed();
      channel.outbox.remove(syncOp);

      // Flush remove buffer
      await vi.advanceTimersByTimeAsync(500);

      expect(cursorStorage.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          remoteName: "remote-1",
          cursorType: "outbox",
          cursorOrdinal: 5,
        }),
      );
    });

    it("should persist inbox cursor when applied operations are removed", () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({ pollSyncEnvelopes: [] });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(),
      );

      const syncOp = createMockSyncOperation("syncop-1", "remote-1", 5);
      channel.inbox.add(syncOp);
      syncOp.executed();
      channel.inbox.remove(syncOp);

      expect(cursorStorage.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          remoteName: "remote-1",
          cursorType: "inbox",
          cursorOrdinal: 5,
        }),
      );
    });

    it("should not persist cursor when removed operations are not applied", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({ pollSyncEnvelopes: [] });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(),
      );

      const syncOp = createMockSyncOperation("syncop-1", "remote-1", 5);
      channel.outbox.add(syncOp);
      channel.outbox.remove(syncOp);

      await vi.advanceTimersByTimeAsync(500);

      expect(cursorStorage.upsert).not.toHaveBeenCalled();
    });

    it("should not persist cursor when ordinal matches last persisted", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        pushSyncEnvelopes: true,
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(),
      );

      const syncOp1 = createMockSyncOperation("syncop-1", "remote-1", 5);
      channel.outbox.add(syncOp1);

      await vi.advanceTimersByTimeAsync(500);
      await vi.waitFor(() => {
        expect(syncOp1.status).toBe(SyncOperationStatus.TransportPending);
      });

      syncOp1.executed();
      channel.outbox.remove(syncOp1);

      await vi.advanceTimersByTimeAsync(500);

      expect(cursorStorage.upsert).toHaveBeenCalledTimes(1);

      const syncOp2 = createMockSyncOperation("syncop-2", "remote-1", 5);
      channel.outbox.add(syncOp2);

      await vi.advanceTimersByTimeAsync(500);
      await vi.waitFor(() => {
        expect(syncOp2.status).toBe(SyncOperationStatus.TransportPending);
      });

      syncOp2.executed();
      channel.outbox.remove(syncOp2);

      await vi.advanceTimersByTimeAsync(500);

      expect(cursorStorage.upsert).toHaveBeenCalledTimes(1);
    });

    it("should not persist cursor when ordinal is not greater than stored ack", async () => {
      const cursorStorage = createMockCursorStorage();
      vi.mocked(cursorStorage.list).mockResolvedValue([
        {
          remoteName: "remote-1",
          cursorType: "outbox",
          cursorOrdinal: 10,
          lastSyncedAtUtcMs: Date.now(),
        },
      ]);

      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        touchChannel: true,
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        cursorStorage,
        createTestConfig(),
        createMockOperationIndex(),
        createPollTimer(),
      );
      await channel.init();

      const syncOp = createMockSyncOperation("syncop-1", "remote-1", 5);
      channel.outbox.add(syncOp);
      syncOp.executed();
      channel.outbox.remove(syncOp);

      expect(cursorStorage.upsert).not.toHaveBeenCalled();
      await channel.shutdown();
    });
  });

  describe("dead letter", () => {
    it("should not stop poller when a dead letter is added (quarantine is in SyncManager)", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        touchChannel: true,
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const manualTimer = new ManualPollTimer(true);
      const channel = new GqlRequestChannel(
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
        expect(manualTimer.isRunning()).toBe(true);
      });

      const deadLetterOp = createMockSyncOperation("dead-1", "remote-1");
      channel.deadLetter.add(deadLetterOp);

      expect(manualTimer.isRunning()).toBe(true);
    });
  });

  describe("remote dead letter handling", () => {
    it("should add dead letters to local deadLetter mailbox when poll returns them", async () => {
      const cursorStorage = createMockCursorStorage();
      const manualTimer = new ManualPollTimer(true);
      const mockFetch = createMockFetch({
        deadLetters: [
          { documentId: "doc-1", error: "Missing operations gap" },
          { documentId: "doc-2", error: "Schema validation failed" },
        ],
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
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
        expect(channel.deadLetter.items).toHaveLength(2);
      });

      expect(channel.deadLetter.items[0].documentId).toBe("doc-1");
      expect(channel.deadLetter.items[1].documentId).toBe("doc-2");
      await channel.shutdown();
    });

    it("should not stop poller after receiving remote dead letters (quarantine is in SyncManager)", async () => {
      const cursorStorage = createMockCursorStorage();
      const manualTimer = new ManualPollTimer(true);
      const mockFetch = createMockFetch({
        deadLetters: [{ documentId: "doc-1", error: "Missing operations gap" }],
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
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
        expect(channel.deadLetter.items).toHaveLength(1);
      });

      expect(manualTimer.isRunning()).toBe(true);
      await channel.shutdown();
    });

    it("should push new outbox items even when dead letters exist (quarantine is in SyncManager)", async () => {
      const cursorStorage = createMockCursorStorage();
      const manualTimer = new ManualPollTimer(true);
      const mockFetch = createMockFetch({
        deadLetters: [{ documentId: "doc-1", error: "Missing operations gap" }],
        pushSyncEnvelopes: true,
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
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
        expect(channel.deadLetter.items).toHaveLength(1);
      });

      const pushCallsBefore = mockFetch.mock.calls.filter((call) =>
        (call[1]?.body as string).includes("pushSyncEnvelopes"),
      ).length;

      const job = createMockSyncOperation("job-1", "remote-1");
      channel.outbox.add(job);

      await vi.waitFor(() => {
        const pushCallsAfter = mockFetch.mock.calls.filter((call) =>
          (call[1]?.body as string).includes("pushSyncEnvelopes"),
        ).length;
        expect(pushCallsAfter).toBeGreaterThan(pushCallsBefore);
      });
      await channel.shutdown();
    });

    it("should not create dead letter ops when deadLetters array is empty", async () => {
      const cursorStorage = createMockCursorStorage();
      const manualTimer = new ManualPollTimer(true);
      const mockFetch = createMockFetch({
        deadLetters: [],
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
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
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      expect(channel.deadLetter.items).toHaveLength(0);
      expect(manualTimer.isRunning()).toBe(true);
      await channel.shutdown();
    });

    it("should process envelopes before handling dead letters", async () => {
      const cursorStorage = createMockCursorStorage();
      const manualTimer = new ManualPollTimer(true);
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

      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation((_url, options) => {
        const body = JSON.parse(options.body as string);
        if (body.query.includes("touchChannel")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: { touchChannel: { success: true, ackOrdinal: 0 } },
              }),
          });
        }
        callCount++;
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: {
                pollSyncEnvelopes: {
                  envelopes: callCount === 1 ? [mockEnvelope] : [],
                  ackOrdinal: 0,
                  deadLetters:
                    callCount === 1
                      ? [{ documentId: "doc-x", error: "gap error" }]
                      : [],
                },
              },
            }),
        });
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const channel = new GqlRequestChannel(
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
        expect(channel.deadLetter.items).toHaveLength(1);
      });

      expect(channel.inbox.items).toHaveLength(1);
      expect(channel.deadLetter.items).toHaveLength(1);
      await channel.shutdown();
    });
  });

  describe("with ManualPollTimer", () => {
    it("should allow manual control of polling", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        touchChannel: true,
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const manualTimer = new ManualPollTimer(true);
      const channel = new GqlRequestChannel(
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

      await channel.shutdown();
      expect(manualTimer.isRunning()).toBe(false);
    });

    it("should not poll after stop is called", async () => {
      const cursorStorage = createMockCursorStorage();
      const mockFetch = createMockFetch({
        pollSyncEnvelopes: [],
        touchChannel: true,
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const manualTimer = new ManualPollTimer(true);
      const channel = new GqlRequestChannel(
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

      await channel.shutdown();

      await manualTimer.tick();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should work with channel recovery flow", async () => {
      const cursorStorage = createMockCursorStorage();
      let pollCount = 0;
      const mockFetch = vi.fn().mockImplementation((_url, options) => {
        const body = JSON.parse(options.body as string);

        if (body.query.includes("touchChannel")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: { touchChannel: { success: true, ackOrdinal: 0 } },
              }),
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
          json: () =>
            Promise.resolve({
              data: {
                pollSyncEnvelopes: { envelopes: [], ackOrdinal: 0 },
              },
            }),
        });
      });
      global.fetch = mockFetch as unknown as typeof global.fetch;

      const manualTimer = new ManualPollTimer(true);
      const channel = new GqlRequestChannel(
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
      expect(channel.getConnectionState().failureCount).toBe(0);

      await channel.shutdown();
    });
  });
});

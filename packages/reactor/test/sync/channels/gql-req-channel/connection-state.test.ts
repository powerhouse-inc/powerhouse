import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GqlRequestChannel } from "../../../../src/sync/channels/gql-req-channel.js";
import type { ConnectionStateSnapshot } from "../../../../src/sync/types.js";
import {
  ManualPollTimer,
  createMockCursorStorage,
  createMockFetch,
  createMockLogger,
  createMockOperationIndex,
  createMockSyncOperation,
  createTestConfig,
  successFetch,
} from "./test-helpers.js";

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
          json: () =>
            Promise.resolve({
              data: { touchChannel: { success: true, ackOrdinal: 0 } },
            }),
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
          json: () =>
            Promise.resolve({
              data: { touchChannel: { success: true, ackOrdinal: 0 } },
            }),
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
          json: () =>
            Promise.resolve({
              data: { touchChannel: { success: true, ackOrdinal: 0 } },
            }),
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

  it("stays connected when dead letter is added (quarantine is in SyncManager)", async () => {
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
    expect(channel.getConnectionState().state).toBe("connected");
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
          json: () =>
            Promise.resolve({
              data: { touchChannel: { success: true, ackOrdinal: 0 } },
            }),
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
          json: () =>
            Promise.resolve({
              data: { touchChannel: { success: true, ackOrdinal: 0 } },
            }),
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
          json: () =>
            Promise.resolve({
              data: { touchChannel: { success: true, ackOrdinal: 0 } },
            }),
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

  it("401 poll error stops polling and transitions to error", async () => {
    const mockFetch = createMockFetch((body) => {
      if (body.query.includes("touchChannel")) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              data: { touchChannel: { success: true, ackOrdinal: 0 } },
            }),
        };
      }
      return {
        ok: false,
        status: 401,
        statusText: "Unauthorized",
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
    await manualTimer.tick();

    expect(channel.getConnectionState().state).toBe("error");
    expect(manualTimer.isRunning()).toBe(false);
    await channel.shutdown();
  });

  it("500 poll error allows timer retry", async () => {
    let pollCount = 0;
    const mockFetch = createMockFetch((body) => {
      if (body.query.includes("touchChannel")) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              data: { touchChannel: { success: true, ackOrdinal: 0 } },
            }),
        };
      }
      pollCount++;
      if (pollCount === 1) {
        return {
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
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

    // First poll: 500 error (recoverable) - rethrown by handlePollError
    await manualTimer.tick().catch(() => {});
    expect(channel.getConnectionState().state).toBe("error");
    expect(manualTimer.isRunning()).toBe(true);

    // Second poll succeeds - timer is still running
    await manualTimer.tick();
    expect(channel.getConnectionState().state).toBe("connected");
    await channel.shutdown();
  });

  it("recovery with auth error stops immediately", async () => {
    let touchCount = 0;
    const mockFetch = createMockFetch((body) => {
      if (body.query.includes("touchChannel")) {
        touchCount++;
        if (touchCount > 1) {
          return {
            ok: false,
            status: 403,
            statusText: "Forbidden",
            json: () => Promise.resolve({}),
          };
        }
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              data: { touchChannel: { success: true, ackOrdinal: 0 } },
            }),
        };
      }
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
    // Timer should stay stopped (not restarted)
    expect(manualTimer.isRunning()).toBe(false);
    await channel.shutdown();
  });

  it("recovery with network error retries with backoff", async () => {
    let touchCount = 0;
    const mockFetch = createMockFetch((body) => {
      if (body.query.includes("touchChannel")) {
        touchCount++;
        if (touchCount === 2) {
          throw new Error("Network timeout");
        }
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              data: { touchChannel: { success: true, ackOrdinal: 0 } },
            }),
        };
      }
      if (body.query.includes("pollSyncEnvelopes")) {
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
      createTestConfig({ retryBaseDelayMs: 100, retryMaxDelayMs: 200 }),
      createMockOperationIndex(),
      manualTimer,
    );

    await channel.init();
    await manualTimer.tick();
    expect(channel.getConnectionState().state).toBe("reconnecting");

    // First recovery attempt fails with network error (recoverable)
    await vi.advanceTimersByTimeAsync(50);
    expect(channel.getConnectionState().state).toBe("reconnecting");

    // Advance past backoff delay - second recovery attempt succeeds
    await vi.advanceTimersByTimeAsync(500);
    expect(channel.getConnectionState().state).toBe("connected");
    await channel.shutdown();
  });
});

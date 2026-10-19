import { describe, expect, it, vi } from "vitest";
import { GqlRequestChannel } from "../../src/sync/channels/gql-req-channel.js";
import { IntervalPollTimer } from "../../src/sync/channels/interval-poll-timer.js";
import type { IQueue } from "../../src/queue/interfaces.js";
import {
  ManualPollTimer,
  createMockCursorStorage,
  createMockFetch,
  createMockLogger,
  createMockOperationIndex,
  createTestConfig,
  successFetch,
} from "../sync/channels/gql-req-channel/test-helpers.js";

function makeChannel(
  timer: ManualPollTimer | IntervalPollTimer = new ManualPollTimer(),
) {
  return new GqlRequestChannel(
    createMockLogger(),
    "channel-1",
    "remote-1",
    createMockCursorStorage(),
    createTestConfig(),
    createMockOperationIndex(),
    timer,
  );
}

/** Minimal IQueue stand-in; only totalSize() matters to IntervalPollTimer. */
function fakeQueue(totalSize: () => Promise<number>): IQueue {
  return { totalSize } as unknown as IQueue;
}

describe("a dead poll loop reports itself as connected", () => {
  it("does not report connected before a poll has ever completed", async () => {
    global.fetch = successFetch() as unknown as typeof global.fetch;
    const channel = makeChannel();
    await channel.init();

    const snapshot = channel.getConnectionState();
    expect(snapshot.lastSuccessUtcMs).toBe(0);
    expect(snapshot.state).not.toBe("connected");
    await channel.shutdown();
  });

  it("records a failure when poll() throws after the fetch", async () => {
    const fetchFn = createMockFetch((body) => {
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
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              pollSyncEnvelopes: {
                envelopes: [],
                ackOrdinal: 0,
                hasMore: false,
                deadLetters: [
                  {
                    documentId: "doc-1",
                    error: "boom",
                    errorType: null,
                    jobId: "job-1",
                    branch: "main",
                    scopes: ["public"],
                    operationCount: 1,
                  },
                ],
              },
            },
          }),
      };
    });
    const timer = new ManualPollTimer();
    const channel = new GqlRequestChannel(
      createMockLogger(),
      "channel-1",
      "remote-1",
      createMockCursorStorage(),
      createTestConfig({ fetchFn: fetchFn as never }),
      createMockOperationIndex(),
      timer,
    );
    await channel.init();

    // Mailbox.add rethrows listener failures, after the fetch has succeeded.
    channel.deadLetter.onAdded(() => {
      throw new Error("downstream ingestion blew up");
    });

    await timer.tick().catch(() => undefined);

    const snapshot = channel.getConnectionState();
    expect(snapshot.failureCount).toBeGreaterThan(0);
    expect(snapshot.lastFailureUtcMs).toBeGreaterThan(0);
    await channel.shutdown();
  });

  it("times out a hung poll request and keeps the loop alive", async () => {
    vi.useFakeTimers();
    try {
      let polls = 0;
      const fetchFn = vi.fn((_url: string, options: RequestInit) => {
        const body = JSON.parse(options.body as string) as { query: string };
        if (body.query.includes("touchChannel")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: { touchChannel: { success: true, ackOrdinal: 0 } },
              }),
          });
        }
        polls++;
        // The hung response: never resolves, never rejects.
        return new Promise(() => undefined);
      });

      const timer = new IntervalPollTimer(
        fakeQueue(() => Promise.resolve(0)),
        { intervalMs: 1000, retryBaseDelayMs: 1000, retryMaxDelayMs: 5000 },
      );
      const channel = new GqlRequestChannel(
        createMockLogger(),
        "channel-1",
        "remote-1",
        createMockCursorStorage(),
        createTestConfig({ fetchFn: fetchFn as never }),
        createMockOperationIndex(),
        timer,
      );
      await channel.init();

      await vi.advanceTimersByTimeAsync(120_000);

      expect(polls).toBeGreaterThan(1);
      expect(channel.getConnectionState().lastFailureUtcMs).toBeGreaterThan(0);
      await channel.shutdown();
    } finally {
      vi.useRealTimers();
    }
  });

  it("distinguishes a bailed poll from a successful one", async () => {
    let touches = 0;
    const fetchFn = createMockFetch((body) => {
      if (body.query.includes("touchChannel")) {
        touches++;
        // Every touch after init()'s is a manifest refresh, and it fails.
        if (touches > 1) {
          return { ok: false, json: () => Promise.resolve({}) };
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
            data: {
              pollSyncEnvelopes: {
                envelopes: [],
                ackOrdinal: 0,
                deadLetters: [],
                hasMore: false,
                // Differs from the (absent) peer manifest, so poll() refreshes.
                manifestRevision: "peer-rev-2",
                peerManifestRevision: null,
              },
            },
          }),
      };
    });
    const timer = new ManualPollTimer();
    const channel = new GqlRequestChannel(
      createMockLogger(),
      "channel-1",
      "remote-1",
      createMockCursorStorage(),
      createTestConfig({ fetchFn: fetchFn as never }),
      createMockOperationIndex(),
      timer,
    );
    await channel.init();
    await timer.tick().catch(() => undefined);

    const snapshot = channel.getConnectionState();
    expect(snapshot.lastSuccessUtcMs).toBe(0);
    expect(
      snapshot.lastFailureUtcMs > 0 || snapshot.state !== "connected",
    ).toBe(true);
    await channel.shutdown();
  });

  it("keeps polling after a manifest refresh fails transiently", async () => {
    let touches = 0;
    let polls = 0;
    const fetchFn = createMockFetch((body) => {
      if (body.query.includes("touchChannel")) {
        touches++;
        if (touches === 2) {
          return {
            ok: true,
            json: () =>
              Promise.resolve({ errors: [{ message: "server busy" }] }),
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
      polls++;
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              pollSyncEnvelopes: {
                envelopes: [],
                ackOrdinal: 0,
                deadLetters: [],
                hasMore: false,
                manifestRevision: "peer-rev-2",
                peerManifestRevision: null,
              },
            },
          }),
      };
    });
    const timer = new ManualPollTimer();
    const channel = new GqlRequestChannel(
      createMockLogger(),
      "channel-1",
      "remote-1",
      createMockCursorStorage(),
      createTestConfig({ fetchFn: fetchFn as never }),
      createMockOperationIndex(),
      timer,
    );
    await channel.init();
    await timer.tick().catch(() => undefined);

    expect(channel.getConnectionState().lastFailureUtcMs).toBeGreaterThan(0);
    expect(timer.isRunning()).toBe(true);

    await timer.tick();
    expect(polls).toBe(2);
    expect(channel.getConnectionState().state).toBe("connected");
    await channel.shutdown();
  });

  it("keeps ticking when the delegate hangs until it is cancelled", async () => {
    vi.useFakeTimers();
    try {
      let starts = 0;
      let concurrent = 0;
      let maxConcurrent = 0;
      const timer = new IntervalPollTimer(
        fakeQueue(() => Promise.resolve(0)),
        { intervalMs: 500, retryBaseDelayMs: 500, retryMaxDelayMs: 2000 },
      );
      timer.setDelegate((signal) => {
        starts++;
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        return new Promise<void>((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            concurrent--;
            reject(new Error("cancelled"));
          });
        });
      });
      timer.start();

      await vi.advanceTimersByTimeAsync(600_000);
      expect(starts).toBeGreaterThan(1);
      expect(maxConcurrent).toBe(1);
      timer.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps ticking when the queue size probe never settles", async () => {
    vi.useFakeTimers();
    try {
      let delegated = 0;
      const timer = new IntervalPollTimer(
        fakeQueue(() => new Promise(() => undefined)),
        { intervalMs: 500, retryBaseDelayMs: 500, retryMaxDelayMs: 2000 },
      );
      timer.setDelegate(() => {
        delegated++;
        return Promise.resolve();
      });
      timer.start();

      await vi.advanceTimersByTimeAsync(60_000);
      expect(delegated).toBeGreaterThan(0);
      timer.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

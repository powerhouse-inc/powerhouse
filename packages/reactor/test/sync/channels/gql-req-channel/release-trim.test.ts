import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GqlRequestChannel } from "../../../../src/sync/channels/gql-req-channel.js";
import { SyncOperationStatus } from "../../../../src/sync/types.js";
import {
  ManualPollTimer,
  createMockCursorStorage,
  createMockFetch,
  createMockLogger,
  createMockOperationIndex,
  createMockSyncOperation,
  createTestConfig,
} from "./test-helpers.js";

describe("GqlRequestChannel release backfill trim", () => {
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

  it("keeps a release backfill below the server's ack until a push succeeds", async () => {
    let pushOk = false;
    const fetch = createMockFetch((body) => {
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
        return pushOk
          ? {
              ok: true,
              json: () =>
                Promise.resolve({ data: { pushSyncEnvelopes: true } }),
            }
          : { ok: false, status: 503, json: () => Promise.resolve({}) };
      }
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              pollSyncEnvelopes: {
                envelopes: [],
                ackOrdinal: 10,
                deadLetters: [],
                hasMore: false,
              },
            },
          }),
      };
    });
    global.fetch = fetch as unknown as typeof global.fetch;
    const timer = new ManualPollTimer();
    const channel = new GqlRequestChannel(
      createMockLogger(),
      "channel-1",
      "remote-1",
      createMockCursorStorage(),
      createTestConfig({ retryBaseDelayMs: 100, retryMaxDelayMs: 200 }),
      createMockOperationIndex(),
      timer,
    );
    await channel.init();

    const released = createMockSyncOperation("released", "remote-1", 3, "m3");
    released.awaitingPush = true;
    const ordinary = createMockSyncOperation("ordinary", "remote-1", 4);
    channel.outbox.add(released, ordinary);
    await vi.advanceTimersByTimeAsync(600);

    await timer.tick();
    expect(channel.outbox.items).toEqual([released]);
    expect(released.awaitingPush).toBe(true);

    pushOk = true;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(released.awaitingPush).toBe(false);

    await timer.tick();
    expect(channel.outbox.items).toEqual([]);
    expect(released.status).toBe(SyncOperationStatus.Applied);

    await channel.shutdown();
  });
});

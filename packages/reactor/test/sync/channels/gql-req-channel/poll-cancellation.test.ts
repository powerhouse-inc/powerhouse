import { describe, expect, it, vi } from "vitest";
import type { SyncEnvelope } from "../../../../src/sync/types.js";
import { GqlRequestChannel } from "../../../../src/sync/channels/gql-req-channel.js";
import {
  ManualPollTimer,
  createMockCursorStorage,
  createMockLogger,
  createMockOperationContext,
  createMockOperationIndex,
  createMockSyncOperation,
  createTestConfig,
} from "./test-helpers.js";

const envelope: SyncEnvelope = {
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

describe("a cancelled poll tick", () => {
  it("stops mutating the mailboxes and records a failure", async () => {
    const cancellation = new AbortController();
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
      // The remote answers, but the tick's bound passed first: whether the
      // response or the cancellation wins the race, nothing may be applied.
      cancellation.abort(new Error("poll delegate exceeded its 1000ms bound"));
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              pollSyncEnvelopes: {
                envelopes: [envelope],
                ackOrdinal: 5,
                deadLetters: [],
                hasMore: false,
              },
            },
          }),
      });
    });

    const timer = new ManualPollTimer();
    const cursorStorage = createMockCursorStorage();
    const channel = new GqlRequestChannel(
      createMockLogger(),
      "channel-1",
      "remote-1",
      cursorStorage,
      createTestConfig({ fetchFn: fetchFn as never }),
      createMockOperationIndex(),
      timer,
    );
    await channel.init();

    // An unacked outbox entry, so an ack-driven trim would be observable.
    channel.outbox.add(createMockSyncOperation("op-out", "remote-1", 5));
    const outboxBefore = channel.outbox.items.length;

    await timer.tick(cancellation.signal).catch(() => undefined);

    expect(channel.inbox.items).toEqual([]);
    expect(channel.inbox.ackOrdinal).toBe(0);
    expect(channel.outbox.items.length).toBe(outboxBefore);
    expect(channel.outbox.ackOrdinal).toBe(0);
    expect(cursorStorage.upsert).not.toHaveBeenCalled();

    const snapshot = channel.getConnectionState();
    expect(snapshot.lastSuccessUtcMs).toBe(0);
    expect(snapshot.failureCount).toBeGreaterThan(0);
    expect(snapshot.lastFailureUtcMs).toBeGreaterThan(0);

    await channel.shutdown();
  });

  it("ingests normally when the tick is not cancelled", async () => {
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
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              pollSyncEnvelopes: {
                envelopes: [envelope],
                ackOrdinal: 0,
                deadLetters: [],
                hasMore: false,
              },
            },
          }),
      });
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

    await timer.tick(new AbortController().signal);

    expect(channel.inbox.items).toHaveLength(1);
    expect(channel.getConnectionState().lastSuccessUtcMs).toBeGreaterThan(0);

    await channel.shutdown();
  });
});

describe("a poll whose token fetch never settles", () => {
  it("is bounded by the request deadline and recorded as a failure", async () => {
    let tokens = 0;
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
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              pollSyncEnvelopes: {
                envelopes: [],
                ackOrdinal: 0,
                deadLetters: [],
                hasMore: false,
              },
            },
          }),
      });
    });
    const timer = new ManualPollTimer();
    const channel = new GqlRequestChannel(
      createMockLogger(),
      "channel-1",
      "remote-1",
      createMockCursorStorage(),
      createTestConfig({
        fetchFn: fetchFn as never,
        requestTimeoutMs: 50,
        jwtHandler: () => {
          tokens++;
          return tokens === 1
            ? Promise.resolve("token")
            : new Promise<string>(() => undefined);
        },
      }),
      createMockOperationIndex(),
      timer,
    );
    await channel.init();

    const outcome = await Promise.race([
      timer.tick().then(
        () => "settled",
        () => "settled",
      ),
      new Promise((resolve) => setTimeout(() => resolve("hung"), 1000)),
    ]);

    expect(outcome).toBe("settled");
    expect(channel.getConnectionState().lastFailureUtcMs).toBeGreaterThan(0);
    await channel.shutdown();
  });
});

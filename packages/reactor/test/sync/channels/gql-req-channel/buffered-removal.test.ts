import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GqlRequestChannel } from "../../../../src/sync/channels/gql-req-channel.js";
import {
  ManualPollTimer,
  createMockCursorStorage,
  createMockLogger,
  createMockOperationIndex,
  createMockSyncOperation,
  createTestConfig,
  successFetch,
} from "./test-helpers.js";

const pushes = (fetch: ReturnType<typeof successFetch>) =>
  fetch.mock.calls.filter(([, init]) =>
    String((init as RequestInit).body).includes("pushSyncEnvelopes"),
  );

describe("GqlRequestChannel buffered outbox", () => {
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

  it("does not push an entry removed before the buffer flushed", async () => {
    const fetch = successFetch();
    global.fetch = fetch as unknown as typeof global.fetch;
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

    const removed = createMockSyncOperation("op-1", "remote-1", 1, "gone");
    const kept = createMockSyncOperation("op-2", "remote-1", 2, "kept");
    channel.outbox.add(removed, kept);
    channel.outbox.remove(removed);
    await vi.advanceTimersByTimeAsync(1_000);

    const bodies = pushes(fetch).map(([, init]) =>
      String((init as RequestInit).body),
    );
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toContain('"kept"');
    expect(bodies[0]).not.toContain('"gone"');

    await channel.shutdown();
  });
});

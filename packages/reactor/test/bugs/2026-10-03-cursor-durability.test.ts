import { describe, expect, it, vi } from "vitest";
import { GqlRequestChannel } from "../../src/sync/channels/gql-req-channel.js";
import type { RemoteCursor } from "../../src/sync/types.js";
import {
  ManualPollTimer,
  createMockLogger,
  createMockOperationIndex,
  createMockSyncOperation,
  createTestConfig,
  successFetch,
} from "../sync/channels/gql-req-channel/test-helpers.js";

function cursorStorage() {
  return {
    list: vi.fn(() => Promise.resolve([] as RemoteCursor[])),
    get: vi.fn(() => Promise.resolve(undefined)),
    upsert: vi.fn((_cursor: RemoteCursor) => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve(undefined)),
  };
}

function makeChannel(storage: unknown) {
  return new GqlRequestChannel(
    createMockLogger(),
    "channel-1",
    "remote-1",
    storage as never,
    createTestConfig(),
    createMockOperationIndex(),
    new ManualPollTimer(),
  );
}

describe("inbox cursor persistence", () => {
  it("retries an inbox cursor write that failed", async () => {
    global.fetch = successFetch() as unknown as typeof global.fetch;
    const storage = cursorStorage();
    let fail = true;
    storage.upsert = vi.fn((cursor: RemoteCursor) =>
      fail && cursor.cursorType === "inbox"
        ? Promise.reject(new Error("storage unavailable"))
        : Promise.resolve(),
    );
    const channel = makeChannel(storage);
    await channel.init();

    const first = createMockSyncOperation("op-a", "remote-1", 100);
    channel.inbox.add(first);
    first.transported();
    first.executed();
    channel.inbox.remove(first);
    await new Promise((resolve) => setTimeout(resolve, 10));

    fail = false;
    const second = createMockSyncOperation("op-b", "remote-1", 100);
    channel.inbox.add(second);
    second.transported();
    second.executed();
    channel.inbox.remove(second);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const inboxCalls = storage.upsert.mock.calls.filter(
      ([cursor]) => cursor.cursorType === "inbox",
    );
    expect(inboxCalls.length).toBeGreaterThanOrEqual(2);
    await channel.shutdown();
  });
});

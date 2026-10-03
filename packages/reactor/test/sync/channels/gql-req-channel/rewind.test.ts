/**
 * `rewindInboxCursor` must take effect in place: the poll request is built from
 * the in-memory inbox watermark, so lowering only the stored cursor did nothing
 * until a restart (see
 * docs/bugs/2026-10-03-pglite-aborted-transaction-bricks-worker-reactor.md,
 * addendum 2, defect e). This proves it resets the in-memory watermark, persists
 * the lowered cursor, and triggers a pull.
 */
import { describe, expect, it, vi } from "vitest";
import type { ISyncCursorStorage } from "../../../../src/storage/interfaces.js";
import type { RemoteCursor } from "../../../../src/sync/types.js";
import { GqlRequestChannel } from "../../../../src/sync/channels/gql-req-channel.js";
import {
  ManualPollTimer,
  createMockLogger,
  createMockOperationIndex,
  createTestConfig,
  successFetch,
} from "./test-helpers.js";

function cursorStorageAt(inbox: number, outbox: number) {
  const upserts: RemoteCursor[] = [];
  const storage: ISyncCursorStorage = {
    list: vi.fn().mockResolvedValue([
      {
        remoteName: "remote-1",
        cursorType: "inbox",
        cursorOrdinal: inbox,
        lastSyncedAtUtcMs: 1,
      },
      {
        remoteName: "remote-1",
        cursorType: "outbox",
        cursorOrdinal: outbox,
        lastSyncedAtUtcMs: 1,
      },
    ]),
    get: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn((cursor: RemoteCursor) => {
      upserts.push(cursor);
      return Promise.resolve();
    }),
  } as unknown as ISyncCursorStorage;
  return { storage, upserts };
}

describe("GqlRequestChannel.rewindInboxCursor", () => {
  it("resets the in-memory inbox watermark, persists it, and re-pulls", async () => {
    global.fetch = successFetch() as unknown as typeof global.fetch;
    const { storage, upserts } = cursorStorageAt(9770, 42);
    const timer = new ManualPollTimer();
    const triggerSpy = vi.spyOn(timer, "triggerNow");

    const channel = new GqlRequestChannel(
      createMockLogger(),
      "channel-1",
      "remote-1",
      storage,
      createTestConfig(),
      createMockOperationIndex(),
      timer,
    );
    await channel.init();
    expect(channel.inbox.ackOrdinal).toBe(9770);

    await channel.rewindInboxCursor(100);

    expect(channel.inbox.ackOrdinal).toBe(100);
    expect(channel.inbox.latestOrdinal).toBe(100);
    const inboxWrites = upserts.filter((c) => c.cursorType === "inbox");
    expect(inboxWrites.at(-1)?.cursorOrdinal).toBe(100);
    expect(triggerSpy).toHaveBeenCalled();

    await channel.shutdown();
  });

  it("refuses to rewind a shut-down channel", async () => {
    global.fetch = successFetch() as unknown as typeof global.fetch;
    const { storage } = cursorStorageAt(10, 0);
    const channel = new GqlRequestChannel(
      createMockLogger(),
      "channel-1",
      "remote-1",
      storage,
      createTestConfig(),
      createMockOperationIndex(),
      new ManualPollTimer(),
    );
    await channel.init();
    await channel.shutdown();

    await expect(channel.rewindInboxCursor(0)).rejects.toThrow("shut down");
  });
});

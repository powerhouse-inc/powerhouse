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
  createMockSyncOperation,
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

  it("serialises the lowered write so a concurrent poll-persist cannot overwrite it", async () => {
    global.fetch = successFetch() as unknown as typeof global.fetch;
    const { storage } = cursorStorageAt(9770, 0);

    const writes: RemoteCursor[] = [];
    let active = 0;
    let maxActive = 0;
    const releases: Array<() => void> = [];
    storage.upsert = vi.fn((cursor: RemoteCursor) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      writes.push(cursor);
      return new Promise<void>((resolve) => {
        releases.push(() => {
          active -= 1;
          resolve();
        });
      });
    });

    const timer = new ManualPollTimer();
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
    // Silence the post-rewind pull so it cannot add cursor writes of its own.
    timer.stop();

    // Start the rewind but do not await it: its lowered persist is now in flight.
    const rewindPromise = channel.rewindInboxCursor(100);

    // An in-flight poll finishes mid-rewind: an applied op advances the ack and
    // fires the inbox onRemoved -> persistCursor for a HIGHER ordinal. The old
    // bare upsert ran this concurrently and let it win; the serialised writer
    // must suppress it while the rewind's own write is the one that lands.
    const applied = createMockSyncOperation("op-late", "remote-1", 200);
    channel.inbox.add(applied);
    applied.transported();
    applied.executed();
    channel.inbox.remove(applied);

    await Promise.resolve();
    await Promise.resolve();

    while (releases.length > 0) releases.shift()?.();
    await rewindPromise;
    while (releases.length > 0) releases.shift()?.();

    expect(maxActive).toBe(1);
    const inboxWrites = writes.filter((c) => c.cursorType === "inbox");
    expect(inboxWrites.at(-1)?.cursorOrdinal).toBe(100);

    await channel.shutdown();
  });

  it("surfaces a storage failure while keeping the writer chain alive", async () => {
    global.fetch = successFetch() as unknown as typeof global.fetch;
    const { storage } = cursorStorageAt(9770, 0);
    storage.upsert = vi
      .fn()
      .mockRejectedValueOnce(new Error("storage down"))
      .mockResolvedValue(undefined);

    const timer = new ManualPollTimer();
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
    timer.stop();

    await expect(channel.rewindInboxCursor(100)).rejects.toThrow(
      "storage down",
    );

    // The chain survived: a second rewind still runs its write.
    await channel.rewindInboxCursor(50);
    expect(channel.inbox.ackOrdinal).toBe(50);

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

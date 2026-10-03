/**
 * Cursor writes for one (remote, cursorType) row are serialised.
 *
 * Tracking only an in-flight ordinal was not enough: a removal arriving while
 * `upsert(5)` was outstanding compared 7 against `max(persisted, inFlight) = 5`
 * and fired `upsert(7)` concurrently. Two writers on one row is
 * last-writer-wins, and nothing in `ISyncCursorStorage` promises FIFO, so 5
 * could land after 7 - leaving the stored cursor behind the in-memory watermark,
 * which on restart resends operations the remote has already acknowledged.
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

type Write = { ordinal: number; settled: boolean };

/** Cursor storage whose writes are released by hand, recording overlap. */
function gatedCursorStorage() {
  const writes: Write[] = [];
  const releases: Array<() => void> = [];
  const storage: ISyncCursorStorage = {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn((cursor: RemoteCursor) => {
      const write: Write = { ordinal: cursor.cursorOrdinal, settled: false };
      writes.push(write);
      return new Promise<void>((resolve) => {
        releases.push(() => {
          write.settled = true;
          resolve();
        });
      });
    }),
  } as unknown as ISyncCursorStorage;

  return {
    storage,
    writes,
    /** Writes started but not yet settled. */
    outstanding: () => writes.filter((w) => !w.settled).length,
    releaseAll: () => {
      for (const release of releases.splice(0)) release();
    },
    releaseFirst: () => releases.splice(0, 1)[0]?.(),
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

function channelOver(storage: ISyncCursorStorage) {
  global.fetch = successFetch() as unknown as typeof global.fetch;
  return new GqlRequestChannel(
    createMockLogger(),
    "channel-1",
    "remote-1",
    storage,
    createTestConfig(),
    createMockOperationIndex(),
    new ManualPollTimer(),
  );
}

/** Acknowledges and removes one inbox entry at `ordinal`. */
function ackInbox(channel: GqlRequestChannel, ordinal: number): void {
  const syncOp = createMockSyncOperation(`op-${ordinal}`, "remote-1", ordinal);
  channel.inbox.add(syncOp);
  syncOp.transported();
  syncOp.executed();
  channel.inbox.remove(syncOp);
}

describe("inbox cursor persistence", () => {
  it("never has two writes for the same cursor row outstanding", async () => {
    const gate = gatedCursorStorage();
    const channel = channelOver(gate.storage);
    await channel.init();

    ackInbox(channel, 5);
    await flush();
    expect(gate.writes.map((w) => w.ordinal)).toEqual([5]);
    expect(gate.outstanding()).toBe(1);

    // A second removal while the first write is still in flight: it must queue
    // behind it, not run beside it.
    ackInbox(channel, 7);
    await flush();
    expect(gate.writes.map((w) => w.ordinal)).toEqual([5]);
    expect(gate.outstanding()).toBe(1);

    gate.releaseFirst();
    await flush();
    expect(gate.writes.map((w) => w.ordinal)).toEqual([5, 7]);
    expect(gate.outstanding()).toBe(1);

    gate.releaseAll();
    await flush();
    expect(gate.writes.map((w) => w.ordinal)).toEqual([5, 7]);
    expect(gate.outstanding()).toBe(0);

    await channel.shutdown();
  });

  it("coalesces a burst of removals into one write at the highest ordinal", async () => {
    const gate = gatedCursorStorage();
    const channel = channelOver(gate.storage);
    await channel.init();

    ackInbox(channel, 3);
    ackInbox(channel, 6);
    ackInbox(channel, 9);
    await flush();
    gate.releaseAll();
    await flush();

    // One write, at the highest ordinal: the earlier ones are superseded
    // before any of them reaches storage.
    expect(gate.writes.map((w) => w.ordinal)).toEqual([9]);

    await channel.shutdown();
  });

  it("leaves the stored cursor at the highest ordinal after a burst", async () => {
    const stored: number[] = [];
    const storage: ISyncCursorStorage = {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      // Non-FIFO storage: the lower ordinal takes longer, so a concurrent
      // writer would leave the smaller value last.
      upsert: vi.fn(
        (cursor: RemoteCursor) =>
          new Promise<void>((resolve) => {
            setTimeout(
              () => {
                stored.push(cursor.cursorOrdinal);
                resolve();
              },
              Math.max(0, 40 - cursor.cursorOrdinal),
            );
          }),
      ),
    } as unknown as ISyncCursorStorage;

    const channel = channelOver(storage);
    await channel.init();

    for (const ordinal of [5, 7, 11, 12]) {
      ackInbox(channel, ordinal);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(stored.length).toBeGreaterThan(0);
    expect(stored.at(-1)).toBe(12);
    expect(Math.max(...stored)).toBe(12);
    // Strictly ascending: every write is ordered against the one before it.
    expect([...stored].sort((a, b) => a - b)).toEqual(stored);

    await channel.shutdown();
  });
});

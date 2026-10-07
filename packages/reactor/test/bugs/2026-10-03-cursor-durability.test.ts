/**
 * Repro harness for mechanism (B) of
 * docs/bugs/2026-10-03-pglite-aborted-transaction-bricks-worker-reactor.md
 * (addendum 2, item 1) and the analysis in
 * docs/bugs/2026-10-03-sync-defect-analysis.md.
 *
 * The live defect: after the poisoned transaction rolled back on restart, the
 * Accounts channel's `reactor.sync_cursors` inbox row stood at 16796 with a
 * fresh `last_synced_at` -- ahead of the data that had been erased. Polls
 * returned "caught up" forever, the drive froze at 340/230 against a server at
 * 375/267, and all channels stayed green.
 *
 * Everything below asserts the CORRECT behaviour, so every test fails against
 * current code. `describe.skip`ped so CI stays green until the fixes land as
 * their own reviewed work packages.
 */
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

/** A cursor storage that records every write, in order. */
function recordingCursorStorage(seed: RemoteCursor[] = []) {
  const rows = new Map<string, RemoteCursor>(
    seed.map((c) => [`${c.remoteName}:${c.cursorType}`, c]),
  );
  const writes: RemoteCursor[] = [];
  return {
    writes,
    rows,
    storage: {
      list: vi.fn((remoteName: string) =>
        Promise.resolve(
          [...rows.values()].filter((c) => c.remoteName === remoteName),
        ),
      ),
      get: vi.fn((remoteName: string, cursorType: string) =>
        Promise.resolve(rows.get(`${remoteName}:${cursorType}`)),
      ),
      upsert: vi.fn((cursor: RemoteCursor) => {
        writes.push({ ...cursor });
        rows.set(`${cursor.remoteName}:${cursor.cursorType}`, { ...cursor });
        return Promise.resolve();
      }),
      remove: vi.fn(() => Promise.resolve(undefined)),
    },
  };
}

function makeChannel(storage: unknown, timer = new ManualPollTimer()) {
  const channel = new GqlRequestChannel(
    createMockLogger(),
    "channel-1",
    "remote-1",
    storage as never,
    createTestConfig(),
    createMockOperationIndex(),
    timer,
  );
  return { channel, timer };
}

describe("mechanism B: inbox cursor persistence is not tied to op durability", () => {
  /**
   * The ordering that produced the permanent gap, in the code:
   *
   *  1. SimpleJobExecutor.executeJob runs the load inside
   *     KyselyExecutionScope.run's `db.transaction()`
   *     (src/executor/execution-scope.ts:94). Its COMMIT silently degraded to
   *     a ROLLBACK -- see mechanism A -- so the transaction resolved and the
   *     job was reported COMPLETED although nothing was written.
   *  2. SyncManager awaits that job (src/sync/sync-manager.ts:2255), calls
   *     `syncOp.executed()` (:2281) -- which advances the mailbox `_ack` --
   *     and then `remote.channel.inbox.remove(syncOp)` (:2300).
   *  3. `Mailbox.remove` synchronously fires the channel's `onRemoved` hook
   *     (src/sync/channels/gql-req-channel.ts:286-303), which reads
   *     `this.inbox.ackOrdinal` and calls `cursorStorage.upsert(...)` as a
   *     fire-and-forget promise with a `.catch(log)`.
   *
   * That upsert runs on its OWN autocommit statement, on a different Kysely
   * acquisition than the job's transaction. There is no handshake of any kind
   * between "the ops are durable" and "the cursor moved": the channel is never
   * told, and nothing re-reads the ops to confirm. So the cursor commits
   * unconditionally and the data may not exist.
   *
   * Correct behaviour: the cursor must not be persisted for operations that
   * are not durable. The fix may take either shape -- write the cursor inside
   * the job's own transaction, or gate the advance on a durability
   * confirmation -- but an undurable batch must leave the stored cursor alone.
   *
   * STAYS SKIPPED, deliberately: this is B-fix 1's sync-side gate, which
   * touches the hot ingestion path (the executor reporting durability, and
   * SyncManager withholding `syncOp.executed()` / `inbox.remove` until it
   * does) and needs load testing of its own. What closed the LIVE instance
   * instead is the dialect's commit guard: a transaction that committed
   * nothing can no longer resolve successfully, so a job the executor reports
   * COMPLETED did commit. See
   * test/storage/kysely/pglite-dialect.test.ts and the mechanism A repro's
   * "fails the transaction when its COMMIT silently degraded to a ROLLBACK".
   * The remaining hole is a cursor advance for a job that failed for some
   * other reason between the COMMIT and the removal.
   */
  it.skip("does not persist an inbox cursor for operations that never committed", async () => {
    global.fetch = successFetch() as unknown as typeof global.fetch;
    const { writes, storage } = recordingCursorStorage();
    const { channel } = makeChannel(storage);
    await channel.init();

    const syncOp = createMockSyncOperation("op-a", "remote-1", 16796);
    channel.inbox.add(syncOp);

    // What the sync manager does for a job the executor reported COMPLETED --
    // which, per mechanism A, it does even when the transaction rolled back.
    syncOp.transported();
    syncOp.executed();
    channel.inbox.remove(syncOp);
    await vi
      .waitFor(() => expect(storage.upsert).toHaveBeenCalled(), {
        timeout: 250,
      })
      .catch(() => undefined);

    const inboxWrites = writes.filter((w) => w.cursorType === "inbox");
    expect(inboxWrites).toEqual([]);
    await channel.shutdown();
  });

  /**
   * The fire-and-forget write makes the in-memory watermark unconditionally
   * optimistic. `lastPersistedInboxOrdinal` is assigned BEFORE the upsert is
   * awaited (gql-req-channel.ts:288-290) and is never rolled back when the
   * write rejects, so a lost cursor write is never retried -- the guard
   * `maxOrdinal > this.lastPersistedInboxOrdinal` will skip every later
   * removal at or below that ordinal.
   *
   * Correct behaviour: a rejected cursor write must leave the watermark where
   * it was, so the next advance retries it.
   */
  it("retries an inbox cursor write that failed", async () => {
    global.fetch = successFetch() as unknown as typeof global.fetch;
    const { storage } = recordingCursorStorage();
    let fail = true;
    storage.upsert = vi.fn((cursor: RemoteCursor) =>
      fail && cursor.cursorType === "inbox"
        ? Promise.reject(new Error("storage unavailable"))
        : Promise.resolve(),
    );
    const { channel } = makeChannel(storage);
    await channel.init();

    const first = createMockSyncOperation("op-a", "remote-1", 100);
    channel.inbox.add(first);
    first.transported();
    first.executed();
    channel.inbox.remove(first);
    await new Promise((resolve) => setTimeout(resolve, 10));

    fail = false;
    // A later removal at the SAME ordinal: the failed write must be retried.
    const second = createMockSyncOperation("op-b", "remote-1", 100);
    channel.inbox.add(second);
    second.transported();
    second.executed();
    channel.inbox.remove(second);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const inboxCalls = storage.upsert.mock.calls.filter(
      ([cursor]) => (cursor as RemoteCursor).cursorType === "inbox",
    );
    expect(inboxCalls.length).toBeGreaterThanOrEqual(2);
    await channel.shutdown();
  });

  /**
   * Addendum 2, item 3: "No live cursor-rewind lever." Setting
   * `cursor_ordinal = 0` via SQL did nothing.
   *
   * `init()` is the only reader of cursor storage
   * (gql-req-channel.ts:462-482): it loads the rows once, seeds
   * `inbox.init(inboxOrdinal)` and `lastPersistedInboxOrdinal`, and from then
   * on the channel polls from the in-memory `this.inbox.ackOrdinal`
   * (gql-req-channel.ts:508-512, sent as the `outboxAck` variable -- "outbox"
   * is the remote's view of our inbox). Nothing re-reads storage, and
   * `lastPersistedInboxOrdinal` guarantees a lowered row is overwritten by the
   * next advance rather than honoured. A rewind only takes effect on the next
   * worker restart.
   *
   * Correct behaviour: a cursor rewound in storage must be picked up at
   * runtime (whether by re-reading, or through an explicit rewind lever that
   * the inspector can call -- see defect (e) in the bug doc).
   *
   * STAYS SKIPPED, deliberately: this is B-fix 4, a new API surface
   * (`IChannel.rewindInboxCursor`) plus the inspector op that drives it, which
   * is the W0.5 repair-lever work rather than a defect fix. Nothing here
   * covers it yet; the operator playbook is still SQL rewind +
   * `adminClient.restart()`.
   */
  it.skip("honours a cursor rewound in storage without a restart", async () => {
    const { rows, storage } = recordingCursorStorage([
      {
        remoteName: "remote-1",
        cursorType: "inbox",
        cursorOrdinal: 9770,
        lastSyncedAtUtcMs: Date.now(),
      },
    ]);
    const polled: number[] = [];
    global.fetch = vi.fn((_url: string, options: RequestInit) => {
      const body = JSON.parse(options.body as string) as {
        query: string;
        variables?: { outboxAck?: number };
      };
      if (body.query.includes("touchChannel")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: { touchChannel: { success: true, ackOrdinal: 0 } },
            }),
        });
      }
      if (body.variables?.outboxAck !== undefined) {
        polled.push(body.variables.outboxAck);
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
    }) as unknown as typeof global.fetch;

    const { channel, timer } = makeChannel(storage);
    await channel.init();
    await timer.tick();
    expect(polled.at(-1)).toBe(9770);

    // The repair an operator actually has: rewind the row in SQL.
    rows.set("remote-1:inbox", {
      remoteName: "remote-1",
      cursorType: "inbox",
      cursorOrdinal: 0,
      lastSyncedAtUtcMs: Date.now(),
    });

    await timer.tick();
    expect(polled.at(-1)).toBe(0);
    await channel.shutdown();
  });
});

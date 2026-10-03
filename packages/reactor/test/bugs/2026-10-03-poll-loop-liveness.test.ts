/**
 * Repro for mechanism (C) of
 * docs/bugs/2026-10-03-pglite-aborted-transaction-bricks-worker-reactor.md
 * (addendum 2, item 4) and the analysis in
 * docs/bugs/2026-10-03-sync-defect-analysis.md.
 *
 * The live defect: after a restart the Accounts channel's
 * ConnectionStateSnapshot read `state: "connected", lastSuccessUtcMs: 0,
 * lastFailureUtcMs: 0` indefinitely. Not one poll had completed since boot, no
 * failure was recorded, nothing retried, and the channel reported green the
 * whole time.
 *
 * Everything below asserts the CORRECT behaviour, so every test fails against
 * current code. `describe.skip`ped so CI stays green until the fixes land as
 * their own reviewed work packages.
 */
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

describe("mechanism C: a dead poll loop reports itself as connected", () => {
  /**
   * The reporting defect, and the reason the live snapshot was unfalsifiable.
   *
   * `init()` (src/sync/channels/gql-req-channel.ts:462-482) ends with:
   *
   *     this.pollTimer.setDelegate(() => this.poll());
   *     this.pollTimer.start();
   *     this.transitionConnectionState("connected");   // :481
   *
   * So "connected" means no more than "a timer was started". `lastSuccessUtcMs`
   * stays undefined and `getConnectionState()` reports it as 0 (:331), which
   * is indistinguishable from "a success long ago at the epoch". The same
   * unearned "connected" is set by `recoverFromChannelNotFound` on a
   * successful touch (:749), again without a completed poll.
   *
   * Correct behaviour: a channel that has never completed a poll must not
   * report `connected`.
   *
   * NOTE: this intentionally contradicts the currently-codified expectation in
   * test/sync/channels/gql-req-channel/connection-state.test.ts ("transitions
   * to connected after init"). That test encodes the defect; whichever fix
   * lands must update it.
   */
  it("does not report connected before a poll has ever completed", async () => {
    global.fetch = successFetch() as unknown as typeof global.fetch;
    const channel = makeChannel();
    await channel.init();

    const snapshot = channel.getConnectionState();
    expect(snapshot.lastSuccessUtcMs).toBe(0);
    expect(snapshot.state).not.toBe("connected");
    await channel.shutdown();
  });

  /**
   * The silence. `poll()` only routes errors through `handlePollError` for the
   * `pollSyncEnvelopes` call itself (gql-req-channel.ts:518-525). Anything
   * thrown AFTER the fetch -- `consolidateSyncOperations`, `inbox.add` (which
   * rethrows listener failures as a `MailboxAggregateError`, see
   * src/sync/mailbox.ts:155-161), `handleRemoteDeadLetters` -- escapes `poll()`
   * unclassified. `failureCount` is not incremented, `lastFailureUtcMs` is not
   * set, no state transition happens.
   *
   * IntervalPollTimer.tick catches it (interval-poll-timer.ts:99-102) and
   * retries with exponential backoff capped at `retryMaxDelayMs` -- 300_000 by
   * default -- so after ~9 consecutive failures the channel retries once every
   * five minutes while reporting `connected`, `failureCount: 0`,
   * `lastFailureUtcMs: 0`. That is exactly the live snapshot.
   *
   * Correct behaviour: every poll failure must be recorded, whatever stage of
   * poll() raised it.
   */
  it("records a failure when poll() throws after the fetch", async () => {
    // A poll whose response carries a dead letter, so poll() reaches
    // handleRemoteDeadLetters -> deadLetter.add -> listener callbacks.
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

    // A mailbox listener that throws stands in for any post-fetch failure --
    // the sync manager registers real ones (sync-manager.ts:1433-1437), and
    // Mailbox.add rethrows them as a MailboxAggregateError.
    channel.deadLetter.onAdded(() => {
      throw new Error("downstream ingestion blew up");
    });

    await timer.tick().catch(() => undefined);

    const snapshot = channel.getConnectionState();
    expect(snapshot.failureCount).toBeGreaterThan(0);
    expect(snapshot.lastFailureUtcMs).toBeGreaterThan(0);
    await channel.shutdown();
  });

  /**
   * The loop death. `executeGraphQL` passes `signal: this.abortController.signal`
   * (gql-req-channel.ts:1413), and that controller is aborted only by
   * `shutdown()` (:316). There is no request timeout anywhere -- no
   * `AbortSignal.timeout`, no race, and no bound on `await response.json()`
   * either.
   *
   * IntervalPollTimer schedules the next tick only from the delegate's
   * `.then`/`.catch` (interval-poll-timer.ts:94-102). A delegate that never
   * settles therefore leaves `this.timer` undefined with nothing pending: the
   * loop is dead forever, silently, with no failure recorded. A cursor-0
   * re-pull asking the server for ~16k envelopes in one response is a very
   * plausible way to get there.
   *
   * Correct behaviour: a hung request must time out and be recorded as a
   * failure, and the loop must keep ticking.
   */
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

  /**
   * The silent early return inside poll(): when the peer's manifest revision
   * has moved, poll() refreshes it first and bails if the refresh failed --
   * `if (!(await this.refreshManifestsIfStale(...))) return;`
   * (gql-req-channel.ts:548-555). `refreshManifestsIfStale` logs and returns
   * false (:570-578).
   *
   * That `return` reaches neither `lastSuccessUtcMs`/`failureCount = 0` at the
   * end of poll() nor `handlePollError`, so the delegate RESOLVES: the timer
   * treats it as a success, resets `consecutiveFailures`, and schedules at the
   * normal interval. A peer whose manifest cannot be refreshed therefore polls
   * forever, ingests nothing, and reports
   * `connected`/`lastSuccess: 0`/`lastFailure: 0` -- the live snapshot exactly,
   * with a loop that is alive rather than dead.
   *
   * Correct behaviour: a poll that bailed without ingesting must be visible in
   * the snapshot, one way or the other.
   */
  it("distinguishes a bailed poll from a successful one", async () => {
    let touches = 0;
    const fetchFn = createMockFetch((body) => {
      if (body.query.includes("touchChannel")) {
        touches++;
        // The first touch is init()'s; every later one is the manifest
        // refresh, and it fails.
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
    // Either a recorded failure or a non-connected state; today: neither.
    expect(
      snapshot.lastFailureUtcMs > 0 || snapshot.state !== "connected",
    ).toBe(true);
    await channel.shutdown();
  });

  /**
   * IntervalPollTimer's own liveness holes, independent of the channel.
   *
   * (a) A delegate that never settles leaves nothing scheduled: no timer, no
   *     recheck, no supervisor. The loop cannot be revived except by
   *     `triggerNow()` from outside.
   * (b) `queue.totalSize()` is awaited with no timeout either
   *     (interval-poll-timer.ts:87-88). A queue whose size probe hangs -- which
   *     is what mechanism A's poisoned session does to anything that reads the
   *     DB -- kills the loop the same way.
   *
   * Correct behaviour: the loop must be supervised and must always have a next
   * tick pending.
   */
  it("keeps ticking when the delegate never settles", async () => {
    vi.useFakeTimers();
    try {
      let starts = 0;
      const timer = new IntervalPollTimer(
        fakeQueue(() => Promise.resolve(0)),
        { intervalMs: 500, retryBaseDelayMs: 500, retryMaxDelayMs: 2000 },
      );
      timer.setDelegate(() => {
        starts++;
        return new Promise(() => undefined);
      });
      timer.start();

      await vi.advanceTimersByTimeAsync(60_000);
      expect(starts).toBeGreaterThan(1);
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

/**
 * What a timer invokes on each tick.
 *
 * The signal is the timer's cancellation handle on the tick: a timer that
 * bounds a tick aborts it when the bound passes, and the delegate is expected
 * to settle promptly after that and to stop mutating shared state the moment it
 * is aborted. A timer that cannot cancel a tick passes `undefined`.
 *
 * Honouring the signal is what keeps the loop alive: a bounded timer schedules
 * the next tick from this one's settlement, and will not start a second
 * delegate alongside a delegate that is still running - two concurrent polls on
 * one channel ingest the same page twice and interleave cursor writes.
 */
export type PollDelegate = (signal: AbortSignal | undefined) => Promise<void>;

/**
 * Timer that controls when polling occurs.
 * GqlChannel registers a delegate; the timer invokes it when appropriate.
 * The delegate returns a Promise; timer waits for completion before scheduling next tick.
 */
export type IPollTimer = {
  /** Register the delegate to be called on each tick. Returns Promise that timer awaits. */
  setDelegate: (delegate: PollDelegate) => void;

  /** Start the timer (begins calling delegate periodically) */
  start: () => void;

  /** Stop the timer */
  stop: () => void;

  /**
   * Fires the delegate exactly once without changing the running/paused state.
   * Used by Manual polling mode to pull on demand without resuming the schedule.
   */
  triggerNow: () => void;
};

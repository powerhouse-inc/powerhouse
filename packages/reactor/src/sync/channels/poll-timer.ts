/**
 * Invoked on each tick. Once `signal` aborts, the delegate must settle promptly
 * and stop mutating shared state; the next tick waits for it.
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

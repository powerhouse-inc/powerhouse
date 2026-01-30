/**
 * Timer that controls when polling occurs.
 * GqlChannel registers a delegate; the timer invokes it when appropriate.
 * The delegate returns a Promise; timer waits for completion before scheduling next tick.
 */
export type IPollTimer = {
  /** Register the delegate to be called on each tick. Returns Promise that timer awaits. */
  setDelegate: (delegate: () => Promise<void>) => void;

  /** Start the timer (begins calling delegate periodically) */
  start: () => void;

  /** Stop the timer */
  stop: () => void;
};

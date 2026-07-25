/**
 * Ordered result of one batch item. `index` always mirrors the input
 * position, so callers can correlate results with inputs regardless of
 * completion order, and successes are retained when siblings fail.
 */
export type BatchItemResult<R> =
  | { index: number; status: "fulfilled"; value: R }
  | { index: number; status: "rejected"; error: unknown };

export type RunWithConcurrencyOptions = {
  /** Maximum simultaneously running workers. Must be a positive integer. */
  concurrency: number;
  /**
   * Whole-batch cancellation: unstarted items are rejected with the signal's
   * reason without ever starting, while already-started items keep running —
   * per-item signals are the mechanism for interrupting active work.
   */
  signal?: AbortSignal;
};

/**
 * Runs `worker` over `items` with a hard upper bound on simultaneous
 * executions. Bounding starts (not just transfers) is what keeps memory flat:
 * an item's preprocessing (hashing/buffering) only begins when a slot frees.
 */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  options: RunWithConcurrencyOptions,
): Promise<BatchItemResult<R>[]> {
  const { concurrency, signal } = options;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(
      `concurrency must be a positive integer, got: ${concurrency}`,
    );
  }

  const results: BatchItemResult<R>[] = new Array<BatchItemResult<R>>(
    items.length,
  );
  let nextIndex = 0;

  async function runLane(): Promise<void> {
    for (;;) {
      const index = nextIndex++;
      if (index >= items.length) return;
      if (signal?.aborted) {
        results[index] = {
          index,
          status: "rejected",
          error: signalReason(signal),
        };
        continue;
      }
      try {
        const value = await worker(items[index], index);
        results[index] = { index, status: "fulfilled", value };
      } catch (error) {
        results[index] = { index, status: "rejected", error };
      }
    }
  }

  const lanes = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runLane(),
  );
  await Promise.all(lanes);
  return results;
}

function signalReason(signal: AbortSignal): unknown {
  return (
    (signal as { reason?: unknown }).reason ??
    new DOMException("The operation was aborted", "AbortError")
  );
}

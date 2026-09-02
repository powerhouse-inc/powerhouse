import type { Options } from "tinybench";
import { bench as vitestBench } from "vitest";

/**
 * `bench`, but a throw is never silent.
 *
 * tinybench parks a throw raised during the warmup phase on `result.error`
 * and, with `throws` falsy, dispatches no event. vitest's runner listens only
 * for `complete` and `error`, so neither fires and it marks the suite passed
 * anyway: the case keeps its default `{rank: 0, rme: 0, samples: []}`, the
 * console prints "NaNx faster than", and the process exits 0.
 *
 * That is not hypothetical. It hid fifteen dead cases in the write-cache bench
 * and one in queue-only, for long enough that nobody knows how long. Only a
 * record schema requiring a positive hz ever noticed.
 *
 * vitest stores the options object verbatim and merges nothing from config, so
 * there is no global switch for this. Importing `bench` from here instead of
 * from vitest is the whole mechanism, and it means a case added later cannot
 * forget it.
 */
export function bench(
  name: string,
  fn: () => void | Promise<void>,
  options: Options = {},
): void {
  vitestBench(name, fn, { ...options, throws: true });
}

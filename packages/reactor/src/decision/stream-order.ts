import type { Operation } from "@powerhousedao/shared/document-model";
import {
  garbageCollect,
  sortOperations,
} from "@powerhousedao/shared/document-model";

/** Where a stream's stored order contradicts its timestamps. */
export type OutOfOrderPair = {
  previous: Operation;
  current: Operation;
  /**
   * `descending` cannot be walked at all. `tied` walks fine — the intra-stream
   * rule breaks the tie by index — but violates the monotonic auth rule, so a
   * stream holding one can never be replicated to a peer that lacks it.
   */
  kind: "descending" | "tied";
};

/**
 * The first pair of effective operations whose stored order contradicts their
 * timestamps, or undefined when the stream is in position order.
 *
 * Such a stream cannot be walked, and the auth stream is never reshuffled once
 * the monotonic rule is on, so run this before enabling enforcement on a fleet.
 *
 * `requireStrict` additionally rejects a tie, which is what the auth stream's
 * monotonic rule requires and what the walk alone does not care about.
 */
export function firstOutOfOrderPair(
  operations: Operation[],
  options?: { requireStrict?: boolean },
): OutOfOrderPair | undefined {
  const requireStrict = options?.requireStrict ?? false;
  const effective = garbageCollect(sortOperations([...operations]));

  for (let i = 1; i < effective.length; i++) {
    const previous = effective[i - 1];
    const current = effective[i];

    // Parsed rather than compared through comparePositions: one stream makes the
    // cross-stream rules inert, and a tie has to be visible here rather than
    // resolved by index.
    const previousAt = Date.parse(previous.timestampUtcMs);
    const currentAt = Date.parse(current.timestampUtcMs);

    if (currentAt < previousAt) {
      return { previous, current, kind: "descending" };
    }
    if (requireStrict && currentAt === previousAt) {
      return { previous, current, kind: "tied" };
    }
  }

  return undefined;
}

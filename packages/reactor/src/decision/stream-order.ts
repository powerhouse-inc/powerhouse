import type { Operation } from "@powerhousedao/shared/document-model";
import {
  garbageCollect,
  sortOperations,
} from "@powerhousedao/shared/document-model";
import { comparePositions } from "./merged-order.js";

export type OutOfOrderPair = {
  previous: Operation;
  current: Operation;
};

/**
 * The first pair of effective operations whose stored order contradicts their
 * timestamps, or undefined when the stream is in position order.
 *
 * Such a stream cannot be walked, and the auth stream is never reshuffled once
 * the monotonic rule is on, so run this before enabling enforcement on a fleet.
 */
export function firstOutOfOrderPair(
  operations: Operation[],
): OutOfOrderPair | undefined {
  const effective = garbageCollect(sortOperations([...operations]));

  for (let i = 1; i < effective.length; i++) {
    const previous = effective[i - 1];
    const current = effective[i];
    // One stream, so the scope is inert.
    if (
      comparePositions(
        { streamKey: "stream", scope: "stream", operation: previous },
        { streamKey: "stream", scope: "stream", operation: current },
      ) > 0
    ) {
      return { previous, current };
    }
  }

  return undefined;
}

import type { Operation } from "@powerhousedao/shared/document-model";
import type { StreamQuery } from "./types.js";

/** Identifies a stream within a walk. */
export function streamKey(query: StreamQuery): string {
  return `${query.documentId}:${query.scope}:${query.branch}`;
}

/** An operation together with the stream it belongs to. */
export type PositionedOperation = {
  streamKey: string;
  operation: Operation;
};

/**
 * One stream's operations, in the order the store returned them. That order is
 * kept for applying, because the reducers and the skip bookkeeping require it.
 */
export type StreamOperations = {
  streamKey: string;
  operations: Operation[];
};

/**
 * Orders two operations from different streams by position. Timestamp decides;
 * an equal timestamp falls to the action id and then the operation id, so that
 * two replicas holding the same operations agree on the order whatever order
 * they happen to store them in.
 */
export function comparePositions(
  a: PositionedOperation,
  b: PositionedOperation,
): number {
  const aTime = Date.parse(a.operation.timestampUtcMs);
  const bTime = Date.parse(b.operation.timestampUtcMs);

  if (aTime !== bTime) {
    return aTime - bTime;
  }

  // Within one stream the stored order decides, so a tie keeps it. The action
  // and operation ids only break ties between separate streams.
  if (a.streamKey === b.streamKey) {
    return a.operation.index - b.operation.index;
  }

  const actionIds = (a.operation.action.id ?? "").localeCompare(
    b.operation.action.id ?? "",
  );
  if (actionIds !== 0) {
    return actionIds;
  }

  return (a.operation.id ?? "").localeCompare(b.operation.id ?? "");
}

/**
 * Merges the read-set streams into one sequence by position. Each stream keeps
 * its stored order; only how far to go is decided by the timestamp, so a stream
 * whose stored order disagrees with its timestamp order still applies in the
 * order it is stored.
 *
 * An operation's position in the result is the bound a decision at that
 * operation reads to: every operation before it has been applied, and it has
 * not.
 */
export function mergeByPosition(
  streams: StreamOperations[],
): PositionedOperation[] {
  const merged: PositionedOperation[] = [];

  for (const stream of streams) {
    for (const operation of stream.operations) {
      merged.push({ streamKey: stream.streamKey, operation });
    }
  }

  return merged.sort(comparePositions);
}

/**
 * For auth-related reshuffles, we may need to retract previous operations.
 * This function calculates the needed skip value.
 */
export function retractionSkip(
  nextIndex: number,
  firstRetractedIndex: number,
): number {
  return nextIndex - firstRetractedIndex;
}

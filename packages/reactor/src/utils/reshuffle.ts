type OperationIndex = {
  index: number;
  skip: number;
  id: string;
  timestampUtcMs: string;
  action?: {
    id?: string;
    type?: string;
  };
};

const STRICT_ORDER_ACTION_TYPES = new Set([
  "CREATE_DOCUMENT",
  "DELETE_DOCUMENT",
  "UPGRADE_DOCUMENT",
  "ADD_RELATIONSHIP",
  "REMOVE_RELATIONSHIP",
]);

/**
 * Sorts operations by index and skip number.
 * [0:0 2:0 1:0 3:3 3:1] => [0:0 1:0 2:0 3:1 3:3]
 */
export function sortOperations<TOpIndex extends OperationIndex>(
  operations: TOpIndex[],
): TOpIndex[] {
  return operations
    .slice()
    .sort((a, b) => a.skip - b.skip)
    .sort((a, b) => a.index - b.index);
}

/**
 * Reshuffles operations by timestamp, then applies deterministic tie-breaking.
 * Used for merging concurrent operations from different branches.
 *
 * For strict document-structure actions (e.g., CREATE_DOCUMENT/UPGRADE_DOCUMENT),
 * logical index (index - skip) is prioritized to preserve causal replay order.
 *
 * For other actions, action ID is prioritized to ensure a canonical cross-reactor order
 * for concurrent operations that may have diverged local indices due to prior reshuffles.
 * Logical index and operation ID are then used as deterministic tie-breakers.
 *
 * Example:
 * [0:0, 1:0, 2:0, A3:0, A4:0, A5:0] + [0:0, 1:0, 2:0, B3:0, B4:2, B5:0]
 * GC               => [0:0, 1:0, 2:0, A3:0, A4:0, A5:0] + [0:0, 1:0, B4:2, B5:0]
 * Split            => [0:0, 1:0] + [2:0, A3:0, A4:0, A5:0] + [B4:2, B5:0]
 * Reshuffle(6:4)   => [6:4, 7:0, 8:0, 9:0, 10:0, 11:0]
 * merge            => [0:0, 1:0, 6:4, 7:0, 8:0, 9:0, 10:0, 11:0]
 */
export function reshuffleByTimestamp<TOp extends OperationIndex>(
  startIndex: { index: number; skip: number },
  opsA: TOp[],
  opsB: TOp[],
): TOp[] {
  return [...opsA, ...opsB]
    .sort((a, b) => {
      const timestampDiff =
        new Date(a.timestampUtcMs).getTime() -
        new Date(b.timestampUtcMs).getTime();
      if (timestampDiff !== 0) {
        return timestampDiff;
      }

      const shouldPrioritizeLogicalIndex =
        STRICT_ORDER_ACTION_TYPES.has(a.action?.type ?? "") ||
        STRICT_ORDER_ACTION_TYPES.has(b.action?.type ?? "");
      const logicalIndexDiff = a.index - a.skip - (b.index - b.skip);

      if (shouldPrioritizeLogicalIndex) {
        if (logicalIndexDiff !== 0) {
          return logicalIndexDiff;
        }
      }

      const actionIdDiff = (a.action?.id ?? "").localeCompare(
        b.action?.id ?? "",
      );
      if (actionIdDiff !== 0) {
        return actionIdDiff;
      }

      if (!shouldPrioritizeLogicalIndex && logicalIndexDiff !== 0) {
        return logicalIndexDiff;
      }

      return a.id.localeCompare(b.id);
    })
    .map((op, i) => ({
      ...op,
      index: startIndex.index + i,
      skip: i === 0 ? startIndex.skip : 0,
    }));
}

/**
 * Reshuffles operations by timestamp first, then by original index value.
 * Used for merging concurrent operations while preserving index ordering for operations with same timestamp.
 */
export function reshuffleByTimestampAndIndex<TOp extends OperationIndex>(
  startIndex: { index: number; skip: number },
  opsA: TOp[],
  opsB: TOp[],
): TOp[] {
  return [...opsA, ...opsB]
    .sort((a, b) => {
      const indexDiff = a.index - b.index;
      if (indexDiff !== 0) {
        return indexDiff;
      }
      const timestampDiff =
        new Date(a.timestampUtcMs).getTime() -
        new Date(b.timestampUtcMs).getTime();
      if (timestampDiff !== 0) {
        return timestampDiff;
      }
      return a.id.localeCompare(b.id);
    })
    .map((op, i) => ({
      ...op,
      index: startIndex.index + i,
      skip: i === 0 ? startIndex.skip : 0,
    }));
}

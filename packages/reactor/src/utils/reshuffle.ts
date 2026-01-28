type OperationIndex = {
  index: number;
  skip: number;
  id: string;
  timestampUtcMs: string;
};

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
 * Reshuffles operations by timestamp, then original index, then ID.
 * Used for merging concurrent operations from different branches.
 *
 * When timestamps are equal, operations are sorted by their original index to preserve
 * ordering of operations created together (e.g., CREATE_DOCUMENT at index 0 must come
 * before UPGRADE_DOCUMENT at index 1). ID is used as a final tiebreaker for determinism.
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
      const indexDiff = a.index - b.index;
      if (indexDiff !== 0) {
        return indexDiff;
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

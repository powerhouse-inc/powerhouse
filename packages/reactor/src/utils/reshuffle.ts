type OperationIndex = {
  index: number;
  skip: number;
  id?: string;
  timestampUtcMs?: string;
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
 * Reshuffles operations by timestamp only, ignoring their original index values.
 * Used for merging concurrent operations from different branches.
 *
 * Example:
 * [0:0, 1:0, 2:0, A3:0, A4:0, A5:0] + [0:0, 1:0, 2:0, B3:0, B4:2, B5:0]
 * GC               => [0:0, 1:0, 2:0, A3:0, A4:0, A5:0] + [0:0, 1:0, B4:2, B5:0]
 * Split            => [0:0, 1:0] + [2:0, A3:0, A4:0, A5:0] + [B4:2, B5:0]
 * Reshuffle(6:4)   => [6:4, 7:0, 8:0, 9:0, 10:0, 11:0]
 * merge            => [0:0, 1:0, 6:4, 7:0, 8:0, 9:0, 10:0, 11:0]
 */
export function reshuffleByTimestamp<TOp extends OperationIndex>(
  startIndex: OperationIndex,
  opsA: TOp[],
  opsB: TOp[],
): TOp[] {
  return [...opsA, ...opsB]
    .sort(
      (a, b) =>
        new Date(a.timestampUtcMs || "").getTime() -
        new Date(b.timestampUtcMs || "").getTime(),
    )
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
  startIndex: OperationIndex,
  opsA: TOp[],
  opsB: TOp[],
): TOp[] {
  return [...opsA, ...opsB]
    .sort(
      (a, b) =>
        new Date(a.timestampUtcMs || "").getTime() -
        new Date(b.timestampUtcMs || "").getTime(),
    )
    .sort((a, b) => a.index - b.index)
    .map((op, i) => ({
      ...op,
      index: startIndex.index + i,
      skip: i === 0 ? startIndex.skip : 0,
    }));
}

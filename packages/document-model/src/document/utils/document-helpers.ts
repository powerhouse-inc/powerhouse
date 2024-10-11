import {
  Operation,
  OperationScope,
  Action,
  DocumentOperations,
} from "../types";
import stringify from "safe-stable-stringify";

export type OperationIndex = {
  index: number;
  skip: number;
};

export enum IntegrityIssueType {
  UNEXPECTED_INDEX = "UNEXPECTED_INDEX",
}

export enum IntegrityIssueSubType {
  DUPLICATED_INDEX = "DUPLICATED_INDEX",
  MISSING_INDEX = "MISSING_INDEX",
}

type IntegrityIssue = {
  operation: OperationIndex;
  issue: IntegrityIssueType;
  category: IntegrityIssueSubType;
  message: string;
};

type Reshuffle = (
  startIndex: OperationIndex,
  opsA: Operation[],
  opsB: Operation[],
) => Operation[];

export function checkCleanedOperationsIntegrity(
  sortedOperations: Operation[],
): IntegrityIssue[] {
  const result: IntegrityIssue[] = [];

  // 1:1 1
  // 0:0 0 -> 1:0 1 -> 2:0 -> 3:0 -> 4:0 -> 5:0
  // 0:0 0 -> 2:1 1 -> 3:0 -> 4:0 -> 5:0
  // 0:0 0 -> 3:2 1 -> 4:0 -> 5:0
  // 0:0 0 -> 3:2 1 -> 5:1

  // 0:3 (expected 0, got -3)
  // 1:2 (expected 0, got -1)
  // 0:0 -> 1:1
  // 0:0 -> 2:2
  // 0:0 -> 3:2 -> 5:2

  let currentIndex = -1;
  for (const nextOperation of sortedOperations) {
    const nextIndex = nextOperation.index - nextOperation.skip;

    if (nextIndex !== currentIndex + 1) {
      result.push({
        operation: {
          index: nextOperation.index,
          skip: nextOperation.skip,
        },
        issue: IntegrityIssueType.UNEXPECTED_INDEX,
        category:
          nextIndex > currentIndex + 1
            ? IntegrityIssueSubType.MISSING_INDEX
            : IntegrityIssueSubType.DUPLICATED_INDEX,
        message: `Expected index ${currentIndex + 1} with skip 0 or equivalent, got index ${nextOperation.index} with skip ${nextOperation.skip}`,
      });
    }

    currentIndex = nextOperation.index;
  }

  return result;
}

// [] -> []
// [0:0] -> [0:0]

// 0:0 1:0 2:0 => 0:0 1:0 2:0, removals 0, no issues
// 0:0 1:1 2:0 => 1:1 2:0, removals 1, no issues

// 0:0 1:1 2:0 3:1 => 1:1 3:1, removals 2, no issues
// 0:0 1:1 2:0 3:3 => 3:3

// 1:1 2:0 3:0 => 1:1 2:0 3:0, removals 0, no issues
// 1:0 0:0 2:0 => 2:0, removals 2, issues [UNEXPECTED_INDEX, INDEX_OUT_OF_ORDER]
// 0:0 1:0 2:0 => 0:0 1:0 2:0, removals 0, no issues
// 0:0 1:0 2:0 => 0:0 1:0 2:0, removals 0, no issues
// 0:0 1:0 2:0 => 0:0 1:0 2:0, removals 0, no issues

export function garbageCollect<A extends OperationIndex>(
  sortedOperations: A[],
): A[] {
  const result: A[] = [];

  let i = sortedOperations.length - 1;

  while (i > -1) {
    result.unshift(sortedOperations[i]);
    const skipUntil =
      (sortedOperations[i]?.index || 0) - (sortedOperations[i]?.skip || 0) - 1;

    let j = i - 1;
    while (j > -1 && (sortedOperations[j]?.index || 0) > skipUntil) {
      j--;
    }

    i = j;
  }

  return result;
}

export function addUndo(sortedOperations: Operation[]): Operation[] {
  const operationsCopy = [...sortedOperations];
  const latestOperation = operationsCopy[operationsCopy.length - 1];

  if (!latestOperation) return operationsCopy;

  if (latestOperation.type === "NOOP") {
    operationsCopy.push({
      ...latestOperation,
      index: latestOperation.index,
      type: "NOOP",
      skip: nextSkipNumber(sortedOperations),
    });
  } else {
    operationsCopy.push({
      type: "NOOP",
      index: latestOperation.index + 1,
      timestamp: new Date().toISOString(),
      input: {},
      skip: 1,
      scope: latestOperation.scope,
      hash: latestOperation.hash,
    });
  }

  return operationsCopy;
}

// [0:0 2:0 1:0 3:3 3:1] => [0:0 1:0 2:0 3:1 3:3]
// Sort by index _and_ skip number
export function sortOperations<A extends OperationIndex>(operations: A[]): A[] {
  return operations
    .slice()
    .sort((a, b) => a.skip - b.skip)
    .sort((a, b) => a.index - b.index);
}

// [0:0, 1:0, 2:0, A3:0, A4:0, A5:0] + [0:0, 1:0, 2:0, B3:0, B4:2, B5:0]
// GC               => [0:0, 1:0, 2:0, A3:0, A4:0, A5:0] + [0:0, 1:0, B4:2, B5:0]
// Split            => [0:0, 1:0] + [2:0, A3:0, A4:0, A5:0] + [B4:2, B5:0]
// Reshuffle(6:4)   => [6:4, 7:0, 8:0, 9:0, 10:0, 11:0]
// merge            => [0:0, 1:0, 6:4, 7:0, 8:0, 9:0, 10:0, 11:0]
export const reshuffleByTimestamp: Reshuffle = (startIndex, opsA, opsB) => {
  return [...opsA, ...opsB]
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    )
    .map((op, i) => ({
      ...op,
      index: startIndex.index + i,
      skip: i === 0 ? startIndex.skip : 0,
    }));
};

export const reshuffleByTimestampAndIndex: Reshuffle = (
  startIndex,
  opsA,
  opsB,
) => {
  return [...opsA, ...opsB]
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    )
    .sort((a, b) => a.index - b.index)
    .map((op, i) => ({
      ...op,
      index: startIndex.index + i,
      skip: i === 0 ? startIndex.skip : 0,
    }));
};

// TODO: implement better operation equality function
export function operationsAreEqual(op1: Operation, op2: Operation) {
  return stringify(op1) === stringify(op2);
}

// [T0:0 T1:0 T2:0 T3:0] + [B4:0 B5:0] = [T0:0 T1:0 T2:0 T3:0 B4:0 B5:0]
// [T0:0 T1:0 T2:0 T3:0] + [B3:0 B4:0] = [T0:0 T1:0 T2:0 B3:0 B4:0]
// [T0:0 T1:0 T2:0 T3:0] + [B2:0 B3:0] = [T0:0 T1:0 B2:0 B3:0]

// [T0:0 T1:0 T2:0 T3:0] + [B4:0 B4:2] = [T0:0 T1:0 T2:0 T3:0 B4:0 B4:2]
// [T0:0 T1:0 T2:0 T3:0] + [B3:0 B3:2] = [T0:0 T1:0 T2:0 B3:0 B3:2]
// [T0:0 T1:0 T2:0 T3:0] + [B2:3 B3:0] = [T0:0 T1:0 B2:3 B3:0]

export function attachBranch(
  trunk: Operation[],
  newBranch: Operation[],
): [Operation[], Operation[]] {
  const trunkCopy = garbageCollect(sortOperations(trunk.slice()));
  const newOperations = garbageCollect(sortOperations(newBranch.slice()));
  if (trunkCopy.length < 1) {
    return [newOperations, []];
  }

  const result: Operation[] = [];
  let enteredBranch = false;

  while (newOperations.length > 0) {
    const newOperationCandidate = newOperations[0];

    let nextTrunkOperation = trunkCopy.shift();
    while (
      nextTrunkOperation &&
      precedes(nextTrunkOperation, newOperationCandidate)
    ) {
      result.push(nextTrunkOperation);
      nextTrunkOperation = trunkCopy.shift();
    }

    if (!nextTrunkOperation) {
      enteredBranch = true;
    } else if (!enteredBranch) {
      if (operationsAreEqual(nextTrunkOperation, newOperationCandidate)) {
        newOperations.shift();
        result.push(nextTrunkOperation);
      } else {
        trunkCopy.unshift(nextTrunkOperation);
        enteredBranch = true;
      }
    }

    if (enteredBranch) {
      let nextAppend = newOperations.shift();
      while (nextAppend) {
        result.push(nextAppend);
        nextAppend = newOperations.shift();
      }
    }
  }

  if (!enteredBranch) {
    let nextAppend = trunkCopy.shift();
    while (nextAppend) {
      result.push(nextAppend);
      nextAppend = trunkCopy.shift();
    }
  }

  return [garbageCollect(result), trunkCopy];
}

export function precedes(op1: Operation, op2: Operation) {
  return (
    op1.index < op2.index ||
    (op1.index === op2.index && op1.id === op2.id && op1.skip < op2.skip)
  );
}

export function split(
  sortedTargetOperations: Operation[],
  sortedMergeOperations: Operation[],
): [Operation[], Operation[], Operation[]] {
  const commonOperations: Operation[] = [];
  const targetDiffOperations: Operation[] = [];
  const mergeDiffOperations: Operation[] = [];

  // get bigger array length
  const maxLength = Math.max(
    sortedTargetOperations.length,
    sortedMergeOperations.length,
  );

  let splitHappened = false;
  for (let i = 0; i < maxLength; i++) {
    const targetOperation = sortedTargetOperations[i];
    const mergeOperation = sortedMergeOperations[i];

    if (targetOperation && mergeOperation) {
      if (
        !splitHappened &&
        operationsAreEqual(targetOperation, mergeOperation)
      ) {
        commonOperations.push(targetOperation);
      } else {
        splitHappened = true;
        targetDiffOperations.push(targetOperation);
        mergeDiffOperations.push(mergeOperation);
      }
    } else if (targetOperation) {
      targetDiffOperations.push(targetOperation);
    } else if (mergeOperation) {
      mergeDiffOperations.push(mergeOperation);
    }
  }

  return [commonOperations, targetDiffOperations, mergeDiffOperations];
}

// [0:0, 1:0, 2:0, A3:0, A4:0, A5:0] + [0:0, 1:0, 2:0, B3:0, B4:2, B5:0]
// GC               => [0:0, 1:0, 2:0, A3:0, A4:0, A5:0] + [0:0, 1:0, B4:2, B5:0]
// Split            => [0:0, 1:0] + [2:0, A3:0, A4:0, A5:0] + [B4:2, B5:0]
// Reshuffle(6:4)   => [6:4, 7:0, 8:0, 9:0, 10:0, 11:0]
// merge            => [0:0, 1:0, 6:4, 7:0, 8:0, 9:0, 10:0, 11:0]
export function merge(
  sortedTargetOperations: Operation[],
  sortedMergeOperations: Operation[],
  reshuffle: Reshuffle,
): Operation[] {
  const [_commonOperations, _targetOperations, _mergeOperations] = split(
    garbageCollect(sortedTargetOperations),
    garbageCollect(sortedMergeOperations),
  );

  const maxCommonIndex = getMaxIndex(_commonOperations);
  const nextIndex =
    1 +
    Math.max(
      maxCommonIndex,
      getMaxIndex(_targetOperations),
      getMaxIndex(_mergeOperations),
    );

  const filteredMergeOperations = filterDuplicatedOperations(
    _mergeOperations,
    _targetOperations,
  );

  const newOperationHistory = reshuffle(
    {
      index: nextIndex,
      skip: nextIndex - (maxCommonIndex + 1),
    },
    _targetOperations,
    filteredMergeOperations,
  );

  return _commonOperations.concat(newOperationHistory);
}

function getMaxIndex(sortedOperations: Operation[]) {
  const lastElement = sortedOperations[sortedOperations.length - 1];
  if (!lastElement) {
    return -1;
  }

  return lastElement.index;
}

// [] => -1
// [0:0] => -1
// [0:0 1:0] => 1
// [0:0 1:1] => -1
// [1:1] => -1
// [0:0 1:0 2:0] => 1
// [0:0 1:0 2:0 2:1] => 2
// [0:0 1:0 2:0 2:1 2:2] => -1
// [0:0 1:1 2:0] => 2
// [0:0 1:1 2:2] => -1
// [0:0 1:1 2:0 3:0] => 1
// [0:0 1:1 2:0 3:1] => 3
// [0:0 1:1 2:0 3:3] => -1
// [50:50 100:50 150:50 151:0 152:0 153:0 154:3] => 53

export function nextSkipNumber<A extends OperationIndex>(
  sortedOperations: A[],
): number {
  if (sortedOperations.length < 1) {
    return -1;
  }

  const cleanedOperations = garbageCollect(sortedOperations);

  let nextSkip =
    (cleanedOperations[cleanedOperations.length - 1]?.skip || 0) + 1;

  if (cleanedOperations.length > 1) {
    nextSkip += cleanedOperations[cleanedOperations.length - 2]?.skip || 0;
  }

  return (cleanedOperations[cleanedOperations.length - 1]?.index || -1) <
    nextSkip
    ? -1
    : nextSkip;
}

export const checkOperationsIntegrity = (
  operations: Operation[],
): IntegrityIssue[] => {
  return checkCleanedOperationsIntegrity(
    garbageCollect(sortOperations(operations)),
  );
};

export type OperationsByScope = Partial<Record<OperationScope, Operation[]>>;

export const groupOperationsByScope = (
  operations: Operation[],
): OperationsByScope => {
  const result = operations.reduce<OperationsByScope>((acc, operation) => {
    if (!acc[operation.scope]) {
      acc[operation.scope] = [];
    }

    acc[operation.scope]?.push(operation);

    return acc;
  }, {});

  return result;
};

type PrepareOperationsResult = {
  validOperations: Operation[];
  invalidOperations: Operation[];
  duplicatedOperations: Operation[];
  integrityIssues: IntegrityIssue[];
};

export const prepareOperations = (
  operationsHistory: Operation[],
  newOperations: Operation[],
): PrepareOperationsResult => {
  const result: PrepareOperationsResult = {
    integrityIssues: [],
    validOperations: [],
    invalidOperations: [],
    duplicatedOperations: [],
  };

  const sortedOperationsHistory = sortOperations(operationsHistory);
  const sortedOperations = sortOperations(newOperations);

  const integrityErrors = checkCleanedOperationsIntegrity([
    ...sortedOperationsHistory,
    ...sortedOperations,
  ]);

  const missingIndexErrors = integrityErrors.filter(
    (integrityIssue) =>
      integrityIssue.category === IntegrityIssueSubType.MISSING_INDEX,
  );

  // get the integrity error with the lowest index operation
  const firstMissingIndexOperation = [...missingIndexErrors]
    .sort((a, b) => b.operation.index - a.operation.index)
    .pop()?.operation;

  for (const newOperation of sortedOperations) {
    // Operation is missing index or it follows an operation that is missing index
    if (
      firstMissingIndexOperation &&
      newOperation.index >= firstMissingIndexOperation.index
    ) {
      result.invalidOperations.push(newOperation);
      continue;
    }

    // check if operation is duplicated
    const isDuplicatedOperation = integrityErrors.some((integrityError) => {
      return (
        integrityError.operation.index === newOperation.index &&
        integrityError.operation.skip === newOperation.skip &&
        integrityError.category === IntegrityIssueSubType.DUPLICATED_INDEX
      );
    });

    // add to duplicated operations if it is duplicated
    if (isDuplicatedOperation) {
      result.duplicatedOperations.push(newOperation);
      continue;
    }

    // otherwise, add to valid operations
    result.validOperations.push(newOperation);
  }

  result.integrityIssues.push(...integrityErrors);
  return result;
};

export function removeExistingOperations(
  newOperations: Operation[],
  operationsHistory: Operation[],
): Operation[] {
  return newOperations.filter((newOperation) => {
    return !operationsHistory.some((historyOperation) => {
      return (
        (newOperation.type === "NOOP" &&
          newOperation.skip === 0 &&
          newOperation.index === historyOperation.index) ||
        (newOperation.index === historyOperation.index &&
          newOperation.skip === historyOperation.skip &&
          newOperation.scope === historyOperation.scope &&
          newOperation.hash === historyOperation.hash &&
          newOperation.type === historyOperation.type)
      );
    });
  });
}

export type SkipHeaderOperationIndex = Partial<Pick<OperationIndex, "index">> &
  Pick<OperationIndex, "skip">;

/**
 * Skips header operations and returns the remaining operations.
 *
 * @param operations - The array of operations.
 * @param skipHeaderOperation - The skip header operation index.
 * @returns The remaining operations after skipping header operations.
 */
export function skipHeaderOperations<A extends OperationIndex>(
  operations: A[],
  skipHeaderOperation: SkipHeaderOperationIndex,
): A[] {
  const [lastOperation] = sortOperations(operations).slice(-1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const lastIndex = lastOperation?.index ?? -1;
  const nextIndex = lastIndex + 1;

  const skipOperationIndex = {
    ...skipHeaderOperation,
    index: skipHeaderOperation.index ?? nextIndex,
  };

  if (skipOperationIndex.index < lastIndex) {
    throw new Error(
      `The skip header operation index must be greater than or equal to ${lastIndex}`,
    );
  }

  const clearedOperations = garbageCollect(
    sortOperations([...operations, skipOperationIndex]),
  );

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return (clearedOperations || []).slice(0, -1) as A[];
}

export function garbageCollectDocumentOperations<A extends Action>(
  documentOperations: DocumentOperations<A>,
): DocumentOperations<A> {
  const clearedOperations = Object.entries(documentOperations).reduce(
    (acc, entry) => {
      const [scope, ops] = entry;

      return {
        ...acc,
        [scope as OperationScope]: garbageCollect(sortOperations(ops)),
      };
    },
    {},
  );

  return {
    ...clearedOperations,
  } as DocumentOperations<A>;
}

/**
 * Filters out duplicated operations from the target operations array based on their IDs.
 * If an operation has an ID, it is considered duplicated if there is another operation in the source operations array with the same ID.
 * If an operation does not have an ID, it is considered unique and will not be filtered out.
 * @param targetOperations - The array of target operations to filter.
 * @param sourceOperations - The array of source operations to compare against.
 * @returns An array of operations with duplicates filtered out.
 */
export function filterDuplicatedOperations(
  targetOperations: Operation[],
  sourceOperations: Operation[],
): Operation[] {
  return targetOperations.filter((op) => {
    if (op.id) {
      return !sourceOperations.some((targetOp) => targetOp.id === op.id);
    }

    return true;
  });
}

export function filterDocumentOperationsResultingState<A extends Action>(
  documentOperations?: DocumentOperations<A>,
) {
  if (!documentOperations) {
    return {};
  }

  const entries = Object.entries(documentOperations);

  return entries.reduce<DocumentOperations<A>>(
    (acc, [scope, operations]) => ({
      ...acc,
      [scope]: operations.map((op) => {
        const { resultingState, ...restProps } = op;

        return restProps;
      }),
    }),
    {} as DocumentOperations<A>,
  );
}

/**
 * Calculates the difference between two arrays of operations.
 * Returns an array of operations that are present in `clearedOperationsA` but not in `clearedOperationsB`.
 *
 * @template A - The type of the operations.
 * @param {A[]} clearedOperationsA - The first array of operations.
 * @param {A[]} clearedOperationsB - The second array of operations.
 * @returns {A[]} - The difference between the two arrays of operations.
 */
export function diffOperations<A extends OperationIndex>(
  clearedOperationsA: A[],
  clearedOperationsB: A[],
): A[] {
  return clearedOperationsA.filter(
    (operationA) =>
      !clearedOperationsB.some(
        (operationB) => operationA.index === operationB.index,
      ),
  );
}

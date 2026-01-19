import stringifyJson, { stringify } from "safe-stable-stringify";
import { hashBrowser } from "./crypto.js";
import { HashMismatchError } from "./errors.js";
import { createPresignedHeader } from "./header.js";
import type {
  Action,
  DocumentOperations,
  Operation,
  PHBaseState,
  PHDocument,
  PHDocumentHeader,
} from "./ph-types.js";
import type {
  CreateState,
  DocumentAction,
  DocumentOperationsIgnoreMap,
  MappedOperation,
  OperationIndex,
  OperationsByScope,
  Reducer,
  ReplayDocumentOptions,
  SignalDispatch,
  SkipHeaderOperationIndex,
  SkipHeaderOperations,
  UndoAction,
  UndoRedoAction,
} from "./types.js";
import { generateId } from "./utils.js";

export function isNoopOperation<
  TOp extends {
    type: string;
    skip: number;
    hash: string;
  },
>(op: Partial<TOp>): boolean {
  return (
    op.type === "NOOP" &&
    op.skip !== undefined &&
    op.skip > 0 &&
    op.hash !== undefined
  );
}

export function isUndoRedo(action: Action): action is UndoRedoAction {
  return ["UNDO", "REDO"].includes(action.type);
}

export function isUndo(action: Action): action is UndoAction {
  return action.type === "UNDO";
}

export function isDocumentAction(action: Action): action is DocumentAction {
  return ["SET_NAME", "UNDO", "REDO", "PRUNE", "LOAD_STATE"].includes(
    action.type,
  );
}

/**
 * Important note: it is the responsibility of the caller to set the document type
 * on the header.
 */
export function baseCreateDocument<TState extends PHBaseState = PHBaseState>(
  createState: CreateState<TState>,
  initialState?: Partial<TState>,
): PHDocument<TState> {
  const state = createState(initialState);
  const header = createPresignedHeader();
  const phDocument: PHDocument<TState> = {
    header,
    state,
    initialState: state,
    operations: { global: [], local: [] },
    clipboard: [],
  };

  return phDocument;
}

export function hashDocumentStateForScope(
  document: {
    state: {
      [key: string]: unknown;
    };
  },
  scope = "global",
) {
  const stateString = stringifyJson(document.state[scope] || "");
  return hashBrowser(stateString);
}

export function readOnly<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}

/**
 * Maps skipped operations in an array of operations.
 * Skipped operations are operations that are ignored during processing.
 * @param operations - The array of operations to map.
 * @param skippedHeadOperations - The number of operations to skip at the head of the array of operations.
 * @returns An array of mapped operations with ignore flag indicating if the operation is skipped.
 * @throws Error if the operation index is invalid and there are missing operations.
 */
export function mapSkippedOperations(
  operations: Operation[],
  skippedHeadOperations?: number,
): MappedOperation[] {
  const ops = [...operations];

  let skipped = skippedHeadOperations || 0;
  let latestOpIndex = ops.length > 0 ? ops[ops.length - 1].index : 0;

  const scopeOpsWithIgnore: MappedOperation[] = [];

  for (const operation of ops.reverse()) {
    if (skipped > 0) {
      const operationsDiff = latestOpIndex - operation.index;
      skipped -= operationsDiff;
    }

    if (skipped < 0) {
      throw new Error("Invalid operation index, missing operations");
    }

    const mappedOp = {
      ignore: skipped > 0,
      operation,
    };

    // here we add 1 to the skip number because we want to get the number of
    // operations that we want to move the pointer back to get the latest valid operation
    // operation.skip = 1 means that we want to move the pointer back 2 operations to get to the latest valid operation
    const operationSkip = operation.skip > 0 ? operation.skip + 1 : 0;

    if (operationSkip > 0 && operationSkip > skipped) {
      const skipDiff = operationSkip - skipped;
      skipped = skipped + skipDiff;
    }

    latestOpIndex = operation.index;
    scopeOpsWithIgnore.push(mappedOp);
  }

  return scopeOpsWithIgnore.reverse();
}

/**
 * V2 version of mapSkippedOperations for protocol version 2+.
 * In V2, all NOOPs have skip=1 and consecutive NOOPs form chains.
 * N consecutive NOOPs at any point skip N preceding content operations.
 *
 * Algorithm: Process from end to start
 * - When hitting a NOOP: increment chain length, mark as ignored
 * - When hitting a non-NOOP:
 *   - If chain > 0: decrement chain, mark as ignored (this op was undone)
 *   - If chain == 0: mark as not ignored (apply this op)
 */
export function mapSkippedOperationsV2(
  operations: Operation[],
): MappedOperation[] {
  const ops = [...operations];
  const result: MappedOperation[] = [];

  let noopChainLength = 0;

  for (let i = ops.length - 1; i >= 0; i--) {
    const operation = ops[i];
    const isNoop = operation.action.type === "NOOP";

    if (isNoop) {
      noopChainLength++;
      result.unshift({ ignore: true, operation });
    } else if (noopChainLength > 0) {
      noopChainLength--;
      result.unshift({ ignore: true, operation });
    } else {
      result.unshift({ ignore: false, operation });
    }
  }

  return result;
}

/**
 * V2 garbage collect that returns only operations that should be applied for state.
 * Uses the V2 model where consecutive NOOPs form chains.
 * Unlike V1 garbageCollect, this preserves ALL operations but marks which to apply.
 */
export function garbageCollectV2<TOpIndex extends OperationIndex>(
  sortedOperations: TOpIndex[],
): TOpIndex[] {
  const result: TOpIndex[] = [];
  let noopChainLength = 0;

  for (let i = sortedOperations.length - 1; i >= 0; i--) {
    const op = sortedOperations[i];
    // Check if this is a NOOP operation
    const isNoop =
      "action" in op &&
      (op as unknown as Operation).action.type === "NOOP" &&
      op.skip > 0;

    if (isNoop) {
      noopChainLength++;
      // Include the NOOP in result (for operation history)
      result.unshift(op);
    } else if (noopChainLength > 0) {
      noopChainLength--;
      // Skip this operation - it was undone
    } else {
      // Include this operation
      result.unshift(op);
    }
  }

  return result;
}

// Flattens the mapped operations (with ignore flag) from all scopes into
// a single array and sorts them by timestamp
export function sortMappedOperations(operations: DocumentOperationsIgnoreMap) {
  return Object.values(operations)
    .flatMap((array) => array)
    .sort(
      (a, b) =>
        new Date(a.operation.timestampUtcMs).getTime() -
        new Date(b.operation.timestampUtcMs).getTime(),
    );
}

// Default createState function that just returns the state as-is
const defaultCreateState = <TState extends PHBaseState = PHBaseState>(
  state?: Partial<TState>,
) => {
  return state as TState;
};

// Runs the operations on the initial data using the
// provided document reducer.
// This rebuilds the document according to the provided actions.
export function replayDocument<TState extends PHBaseState = PHBaseState>(
  initialState: TState,
  operations: DocumentOperations,
  reducer: Reducer<TState>,
  header: PHDocumentHeader,
  dispatch?: SignalDispatch,
  skipHeaderOperations: SkipHeaderOperations = {},
  options?: ReplayDocumentOptions,
): PHDocument<TState> {
  const {
    checkHashes = true,
    reuseOperationResultingState,
    operationResultingStateParser = parseResultingState,
    skipIndexValidation,
  } = options || {};

  let documentState = initialState;
  const operationsToReplay: Operation[] = [];
  // Initialize with all scopes found in operations, plus global and local for backward compatibility
  const allScopes = new Set([...Object.keys(operations), "global", "local"]);
  const initialOperations: DocumentOperations = {};
  for (const scope of allScopes) {
    initialOperations[scope] = [];
  }

  // if operation resulting state is to be used then
  // looks for the last operation with state of each
  // scope to use it as the starting point and only
  // replay operations that follow it
  if (reuseOperationResultingState) {
    for (const [scope, scopeOperations] of Object.entries(operations)) {
      if (!scopeOperations) {
        continue;
      }
      const index = scopeOperations.findLastIndex((s) => !!s.resultingState);
      if (index < 0) {
        operationsToReplay.push(...scopeOperations);
        continue;
      }
      const opWithState = scopeOperations[index];
      if (!opWithState || !opWithState.resultingState) continue;
      try {
        const scopeState = operationResultingStateParser(
          opWithState.resultingState,
        );
        documentState = {
          ...documentState,
          // TODO how to deal with attachments?
          [scope]: scopeState,
        };
        const scopeInitialOps =
          initialOperations[scope as keyof typeof initialOperations];
        if (scopeInitialOps) {
          scopeInitialOps.push(...scopeOperations.slice(0, index + 1));
        }
        operationsToReplay.push(...scopeOperations.slice(index + 1));
      } catch {
        /* if parsing fails then keeps replays all scope operations */
        operationsToReplay.push(...scopeOperations);
      }
    }
  } else {
    operationsToReplay.push(
      ...Object.values(operations).flatMap((ops) => ops || []),
    );
  }

  // builds a new document using the provided header (no generated header)
  const document: PHDocument<TState> = {
    header,
    state: defaultCreateState<TState>(documentState),
    initialState,
    operations: initialOperations,
    clipboard: [],
  };

  let result = document;

  // if there are operations left without resulting state
  // then replays them
  if (operationsToReplay.length) {
    result = operationsToReplay.reduce((document, operation) => {
      const doc = reducer(document, operation.action, dispatch, {
        ignoreSkipOperations: true,
        checkHashes,
        skipIndexValidation,
        replayOptions: {
          operation,
        },
      });

      return doc;
    }, document);
  }
  // if not then updates the document header according
  // to the latest operation of each scope
  else {
    for (const scopeOperations of Object.values(initialOperations)) {
      if (!scopeOperations) {
        continue;
      }
      const lastOperation = scopeOperations.at(-1);
      if (lastOperation) {
        result = updateHeaderRevision(
          result,
          lastOperation.action.scope,
        ) as PHDocument<TState>;
      }
    }
  }

  // if hash generation was skipped then checks if the hash
  // of each scope matches the hash of last operation
  if (!checkHashes) {
    for (const scope of Object.keys(result.state)) {
      for (let i = operationsToReplay.length - 1; i >= 0; i--) {
        const operation = operationsToReplay[i];

        if (operation.action.scope !== scope) {
          continue;
        }
        if (operation.hash !== hashDocumentStateForScope(result, scope)) {
          throw new HashMismatchError(scope, result, operation);
        } else {
          break;
        }
      }
    }
  }

  // reuses operation timestamp if provided
  // Initialize with all scopes from both result.operations and input operations
  const allResultScopes = new Set([
    ...Object.keys(result.operations),
    ...Object.keys(operations),
    "global",
    "local",
  ]);
  const initialResultOperations: DocumentOperations = {};
  for (const scope of allResultScopes) {
    initialResultOperations[scope] = [];
  }

  // Iterate over all scopes (not just result.operations) to preserve empty scopes
  const resultOperations: DocumentOperations = Array.from(
    allResultScopes,
  ).reduce((acc, scope) => {
    const scopeOps = result.operations[scope] || [];

    return {
      ...acc,
      [scope]: [
        ...scopeOps.map((operation, index) => {
          return {
            ...operation,
            timestamp:
              operations[scope]?.[index]?.timestampUtcMs ??
              operation.timestampUtcMs,
          };
        }),
      ],
    };
  }, initialResultOperations);

  // gets the last modified timestamp from the latest operation
  const lastModified = header
    ? header.lastModifiedAtUtcIso
    : Object.values(resultOperations).reduce((acc, curr) => {
        if (!curr) {
          return acc;
        }
        const operation = curr.at(-1);
        if (operation) {
          if (operation.timestampUtcMs > acc) {
            return operation.timestampUtcMs;
          }
        }

        return acc;
      }, document.header.lastModifiedAtUtcIso);

  if (header) {
    result.header = {
      ...header,
      revision: result.header.revision,
      lastModifiedAtUtcIso: lastModified,
    };
  }

  return {
    ...result,
    operations: resultOperations,
  } as PHDocument<TState>;
}

export function parseResultingState<TState>(
  state: string | null | undefined,
): TState {
  const stateType = typeof state;
  if (stateType === "string") {
    return JSON.parse(state!) as TState;
  } else if (stateType === "object") {
    return state as TState;
  } else {
    throw new Error(`Providing resulting state is of type: ${stateType}`);
  }
}

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
  sortedOperations: OperationIndex[],
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

export function garbageCollect<TOpIndex extends OperationIndex>(
  sortedOperations: TOpIndex[],
) {
  const result: TOpIndex[] = [];

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
export function addUndo(sortedOperations: Operation[]) {
  const operationsCopy = [...sortedOperations];
  const latestOperation = operationsCopy[operationsCopy.length - 1];

  if (!latestOperation) return operationsCopy;

  if (latestOperation.action.type === "NOOP") {
    operationsCopy.push({
      ...latestOperation,
      index: latestOperation.index,
      skip: nextSkipNumber(sortedOperations),
      action: {
        ...latestOperation.action,

        // TODO: this will break the signature...
        id: generateId(),
        timestampUtcMs: new Date().toISOString(),
        type: "NOOP",
      },
    });
  } else {
    operationsCopy.push({
      id: generateId(),
      timestampUtcMs: new Date().toISOString(),
      index: latestOperation.index + 1,
      skip: 1,
      hash: latestOperation.hash,
      action: {
        id: generateId(),
        timestampUtcMs: new Date().toISOString(),
        type: "NOOP",
        input: {},
        scope: latestOperation.action.scope,
      },
    });
  }

  return operationsCopy;
}

// [0:0 2:0 1:0 3:3 3:1] => [0:0 1:0 2:0 3:1 3:3]
// Sort by index _and_ skip number
export function sortOperations<TOpIndex extends OperationIndex>(
  operations: TOpIndex[],
): TOpIndex[] {
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

// TODO: implement better operation equality function
export function operationsAreEqual<
  TOp extends {
    index: number;
    skip: number;
    type?: string;
    scope?: string;
    input?: unknown;
  },
>(op1: TOp, op2: TOp): boolean {
  const a = op1;
  const b = op2;

  const aComparable = {
    index: a.index,
    skip: a.skip,
    type: a.type ?? null,
    scope: a.scope ?? null,
    input: a.input ?? null,
  };

  const bComparable = {
    index: b.index,
    skip: b.skip,
    type: b.type ?? null,
    scope: b.scope ?? null,
    input: b.input ?? null,
  };

  return stringify(aComparable) === stringify(bComparable);
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

export function precedes(op1: OperationIndex, op2: OperationIndex) {
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

function getMaxIndex(sortedOperations: OperationIndex[]) {
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

export function nextSkipNumber(sortedOperations: OperationIndex[]) {
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

export function checkOperationsIntegrity(operations: Operation[]) {
  return checkCleanedOperationsIntegrity(
    garbageCollect(sortOperations(operations)),
  );
}
export function groupOperationsByScope(operations: Operation[]) {
  const result = operations.reduce<OperationsByScope>((acc, operation) => {
    if (!acc[operation.action.scope]) {
      acc[operation.action.scope] = [];
    }

    acc[operation.action.scope]?.push(operation);

    return acc;
  }, {});

  return result;
}

type PrepareOperationsResult = {
  validOperations: Operation[];
  invalidOperations: Operation[];
  duplicatedOperations: Operation[];
  integrityIssues: IntegrityIssue[];
};

export function prepareOperations(
  operationsHistory: Operation[],
  newOperations: Operation[],
) {
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
}

export function removeExistingOperations(
  newOperations: Operation[],
  operationsHistory: Operation[],
) {
  return newOperations.filter((newOperation) => {
    return !operationsHistory.some((historyOperation) => {
      return (
        (newOperation.action.type === "NOOP" &&
          newOperation.skip === 0 &&
          newOperation.index === historyOperation.index) ||
        (newOperation.index === historyOperation.index &&
          newOperation.skip === historyOperation.skip &&
          newOperation.action.scope === historyOperation.action.scope &&
          newOperation.hash === historyOperation.hash &&
          newOperation.action.type === historyOperation.action.type)
      );
    });
  });
}

/**
 * Skips header operations and returns the remaining operations.
 *
 * @param operations - The array of operations.
 * @param skipHeaderOperation - The skip header operation index.
 * @returns The remaining operations after skipping header operations.
 */
export function skipHeaderOperations(
  operations: Operation[],
  skipHeaderOperation: SkipHeaderOperationIndex,
): Operation[] {
  const lastOperation = sortOperations(operations).at(-1);
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

  return clearedOperations.slice(0, -1) as Operation[]; //clearedOperation ? [clearedOperation as TOpIndex] : [];
}

export function garbageCollectDocumentOperations(
  documentOperations: DocumentOperations,
) {
  const clearedOperations = Object.entries(documentOperations).reduce(
    (acc, entry) => {
      const [scope, ops] = entry;
      if (!ops) {
        return acc;
      }

      return {
        ...acc,
        [scope]: garbageCollect(sortOperations(ops)),
      };
    },
    {},
  );

  return clearedOperations as DocumentOperations;
}

/**
 * Filters out duplicated operations from the target operations array based on their IDs.
 * If an operation has an ID, it is considered duplicated if there is another operation in the source operations array with the same ID.
 * If an operation does not have an ID, it is considered unique and will not be filtered out.
 * @param targetOperations - The array of target operations to filter.
 * @param sourceOperations - The array of source operations to compare against.
 * @returns An array of operations with duplicates filtered out.
 */
export function filterDuplicatedOperations<T extends { id?: string | number }>(
  targetOperations: T[],
  sourceOperations: T[],
): T[] {
  return targetOperations.filter((op) => {
    if (op.id) {
      return !sourceOperations.some((targetOp) => targetOp.id === op.id);
    }

    return true;
  });
}

export function filterDocumentOperationsResultingState(
  documentOperations?: DocumentOperations,
) {
  if (!documentOperations) {
    return {} as DocumentOperations;
  }

  const entries = Object.entries(documentOperations);

  return entries.reduce((acc, [scope, operations]) => {
    if (!operations) {
      return acc;
    }
    return {
      ...acc,
      [scope]: operations.map((op) => {
        const { resultingState, ...restProps } = op;

        return restProps;
      }),
    };
  }, {} as DocumentOperations);
}

/**
 * Calculates the difference between two arrays of operations.
 * Returns an array of operations that are present in `clearedOperationsA` but not in `clearedOperationsB`.
 *
 * @template TOp - The type of the operations.
 * @param {TOp[]} clearedOperationsA - The first array of operations.
 * @param {TOp[]} clearedOperationsB - The second array of operations.
 * @returns {TOp[]} - The difference between the two arrays of operations.
 */
export function diffOperations<TOp extends OperationIndex>(
  clearedOperationsA: TOp[],
  clearedOperationsB: TOp[],
): TOp[] {
  return clearedOperationsA.filter(
    (operationA) =>
      !clearedOperationsB.some(
        (operationB) => operationA.index === operationB.index,
      ),
  );
}

// it's operations, falling back to the initial state
export function getDocumentLastModified(document: PHDocument) {
  const sortedOperations = sortOperations(
    Object.values(document.operations).flatMap((ops) => ops || []),
  );

  return (
    sortedOperations.at(-1)?.timestampUtcMs ||
    document.header.lastModifiedAtUtcIso
  );
}

/**
 * Gets the next revision number based on the provided scope.
 *
 * @param state The current state of the document.
 * @param scope The scope of the operation.
 * @returns The next revision number.
 */
function getNextRevision(document: PHDocument, scope: string) {
  const scopeOperations = document.operations[scope];
  const latestOperationIndex = scopeOperations?.at(-1)?.index ?? -1;

  return (latestOperationIndex ?? -1) + 1;
}

/**
 * Updates the document header with the latest revision number and
 * date of last modification.
 *
 * @param state The current state of the document.
 * @param operation The action being applied to the document.
 * @returns The updated document state.
 */
export function updateHeaderRevision(
  document: PHDocument,
  scope: string,
): PHDocument {
  const header: PHDocumentHeader = {
    ...document.header,
    revision: {
      ...document.header.revision,
      [scope]: getNextRevision(document, scope),
    },
    lastModifiedAtUtcIso: getDocumentLastModified(document),
  };

  return {
    ...document,
    header,
  };
}

import type {
  Action,
  BaseStateFromDocument,
  CreateState,
  DocumentAction,
  DocumentOperations,
  DocumentOperationsIgnoreMap,
  MappedOperation,
  Operation,
  PHBaseState,
  PHDocument,
  PHDocumentHeader,
  Reducer,
  SignalDispatch,
  StateReducer,
  UndoAction,
  UndoRedoAction,
} from "document-model";
import { baseReducer, createReducer, hashBrowser } from "document-model";
import stringifyJson from "safe-stable-stringify";
import { createPresignedHeader } from "./header.js";
import { updateHeaderRevision } from "./revisions.js";

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
export function baseCreateDocument<TDocument extends PHDocument>(
  createState: CreateState<TDocument>,
  initialState?: Partial<PHBaseState>,
): TDocument {
  const state = createState(initialState);
  const header = createPresignedHeader();
  const phDocument: PHDocument = {
    header,
    state,
    initialState: state,
    operations: { global: [], local: [] },
    clipboard: [],
    attachments: {},
    history: [],
  };

  return phDocument as TDocument;
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
const defaultCreateState = <TDocument extends PHDocument>(
  state?: Partial<PHBaseState>,
) => {
  return state as BaseStateFromDocument<TDocument>;
};

// Runs the operations on the initial data using the
// provided reducer, wrapped with the document reducer.
// This rebuilds the document according to the provided actions.
export function replayOperations<TDocument extends PHDocument>(
  initialState: BaseStateFromDocument<TDocument>,
  clearedOperations: DocumentOperations,
  stateReducer: StateReducer<TDocument>,
  dispatch?: SignalDispatch,
  header?: PHDocumentHeader,
  documentReducer = baseReducer,
  skipHeaderOperations: SkipHeaderOperations = {},
  options?: ReplayDocumentOptions,
): TDocument {
  // wraps the provided custom reducer with the
  // base document reducer
  const wrappedReducer = createReducer(stateReducer, documentReducer);

  return replayDocument<TDocument>(
    initialState,
    clearedOperations,
    wrappedReducer,
    dispatch,
    header,
    skipHeaderOperations,
    options,
  );
}

export type SkipHeaderOperations = Partial<Record<string, number>>;

export type ReplayDocumentOptions = {
  // if false then reuses the hash from the operations
  // and only checks the final hash of each scope
  checkHashes?: boolean;
  // if true then looks for the latest operation with
  // a resulting state and uses it as a starting point
  reuseOperationResultingState?: boolean;
  // Optional parser for the operation resulting state, uses JSON.parse by default
  operationResultingStateParser?: <TState>(state: string) => TState;
};

// Runs the operations on the initial data using the
// provided document reducer.
// This rebuilds the document according to the provided actions.
export function replayDocument<TDocument extends PHDocument>(
  initialState: BaseStateFromDocument<TDocument>,
  operations: DocumentOperations,
  reducer: Reducer<TDocument>,
  dispatch?: SignalDispatch,
  header?: PHDocumentHeader,
  skipHeaderOperations: SkipHeaderOperations = {},
  options?: ReplayDocumentOptions,
): TDocument {
  const {
    checkHashes = true,
    reuseOperationResultingState,
    operationResultingStateParser = parseResultingState,
  } = options || {};

  let documentState = initialState;
  const operationsToReplay: Operation[] = [];
  const initialOperations: DocumentOperations = {
    global: [],
    local: [],
  };

  // if operation resulting state is to be used then
  // looks for the last operation with state of each
  // scope to use it as the starting point and only
  // replay operations that follow it
  if (reuseOperationResultingState) {
    for (const [scope, scopeOperations] of Object.entries(operations)) {
      const index = scopeOperations.findLastIndex((s) => !!s.resultingState);
      if (index < 0) {
        operationsToReplay.push(...scopeOperations);
        continue;
      }
      const opWithState = scopeOperations[index];
      if (!opWithState.resultingState) continue;
      try {
        const scopeState = operationResultingStateParser(
          opWithState.resultingState,
        );
        documentState = {
          ...documentState,
          // TODO how to deal with attachments?
          [scope]: scopeState,
        };
        initialOperations[scope as keyof typeof initialOperations].push(
          ...scopeOperations.slice(0, index + 1),
        );
        operationsToReplay.push(...scopeOperations.slice(index + 1));
      } catch {
        /* if parsing fails then keeps replays all scope operations */
        operationsToReplay.push(...scopeOperations);
      }
    }
  } else {
    operationsToReplay.push(...Object.values(operations).flat());
  }

  // builds a new document from the initial data
  const document = baseCreateDocument(
    defaultCreateState<TDocument>,
    documentState,
  );
  if (header?.slug) {
    document.header.slug = header.slug;
  }
  document.initialState = initialState;
  document.operations = initialOperations;

  let result = document;

  // if there are operations left without resulting state
  // then replays them
  if (operationsToReplay.length) {
    result = operationsToReplay.reduce((document, operation) => {
      const doc = reducer(document, operation.action, dispatch, {
        ignoreSkipOperations: true,
        checkHashes,
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
      const lastOperation = scopeOperations.at(-1);
      if (lastOperation) {
        result = updateHeaderRevision(
          result,
          lastOperation.action.scope,
        ) as TDocument;
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
          throw new Error(`Hash mismatch for scope ${scope}`);
        } else {
          break;
        }
      }
    }
  }

  // reuses operation timestamp if provided
  const resultOperations: DocumentOperations = Object.keys(
    result.operations,
  ).reduce(
    (acc, key) => {
      const scope = key as keyof DocumentOperations;

      return {
        ...acc,
        [scope]: [
          ...result.operations[scope].map((operation, index) => {
            return {
              ...operation,
              timestamp:
                operations[scope][index]?.timestampUtcMs ??
                operation.timestampUtcMs,
            };
          }),
        ],
      };
    },
    { global: [], local: [] },
  );

  // gets the last modified timestamp from the latest operation
  const lastModified = header
    ? header.lastModifiedAtUtcIso
    : Object.values(resultOperations).reduce((acc, curr) => {
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
  } as TDocument;
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

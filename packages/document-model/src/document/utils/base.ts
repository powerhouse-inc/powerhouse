import { ZodError } from "zod";
import stringifyJson from "safe-stable-stringify";
import { baseReducer, mutableBaseReducer, updateHeader } from "../reducer";
import {
  Action,
  BaseAction,
  UndoRedoAction,
  Document,
  ExtendedState,
  ImmutableStateReducer,
  Reducer,
  OperationScope,
  State,
  CreateState,
  PartialState,
  DocumentOperations,
  DocumentHeader,
  DocumentOperationsIgnoreMap,
  Operation,
  MappedOperation,
  ReducerOptions,
  UndoAction,
} from "../types";
import { hash } from "./node";
import {
  LOAD_STATE,
  PRUNE,
  REDO,
  SET_NAME,
  UNDO,
  NOOP,
} from "../actions/types";
import { SignalDispatch } from "../signal";
import { InvalidActionInputError, InvalidActionInputZodError } from "./errors";

export function isNoopOperation(op: Partial<Operation>): boolean {
  return (
    op.type === NOOP &&
    op.skip !== undefined &&
    op.skip > 0 &&
    op.hash !== undefined
  );
}

export function isUndoRedo(action: Action): action is UndoRedoAction {
  return [UNDO, REDO].includes(action.type);
}

export function isUndo(action: Action): action is UndoAction {
  return action.type === UNDO;
}

export function isBaseAction(action: Action): action is BaseAction {
  return [SET_NAME, UNDO, REDO, PRUNE, LOAD_STATE].includes(action.type);
}

/**
 * Helper function to be used by action creators.
 *
 * @remarks
 * Creates an action with the given type and input properties. The input
 * properties default to an empty object.
 *
 * @typeParam A - Type of the action to be returned.
 *
 * @param type - The type of the action.
 * @param input - The input properties of the action.
 * @param attachments - The attachments included in the action.
 * @param validator - The validator to use for the input properties.
 * @param scope - The scope of the action, can either be 'global' or 'local'.
 * @param skip - The number of operations to skip before this new action is applied.
 *
 * @throws Error if the type is empty or not a string.
 *
 * @returns The new action.
 */
export function createAction<A extends Action>(
  type: A["type"],
  input?: A["input"],
  attachments?: Action["attachments"],
  validator?: () => { parse(v: unknown): A["input"] },
  scope: OperationScope = "global",
): A {
  if (!type) {
    throw new Error("Empty action type");
  }

  if (typeof type !== "string") {
    throw new Error(`Invalid action type: ${JSON.stringify(type)}`);
  }

  const action: Action = { type, input, scope };

  if (attachments) {
    action.attachments = attachments;
  }

  try {
    validator?.().parse(action.input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new InvalidActionInputZodError(error.issues);
    } else {
      throw new InvalidActionInputError(error);
    }
  }

  return action as A;
}

/**
 * Helper function to create a document model reducer.
 *
 * @remarks
 * This function creates a new reducer that wraps the provided `reducer` with
 * `documentReducer`, adding support for document actions:
 *   - `SET_NAME`
 *   - `UNDO`
 *   - `REDO`
 *   - `PRUNE`
 *
 * It also updates the document-related attributes on every operation.
 *
 * @param reducer - The custom reducer to wrap.
 * @param documentReducer - The document reducer to use.
 *
 * @returns The new reducer.
 */
export function createReducer<
  S = unknown,
  A extends Action = Action,
  L = unknown,
>(
  reducer: ImmutableStateReducer<S, A, L>,
  documentReducer = baseReducer,
): Reducer<S, A, L> {
  return (document, action, dispatch, options) => {
    return documentReducer(document, action, reducer, dispatch, options);
  };
}

export function createUnsafeReducer<
  S = unknown,
  A extends Action = Action,
  L = unknown,
>(
  reducer: ImmutableStateReducer<S, A, L>,
  documentReducer = mutableBaseReducer,
): Reducer<S, A, L> {
  return (document, action, dispatch, options) => {
    return documentReducer(document, action, reducer, dispatch, options);
  };
}

export const createExtendedState = <S, L>(
  initialState?: Partial<ExtendedState<PartialState<S>, PartialState<L>>>,
  createState?: CreateState<S, L>,
): ExtendedState<S, L> => {
  return {
    name: "",
    documentType: "",
    revision: {
      global: 0,
      local: 0,
    },
    created: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    attachments: {},
    ...initialState,
    state:
      createState?.(initialState?.state) ??
      ((initialState?.state ?? { global: {}, local: {} }) as State<S, L>),
  };
};

/**
 * Builds the initial document state from the provided data.
 *
 * @typeParam T - The type of the data.
 * @typeParam A - The type of the actions.
 *
 * @param initialState - The initial state of the document. The `data` property
 *   is required, but all other properties are optional.
 *
 * @returns The new document state.
 */
export const createDocument = <S, A extends Action, L = unknown>(
  initialState?: Partial<ExtendedState<PartialState<S>, PartialState<L>>>,
  createState?: (
    state?: Partial<State<PartialState<S>, PartialState<L>>>,
  ) => State<S, L>,
): Document<S, A, L> => {
  const state: ExtendedState<S, L> = createExtendedState(
    initialState,
    createState,
  );
  return {
    ...state,
    initialState: state,
    operations: { global: [], local: [] },
    clipboard: [],
  };
};

// export const stringifyJson = configureStringify

export const hashDocument = (
  document: Pick<Document, "state">,
  scope: OperationScope = "global",
) => {
  return hash(stringifyJson(document.state[scope] || ""));
};

export const hashKey = (date?: Date, randomLimit = 1000) => {
  const random = Math.random() * randomLimit;
  return hash(`${(date ?? new Date()).toISOString()}${random}`);
};

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
export function mapSkippedOperations<A extends Action>(
  operations: Operation<BaseAction | A>[],
  skippedHeadOperations?: number,
): MappedOperation<A>[] {
  const ops = [...operations];

  let skipped = skippedHeadOperations || 0;
  let latestOpIndex = ops.length > 0 ? ops[ops.length - 1].index : 0;

  const scopeOpsWithIgnore = [] as MappedOperation<A>[];

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

// Flattens the operations from all scopes into
// a single array and sorts them by timestamp
export function sortOperations<A extends Action>(
  operations: DocumentOperations<A>,
) {
  return Object.values(operations)
    .flatMap((array) => array)
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
}

// Flattens the mapped operations (with ignore flag) from all scopes into
// a single array and sorts them by timestamp
export function sortMappedOperations<A extends Action>(
  operations: DocumentOperationsIgnoreMap<A>,
) {
  return Object.values(operations)
    .flatMap((array) => array)
    .sort(
      (a, b) =>
        new Date(a.operation.timestamp).getTime() -
        new Date(b.operation.timestamp).getTime(),
    );
}

// gets the last modified timestamp of a document from
// it's operations, falling back to the initial state
export function getDocumentLastModified(document: Document) {
  const sortedOperations = sortOperations(document.operations);
  const timestamp =
    sortedOperations.at(-1)?.timestamp || document.initialState.lastModified;
  return timestamp;
}

// Runs the operations on the initial data using the
// provided reducer, wrapped with the document reducer.
// This rebuilds the document according to the provided actions.
export function replayOperations<T, A extends Action, L>(
  initialState: ExtendedState<T, L>,
  clearedOperations: DocumentOperations<A>,
  reducer: ImmutableStateReducer<T, A, L>,
  dispatch?: SignalDispatch,
  header?: DocumentHeader,
  documentReducer = baseReducer,
  skipHeaderOperations: SkipHeaderOperations = {},
  options?: ReducerOptions,
): Document<T, A, L> {
  // wraps the provided custom reducer with the
  // base document reducer
  const wrappedReducer = createReducer(reducer, documentReducer);

  return replayDocument(
    initialState,
    clearedOperations,
    wrappedReducer,
    dispatch,
    header,
    skipHeaderOperations,
    options,
  );
}

export type SkipHeaderOperations = Partial<Record<OperationScope, number>>;

export type ReplayDocumentOptions = {
  // if false then reuses the hash from the operations
  // and only checks the final hash of each scope
  checkHashes?: boolean;
  // if true then looks for the latest operation with
  // a resulting state and uses it as a starting point
  reuseOperationResultingState?: boolean;
  // Optional parser for the operation resulting state, uses JSON.parse by default
  operationResultingStateParser?: (state: unknown) => object;
};

// Runs the operations on the initial data using the
// provided document reducer.
// This rebuilds the document according to the provided actions.
export function replayDocument<T, A extends Action, L>(
  initialState: ExtendedState<T, L>,
  operations: DocumentOperations<A>,
  reducer: Reducer<T, A, L>,
  dispatch?: SignalDispatch,
  header?: DocumentHeader,
  skipHeaderOperations: SkipHeaderOperations = {},
  options?: ReplayDocumentOptions,
): Document<T, A, L> {
  const {
    checkHashes = true,
    reuseOperationResultingState,
    operationResultingStateParser = parseResultingState,
  } = options || {};

  let documentState = initialState;
  const operationsToReplay = [] as Operation<A | BaseAction>[];
  const initialOperations: DocumentOperations<A> = {
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
      try {
        const scopeState = operationResultingStateParser(
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-type-assertion
          opWithState.resultingState!,
        );
        documentState = {
          ...documentState,
          state: {
            ...documentState.state,
            // TODO how to deal with attachments?
            [scope]: scopeState,
          },
        };
        initialOperations[scope as keyof DocumentOperations<A>].push(
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
  const document = createDocument<T, A, L>(documentState);
  document.initialState = initialState;
  document.operations = initialOperations;

  let result = document;
  // if there are operations left without resulting state
  // then replays them
  if (operationsToReplay.length) {
    result = operationsToReplay.reduce((document, operation) => {
      const doc = reducer(document, operation, dispatch, {
        skip: operation.skip,
        ignoreSkipOperations: true,
        reuseHash: !checkHashes,
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
        result = updateHeader(result, lastOperation);
      }
    }
  }

  // if hash generation was skipped then checks if the hash
  // of each scope matches the hash of last operation
  if (!checkHashes) {
    for (const scope of Object.keys(result.state)) {
      for (let i = operationsToReplay.length - 1; i >= 0; i--) {
        const operation = operationsToReplay[i];

        if (operation.scope !== scope) {
          continue;
        }
        if (operation.hash !== hashDocument(result, scope)) {
          throw new Error(`Hash mismatch for scope ${scope}`);
        } else {
          break;
        }
      }
    }
  }

  // reuses operation timestamp if provided
  const resultOperations: DocumentOperations<A> = Object.keys(
    result.operations,
  ).reduce(
    (acc, key) => {
      const scope = key as keyof DocumentOperations<A>;
      return {
        ...acc,
        [scope]: [
          ...result.operations[scope].map((operation, index) => {
            return {
              ...operation,
              timestamp:
                operations[scope][index]?.timestamp ?? operation.timestamp,
            };
          }),
        ],
      };
    },
    { global: [], local: [] },
  );
  // gets the last modified timestamp from the latest operation
  const lastModified = Object.values(resultOperations).reduce((acc, curr) => {
    const operation = curr.at(-1);
    if (operation && operation.timestamp > acc) {
      acc = operation.timestamp;
    }
    return acc;
  }, initialState.lastModified);

  return { ...result, operations: resultOperations, lastModified };
}

export function isSameDocument(documentA: Document, documentB: Document) {
  return stringifyJson(documentA) === stringifyJson(documentB);
}

export function parseResultingState(state: unknown) {
  const stateType = typeof state;
  if (stateType === "string") {
    return JSON.parse(state as string) as object;
  } else if (stateType === "object") {
    return state as object;
  } else {
    throw new Error(`Providing resulting state is of type: ${stateType}`);
  }
}

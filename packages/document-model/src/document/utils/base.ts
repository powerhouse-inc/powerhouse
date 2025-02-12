import {
  DocumentAction,
  LOAD_STATE,
  NOOP,
  PRUNE,
  REDO,
  SET_NAME,
  UNDO,
  UndoAction,
} from "@document/actions/types.js";
import {
  baseReducer,
  mutableBaseReducer,
  updateHeader,
} from "@document/reducer.js";
import { UndoRedoAction } from "@document/schema/types.js";
import { SignalDispatch } from "@document/signal.js";
import type {
  Action,
  BaseAction,
  BaseDocument,
  BaseState,
  CreateState,
  DocumentHeader,
  DocumentOperations,
  DocumentOperationsIgnoreMap,
  ExtendedState,
  ImmutableStateReducer,
  MappedOperation,
  MutableStateReducer,
  Operation,
  OperationScope,
  PartialState,
  Reducer,
  ReducerOptions,
  StateReducer,
} from "@document/types.js";
import stringifyJson from "safe-stable-stringify";
import { ZodError } from "zod";
import { sortOperations } from "./document-helpers.js";
import {
  InvalidActionInputError,
  InvalidActionInputZodError,
} from "./errors.js";
import { hash } from "./node.js";

export function isNoopOperation<
  TOp extends {
    type: string;
    skip: number;
    hash: string;
  },
>(op: Partial<TOp>): boolean {
  return (
    op.type === NOOP &&
    op.skip !== undefined &&
    op.skip > 0 &&
    op.hash !== undefined
  );
}

export function isUndoRedo(action: BaseAction): action is UndoRedoAction {
  return [UNDO, REDO].includes(action.type);
}

export function isUndo(action: BaseAction): action is UndoAction {
  return action.type === UNDO;
}

export function isDocumentAction(action: BaseAction): action is DocumentAction {
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
export function createAction<TAction extends BaseAction>(
  type: TAction["type"],
  input?: TAction["input"],
  attachments?: TAction["attachments"],
  validator?: () => { parse(v: unknown): TAction["input"] },
  scope: OperationScope = "global",
): TAction {
  if (!type) {
    throw new Error("Empty action type");
  }

  if (typeof type !== "string") {
    throw new Error(`Invalid action type: ${JSON.stringify(type)}`);
  }

  const action: BaseAction = { type, input, scope };

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

  return action as TAction;
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
  TGlobalState,
  TLocalState,
  TAllowedAction extends Action,
>(
  reducer: ImmutableStateReducer<TGlobalState, TLocalState, TAllowedAction>,
  documentReducer = baseReducer,
): Reducer<TGlobalState, TLocalState, TAllowedAction | Action> {
  return (document, action, dispatch, options) => {
    return documentReducer(document, action, reducer, dispatch, options);
  };
}

export function createUnsafeReducer<
  TGlobalState,
  TLocalState,
  TAllowedAction extends Action,
>(
  reducer: MutableStateReducer<TGlobalState, TLocalState, TAllowedAction>,
  documentReducer = mutableBaseReducer,
): Reducer<TGlobalState, TLocalState, TAllowedAction> {
  return (document, action, dispatch, options) => {
    return documentReducer(document, action, reducer, dispatch, options);
  };
}

export function baseCreateExtendedState<TGlobalState, TLocalState>(
  initialState?: Partial<
    ExtendedState<PartialState<TGlobalState>, PartialState<TLocalState>>
  >,
  createState?: CreateState<TGlobalState, TLocalState>,
): ExtendedState<TGlobalState, TLocalState> {
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
      ((initialState?.state ?? { global: {}, local: {} }) as BaseState<
        TGlobalState,
        TLocalState
      >),
  };
}

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
export function baseCreateDocument<TGlobalState, TLocalState>(
  initialState?: Partial<
    ExtendedState<PartialState<TGlobalState>, PartialState<TLocalState>>
  >,
  createState?: CreateState<TGlobalState, TLocalState>,
): BaseDocument<TGlobalState, TLocalState> {
  const state: ExtendedState<TGlobalState, TLocalState> =
    baseCreateExtendedState(initialState, createState);
  return {
    ...state,
    initialState: state,
    operations: { global: [], local: [] },
    clipboard: [],
  };
}

// export const stringifyJson = configureStringify

export function hashDocumentStateForScope(
  document: {
    state: {
      [key in OperationScope]: unknown;
    };
  },
  scope: OperationScope = "global",
) {
  return hash(stringifyJson(document.state[scope] || ""));
}

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
export function mapSkippedOperations<TGlobalState, TLocalState>(
  operations: Operation<TGlobalState, TLocalState>[],
  skippedHeadOperations?: number,
): MappedOperation<TGlobalState, TLocalState>[] {
  const ops = [...operations];

  let skipped = skippedHeadOperations || 0;
  let latestOpIndex = ops.length > 0 ? ops[ops.length - 1].index : 0;

  const scopeOpsWithIgnore: MappedOperation<TGlobalState, TLocalState>[] = [];

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
export function sortMappedOperations<TGlobalState, TLocalState>(
  operations: DocumentOperationsIgnoreMap<TGlobalState, TLocalState>,
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
export function getDocumentLastModified<TGlobalState, TLocalState>(
  document: BaseDocument<TGlobalState, TLocalState>,
) {
  const sortedOperations = sortOperations(
    Object.values(document.operations).flat(),
  );
  const timestamp =
    sortedOperations.at(-1)?.timestamp || document.initialState.lastModified;
  return timestamp;
}

// Runs the operations on the initial data using the
// provided reducer, wrapped with the document reducer.
// This rebuilds the document according to the provided actions.
export function replayOperations<
  TGlobalState,
  TLocalState,
  TAllowedAction extends Action,
>(
  initialState: ExtendedState<TGlobalState, TLocalState>,
  clearedOperations: DocumentOperations<TGlobalState, TLocalState>,
  reducer: ImmutableStateReducer<TGlobalState, TLocalState, TAllowedAction>,
  dispatch?: SignalDispatch,
  header?: DocumentHeader,
  documentReducer = baseReducer,
  skipHeaderOperations: SkipHeaderOperations = {},
  options?: ReducerOptions,
): BaseDocument<TGlobalState, TLocalState> {
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
  operationResultingStateParser?: <TGlobalState>(
    state: string | TGlobalState,
  ) => TGlobalState;
};

// Runs the operations on the initial data using the
// provided document reducer.
// This rebuilds the document according to the provided actions.
export function replayDocument<TGlobalState, TLocalState>(
  initialState: ExtendedState<TGlobalState, TLocalState>,
  operations: DocumentOperations<TGlobalState, TLocalState>,
  reducer: Reducer<TGlobalState, TLocalState, Action>,
  dispatch?: SignalDispatch,
  header?: DocumentHeader,
  skipHeaderOperations: SkipHeaderOperations = {},
  options?: ReplayDocumentOptions,
) {
  const {
    checkHashes = true,
    reuseOperationResultingState,
    operationResultingStateParser = parseResultingState,
  } = options || {};

  let documentState = initialState;
  const operationsToReplay: Operation<TGlobalState, TLocalState>[] = [];
  const initialOperations: DocumentOperations<TGlobalState, TLocalState> = {
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
          opWithState.resultingState,
        );
        documentState = {
          ...documentState,
          state: {
            ...documentState.state,
            // TODO how to deal with attachments?
            [scope]: scopeState,
          },
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
  const document = baseCreateDocument(documentState);
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
        if (operation.hash !== hashDocumentStateForScope(result, scope)) {
          throw new Error(`Hash mismatch for scope ${scope}`);
        } else {
          break;
        }
      }
    }
  }

  // reuses operation timestamp if provided
  const resultOperations: DocumentOperations<TGlobalState, TLocalState> =
    Object.keys(result.operations).reduce(
      (acc, key) => {
        const scope = key as keyof DocumentOperations<
          TGlobalState,
          TLocalState
        >;

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

export function parseResultingState<TGlobalState>(
  state: TGlobalState | string,
): TGlobalState {
  const stateType = typeof state;
  if (stateType === "string") {
    return JSON.parse(state as string) as TGlobalState;
  } else if (stateType === "object") {
    return state as TGlobalState;
  } else {
    throw new Error(`Providing resulting state is of type: ${stateType}`);
  }
}

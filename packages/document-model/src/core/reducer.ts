import { castDraft, create, unsafe } from "mutative";
import {
  actionFromAction,
  loadState,
  operationFromAction,
  operationFromOperation,
  type OperationContext,
} from "./actions.js";
import {
  diffOperations,
  garbageCollect,
  garbageCollectDocumentOperations,
  hashDocumentStateForScope,
  isDocumentAction,
  isUndo,
  isUndoRedo,
  parseResultingState,
  replayDocument,
  skipHeaderOperations,
  sortOperations,
  updateHeaderRevision,
} from "./documents.js";
import {
  loadStateOperation,
  redoOperation,
  setNameOperation,
  undoOperation,
  undoOperationV2,
} from "./operations.js";
import type {
  Action,
  DocumentOperations,
  Operation,
  PHBaseState,
  PHDocument,
  PHDocumentHeader,
} from "./ph-types.js";
import { DocumentActionSchema } from "./schemas.js";
import type {
  PruneActionInput,
  Reducer,
  ReducerOptions,
  ReplayDocumentOptions,
  SignalDispatch,
  SkipHeaderOperations,
  StateReducer,
} from "./types.js";

// This rebuilds the document according to the provided actions.
export function replayOperations<TState extends PHBaseState = PHBaseState>(
  initialState: TState,
  clearedOperations: DocumentOperations,
  stateReducer: StateReducer<TState>,
  header: PHDocumentHeader,
  dispatch?: SignalDispatch,
  documentReducer = baseReducer,
  skipHeaderOperations: SkipHeaderOperations = {},
  options?: ReplayDocumentOptions,
): PHDocument<TState> {
  // wraps the provided custom reducer with the
  // base document reducer
  const wrappedReducer = createReducer(stateReducer, documentReducer);

  return replayDocument<TState>(
    initialState,
    clearedOperations,
    wrappedReducer,
    header,
    dispatch,
    skipHeaderOperations,
    options,
  );
}

/**
 * Updates the operations history of the document based on the provided action.
 *
 * @param state The current state of the document.
 * @param action The action being applied to the document.
 * @param index The index of the operation to update.
 * @param skip The number of operations to skip before applying the action.
 * @param reuseLastOperationIndex Whether to reuse the last operation index (used when a an UNDO operation is performed after an existing one).
 * @param context The operation context for deterministic ID generation.
 * @returns The updated document state.
 */
function updateOperationsForAction<TDocument extends PHDocument>(
  document: TDocument,
  action: Action,
  reuseLastOperationIndex: boolean,
  skip: number,
  context: OperationContext,
): TDocument {
  // UNDO, REDO and PRUNE are meta operations
  // that alter the operations history themselves
  if (["UNDO", "REDO", "PRUNE"].includes(action.type)) {
    return document;
  }

  const scope = action.scope;

  let operations: Operation[] = [];
  if (document.operations[scope]) {
    operations = document.operations[scope].slice();
  }

  const latestOperation = operations.sort((a, b) => a.index - b.index).at(-1);
  const lastOperationIndex = latestOperation?.index ?? -1;

  const index = reuseLastOperationIndex
    ? lastOperationIndex
    : lastOperationIndex + 1;

  const newOperation = operationFromAction(action, index, skip, context);
  operations.push(newOperation);

  // adds the action to the operations history with
  // the latest index and current timestamp
  return {
    ...document,
    operations: { ...document.operations, [scope]: operations },
  };
}

function updateOperationsForOperation<TDocument extends PHDocument>(
  document: TDocument,
  operation: Operation,
  reuseLastOperationIndex: boolean,
  skip: number,
  context: OperationContext,
): TDocument {
  const scope = operation.action.scope;
  const scopeOperations = document.operations[scope];
  const operations: Operation[] = scopeOperations
    ? scopeOperations.slice()
    : [];

  const latestOperation = operations.sort((a, b) => a.index - b.index).at(-1);
  const lastOperationIndex = latestOperation?.index ?? -1;

  const nextIndex = reuseLastOperationIndex
    ? lastOperationIndex
    : lastOperationIndex + 1;

  if (operation.index - skip > nextIndex) {
    throw new Error(
      `Missing operations: expected ${nextIndex} with skip 0 or equivalent, got index ${operation.index} with skip ${skip}`,
    );
  }

  const newOperation = operationFromOperation(
    operation,
    operation.index,
    skip,
    context,
  );
  operations.push(newOperation);

  // adds the action to the operations history with
  // the latest index and current timestamp
  return {
    ...document,
    operations: { ...document.operations, [scope]: operations },
  };
}

/**
 * Updates the document state based on the provided action.
 *
 * @param state The current state of the document.
 * @param action The action being applied to the document.
 * @param skip The number of operations to skip before applying the action.
 * @param reuseLastOperationIndex Whether to reuse the last operation index (used when a an UNDO operation is performed after an existing one).
 * @param context The operation context for deterministic ID generation.
 * @returns The updated document state.
 */
export function updateDocument<TDocument extends PHDocument>(
  document: TDocument,
  action: Action,
  reuseLastOperationIndex: boolean,
  skip: number,
  context: OperationContext,
  operation?: Operation,
): TDocument {
  let newDocument: TDocument;
  if (operation) {
    // operation
    newDocument = updateOperationsForOperation(
      document,
      operation,
      reuseLastOperationIndex,
      skip,
      context,
    ) as TDocument;
  } else {
    // action
    newDocument = updateOperationsForAction(
      document,
      action,
      reuseLastOperationIndex,
      skip,
      context,
    ) as TDocument;
  }

  newDocument = updateHeaderRevision(newDocument, action.scope) as TDocument;
  return newDocument;
}

/**
 * The base document reducer function that wraps a custom reducer function.
 *
 * @param state The current state of the document.
 * @param action The action being applied to the document.
 * @param wrappedReducer The custom reducer function being wrapped by the base reducer.
 * @returns The updated document state.
 */
function _baseReducer<TState extends PHBaseState = PHBaseState>(
  document: PHDocument<TState>,
  action: Action,
  wrappedReducer: StateReducer<TState>,
): PHDocument<TState> {
  // throws if action is not valid base action
  const parsedAction = DocumentActionSchema().parse(action);

  switch (parsedAction.type) {
    // TODO: This needs to be changed to a HEADER scope action if it's changing the header.
    case "SET_NAME":
      return setNameOperation(document, parsedAction.input);
    case "PRUNE":
      return pruneOperation(document, parsedAction.input, wrappedReducer);
    case "LOAD_STATE":
      return loadStateOperation(document, parsedAction.input);
    default:
      return document;
  }
}

/**
 * Processes an UNDO or REDO action.
 *
 * @param document The current state of the document.
 * @param action The action being applied to the document.
 * @param skip The number of operations to skip before applying the action.
 * @returns The updated document, calculated skip value and transformed action (if applied).
 */
export function processUndoRedo<TState extends PHBaseState = PHBaseState>(
  document: PHDocument<TState>,
  action: Action,
  skip: number,
  protocolVersion = 1,
): {
  document: PHDocument<TState>;
  action: Action;
  skip: number;
  reuseLastOperationIndex: boolean;
} {
  switch (action.type) {
    case "UNDO":
      if (protocolVersion >= 2) {
        return undoOperationV2(document, action, skip);
      }
      return undoOperation(document, action, skip);
    case "REDO":
      return redoOperation(document, action, skip);
    default:
      return { document, action, skip, reuseLastOperationIndex: false };
  }
}

function processSkipOperation<TState extends PHBaseState = PHBaseState>(
  document: PHDocument<TState>,
  action: Action,
  customReducer: StateReducer<TState>,
  skipValue: number,
  reuseOperationResultingState = false,
  resultingStateParser = parseResultingState,
): PHDocument<TState> {
  const scope = action.scope;

  const scopeOperations = document.operations[scope];
  if (!scopeOperations) {
    return document;
  }

  const latestOperation = scopeOperations.at(-1);

  if (!latestOperation) return document;

  const documentOperations = garbageCollectDocumentOperations({
    ...document.operations,
    [scope]: skipHeaderOperations(scopeOperations, latestOperation),
  });

  let scopeState: unknown = undefined;
  const documentScopeOps = documentOperations[scope];
  const lastRemainingOperation = documentScopeOps?.at(-1);

  // if the last operation has the resulting state and
  // reuseOperationResultingState is true then reuses it
  // instead of replaying the operations from the beginning
  if (reuseOperationResultingState && lastRemainingOperation?.resultingState) {
    scopeState = resultingStateParser(lastRemainingOperation.resultingState);
  } else {
    const { state } = replayOperations(
      document.initialState,
      documentOperations,
      customReducer,
      document.header,
      undefined,
      undefined,
      undefined,
      {
        reuseOperationResultingState,
        operationResultingStateParser: resultingStateParser,
      },
    );

    scopeState = (state as Record<string, unknown>)[scope];
  }

  return {
    ...document,
    state: {
      ...document.state,
      [scope]: scopeState,
    },
    operations: garbageCollectDocumentOperations({
      ...document.operations,
    }),
  };
}

function processUndoOperation<TState extends PHBaseState = PHBaseState>(
  document: PHDocument<TState>,
  scope: string,
  customReducer: StateReducer<TState>,
  reuseOperationResultingState = false,
  resultingStateParser = parseResultingState,
): PHDocument<TState> {
  const scopeOperations = document.operations[scope];
  if (!scopeOperations) {
    return document;
  }
  const operations = [...scopeOperations];
  const sortedOperations = sortOperations(operations);

  sortedOperations.pop();

  const documentOperations = garbageCollectDocumentOperations({
    ...document.operations,
  });

  const documentScopeOps = documentOperations[scope];
  if (!documentScopeOps) {
    return document;
  }
  const clearedOperations = [...documentScopeOps];
  const diff = diffOperations(
    garbageCollect(sortedOperations),
    clearedOperations,
  );

  const doc = replayOperations(
    document.initialState,
    documentOperations,
    customReducer,
    document.header,
    undefined,
    undefined,
    undefined,
    {
      reuseOperationResultingState,
      operationResultingStateParser: resultingStateParser,
    },
  );

  const clipboard = sortOperations(
    [...document.clipboard, ...diff].filter((op) => op.action.type !== "NOOP"),
  ).reverse();

  return { ...doc, clipboard } as PHDocument<TState>;
}

/**
 * Base document reducer that wraps a custom document reducer and handles
 * document-level actions such as undo, redo, prune, and set name.
 *
 * @template TGlobalState - The type of the state of the custom reducer.
 * @template TAction - The type of the actions of the custom reducer.
 * @param state - The current state of the document.
 * @param action - The action object to apply to the state.
 * @param customReducer - The custom reducer that implements the application logic
 * specific to the document's state.
 * @returns The new state of the document.
 */
export function baseReducer<TState extends PHBaseState = PHBaseState>(
  document: PHDocument<TState>,
  action: Action,
  customReducer: StateReducer<TState>,
  dispatch?: SignalDispatch,
  options: ReducerOptions = {},
): PHDocument<TState> {
  const {
    skip,
    ignoreSkipOperations = false,
    reuseOperationResultingState = false,
    operationResultingStateParser,
    pruneOnSkip = true,
    branch = "main",
  } = options;

  let _action: Action = actionFromAction(action);

  let skipValue = skip ?? options.replayOptions?.operation.skip ?? 0;
  let newDocument = {
    ...document,
  };
  let reuseLastOperationIndex = false;

  const shouldProcessSkipOperation = !ignoreSkipOperations && skipValue > 0;

  if (isUndoRedo(_action)) {
    const {
      skip: calculatedSkip,
      action: transformedAction,
      document: processedDocument,
      reuseLastOperationIndex: reuseIndex,
    } = processUndoRedo(
      document,
      _action,
      skipValue,
      options.protocolVersion ?? 1,
    );

    _action = transformedAction;
    skipValue = calculatedSkip;
    newDocument = processedDocument;
    reuseLastOperationIndex = reuseIndex;
  } else {
    newDocument = {
      ...newDocument,
      clipboard: [],
    };
  }

  // if the action is one the base document actions (SET_NAME, UNDO, REDO, PRUNE)
  // then runs the base reducer first
  if (isDocumentAction(_action)) {
    newDocument = _baseReducer(newDocument, _action, customReducer);
  }

  // updates the document revision number, last modified date
  // and operation history
  const operationContext: OperationContext = {
    documentId: document.header.id,
    scope: _action.scope,
    branch,
  };
  newDocument = updateDocument(
    newDocument,
    _action,
    reuseLastOperationIndex,
    skipValue,
    operationContext,
    options.replayOptions?.operation,
  );

  // Only process undo for actual UNDO actions, not for NOOP operations
  // NOOP operations with skip > 0 will have their clipboard populated server-side
  if (isUndo(action)) {
    console.log(">>>", newDocument.operations);
    const result = processUndoOperation(
      newDocument,
      action.scope,
      customReducer,
    );
    return result;
  }

  if (shouldProcessSkipOperation) {
    const processed = processSkipOperation(
      newDocument,
      _action,
      customReducer,
      skipValue,
      reuseOperationResultingState,
      operationResultingStateParser,
    );

    // Preserve operations when pruneOnSkip is false
    if (!pruneOnSkip) {
      newDocument = {
        ...processed,
        operations: newDocument.operations,
      };
    } else {
      newDocument = processed;
    }
  }

  // wraps the custom reducer with Mutative to avoid
  // mutation bugs and allow writing reducers with
  // mutating code
  newDocument = create(newDocument, (draft) => {
    // the reducer runs on a immutable version of
    // provided state
    try {
      const newState = customReducer(draft.state, _action, dispatch);

      // const clipboardValue = isUndoRedo(action) ? [...clipboard] : [];

      // if the reducer creates a new state object instead
      // of mutating the draft then returns the new state
      if (newState) {
        // Object.assign(draft.state, newState);
        unsafe(() => {
          // casts new state as draft to comply with typescript
          draft.state = castDraft(newState);
          // clipboard: [...clipboardValue],
        });
      } else {
        // unsafe(() => {
        // draft.clipboard = castDraft([...clipboardValue]);
        // });
      }
    } catch (error) {
      // if the reducer throws an error then we should keep the previous state (before replayOperations)
      // and remove skip number from action/operation
      const actionScopeOps = newDocument.operations[_action.scope];
      if (!actionScopeOps) {
        throw new Error(`No operations found for scope: ${_action.scope}`);
      }
      const lastOperationIndex = actionScopeOps.length - 1;
      const draftScopeOps = draft.operations[_action.scope];
      if (!draftScopeOps) {
        throw new Error(
          `No operations found in draft for scope: ${_action.scope}`,
        );
      }
      draftScopeOps[lastOperationIndex].error = (error as Error).message;

      draftScopeOps[lastOperationIndex].skip = 0;

      if (shouldProcessSkipOperation) {
        draft.state = castDraft({
          ...document.state,
        });
        const documentScopeOps = document.operations[_action.scope];
        if (!documentScopeOps) {
          throw new Error(`No operations found for scope: ${_action.scope}`);
        }
        draft.operations = castDraft({
          ...document.operations,
          [_action.scope]: [
            ...documentScopeOps,
            {
              ...draftScopeOps[lastOperationIndex],
            },
          ],
        });
      }
    }
  });
  // updates the document history
  // meta operations are not added to the operations history
  if (["UNDO", "REDO", "PRUNE"].includes(_action.type)) {
    return newDocument;
  }

  // if reuseHash is true, checks if the action has
  // an hash and uses it instead of generating it
  const scope = _action.scope || "global";
  let hash = hashDocumentStateForScope(newDocument, scope);
  if (
    options.replayOptions?.operation.hash &&
    options.replayOptions.operation.hash !== ""
  ) {
    hash = options.replayOptions.operation.hash;
  }

  // updates the last operation with the hash of the resulting state
  const scopeOperations = newDocument.operations[scope];
  const lastOperation = scopeOperations?.at(-1);
  if (lastOperation) {
    lastOperation.hash = hash;

    if (reuseOperationResultingState) {
      lastOperation.resultingState = JSON.stringify(
        (newDocument.state as Record<string, unknown>)[scope],
      );
    }
  }

  return newDocument;
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
export function createReducer<TState extends PHBaseState = PHBaseState>(
  stateReducer: StateReducer<TState>,
  documentReducer = baseReducer,
): Reducer<TState> {
  const reducer: Reducer<TState> = (
    document: PHDocument<TState>,
    action: Action,
    dispatch?: SignalDispatch,
    options?: ReducerOptions,
  ) => {
    return documentReducer(document, action, stateReducer, dispatch, options);
  };
  return reducer;
}

export function pruneOperation<TState extends PHBaseState = PHBaseState>(
  document: PHDocument<TState>,
  input: PruneActionInput,
  wrappedReducer: StateReducer<TState>,
): PHDocument<TState> {
  const operations = document.operations.global;
  if (!operations) {
    throw new Error("No global operations found");
  }

  let { start, end } = input;
  start = start || 0;
  end = end || operations.length;

  const actionsToPrune = operations.slice(start, end);
  const actionsToKeepStart = operations.slice(0, start);
  const actionsToKeepEnd = operations.slice(end);

  // runs all operations from the initial state to
  // the end of prune to get name and data
  const newDocument = replayOperations(
    document.initialState,
    {
      ...document.operations,
      global: actionsToKeepStart.concat(actionsToPrune),
    },
    wrappedReducer,
    document.header,
  );

  const newState = newDocument.state;
  const name = newDocument.header.name;

  // the new operation has the index of the first pruned operation
  const loadStateIndex = actionsToKeepStart.length;

  // if and operation is pruned then reuses the timestamp of the last operation
  // if not then assigns the timestamp of the following unpruned operation
  const loadStateTimestamp = actionsToKeepStart.length
    ? actionsToKeepStart[actionsToKeepStart.length - 1].timestampUtcMs
    : actionsToKeepEnd.length
      ? actionsToKeepEnd[0].timestampUtcMs
      : new Date().toISOString();

  const action = loadState({ name, ...newState }, actionsToPrune.length);

  // replaces pruned operations with LOAD_STATE
  return replayOperations(
    document.initialState,
    {
      ...document.operations,
      global: [
        ...actionsToKeepStart,
        {
          skip: 0,
          ...action,
          action,
          timestampUtcMs: loadStateTimestamp,
          index: loadStateIndex,
          hash: hashDocumentStateForScope({ state: newState }, "global"),
        },
        ...actionsToKeepEnd
          // updates the index for all the following operations
          .map((action, index) => ({
            ...action,
            index: loadStateIndex + index + 1,
          })),
      ],
    },
    wrappedReducer,
    document.header,
  );
}

import { create, castDraft, Draft, unsafe } from "mutative";
import {
  loadStateOperation,
  pruneOperation,
  redoOperation,
  setNameOperation,
  undoOperation,
} from "./actions";
import {
  BaseAction,
  LOAD_STATE,
  PRUNE,
  REDO,
  SET_NAME,
  UNDO,
} from "./actions/types";
import { UndoRedoAction, z } from "./schema";
import {
  Action,
  Document,
  ImmutableStateReducer,
  Operation,
  OperationScope,
  ReducerOptions,
  State,
} from "./types";
import {
  isBaseAction,
  hashDocument,
  replayOperations,
  isUndoRedo,
  isUndo,
  getDocumentLastModified,
  parseResultingState,
} from "./utils/base";
import { SignalDispatch } from "./signal";
import * as documentHelpers from "./utils/document-helpers";
import { generateId } from "./utils";

/**
 * Gets the next revision number based on the provided action.
 *
 * @param state The current state of the document.
 * @param action The action being applied to the document.
 * @returns The next revision number.
 */
function getNextRevision(
  document: Document,
  action: Action | Operation,
): number {
  let latestOperation: Operation | undefined;

  if ("index" in action) {
    latestOperation = { ...action };
  } else {
    latestOperation = document.operations[action.scope].at(-1);
  }

  return (latestOperation?.index ?? -1) + 1;
}

/**
 * Updates the document header with the latest revision number and
 * date of last modification.
 *
 * @param state The current state of the document.
 * @param action The action being applied to the document.
 * @returns The updated document state.
 */
export function updateHeader<T extends Document>(
  document: T,
  action: Action,
): T {
  return {
    ...document,
    revision: {
      ...document.revision,
      [action.scope]: getNextRevision(document, action),
    },
    lastModified: getDocumentLastModified(document),
  };
}

/**
 * Updates the operations history of the document based on the provided action.
 *
 * @param state The current state of the document.
 * @param action The action being applied to the document.
 * @param skip The number of operations to skip before applying the action.
 * @param reuseLastOperationIndex Whether to reuse the last operation index (used when a an UNDO operation is performed after an existing one).
 * @returns The updated document state.
 */
function updateOperations<T extends Document>(
  document: T,
  action: Action | Operation,
  skip = 0,
  reuseLastOperationIndex = false,
): T {
  // UNDO, REDO and PRUNE are meta operations
  // that alter the operations history themselves
  if ([UNDO, REDO, PRUNE].includes(action.type)) {
    return document;
  }

  const { scope } = action;
  const operations = document.operations[scope].slice();
  let operationId: string | undefined;

  const latestOperation = operations.at(-1);
  const lastOperationIndex = latestOperation?.index ?? -1;

  let nextIndex = reuseLastOperationIndex
    ? lastOperationIndex
    : lastOperationIndex + 1;

  let timestamp = new Date().toISOString();

  if ("index" in action) {
    if (action.index - skip > nextIndex) {
      throw new Error(
        `Missing operations: expected ${nextIndex} with skip 0 or equivalent, got index ${action.index} with skip ${skip}`,
      );
    }

    nextIndex = action.index;
    operationId = action.id;

    timestamp = action.timestamp;
  } else {
    operationId = "id" in action ? (action.id as string) : generateId();
  }

  operations.push({
    ...action,
    id: operationId,
    index: nextIndex,
    timestamp,
    hash: "",
    scope,
    skip,
    error: undefined,
  });

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
 * @returns The updated document state.
 */
export function updateDocument<T extends Document>(
  document: T,
  action: Action,
  skip = 0,
  reuseLastOperationIndex = false,
) {
  let newDocument = updateOperations(
    document,
    action,
    skip,
    reuseLastOperationIndex,
  );
  newDocument = updateHeader(newDocument, action);
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
function _baseReducer<T, A extends Action, L>(
  document: Document<T, A, L>,
  action: BaseAction,
  wrappedReducer: ImmutableStateReducer<T, A, L>,
): Document<T, A, L> {
  // throws if action is not valid base action
  z.BaseActionSchema().parse(action);

  switch (action.type) {
    case SET_NAME:
      return setNameOperation(document, action.input);
    case PRUNE:
      return pruneOperation(document, action, wrappedReducer);
    case LOAD_STATE:
      return loadStateOperation(document, action.input.state);
    default:
      return document;
  }
}

type UndoRedoProcessResult<T, A extends Action, L> = {
  document: Document<T, A, L>;
  action: A | BaseAction;
  skip: number;
  reuseLastOperationIndex: boolean;
};

/**
 * Processes an UNDO or REDO action.
 *
 * @param document The current state of the document.
 * @param action The action being applied to the document.
 * @param skip The number of operations to skip before applying the action.
 * @returns The updated document, calculated skip value and transformed action (if apply).
 */
export function processUndoRedo<T, A extends Action, L>(
  document: Document<T, A, L>,
  action: UndoRedoAction,
  skip: number,
): UndoRedoProcessResult<T, A, L> {
  switch (action.type) {
    case UNDO:
      return undoOperation(document, action, skip);
    case REDO:
      return redoOperation(document, action, skip);
    default:
      return { document, action, skip, reuseLastOperationIndex: false };
  }
}

/**
 * Processes a skip operation on a document.
 *
 * @template T - The type of the document state.
 * @template A - The type of the document actions.
 * @template L - The type of the document labels.
 * @param {Document<T, A, L>} document - The document to process the skip operation on.
 * @param {A | BaseAction | Operation} action - The action or operation to process.
 * @param {ImmutableStateReducer<T, A, L>} customReducer - The custom reducer function for the document state.
 * @param {number} skipValue - The value to skip.
 * @returns {Document<T, A, L>} - The updated document after processing the skip operation.
 */
function processSkipOperation<
  T,
  A extends Action,
  L,
  D extends Document<T, A, L>,
>(
  document: D,
  action: A | BaseAction | Operation,
  customReducer: ImmutableStateReducer<T, A, L>,
  skipValue: number,
  reuseOperationResultingState = false,
  resultingStateParser = parseResultingState,
): D {
  const scope = action.scope;

  const latestOperation = document.operations[scope].at(-1);

  if (!latestOperation) return document;

  const documentOperations = documentHelpers.garbageCollectDocumentOperations({
    ...document.operations,
    [scope]: documentHelpers.skipHeaderOperations(
      document.operations[scope],
      latestOperation,
    ),
  });

  let scopeState: T | L | undefined = undefined;
  const lastRemainingOperation = documentOperations[scope].at(-1);

  // if the last operation has the resulting state and
  // reuseOperationResultingState is true then reuses it
  // instead of replaying the operations from the beginning
  if (reuseOperationResultingState && lastRemainingOperation?.resultingState) {
    scopeState = resultingStateParser(lastRemainingOperation.resultingState) as
      | T
      | L;
  } else {
    const { state } = replayOperations(
      document.initialState,
      documentOperations,
      customReducer,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        reuseHash: true,
        reuseOperationResultingState,
        operationResultingStateParser: resultingStateParser,
      },
    );
    scopeState = state[scope];
  }

  return {
    ...document,
    state: {
      ...document.state,
      [scope]: scopeState,
    },
    operations: documentHelpers.garbageCollectDocumentOperations({
      ...document.operations,
    }),
  };
}

function processUndoOperation<
  T,
  A extends Action,
  L,
  D extends Document<T, A, L>,
>(
  document: D,
  scope: OperationScope,
  customReducer: ImmutableStateReducer<T, A, L>,
  reuseOperationResultingState = false,
  resultingStateParser = parseResultingState,
): Document<T, A, L> {
  const operations = [...document.operations[scope]];
  const sortedOperations = documentHelpers.sortOperations(operations);

  sortedOperations.pop();

  const documentOperations = documentHelpers.garbageCollectDocumentOperations({
    ...document.operations,
  });

  const clearedOperations = [...documentOperations[scope]];
  const diff = documentHelpers.diffOperations(
    documentHelpers.garbageCollect(sortedOperations),
    clearedOperations,
  );

  const doc = replayOperations(
    document.initialState,
    documentOperations,
    customReducer,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      reuseHash: true,
      reuseOperationResultingState,
      operationResultingStateParser: resultingStateParser,
    },
  );

  const clipboard = documentHelpers
    .sortOperations(
      [...document.clipboard, ...diff].filter((op) => op.type !== "NOOP"),
    )
    .reverse();

  return { ...doc, clipboard };
}

/**
 * Base document reducer that wraps a custom document reducer and handles
 * document-level actions such as undo, redo, prune, and set name.
 *
 * @template T - The type of the state of the custom reducer.
 * @template A - The type of the actions of the custom reducer.
 * @param state - The current state of the document.
 * @param action - The action object to apply to the state.
 * @param customReducer - The custom reducer that implements the application logic
 * specific to the document's state.
 * @returns The new state of the document.
 */
export function baseReducer<T, A extends Action, L>(
  document: Document<T, A, L>,
  action: A | BaseAction | Operation,
  customReducer: ImmutableStateReducer<T, A, L>,
  dispatch?: SignalDispatch,
  options: ReducerOptions = {},
) {
  const {
    skip,
    ignoreSkipOperations = false,
    reuseHash = false,
    reuseOperationResultingState = false,
    operationResultingStateParser,
  } = options;

  let _action = { ...action };
  let skipValue = skip || 0;
  let newDocument: Document<T, A, L> = { ...document };
  let reuseLastOperationIndex = false;

  const shouldProcessSkipOperation =
    !ignoreSkipOperations &&
    (skipValue > 0 || ("index" in _action && _action.skip > 0));

  if (isUndoRedo(_action)) {
    const {
      skip: calculatedSkip,
      action: transformedAction,
      document: processedDocument,
      reuseLastOperationIndex: reuseIndex,
    } = processUndoRedo(document, _action, skipValue);

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
  if (isBaseAction(_action)) {
    newDocument = _baseReducer(newDocument, _action, customReducer);
  }

  // updates the document revision number, last modified date
  // and operation history
  newDocument = updateDocument(
    newDocument,
    _action,
    skipValue,
    reuseLastOperationIndex,
  );

  const isUndoAction = isUndo(action);

  if (isUndoAction) {
    const result = processUndoOperation(
      newDocument,
      action.scope,
      customReducer,
    );

    return result;
  }

  if (shouldProcessSkipOperation) {
    newDocument = processSkipOperation(
      newDocument,
      _action,
      customReducer,
      skipValue,
      reuseOperationResultingState,
      operationResultingStateParser,
    );
  }

  // wraps the custom reducer with Mutative to avoid
  // mutation bugs and allow writing reducers with
  // mutating code
  newDocument = create(newDocument, (draft) => {
    // the reducer runs on a immutable version of
    // provided state
    try {
      const newState = customReducer(draft.state, _action as A, dispatch);

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
      const lastOperationIndex =
        newDocument.operations[_action.scope].length - 1;
      draft.operations[_action.scope][lastOperationIndex].error = (
        error as Error
      ).message;

      draft.operations[_action.scope][lastOperationIndex].skip = 0;

      if (shouldProcessSkipOperation) {
        draft.state = castDraft<State<T, L>>({ ...document.state });
        draft.operations = castDraft({
          ...document.operations,
          [_action.scope]: [
            ...document.operations[_action.scope],
            {
              ...draft.operations[_action.scope][lastOperationIndex],
            },
          ],
        });
      }
    }
  });
  // updates the document history
  // meta operations are not added to the operations history
  if ([UNDO, REDO, PRUNE].includes(_action.type)) {
    return newDocument;
  }

  // if reuseHash is true, checks if the action has
  // an hash and uses it instead of generating it
  const scope = _action.scope || "global";
  const hash =
    reuseHash && Object.prototype.hasOwnProperty.call(_action, "hash")
      ? (_action as Operation).hash
      : hashDocument(newDocument, scope);

  // updates the last operation with the hash of the resulting state
  const lastOperation = newDocument.operations[scope].at(-1);
  if (lastOperation) {
    lastOperation.hash = hash;

    if (reuseOperationResultingState) {
      lastOperation.resultingState = newDocument.state[scope];
    }

    // if the action has attachments then adds them to the document
    if (!isBaseAction(_action) && _action.attachments) {
      _action.attachments.forEach((attachment) => {
        const { hash, ...file } = attachment;
        newDocument.attachments[hash] = {
          ...file,
        };
      });
    }
  }

  return newDocument;
}

/**
 * Base document reducer that wraps a custom document reducer and handles
 * document-level actions such as undo, redo, prune, and set name.
 *
 * @template T - The type of the state of the custom reducer.
 * @template A - The type of the actions of the custom reducer.
 * @param state - The current state of the document.
 * @param action - The action object to apply to the state.
 * @param customReducer - The custom reducer that implements the application logic
 * specific to the document's state.
 * @returns The new state of the document.
 */
export function mutableBaseReducer<T, A extends Action, L>(
  document: Document<T, A, L>,
  action: A | BaseAction | Operation,
  customReducer: ImmutableStateReducer<T, A, L>,
  dispatch?: SignalDispatch,
  options: ReducerOptions = {},
) {
  const {
    skip,
    ignoreSkipOperations = false,
    reuseHash = false,
    reuseOperationResultingState = false,
    operationResultingStateParser,
  } = options;

  const _action = { ...action };
  const skipValue = skip || 0;
  let newDocument: Document<T, A, L> = { ...document };
  // let clipboard = [...document.clipboard];

  const shouldProcessSkipOperation =
    !ignoreSkipOperations &&
    (skipValue > 0 || ("index" in _action && _action.skip > 0));

  // if the action is one the base document actions (SET_NAME, UNDO, REDO, PRUNE)
  // then runs the base reducer first
  if (isBaseAction(_action)) {
    newDocument = _baseReducer(newDocument, _action, customReducer);
  }

  // updates the document revision number, last modified date
  // and operation history
  newDocument = updateDocument(newDocument, _action, skipValue);

  if (shouldProcessSkipOperation) {
    newDocument = processSkipOperation(
      newDocument,
      _action,
      customReducer,
      skipValue,
      reuseOperationResultingState,
      operationResultingStateParser,
    );
  }

  try {
    const newState = customReducer(
      newDocument.state as Draft<State<T, L>>,
      _action as A,
      dispatch,
    );
    if (newState) {
      newDocument.state = newState;
    }
  } catch (error) {
    // if the reducer throws an error then we should keep the previous state (before replayOperations)
    // and remove skip number from action/operation
    const lastOperationIndex = newDocument.operations[_action.scope].length - 1;
    newDocument.operations[_action.scope][lastOperationIndex].error = (
      error as Error
    ).message;
    newDocument.operations[_action.scope][lastOperationIndex].skip = 0;

    if (shouldProcessSkipOperation) {
      newDocument.state = { ...document.state };
      newDocument.operations = {
        ...document.operations,
        [_action.scope]: [
          ...document.operations[_action.scope],
          {
            ...newDocument.operations[_action.scope][lastOperationIndex],
          },
        ],
      };
    }
  }

  if ([UNDO, REDO, PRUNE].includes(_action.type)) {
    return newDocument;
  }

  // if reuseHash is true, checks if the action has
  // an hash and uses it instead of generating it
  const scope = _action.scope || "global";
  const hash =
    reuseHash && Object.prototype.hasOwnProperty.call(_action, "hash")
      ? (_action as Operation).hash
      : hashDocument(newDocument, scope);

  // updates the last operation with the hash of the resulting state
  const lastOperation = newDocument.operations[scope].at(-1);
  if (lastOperation) {
    lastOperation.hash = hash;

    if (reuseOperationResultingState) {
      lastOperation.resultingState = newDocument.state[scope];
    }

    // if the action has attachments then adds them to the document
    if (!isBaseAction(_action) && _action.attachments) {
      _action.attachments.forEach((attachment) => {
        const { hash, ...file } = attachment;
        newDocument.attachments[hash] = {
          ...file,
        };
      });
    }
  }
  return newDocument;
}

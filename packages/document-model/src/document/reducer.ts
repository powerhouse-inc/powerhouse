import { castDraft, create, unsafe } from "mutative";
import {
  loadStateOperation,
  pruneOperation,
  redoOperation,
  setNameOperation,
  undoOperation,
} from "./actions/operations.js";
import { LOAD_STATE, PRUNE, REDO, SET_NAME, UNDO } from "./actions/types.js";
import { type PHDocumentHeader } from "./ph-types.js";
import { DocumentActionSchema } from "./schema/zod.js";
import { type SignalDispatch } from "./signal.js";
import {
  type Action,
  type DefaultAction,
  type Operation,
  type PHDocument,
  type ReducerOptions,
  type StateReducer,
} from "./types.js";
import {
  getDocumentLastModified,
  hashDocumentStateForScope,
  isDocumentAction,
  isUndo,
  isUndoRedo,
  parseResultingState,
  replayOperations,
} from "./utils/base.js";
import { generateId } from "./utils/crypto.js";
import {
  diffOperations,
  garbageCollect,
  garbageCollectDocumentOperations,
  skipHeaderOperations,
  sortOperations,
} from "./utils/document-helpers.js";

/**
 * Gets the next revision number based on the provided scope.
 *
 * @param state The current state of the document.
 * @param scope The scope of the operation.
 * @returns The next revision number.
 */
function getNextRevision(document: PHDocument, scope: string) {
  const latestOperationIndex = document.operations[scope].at(-1)?.index ?? -1;

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

/**
 * Updates the operations history of the document based on the provided action.
 *
 * @param state The current state of the document.
 * @param actionOrOperation The action being applied to the document.
 * @param skip The number of operations to skip before applying the action.
 * @param reuseLastOperationIndex Whether to reuse the last operation index (used when a an UNDO operation is performed after an existing one).
 * @returns The updated document state.
 */
function updateOperations<TDocument extends PHDocument>(
  document: TDocument,
  actionOrOperation: Action | DefaultAction | Operation,
  skip = 0,
  reuseLastOperationIndex = false,
): TDocument {
  // UNDO, REDO and PRUNE are meta operations
  // that alter the operations history themselves
  if (
    "type" in actionOrOperation &&
    [UNDO, REDO, PRUNE].includes(actionOrOperation.type)
  ) {
    return document;
  }

  const { scope } = actionOrOperation;
  const operations: Operation[] = document.operations[scope].slice();
  let operationId: string | undefined;

  const latestOperation = operations.sort((a, b) => a.index - b.index).at(-1);
  const lastOperationIndex = latestOperation?.index ?? -1;

  let nextIndex = reuseLastOperationIndex
    ? lastOperationIndex
    : lastOperationIndex + 1;

  let timestamp = new Date().toISOString();

  if ("index" in actionOrOperation) {
    if (actionOrOperation.index - skip > nextIndex) {
      throw new Error(
        `Missing operations: expected ${nextIndex} with skip 0 or equivalent, got index ${actionOrOperation.index} with skip ${skip}`,
      );
    }

    nextIndex = actionOrOperation.index;
    operationId = actionOrOperation.id;

    timestamp = actionOrOperation.timestamp;
  } else {
    operationId =
      "id" in actionOrOperation
        ? (actionOrOperation.id as string)
        : generateId();
  }

  operations.push({
    ...actionOrOperation,
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
export function updateDocument<TDocument extends PHDocument>(
  document: TDocument,
  action: Action | Operation,
  skip = 0,
  reuseLastOperationIndex = false,
): TDocument {
  let newDocument = updateOperations(
    document,
    action,
    skip,
    reuseLastOperationIndex,
  );
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
function _baseReducer<TDocument extends PHDocument>(
  document: TDocument,
  action: Action | Operation | DefaultAction,
  wrappedReducer: StateReducer<TDocument>,
): TDocument {
  // throws if action is not valid base action
  const parsedAction = DocumentActionSchema().parse(action);

  switch (parsedAction.type) {
    case SET_NAME:
      return setNameOperation(document, parsedAction.input);
    case PRUNE:
      return pruneOperation(document, parsedAction.input, wrappedReducer);
    case LOAD_STATE:
      return loadStateOperation(document, parsedAction.input.state);
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
export function processUndoRedo<TDocument extends PHDocument>(
  document: TDocument,
  action: Action | Operation | DefaultAction,
  skip: number,
): {
  document: TDocument;
  action: Action | Operation;
  skip: number;
  reuseLastOperationIndex: boolean;
} {
  switch (action.type) {
    case UNDO:
      return undoOperation(document, action, skip);
    case REDO:
      return redoOperation(document, action, skip);
    default:
      return { document, action, skip, reuseLastOperationIndex: false };
  }
}

function processSkipOperation<TDocument extends PHDocument>(
  document: TDocument,
  action: Action | Operation,
  customReducer: StateReducer<TDocument>,
  skipValue: number,
  reuseOperationResultingState = false,
  resultingStateParser = parseResultingState,
): TDocument {
  const scope = action.scope;

  const latestOperation = document.operations[scope].at(-1);

  if (!latestOperation) return document;

  const documentOperations = garbageCollectDocumentOperations({
    ...document.operations,
    [scope]: skipHeaderOperations(document.operations[scope], latestOperation),
  });

  let scopeState: unknown = undefined;
  const lastRemainingOperation = documentOperations[scope].at(-1);

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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    scopeState = (state as any)[scope];
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

function processUndoOperation<TDocument extends PHDocument>(
  document: TDocument,
  scope: string,
  customReducer: StateReducer<TDocument>,
  reuseOperationResultingState = false,
  resultingStateParser = parseResultingState,
): TDocument {
  const operations = [...document.operations[scope]];
  const sortedOperations = sortOperations(operations);

  sortedOperations.pop();

  const documentOperations = garbageCollectDocumentOperations({
    ...document.operations,
  });

  const clearedOperations = [...documentOperations[scope]];
  const diff = diffOperations(
    garbageCollect(sortedOperations),
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

  const clipboard = sortOperations(
    [...document.clipboard, ...diff].filter((op) => op.type !== "NOOP"),
  ).reverse();

  return { ...doc, clipboard } as TDocument;
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
export function baseReducer<TDocument extends PHDocument>(
  document: TDocument,
  action: Action | Operation,
  customReducer: StateReducer<TDocument>,
  dispatch?: SignalDispatch,
  options: ReducerOptions = {},
): TDocument {
  const {
    skip,
    ignoreSkipOperations = false,
    reuseHash = false,
    reuseOperationResultingState = false,
    operationResultingStateParser,
  } = options;

  let _action = { ...action };
  let skipValue = skip || 0;
  let newDocument = {
    ...document,
  };
  let reuseLastOperationIndex = false;

  const shouldProcessSkipOperation =
    !ignoreSkipOperations &&
    (skipValue > 0 ||
      ("index" in _action &&
        "skip" in _action &&
        typeof _action.skip === "number" &&
        _action.skip > 0));

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
  if (isDocumentAction(_action)) {
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
      const lastOperationIndex =
        newDocument.operations[_action.scope].length - 1;
      draft.operations[_action.scope][lastOperationIndex].error = (
        error as Error
      ).message;

      draft.operations[_action.scope][lastOperationIndex].skip = 0;

      if (shouldProcessSkipOperation) {
        draft.state = castDraft({
          ...document.state,
        });
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
      : hashDocumentStateForScope(newDocument, scope);

  // updates the last operation with the hash of the resulting state
  const lastOperation = newDocument.operations[scope].at(-1);
  if (lastOperation) {
    lastOperation.hash = hash;

    if (reuseOperationResultingState) {
      lastOperation.resultingState = JSON.stringify(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (newDocument.state as any)[scope],
      );
    }

    // if the action has attachments then adds them to the document
    if (!isDocumentAction(_action) && _action.attachments) {
      _action.attachments.forEach((attachment) => {
        const { hash, ...file } = attachment;
        if (!newDocument.attachments) {
          newDocument.attachments = {};
        }
        newDocument.attachments[hash] = {
          ...file,
        };
      });
    }
  }

  return newDocument;
}

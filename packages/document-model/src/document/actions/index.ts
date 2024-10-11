import { castDraft, create } from "mutative";
import {
  Action,
  Document,
  ImmutableStateReducer,
  Operation,
  PruneAction,
  RedoAction,
  State,
  UndoAction,
  UndoRedoProcessResult,
} from "../types";
import { hashDocument, replayOperations } from "../utils/base";
import { loadState, noop } from "./creators";
import { documentHelpers } from "../utils";

// updates the name of the document
export function setNameOperation<T>(document: T, name: string): T {
  return { ...document, name };
}

export function noopOperation<T, A extends Action, L>(
  document: Document<T, A, L>,
  action: Partial<Operation>,
  skip: number,
) {
  const defaultValues = {
    skip,
    document,
  };

  const { scope } = action;

  if (!scope) return defaultValues;
  if (action.skip === undefined) return defaultValues;

  return create(defaultValues, (draft) => {
    const lastOperation = draft.document.operations[scope].at(-1);

    if (action.skip && action.skip > 0) {
      draft.skip = action.skip;
    }

    if (
      lastOperation &&
      lastOperation.type === "NOOP" &&
      action.index === lastOperation.index &&
      draft.skip > lastOperation.skip
    ) {
      draft.document.operations[scope].pop();
    }
  });
}

export function undoOperation<T, A extends Action, L>(
  document: Document<T, A, L>,
  action: UndoAction,
  skip: number,
): UndoRedoProcessResult<T, A, L> {
  // const scope = action.scope;
  const { scope, input } = action;

  const defaultResult: UndoRedoProcessResult<T, A, L> = {
    document,
    action,
    skip,
    reuseLastOperationIndex: false,
  };

  return create(defaultResult, (draft) => {
    const operations = [...document.operations[scope]];
    const sortedOperations = documentHelpers.sortOperations(operations);

    draft.action = noop(scope);

    const lastOperation = sortedOperations.at(-1);
    let nextIndex = lastOperation?.index ?? -1;

    const isNewNoop = lastOperation?.type !== "NOOP";

    if (isNewNoop) {
      nextIndex = nextIndex + 1;
    } else {
      draft.reuseLastOperationIndex = true;
    }

    const nextOperationHistory = isNewNoop
      ? [...sortedOperations, { index: nextIndex, skip: 0 }]
      : sortedOperations;

    draft.skip = documentHelpers.nextSkipNumber(nextOperationHistory);

    if (lastOperation && draft.skip > lastOperation.skip + 1) {
      // there's an overlap with a previous skip operation
      // (add 1 to the skip value because we are adding a new operation to the history)
      draft.skip = draft.skip + 1;
    }

    if (draft.skip < 0) {
      throw new Error(
        `Cannot undo: you can't undo more operations than the ones in the scope history`,
      );
    }
  });
}

export function redoOperation<T, A extends Action, L>(
  document: Document<T, A, L>,
  action: RedoAction,
  skip: number,
): UndoRedoProcessResult<T, A, L> {
  const { scope, input } = action;

  const defaultResult: UndoRedoProcessResult<T, A, L> = {
    document,
    action,
    skip,
    reuseLastOperationIndex: false,
  };

  return create(defaultResult, (draft) => {
    if (draft.skip > 0) {
      throw new Error(
        `Cannot redo: skip value from reducer cannot be used with REDO action`,
      );
    }

    if (input > 1) {
      throw new Error(`Cannot redo: you can only redo one operation at a time`);
    }

    if (input < 1) {
      throw new Error(`Invalid REDO action: invalid redo input value`);
    }

    if (draft.document.clipboard.length < 1) {
      throw new Error(`Cannot redo: no operations in the clipboard`);
    }

    const operationIndex = draft.document.clipboard.findLastIndex(
      (op) => op.scope === scope,
    );
    if (operationIndex < 0) {
      throw new Error(
        `Cannot redo: no operations in clipboard for scope "${scope}"`,
      );
    }

    const operation = draft.document.clipboard.splice(operationIndex, 1)[0];

    draft.action = castDraft({
      type: operation.type,
      scope: operation.scope,
      input: operation.input,
    } as A);
  });
}

export function pruneOperation<T, A extends Action, L>(
  document: Document<T, A, L>,
  action: PruneAction,
  wrappedReducer: ImmutableStateReducer<T, A, L>,
): Document<T, A, L> {
  const { scope } = action;
  const operations = document.operations[scope];

  let {
    input: { start, end },
  } = action;
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
      [scope]: actionsToKeepStart.concat(actionsToPrune),
    },
    wrappedReducer,
  );

  const { name, state: newState } = newDocument;

  // the new operation has the index of the first pruned operation
  const loadStateIndex = actionsToKeepStart.length;

  // if and operation is pruned then reuses the timestamp of the last operation
  // if not then assigns the timestamp of the following unpruned operation
  const loadStateTimestamp = actionsToKeepStart.length
    ? actionsToKeepStart[actionsToKeepStart.length - 1].timestamp
    : actionsToKeepEnd.length
      ? actionsToKeepEnd[0].timestamp
      : new Date().toISOString();

  // replaces pruned operations with LOAD_STATE
  return replayOperations(
    document.initialState,
    {
      ...document.operations,
      [scope]: [
        ...actionsToKeepStart,
        {
          ...loadState({ name, state: newState }, actionsToPrune.length),
          timestamp: loadStateTimestamp,
          index: loadStateIndex,
          hash: hashDocument({ state: newState }, "global"),
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
  );
}

export function loadStateOperation<T, A extends Action, L>(
  oldDocument: Document<T, A, L>,
  newDocument: { name: string; state?: State<T, L> },
): Document<T, A, L> {
  return {
    ...oldDocument,
    name: newDocument.name,
    state: newDocument.state ?? ({ global: {}, local: {} } as State<T, L>),
  };
}

export * from "./creators";

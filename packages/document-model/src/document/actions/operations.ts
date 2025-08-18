import { castDraft, create, type Draft } from "mutative";
import { type PruneActionInput } from "../schema/types.js";
import {
  type Action,
  type BaseState,
  type PHDocument,
  type StateReducer,
} from "../types.js";
import { hashDocumentStateForScope, replayOperations } from "../utils/base.js";
import { nextSkipNumber, sortOperations } from "../utils/document-helpers.js";
import { loadState, noop } from "./creators.js";

// updates the name of the document
export function setNameOperation<TDocument extends PHDocument>(
  document: TDocument,
  name: string,
) {
  return { ...document, header: { ...document.header, name } };
}

export function undoOperation<TDocument extends PHDocument>(
  document: TDocument,
  action: Action,
  skip: number,
): {
  document: TDocument;
  action: Action;
  skip: number;
  reuseLastOperationIndex: boolean;
} {
  // const scope = action.scope;
  const { scope } = action;

  const defaultResult = {
    document,
    action,
    skip,
    reuseLastOperationIndex: false,
  };

  return create(defaultResult, (draft) => {
    const operations = [...document.operations[scope]];
    const sortedOperations = sortOperations(operations);

    draft.action = noop(scope) as Draft<Action>;

    const lastOperation = sortedOperations.at(-1);
    let nextIndex = lastOperation?.index ?? -1;

    const isNewNoop = lastOperation?.action.type !== "NOOP";

    if (isNewNoop) {
      nextIndex = nextIndex + 1;
    } else {
      draft.reuseLastOperationIndex = true;
    }

    const nextOperationHistory = isNewNoop
      ? [...sortedOperations, { index: nextIndex, skip: 0 }]
      : sortedOperations;

    draft.skip = nextSkipNumber(nextOperationHistory);

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

export function redoOperation<TDocument extends PHDocument>(
  document: TDocument,
  action: Action,
  skip: number,
): {
  document: TDocument;
  action: Action;
  skip: number;
  reuseLastOperationIndex: boolean;
} {
  const { scope, input } = action;

  const defaultResult = {
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

    if (typeof input !== "number" || input > 1) {
      throw new Error(`Cannot redo: you can only redo one operation at a time`);
    }

    if (typeof input !== "number" || input < 1) {
      throw new Error(`Invalid REDO action: invalid redo input value`);
    }

    if (draft.document.clipboard.length < 1) {
      throw new Error(`Cannot redo: no operations in the clipboard`);
    }

    const operationIndex = draft.document.clipboard.findLastIndex(
      (op) => op.action.scope === scope,
    );
    if (operationIndex < 0) {
      throw new Error(
        `Cannot redo: no operations in clipboard for scope "${scope}"`,
      );
    }

    const operation = draft.document.clipboard.splice(operationIndex, 1)[0];

    draft.action = castDraft({
      type: operation.action.type,
      scope: operation.action.scope,
      input: operation.action.input,
    } as Action);
  });
}

export function pruneOperation<TDocument extends PHDocument>(
  document: TDocument,
  input: PruneActionInput,
  wrappedReducer: StateReducer<TDocument>,
): TDocument {
  const operations = document.operations.global;

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
  );
}

export function loadStateOperation<TDocument extends PHDocument>(
  oldDocument: TDocument,
  newDocument: { name: string; state?: BaseState<unknown, unknown> },
): TDocument {
  return {
    ...oldDocument,
    name: newDocument.name,
    state:
      newDocument.state ??
      ({ global: {}, local: {} } as BaseState<unknown, unknown>),
  };
}

import {
  Action,
  BaseDocument,
  BaseState,
  ImmutableStateReducer,
} from "@document/types.js";
import {
  hashDocumentStateForScope,
  replayOperations,
} from "@document/utils/base.js";
import {
  nextSkipNumber,
  sortOperations,
} from "@document/utils/document-helpers.js";
import { castDraft, create, Draft } from "mutative";
import { loadState, noop } from "./creators.js";
import { PruneAction } from "./types.js";

// updates the name of the document
export function setNameOperation<TGlobalState, TLocalState>(
  document: BaseDocument<TGlobalState, TLocalState>,
  name: string,
) {
  return { ...document, name };
}

export function undoOperation<TGlobalState, TLocalState>(
  document: BaseDocument<TGlobalState, TLocalState>,
  action: Action,
  skip: number,
) {
  // const scope = action.scope;
  const { scope, input } = action;

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

    const isNewNoop = lastOperation?.type !== "NOOP";

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

export function redoOperation<TGlobalState, TLocalState>(
  document: BaseDocument<TGlobalState, TLocalState>,
  action: Action,
  skip: number,
) {
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
    } as Action);
  });
}

export function pruneOperation<TGlobalState, TLocalState>(
  document: BaseDocument<TGlobalState, TLocalState>,
  action: PruneAction,
  wrappedReducer: ImmutableStateReducer<TGlobalState, TLocalState, Action>,
) {
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

export function loadStateOperation<TGlobalState, TLocalState>(
  oldDocument: BaseDocument<TGlobalState, TLocalState>,
  newDocument: { name: string; state?: BaseState<TGlobalState, TLocalState> },
): BaseDocument<TGlobalState, TLocalState> {
  return {
    ...oldDocument,
    name: newDocument.name,
    state:
      newDocument.state ??
      ({ global: {}, local: {} } as BaseState<TGlobalState, TLocalState>),
  };
}

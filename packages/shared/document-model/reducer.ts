import { castDraft, create, unsafe } from "mutative";
import type { Action } from "./actions.js";
import {
  actionFromAction,
  operationFromAction,
  operationFromOperation,
} from "./actions.js";
import { applyAuthAction, assertAuthScopeActionAllowed } from "./auth.js";
import { baseActionReducer } from "./base-action-reducer.js";
import { tagStateReducer } from "./state-reducer.js";
import { isDenied } from "./denied.js";
import { SubmittedUndoRefusedError } from "./errors.js";
import {
  appliesRewind,
  assertNever,
  baseReducerVersion,
  capabilitiesOf,
  derivesByRule,
  type BaseReducerVersion,
} from "./base-reducer-protocol.js";
import {
  diffOperations,
  garbageCollect,
  garbageCollectDocumentOperations,
  garbageCollectV2,
  hashDocumentStateForScope,
  isDocumentAction,
  isUndo,
  isUndoRedo,
  parseResultingState,
  replayDocument,
  skipHeaderOperations,
  sortOperations,
  updateHeaderRevision,
  type PHDocument,
  type PHDocumentHeader,
} from "./documents.js";
import {
  appliedOperations,
  deriveScope,
  positionalOperations,
  reduceOne,
  retractedActionIds,
  tailAppliesIncrementally,
  type ReducerFor,
} from "./retraction.js";
import {
  redoOperation,
  undoOperation,
  undoOperationV2,
  type DocumentOperations,
  type Operation,
  type OperationContext,
} from "./operations.js";
import type { PHBaseState } from "./state.js";
import type {
  DeriveScope,
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
  // UNDO and REDO are meta operations
  // that alter the operations history themselves
  if (["UNDO", "REDO"].includes(action.type)) {
    return document;
  }

  const scope = action.scope;
  const existing = document.operations[scope];
  // Relies on ops being sorted ascending by index — see reactor CLAUDE.md invariants.
  const lastOperationIndex = existing?.at(-1)?.index ?? -1;

  const index = reuseLastOperationIndex
    ? lastOperationIndex
    : lastOperationIndex + 1;

  const newOperation = operationFromAction(action, index, skip, context);

  const operations = [...(existing ?? []), newOperation];

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
  skipIndexValidation?: boolean,
): TDocument {
  const scope = operation.action.scope;
  const existing = document.operations[scope];
  // Relies on ops being sorted ascending by index — see reactor CLAUDE.md invariants.
  const lastOperationIndex = existing?.at(-1)?.index ?? -1;

  const nextIndex = reuseLastOperationIndex
    ? lastOperationIndex
    : lastOperationIndex + 1;

  if (!skipIndexValidation && operation.index - skip > nextIndex) {
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

  const operations = [...(existing ?? []), newOperation];

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
  skipIndexValidation?: boolean,
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
      skipIndexValidation,
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

  newDocument = updateHeaderRevision(
    newDocument,
    action.scope,
    action.timestampUtcMs,
  ) as TDocument;
  return newDocument;
}

/**
 * Processes an UNDO or REDO action.
 *
 * @param document The current state of the document.
 * @param action The action being applied to the document.
 * @param skip The number of operations to skip before applying the action.
 * @param protocolVersion The document's base-reducer version.
 * @returns The updated document, calculated skip value and transformed action (if applied).
 */
export function processUndoRedo<TState extends PHBaseState = PHBaseState>(
  document: PHDocument<TState>,
  action: Action,
  skip: number,
  protocolVersion: BaseReducerVersion = 1,
): {
  document: PHDocument<TState>;
  action: Action;
  skip: number;
  reuseLastOperationIndex: boolean;
} {
  if (action.type !== "UNDO" && action.type !== "REDO") {
    return { document, action, skip, reuseLastOperationIndex: false };
  }
  const { undo: model } = capabilitiesOf(protocolVersion);
  switch (model) {
    case "skip":
      return action.type === "UNDO"
        ? undoOperation(document, action, skip)
        : redoOperation(document, action, skip);
    case "noop-chain":
      return action.type === "UNDO"
        ? undoOperationV2(document, action, skip)
        : redoOperation(document, action, skip);
    case "retraction":
      // The reactor refuses the same input; a client submits RETRACT.
      throw new SubmittedUndoRefusedError(document.header.id, action.type);
    default:
      return assertNever(model, "undo model");
  }
}

function processSkipOperation<TState extends PHBaseState = PHBaseState>(
  document: PHDocument<TState>,
  action: Action,
  customReducer: StateReducer<TState>,
  skipValue: number,
  protocolVersion: BaseReducerVersion,
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
        skipIndexValidation: true,
        protocolVersion,
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
  protocolVersion: BaseReducerVersion,
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
      protocolVersion,
    },
  );

  const clipboard = sortOperations(
    [...document.clipboard, ...diff].filter((op) => op.action.type !== "NOOP"),
  ).reverse();

  return { ...doc, clipboard } as PHDocument<TState>;
}

/**
 * Base document reducer that wraps a custom document reducer and handles
 * document-level actions such as undo, redo, and set name.
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

  // UNDO/REDO are rejected on the auth scope.
  assertAuthScopeActionAllowed(_action);

  const protocolVersion: BaseReducerVersion =
    options.protocolVersion ?? baseReducerVersion(document.header);
  const caps = capabilitiesOf(protocolVersion);
  const byRule = derivesByRule(caps, _action.scope);

  let skipValue = skip ?? options.replayOptions?.operation.skip ?? 0;
  let newDocument = {
    ...document,
  };
  let reuseLastOperationIndex = false;

  const shouldProcessSkipOperation =
    appliesRewind(caps, _action.scope) &&
    !ignoreSkipOperations &&
    skipValue > 0;

  if (isUndoRedo(_action)) {
    const {
      skip: calculatedSkip,
      action: transformedAction,
      document: processedDocument,
      reuseLastOperationIndex: reuseIndex,
    } = processUndoRedo(document, _action, skipValue, protocolVersion);

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

  // if the action is one the base document actions (SET_NAME, UNDO, REDO)
  // then runs the base reducer first
  if (!byRule && isDocumentAction(_action)) {
    newDocument = baseActionReducer(newDocument, _action);
  }

  // updates the document revision number, last modified date
  // and operation history
  const operationContext = {
    documentId: document.header.id,
    scope: _action.scope,
    branch,
  } as OperationContext;

  newDocument = updateDocument(
    newDocument,
    _action,
    reuseLastOperationIndex,
    skipValue,
    operationContext,
    options.replayOptions?.operation,
    options.skipIndexValidation,
  );

  if (byRule) {
    return applyByRule(
      newDocument,
      _action.scope,
      customReducer,
      dispatch,
      skipValue,
      options,
    );
  }

  // NOOP operations with skip > 0 will have their clipboard populated server-side
  const isNoopWithSkip = _action.type === "NOOP" && skipValue > 0;
  const undoModel = caps.undo;
  switch (undoModel) {
    case "skip":
      if (isUndo(action)) {
        const result = processUndoOperation(
          newDocument,
          action.scope,
          customReducer,
          protocolVersion,
        );
        return result;
      }
      break;
    case "noop-chain":
      // V2 UNDO: Rebuild state using garbageCollectV2 which handles consecutive NOOPs as chains
      // Also trigger for NOOP operations loaded from sync (they have skip > 0)
      if (isUndo(action) || isNoopWithSkip) {
        const scope = _action.scope;
        const scopeOperations = newDocument.operations[scope] || [];
        const sortedOps = sortOperations([...scopeOperations]);

        // Get operations that should be applied (excludes undone operations)
        const effectiveOps = garbageCollectV2(sortedOps) as Operation[];

        // Build operations for replay - only include non-NOOP operations
        const opsToReplay = effectiveOps.filter(
          (op: Operation) => op.action.type !== "NOOP",
        );

        // Create document operations with only the effective ops for this scope
        const replayOps: DocumentOperations = {
          ...newDocument.operations,
          [scope]: opsToReplay,
        };

        // Replay to rebuild state using replayOperations which wraps the reducer
        // Pass skipIndexValidation since garbageCollectV2 creates gapped indices
        const rebuiltDoc = replayOperations(
          newDocument.initialState,
          replayOps,
          customReducer,
          newDocument.header,
          dispatch,
          baseReducer,
          {},
          { skipIndexValidation: true, protocolVersion },
        );

        // Return document with rebuilt state but original operations (including all NOOPs)
        return {
          ...rebuiltDoc,
          operations: newDocument.operations,
          clipboard: [],
        } as PHDocument<TState>;
      }
      break;
    case "retraction":
      break;
    default:
      assertNever(undoModel, "undo model");
  }

  if (shouldProcessSkipOperation) {
    const processed = processSkipOperation(
      newDocument,
      _action,
      customReducer,
      skipValue,
      protocolVersion,
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
      // auth scope actions have a specialized handler, but we need to catch failures
      // on load (not mutate) to log them
      if (_action.scope === "auth") {
        const authState = applyAuthAction(newDocument, _action).state;
        unsafe(() => {
          draft.state = castDraft(authState);
        });
        return;
      }
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
      // A failed action keeps the prior state; with a skip, the rewound one.
      const actionScopeOps = newDocument.operations[_action.scope];
      if (!actionScopeOps) {
        throw new Error(`No operations found for scope: ${_action.scope}`, {
          cause: error,
        });
      }
      const lastOperationIndex = actionScopeOps.length - 1;
      const draftScopeOps = draft.operations[_action.scope];
      if (!draftScopeOps) {
        throw new Error(
          `No operations found in draft for scope: ${_action.scope}`,
          { cause: error },
        );
      }
      const failed = draftScopeOps[lastOperationIndex];
      failed.error = (error as Error).message;
      const { name, code } = reducerErrorIdentity(error);
      if (name !== undefined) failed.errorName = name;
      if (code !== undefined) failed.errorCode = code;

      if (shouldProcessSkipOperation) {
        draft.state = castDraft({
          ...newDocument.state,
        });
      } else {
        draftScopeOps[lastOperationIndex].skip = 0;
      }
    }
  });
  // updates the document history
  // meta operations are not added to the operations history
  if (["UNDO", "REDO"].includes(_action.type)) {
    return newDocument;
  }

  // if the replayed operation carries a hash then it is reused instead of
  // generating one, which also skips hashing the whole scope state
  const scope = _action.scope || "global";
  const replayHash = options.replayOptions?.operation.hash;
  const hash = replayHash
    ? replayHash
    : hashDocumentStateForScope(newDocument, scope);

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
 * Base-reducer 3: applies the appended row, or re-derives the scope when the
 * row rewinds, retracts, or is named by a retraction. A stored `error` is
 * diagnostic: it is written only on the appended row.
 */
function applyByRule<TState extends PHBaseState>(
  document: PHDocument<TState>,
  scope: string,
  customReducer: StateReducer<TState>,
  dispatch: SignalDispatch | undefined,
  skip: number,
  options: ReducerOptions,
): PHDocument<TState> {
  const operations = document.operations[scope] ?? [];
  const appended = operations.at(-1);
  if (!appended) {
    throw new Error(`No operations found for scope: ${scope}`);
  }
  const appendedId = appended.action.id;

  const appendedReducer: StateReducer<TState> = (state, action) =>
    customReducer(state, action, dispatch);
  const reducerFor: ReducerFor<TState> = (operation) =>
    operation.action.id === appendedId ? appendedReducer : customReducer;

  const targeted =
    options.targeted ?? retractedActionIds(positionalOperations(operations));
  const rebuild = !tailAppliesIncrementally(
    [{ skip, action: appended.action }],
    { named: (id) => targeted.has(id) },
  );

  let next = document;
  let error: string | undefined;
  if (rebuild) {
    let thrown: unknown;
    const onThrow = (operation: Operation, caught: unknown) => {
      if (operation.action.id === appendedId) thrown = caught;
    };
    const derived = options.deriveScope
      ? options.deriveScope(document, operations, scope, onThrow)
      : deriveScope(document, operations, reducerFor, scope, onThrow);
    next = derived.document;
    const threw =
      !derived.applied.has(appendedId) &&
      appliedOperations(operations).some(
        (operation) => operation.action.id === appendedId,
      );
    if (threw) {
      error = errorMessage(thrown);
    }
  } else if (!isDenied(appended)) {
    try {
      next = reduceOne(document, appended, reducerFor);
    } catch (caught) {
      error = errorMessage(caught);
    }
  }

  const replayHash = options.replayOptions?.operation.hash;
  const row: Operation = {
    ...appended,
    hash: replayHash ? replayHash : hashDocumentStateForScope(next, scope),
    ...(error === undefined ? {} : { error }),
    ...(options.reuseOperationResultingState
      ? {
          resultingState: JSON.stringify(
            (next.state as Record<string, unknown>)[scope],
          ),
        }
      : {}),
  };
  return {
    ...next,
    operations: {
      ...next.operations,
      [scope]: [...operations.slice(0, -1), row],
    },
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Action failed";
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
  return tagStateReducer(reducer, stateReducer);
}

export { stateReducerOf } from "./state-reducer.js";

/** A thrown error's class name and generated `errorCode`, where it has them. */
function reducerErrorIdentity(error: unknown): {
  name?: string;
  code?: string;
} {
  if (typeof error !== "object" || error === null) return {};
  const { name, errorCode } = error as { name?: unknown; errorCode?: unknown };
  // Generated error classes leave `name` as "Error"; their class has the name.
  const className = (error as object).constructor.name;
  const named = [name, className].find(
    (candidate): candidate is string =>
      typeof candidate === "string" &&
      candidate !== "" &&
      candidate !== "Error" &&
      candidate !== "Object",
  );
  return {
    ...(named !== undefined && { name: named }),
    ...(typeof errorCode === "string" && { code: errorCode }),
  };
}

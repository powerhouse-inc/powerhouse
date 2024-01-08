import {
    Action,
    Document,
    ImmutableStateReducer,
    PruneAction,
    RedoAction,
    State,
    UndoAction,
} from '../types';
import { hashDocument, replayOperations } from '../utils/base';
import { loadState } from './creators';

// updates the name of the document
export function setNameOperation<T>(document: T, name: string): T {
    return { ...document, name };
}

// undoes the last `count` operations
export function undoOperation<T, A extends Action, L>(
    document: Document<T, A, L>,
    action: UndoAction,
    wrappedReducer: ImmutableStateReducer<T, A, L>,
): Document<T, A, L> {
    const { scope, input: count } = action;
    const revision = document.revision[action.scope];

    // undo can't be higher than the number of active operations
    const undoCount = Math.min(count, revision);

    // builds the global state from the initial data without the
    // undone operations
    const operations = document.operations[scope].slice(
        0,
        revision - undoCount,
    );
    const newDocument = replayOperations(
        document.initialState,
        {
            ...document.operations,
            [scope]: operations,
        },
        wrappedReducer,
    );

    // updates the state and the revision number but
    // keeps the operations history to allow REDO
    return {
        ...newDocument,
        operations: document.operations,
        revision: {
            ...document.revision,
            [scope]: document.revision[scope] - undoCount,
        },
    };
}

// redoes the last `count` undone operations
export function redoOperation<T, A extends Action, L>(
    document: Document<T, A, L>,
    action: RedoAction,
    wrappedReducer: ImmutableStateReducer<T, A, L>,
): Document<T, A, L> {
    const { scope, input: count } = action;
    // the number of undone operations is retrieved from the revision number
    const undoCount =
        document.operations[scope].length - document.revision[scope];
    if (!undoCount) {
        throw new Error('There is no UNDO operation to REDO');
    }

    // redo can't be higher than the number of undone operations
    const redoCount = count < undoCount ? count : undoCount;

    // builds state from the initial date taking
    // into account the redone operations
    const operations = document.operations[scope].slice(
        0,
        document.revision[scope] + redoCount,
    );
    const newDocument = replayOperations(
        document.initialState,
        {
            ...document.operations,
            [scope]: operations,
        },
        wrappedReducer,
    );

    // updates the state and the revision number but
    // keeps the operations history to allow more REDOs
    return {
        ...newDocument,
        operations: document.operations,
        revision: {
            ...document.revision,
            [scope]: document.revision[scope] + redoCount,
        },
    };
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
                    ...loadState(
                        { name, state: newState },
                        actionsToPrune.length,
                    ),
                    timestamp: loadStateTimestamp,
                    index: loadStateIndex,
                    hash: hashDocument({ state: newState }, 'global'),
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

export * from './creators';

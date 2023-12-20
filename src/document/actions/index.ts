import { Action, Document, ImmutableStateReducer, State } from '../types';
import { hashDocument, replayOperations } from '../utils/base';
import { loadState } from './creators';

// updates the name of the document
export function setNameOperation<T>(document: T, name: string): T {
    return { ...document, name };
}

// undoes the last `count` operations
export function undoOperation<T, A extends Action, L>(
    document: Document<T, A, L>,
    count: number,
    wrappedReducer: ImmutableStateReducer<T, A, L>,
): Document<T, A, L> {
    // undo can't be higher than the number of active operations
    const undoCount = Math.min(count, document.revision);

    // builds the global state from the initial data without the
    // undone operations
    const globalOperations = document.operations.global.slice(
        0,
        document.revision - undoCount,
    );
    const newDocument = replayOperations(
        document.initialState,
        {
            global: globalOperations,
            local: document.operations.local,
        },
        wrappedReducer,
    );

    // updates the state and the revision number but
    // keeps the operations history to allow REDO
    return {
        ...newDocument,
        operations: document.operations,
        revision: document.revision - undoCount,
    };
}

// redoes the last `count` undone operations
export function redoOperation<T, A extends Action, L>(
    document: Document<T, A, L>,
    count: number,
    wrappedReducer: ImmutableStateReducer<T, A, L>,
): Document<T, A, L> {
    // the number of undone operations is retrieved from the revision number
    const undoCount = document.operations.global.length - document.revision;
    if (!undoCount) {
        throw new Error('There is no UNDO operation to REDO');
    }

    // redo can't be higher than the number of undone operations
    const redoCount = count < undoCount ? count : undoCount;

    // builds state from the initial date taking
    // into account the redone operations
    const globalOperations = document.operations.global.slice(
        0,
        document.revision + redoCount,
    );
    const newDocument = replayOperations(
        document.initialState,
        {
            global: globalOperations,
            local: document.operations.local,
        },
        wrappedReducer,
    );

    // updates the state and the revision number but
    // keeps the operations history to allow more REDOs
    return {
        ...newDocument,
        operations: document.operations,
        revision: document.revision + redoCount,
    };
}

export function pruneOperation<T, A extends Action, L>(
    document: Document<T, A, L>,
    start: number | null | undefined,
    end: number | null | undefined,
    wrappedReducer: ImmutableStateReducer<T, A, L>,
): Document<T, A, L> {
    start = start || 0;
    end = end || document.operations.global.length;
    const actionsToPrune = document.operations.global.slice(start, end);
    const actionsToKeepStart = document.operations.global.slice(0, start);
    const actionsToKeepEnd = document.operations.global.slice(end);

    // runs all operations from the initial state to
    // the end of prune to get name and data
    const newDocument = replayOperations(
        document.initialState,
        {
            global: actionsToKeepStart.concat(actionsToPrune),
            local: document.operations.local,
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
            global: [
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
            local: document.operations.local,
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

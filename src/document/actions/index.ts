import { SignalDispatch } from '../signal';
import {
    Action,
    Document,
    ExtendedState,
    ImmutableStateReducer,
    State,
} from '../types';
import { createDocument, createReducer } from '../utils';
import { loadState } from './creators';
import { BaseAction } from './types';

// Runs the operations on the initial data using the
// provided reducer, wrapped with the base reducer.
// This produces and alternate version of the document
// according to the provided actions.
function replayOperations<T, A extends Action, L>(
    initialState: ExtendedState<T, L>,
    operations: {
        global: (A | BaseAction)[];
        local: A[];
    },
    reducer: ImmutableStateReducer<T, A, L>,
    dispatch?: SignalDispatch,
): Document<T, A, L> {
    // builds a new document from the initial data
    const document = createDocument<T, A, L>(initialState);

    // wraps the provided custom reducer with the
    // base document reducer
    const wrappedReducer = createReducer(reducer);

    // runs all the operations on the new document
    // and returns the resulting state
    return operations.global
        .concat(operations.local)
        .reduce(
            (document, operation) =>
                wrappedReducer(document, operation, dispatch),
            document,
        );
}

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

    // replaces pruned operations with LOAD_STATE
    return replayOperations(
        document.initialState,
        {
            global: [
                ...actionsToKeepStart,
                loadState({ name, state: newState }, actionsToPrune.length),
                ...actionsToKeepEnd,
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

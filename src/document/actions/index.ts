import { Action, Document, ImmutableStateReducer } from '../types';
import { createDocument, createReducer } from '../utils';
import { loadState } from './creators';
import { BaseAction } from './types';

// Runs the operations on the initial data using the
// provided reducer, wrapped with the base reducer.
// This produces and alternate version of the document
// according to the provided actions.
function replayOperations<T, A extends Action>(
    initialState: Partial<Document<T, A>> & { state: T },
    operations: Array<A | BaseAction>,
    reducer: ImmutableStateReducer<T, A>
): Document<T, A> {
    // builds a new document from the initial data
    const state = createDocument(initialState);

    // wraps the provided custom reducer with the
    // base document reducer
    const wrappedReducer = createReducer(reducer);

    // runs all the operations on the new document
    // and returns the resulting state
    return operations.reduce(
        (state, operation) => wrappedReducer(state, operation),
        state
    );
}

// updates the name of the document
export function setNameOperation<T, A extends Action>(
    document: Document<T, A>,
    name: string
): Document<T, A> {
    return { ...document, name };
}

// undoes the last `count` operations
export function undoOperation<T, A extends Action>(
    document: Document<T, A>,
    count: number,
    wrappedReducer: ImmutableStateReducer<T, A>
): Document<T, A> {
    // undo can't be higher than the number of active operations
    const undoCount = Math.min(count, document.revision);

    // builds the state from the initial data without the
    // undone operations
    const operations = document.operations.slice(
        0,
        document.revision - undoCount
    );
    const newState = replayOperations(
        document.initialState,
        operations,
        wrappedReducer
    );

    // updates the state and the revision number but
    // keeps the operations history to allow REDO
    return {
        ...newState,
        operations: document.operations,
        revision: document.revision - undoCount,
    };
}

// redoes the last `count` undone operations
export function redoOperation<T, A extends Action>(
    document: Document<T, A>,
    count: number,
    wrappedReducer: ImmutableStateReducer<T, A>
): Document<T, A> {
    // the number of undone operations is retrieved from the revision number
    const undoCount = document.operations.length - document.revision;
    if (!undoCount) {
        throw new Error('There is no UNDO operation to REDO');
    }

    // redo can't be higher than the number of undone operations
    const redoCount = count < undoCount ? count : undoCount;

    // builds state from the initial date taking
    // into account the redone operations
    const operations = document.operations.slice(
        0,
        document.revision + redoCount
    );
    const newState = replayOperations(
        document.initialState,
        operations,
        wrappedReducer
    );

    // updates the state and the revision number but
    // keeps the operations history to allow more REDOs
    return {
        ...newState,
        operations: document.operations,
        revision: document.revision + redoCount,
    };
}

export function pruneOperation<T, A extends Action>(
    document: Document<T, A>,
    start: number | null | undefined,
    end: number | null | undefined,
    wrappedReducer: ImmutableStateReducer<T, A>
): Document<T, A> {
    start = start || 0;
    end = end || document.operations.length;
    const actionsToPrune = document.operations.slice(start, end);
    const actionsToKeepStart = document.operations.slice(0, start);
    const actionsToKeepEnd = document.operations.slice(end);

    // runs all operations from the initial state to
    // the end of prune to get name and data
    const { name, state: newState } = replayOperations(
        document.initialState,
        actionsToKeepStart.concat(actionsToPrune),
        wrappedReducer
    );

    // replaces pruned operations with LOAD_STATE
    return replayOperations(
        document.initialState,
        [
            ...actionsToKeepStart,
            loadState({ name, state: newState }, actionsToPrune.length),
            ...actionsToKeepEnd,
        ],
        wrappedReducer
    );
}

export function loadStateOperation<T, A extends Action>(
    oldDocument: Document<T, A>,
    newDocument: { name: string; state?: T }
): Document<T, A> {
    return {
        ...oldDocument,
        name: newDocument.name,
        state: newDocument.state ?? ({} as T),
    };
}

export * from './creators';

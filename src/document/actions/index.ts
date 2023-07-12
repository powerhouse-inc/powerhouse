import { Action, Document, ImmutableReducer } from '../types';
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
    reducer: ImmutableReducer<T, A>
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
    state: Document<T, A>,
    name: string
): Document<T, A> {
    return { ...state, name };
}

// undoes the last `count` operations
export function undoOperation<T, A extends Action>(
    state: Document<T, A>,
    count: number,
    wrappedReducer: ImmutableReducer<T, A>
): Document<T, A> {
    // undo can't be higher than the number of active operations
    const undoCount = Math.min(count, state.revision);

    // builds the state from the initial data without the
    // undone operations
    const operations = state.operations.slice(0, state.revision - undoCount);
    const newState = replayOperations(
        state.initialState,
        operations,
        wrappedReducer
    );

    // updates the state and the revision number but
    // keeps the operations history to allow REDO
    return {
        ...newState,
        operations: state.operations,
        revision: state.revision - undoCount,
    };
}

// redoes the last `count` undone operations
export function redoOperation<T, A extends Action>(
    state: Document<T, A>,
    count: number,
    wrappedReducer: ImmutableReducer<T, A>
): Document<T, A> {
    // the number of undone operations is retrieved from the revision number
    const undoCount = state.operations.length - state.revision;
    if (!undoCount) {
        throw new Error('There is no UNDO operation to REDO');
    }

    // redo can't be higher than the number of undone operations
    const redoCount = count < undoCount ? count : undoCount;

    // builds state from the initial date taking
    // into account the redone operations
    const operations = state.operations.slice(0, state.revision + redoCount);
    const newState = replayOperations(
        state.initialState,
        operations,
        wrappedReducer
    );

    // updates the state and the revision number but
    // keeps the operations history to allow more REDOs
    return {
        ...newState,
        operations: state.operations,
        revision: state.revision + redoCount,
    };
}

export function pruneOperation<T, A extends Action>(
    state: Document<T, A>,
    start: number | null | undefined,
    end: number | null | undefined,
    wrappedReducer: ImmutableReducer<T, A>
): Document<T, A> {
    start = start || 0;
    end = end || state.operations.length;
    const actionsToPrune = state.operations.slice(start, end);
    const actionsToKeepStart = state.operations.slice(0, start);
    const actionsToKeepEnd = state.operations.slice(end);

    // runs all operations from the initial state to
    // the end of prune to get name and data
    const { name, state: newState } = replayOperations(
        state.initialState,
        actionsToKeepStart.concat(actionsToPrune),
        wrappedReducer
    );

    // replaces pruned operations with LOAD_STATE
    return replayOperations(
        state.initialState,
        [
            ...actionsToKeepStart,
            loadState({ name, state: newState }, actionsToPrune.length),
            ...actionsToKeepEnd,
        ],
        wrappedReducer
    );
}

export function loadStateOperation<T, A extends Action>(
    oldState: Document<T, A>,
    newState: { name: string; state?: Document['state'] }
): Document<T, A> {
    return {
        ...oldState,
        name: newState.name,
        state: (newState.state ?? {}) as T,
    };
}

export * from './creators';

import { Action, Document, Reducer } from './types';
import {
    BaseAction,
    PRUNE,
    REDO,
    SET_NAME,
    UNDO,
    isBaseAction,
    pruneOperation,
    redoOperation,
    setNameOperation,
    undoOperation,
} from './actions';

function getNextRevision<T, A extends Action>(
    state: Document<T, A>,
    action: A
): number {
    // UNDO, REDO and PRUNE alter the revision themselves
    return [UNDO, REDO, PRUNE].includes(action.type)
        ? state.revision
        : state.revision + 1;
}

function updateHeader<T, A extends Action>(
    state: Document<T, A>,
    action: A
): Document<T, A> {
    return {
        ...state,
        revision: getNextRevision(state, action),
        lastModified: new Date().toISOString(),
    };
}

function updateOperations<T, A extends Action>(
    state: Document<T, A>,
    action: A
): Document<T, A> {
    // UNDO, REDO and PRUNE are meta operations
    // that alter the operations history themselves
    if ([UNDO, REDO, PRUNE].includes(action.type)) {
        return state;
    }

    // removes undone operations from history if there
    // is a new operation after an UNDO
    const operations = state.operations.slice(0, state.revision);
    return {
        ...state,
        operations: [
            ...operations,
            {
                ...action,
                index: operations.length,
            },
        ],
    };
}

function updateDocument<T, A extends Action>(
    state: Document<T, A | BaseAction>,
    action: A | BaseAction
): Document<T, A | BaseAction> {
    let newState = updateOperations(state, action);
    newState = updateHeader(newState, action);
    return newState;
}

function _baseReducer<T, A extends Action>(
    state: Document<T, A | BaseAction>,
    action: BaseAction,
    composedReducer: Reducer<Document<T, A>, A>
): Document<T, A | BaseAction> {
    switch (action.type) {
        case SET_NAME:
            return setNameOperation(state, action.input);
        case UNDO:
            return undoOperation(state, action.input, composedReducer);
        case REDO:
            return redoOperation(state, action.input, composedReducer);
        case PRUNE:
            return pruneOperation(state, action.input, composedReducer);
        default:
            return state;
    }
}

export function baseReducer<T, A extends Action>(
    state: Document<T, A | BaseAction>,
    action: A | BaseAction,
    composedReducer: Reducer<Document<T, A>, A>
): Document<T, A | BaseAction> {
    let newState = state;

    if (isBaseAction(action)) {
        newState = _baseReducer<T, A>(newState, action, composedReducer);
    }
    newState = updateDocument<T, A>(newState, action);
    return newState;
}

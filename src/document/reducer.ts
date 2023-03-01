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

function updateHeader<T, A extends Action>(
    state: Document<T, A>
): Document<T, A> {
    return {
        ...state,
        revision: state.operations.length,
        lastModified: new Date().toISOString(),
    };
}

function updateOperations<T, A extends Action>(
    state: Document<T, A>,
    action: A
): Document<T, A> {
    // REDO and PRUNE operations alter the operations history themselves
    if ([REDO, PRUNE].includes(action.type)) {
        return state;
    }

    return {
        ...state,
        operations: [
            ...state.operations,
            {
                ...action,
                index: state.operations.length,
            },
        ],
    };
}

function updateDocument<T, A extends Action>(
    state: Document<T, A | BaseAction>,
    action: A | BaseAction
): Document<T, A | BaseAction> {
    let newState = updateOperations(state, action);
    newState = updateHeader(newState);
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

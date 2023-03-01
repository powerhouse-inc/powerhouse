import { Action, Document, Reducer } from './types';
import {
    BaseAction,
    REDO,
    SET_NAME,
    UNDO,
    isBaseAction,
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
    // REDO operations are not added to the history
    if (action.type === REDO) {
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
    state: Document<T, A>,
    action: A
): Document<T, A> {
    let newState = updateOperations(state, action);
    newState = updateHeader(newState);
    return newState;
}

function _baseReducer<T, A extends Action>(
    state: Document<T, A>,
    action: BaseAction,
    composedReducer: Reducer<Document<T, A>, A>
): Document<T, A> {
    switch (action.type) {
        case SET_NAME:
            return setNameOperation(state, action.input);
        case UNDO:
            return undoOperation(state, action.input, composedReducer);
        case REDO:
            return redoOperation(state, action.input, composedReducer);
        default:
            return state;
    }
}

export function baseReducer<T, A extends Action>(
    state: Document<T, A>,
    action: A,
    composedReducer: Reducer<Document<T, A>, A>
): Document<T, A> {
    let newState = state;

    if (isBaseAction(action)) {
        newState = _baseReducer<T, A>(state, action, composedReducer);
    }

    newState = updateDocument<T, A>(newState, action);
    return newState;
}

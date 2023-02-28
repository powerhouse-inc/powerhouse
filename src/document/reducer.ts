import { BaseAction, SET_NAME } from './actions';
import { Action, Document } from './types';

function updateHeader<T>(state: Document<T>): Document<T> {
    return {
        ...state,
        revision: state.revision + 1,
        lastModified: new Date().toISOString(),
    };
}

function updateOperations<T>(state: Document<T>, action: Action): Document<T> {
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

function updateDocument<T>(state: Document<T>, action: Action): Document<T> {
    let newState = updateHeader(state);
    newState = updateOperations(newState, action);
    return newState;
}

export function baseReducer<T>(
    state: Document<T>,
    action: Action | BaseAction
): Document<T> {
    const newState = updateDocument(state, action);

    switch (action.type) {
        case SET_NAME:
            return {
                ...newState,
                name: (action as BaseAction).input,
            };
        default:
            return newState;
    }
}

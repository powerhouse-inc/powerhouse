import { BaseAction } from './actions';
import { baseReducer } from './reducer';
import { Action, Document, Reducer } from './types';

// helper to be used by action creators
export function createAction<A extends Action>(
    type: A['type'],
    input: A['input'] = {} as A['input']
): A {
    if (!type) {
        throw new Error('Empty action type');
    }

    if (typeof type !== 'string') {
        throw new Error(`Invalid action type: ${type}`);
    }

    return { type, input } as A;
}

// wraps reducer with documentReducer, adding support for
// document actions: SET_NAME, UNDO, REDO, PRUNE
// Also updates the document-related attributes on every operation
export function createReducer<T = unknown, A extends Action = Action>(
    reducer: Reducer<T, A>,
    documentReducer = baseReducer
): Reducer<T, A | BaseAction> {
    return (state, action) => {
        // the document reducer
        const newState = documentReducer<T, A>(state, action, reducer);
        return reducer(newState, action as A);
    };
}

// builds the initial document state from the provided data
export const createDocument = <T, A extends Action>(
    initialState?: Partial<Document<T, A>> & { data: T }
): Document<T, A> => {
    const state = {
        name: '',
        documentType: '',
        revision: 0,
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        data: {} as T,
        operations: [],
        ...initialState,
    };
    // saves the initial state
    return { ...state, initialState: { ...state } };
};

import JSONDeterministic from 'json-stringify-deterministic';
import { BaseAction } from '../actions/types';
import { baseReducer } from '../reducer';
import { Action, Document, ImmutableReducer } from '../types';
import { hash } from './node';

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
    reducer: ImmutableReducer<T, A>,
    documentReducer = baseReducer
) {
    return (state: Document<T, A | BaseAction>, action: A | BaseAction) => {
        return documentReducer<T, A>(state, action, reducer);
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
        fileRegistry: {},
        ...initialState,
    };

    // saves the initial state
    const { initialState: _, ...newInitialState } = state;
    return {
        ...state,
        initialState: newInitialState,
    };
};

export const hashDocument = (state: Document) => {
    const { fileRegistry, ...document } = state;
    return hash(JSONDeterministic(document));
};

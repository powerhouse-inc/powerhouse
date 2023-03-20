import produce, { castDraft } from 'immer';
import { BaseAction } from '../actions';
import { baseReducer } from '../reducer';
import { Action, Document, ImmutableReducer } from '../types';

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
        // first runs the action by the document reducer to
        // update document fields and support base actions
        const newState = documentReducer<T, A>(state, action, reducer);

        // wraps the custom reducer with Immer to avoid
        // mutation bugs and allow writing reducers with
        // mutating code
        return produce(newState, draft => {
            // the reducer runs on a immutable version of
            // provided state
            const newDraft = reducer(draft, action as A);

            // if the reducer creates a new state object instead
            // of mutating the draft then returns the new state
            if (newDraft) {
                // casts new state as draft to comply with typescript
                return castDraft(newDraft);
            }
        });
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

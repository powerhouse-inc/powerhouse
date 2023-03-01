import { BaseAction } from './actions';
import { baseReducer } from './reducer';
import { Action, Document, Reducer } from './types';

export function createAction<T extends string, P>(type: T, input: P = {} as P) {
    if (!type) {
        throw new Error('Empty action type');
    }

    if (typeof type !== 'string') {
        throw new Error(`Invalid action type: ${type}`);
    }

    return { type, input };
}

export function createReducer<T = unknown, A extends Action = Action>(
    reducer: Reducer<Document<T, A>, A>,
    documentReducer = baseReducer
): Reducer<Document<T, A | BaseAction>, A | BaseAction> {
    return (state, action) => {
        const newState = documentReducer<T, A>(state, action, reducer);
        return reducer(newState as Document<T, A>, action as A);
    };
}

export const createDocument = <T, A extends Action>(
    initialState?: Partial<Document<T, A>>
): Document<T, A> => ({
    name: '',
    documentType: '',
    revision: 0,
    created: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    data: {} as T,
    operations: [],
    initialData: initialState?.data ?? ({} as T),
    ...initialState,
});

// export function createStore<State, A extends Action>(
//     reducer: Reducer<State, A>,
//     initialState: State
// ) {
//     let state = initialState;

//     function getState() {
//         return state;
//     }

//     function dispatch(action: A) {
//         state = reducer(state, action);
//     }

//     return { getState, dispatch };
// }

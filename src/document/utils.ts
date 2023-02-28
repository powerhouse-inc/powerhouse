import { baseReducer } from './reducer';
import { Action, Document, Reducer } from './types';

export function action<T extends string, P>(type: T, input: P) {
    if (!type) {
        throw new Error('Empty action type');
    }

    if (typeof type !== 'string') {
        throw new Error(`Invalid action type: ${type}`);
    }

    return { type, input };
}

export function createReducer<A extends Action, T = unknown>(
    reducer: Reducer<Document<T>, A>
): Reducer<Document<T>, A> {
    return (state: Document<T>, action: A) => {
        const newState = baseReducer<T>(state, action);
        return reducer(newState, action);
    };
}

export const initDocument = <T>(
    initialState?: Partial<Document<T>>
): Document<T> => ({
    name: '',
    documentType: '',
    revision: 0,
    created: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    data: {} as T,
    operations: [],
    ...initialState,
});

// export function createDocument<State, A extends Action>(
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

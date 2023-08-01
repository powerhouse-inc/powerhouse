import JSONDeterministic from 'json-stringify-deterministic';
import { baseReducer } from '../reducer';
import {
    Action,
    Document,
    ExtendedState,
    ImmutableStateReducer,
    Reducer,
} from '../types';
import { hash } from './node';

/**
 * Helper function to be used by action creators.
 *
 * @remarks
 * Creates an action with the given type and input properties. The input
 * properties default to an empty object.
 *
 * @typeParam A - Type of the action to be returned.
 *
 * @param type - The type of the action.
 * @param input - The input properties of the action.
 *
 * @throws Error if the type is empty or not a string.
 *
 * @returns The new action.
 */
export function createAction<A extends Action>(
    type: A['type'],
    input?: A['input'],
    attachments?: Action['attachments'],
    validator?: () => { parse(v: unknown): A }
): A {
    if (!type) {
        throw new Error('Empty action type');
    }

    if (typeof type !== 'string') {
        throw new Error(`Invalid action type: ${type}`);
    }

    const action = attachments ? { type, input, attachments } : { type, input };

    validator?.().parse(action);

    return action as unknown as A;
}

/**
 * Helper function to create a document model reducer.
 *
 * @remarks
 * This function creates a new reducer that wraps the provided `reducer` with
 * `documentReducer`, adding support for document actions:
 *   - `SET_NAME`
 *   - `UNDO`
 *   - `REDO`
 *   - `PRUNE`
 *
 * It also updates the document-related attributes on every operation.
 *
 * @param reducer - The custom reducer to wrap.
 * @param documentReducer - The document reducer to use.
 *
 * @returns The new reducer.
 */
export function createReducer<T = unknown, A extends Action = Action>(
    reducer: ImmutableStateReducer<T, A>,
    documentReducer = baseReducer
): Reducer<T, A> {
    return (document, action) => {
        return documentReducer(document, action, reducer);
    };
}

/**
 * Builds the initial document state from the provided data.
 *
 * @typeParam T - The type of the data.
 * @typeParam A - The type of the actions.
 *
 * @param initialState - The initial state of the document. The `data` property
 *   is required, but all other properties are optional.
 *
 * @returns The new document state.
 */
export const createDocument = <T, A extends Action>(
    initialState?: Partial<ExtendedState<T>>
): Document<T, A> => {
    const state: ExtendedState<T> = {
        name: '',
        documentType: '',
        revision: 0,
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        state: {} as T,
        attachments: {},
        ...initialState,
    };

    return {
        ...state,
        initialState: state,
        operations: [],
    };
};

export const hashDocument = (document: Document) => {
    return hash(JSONDeterministic(document.state));
};

export const hashKey = (date?: Date, randomLimit = 1000) => {
    const random = Math.random() * randomLimit;
    return hash(`${(date ?? new Date()).toISOString()}${random}`);
};

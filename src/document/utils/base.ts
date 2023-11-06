import JSONDeterministic from 'json-stringify-deterministic';
import { baseReducer } from '../reducer';
import {
    Action,
    BaseAction,
    Document,
    ExtendedState,
    ImmutableStateReducer,
    Reducer,
} from '../types';
import { hash } from './node';
import { LOAD_STATE, PRUNE, REDO, SET_NAME, UNDO } from '../actions/types';
import { castImmutable, freeze } from 'immer';

export function isBaseAction(action: Action): action is BaseAction {
    return [SET_NAME, UNDO, REDO, PRUNE, LOAD_STATE].includes(action.type);
}

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
    validator?: () => { parse(v: unknown): A },
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
export function createReducer<S = unknown, A extends Action = Action>(
    reducer: ImmutableStateReducer<S, A>,
    documentReducer = baseReducer,
): Reducer<S, A> {
    return (document, action) => {
        return documentReducer(document, action, reducer);
    };
}

export const createExtendedState = <S>(
    initialState?: Partial<ExtendedState<Partial<S>>>,
    createState?: (state?: Partial<S>) => S,
): ExtendedState<S> => {
    return {
        name: '',
        documentType: '',
        revision: 0,
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        attachments: {},
        ...initialState,
        state:
            createState?.(initialState?.state) ??
            ((initialState?.state ?? {}) as S),
    };
};

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
export const createDocument = <S, A extends Action>(
    initialState?: Partial<ExtendedState<Partial<S>>>,
    createState?: (state?: Partial<S>) => S,
): Document<S, A> => {
    const state: ExtendedState<S> = createExtendedState(
        initialState,
        createState,
    );
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

export function readOnly<T>(value: T) {
    return castImmutable(freeze(value, true));
}

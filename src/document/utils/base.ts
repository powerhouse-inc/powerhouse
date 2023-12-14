import JSONDeterministic from 'json-stringify-deterministic';
import { baseReducer } from '../reducer';
import {
    Action,
    BaseAction,
    Document,
    ExtendedState,
    ImmutableStateReducer,
    Reducer,
    Immutable,
    OperationScope,
    State,
    CreateState,
    PartialState,
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
    scope: OperationScope = 'global',
): A {
    if (!type) {
        throw new Error('Empty action type');
    }

    if (typeof type !== 'string') {
        throw new Error(`Invalid action type: ${type}`);
    }

    const action: Action = { type, input, scope };

    if (attachments) {
        action['attachments'] = attachments;
    }

    validator?.().parse(action);

    return action as A;
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
export function createReducer<
    S = unknown,
    A extends Action = Action,
    L = unknown,
>(
    reducer: ImmutableStateReducer<S, A, L>,
    documentReducer = baseReducer,
): Reducer<S, A, L> {
    return (document, action, dispatch) => {
        return documentReducer(document, action, reducer, dispatch);
    };
}

export const createExtendedState = <S, L>(
    initialState?: Partial<ExtendedState<PartialState<S>, PartialState<L>>>,
    createState?: CreateState<S, L>,
): ExtendedState<S, L> => {
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
            ((initialState?.state ?? { global: {}, local: {} }) as State<S, L>),
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
export const createDocument = <S, A extends Action, L = unknown>(
    initialState?: Partial<ExtendedState<PartialState<S>, PartialState<L>>>,
    createState?: (
        state?: Partial<State<PartialState<S>, PartialState<L>>>,
    ) => State<S, L>,
): Document<S, A, L> => {
    const state: ExtendedState<S, L> = createExtendedState(
        initialState,
        createState,
    );
    return {
        ...state,
        initialState: state,
        operations: { global: [], local: [] },
    };
};

export const hashDocument = (
    document: Document,
    scope: OperationScope = 'global',
) => {
    return hash(
        JSONDeterministic(
            scope === 'local' ? document.state.local : document.state.global,
        ),
    );
};

export const hashKey = (date?: Date, randomLimit = 1000) => {
    const random = Math.random() * randomLimit;
    return hash(`${(date ?? new Date()).toISOString()}${random}`);
};

export function readOnly<T>(value: T): Immutable<T> {
    return castImmutable(freeze(value, true));
}

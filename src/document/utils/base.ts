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
    DocumentOperations,
    DocumentHeader,
    DocumentOperationsIgnoreMap,
    Operation,
    MappedOperation,
} from '../types';
import { hash } from './node';
import { noop } from '../actions/creators';
import { LOAD_STATE, PRUNE, REDO, SET_NAME, UNDO } from '../actions/types';
import { castImmutable, freeze } from 'immer';
import { SignalDispatch } from '../signal';

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
 * @param attachments - The attachments included in the action.
 * @param validator - The validator to use for the input properties.
 * @param scope - The scope of the action, can either be 'global' or 'local'.
 * @param skip - The number of operations to skip before this new action is applied.
 *
 * @throws Error if the type is empty or not a string.
 *
 * @returns The new action.
 */
export function createAction<A extends Action>(
    type: A['type'],
    input?: A['input'],
    attachments?: Action['attachments'],
    validator?: () => { parse(v: unknown): A['input'] },
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
        action.attachments = attachments;
    }

    try {
        validator?.().parse(action.input);
    } catch (error) {
        throw new Error(`Invalid action input: ${error}`);
    }

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
    return (document, action, dispatch, options) => {
        return documentReducer(document, action, reducer, dispatch, options);
    };
}

export const createExtendedState = <S, L>(
    initialState?: Partial<ExtendedState<PartialState<S>, PartialState<L>>>,
    createState?: CreateState<S, L>,
): ExtendedState<S, L> => {
    return {
        name: '',
        documentType: '',
        revision: {
            global: 0,
            local: 0,
        },
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
    document: Pick<Document, 'state'>,
    scope: OperationScope = 'global',
) => {
    return hash(JSONDeterministic(document.state[scope]));
};

export const hashKey = (date?: Date, randomLimit = 1000) => {
    const random = Math.random() * randomLimit;
    return hash(`${(date ?? new Date()).toISOString()}${random}`);
};

export function readOnly<T>(value: T): Immutable<T> {
    return castImmutable(freeze(value, true));
}

/**
 * Maps skipped operations in an array of operations.
 * Skipped operations are operations that are ignored during processing.
 * @param operations - The array of operations to map.
 * @returns An array of mapped operations with ignore flag indicating if the operation is skipped.
 * @throws Error if the operation index is invalid and there are missing operations.
 */
export function mapSkippedOperations<A extends Action>(
    operations: Operation<BaseAction | A>[],
): MappedOperation<A>[] {
    const ops = [...operations];

    let skipped = 0;
    let latestOpIndex = ops.length > 0 ? ops[ops.length - 1].index : 0;

    const scopeOpsWithIgnore = [] as MappedOperation<A>[];

    for (const operation of ops.reverse()) {
        if (skipped > 0) {
            const operationsDiff = latestOpIndex - operation.index;
            skipped -= operationsDiff;
        }

        if (skipped < 0) {
            throw new Error('Invalid operation index, missing operations');
        }

        const mappedOp = {
            ignore: skipped > 0,
            operation,
        };

        if (operation.skip > 0) {
            // here we add 1 to the skip number because we want to get the number of
            // operations that we want to move the pointer back to get the latest valid operation
            // operation.skip = 1 means that we want to move the pointer back 2 operations to get to the latest valid operation
            skipped = skipped + (operation.skip + 1);
        }

        latestOpIndex = operation.index;
        scopeOpsWithIgnore.push(mappedOp);
    }

    return scopeOpsWithIgnore.reverse();
}

// Flattens the operations from all scopes into
// a single array and sorts them by timestamp
export function sortOperations<A extends Action>(
    operations: DocumentOperations<A>,
) {
    return Object.values(operations)
        .flatMap(array => array)
        .sort(
            (a, b) =>
                new Date(a.timestamp).getTime() -
                new Date(b.timestamp).getTime(),
        );
}

// Flattens the mapped operations (with ignore flag) from all scopes into
// a single array and sorts them by timestamp
export function sortMappedOperations<A extends Action>(
    operations: DocumentOperationsIgnoreMap<A>,
) {
    return Object.values(operations)
        .flatMap(array => array)
        .sort(
            (a, b) =>
                new Date(a.operation.timestamp).getTime() -
                new Date(b.operation.timestamp).getTime(),
        );
}

// Runs the operations on the initial data using the
// provided reducer, wrapped with the document reducer.
// This rebuilds the document according to the provided actions.
export function replayOperations<T, A extends Action, L>(
    initialState: ExtendedState<T, L>,
    operations: DocumentOperations<A>,
    reducer: ImmutableStateReducer<T, A, L>,
    dispatch?: SignalDispatch,
    header?: DocumentHeader,
    documentReducer = baseReducer,
): Document<T, A, L> {
    // wraps the provided custom reducer with the
    // base document reducer
    const wrappedReducer = createReducer(reducer, documentReducer);

    return replayDocument(
        initialState,
        operations,
        wrappedReducer,
        dispatch,
        header,
    );
}

// Runs the operations on the initial data using the
// provided document reducer.
// This rebuilds the document according to the provided actions.
export function replayDocument<T, A extends Action, L>(
    initialState: ExtendedState<T, L>,
    operations: DocumentOperations<A>,
    reducer: Reducer<T, A, L>,
    dispatch?: SignalDispatch,
    header?: DocumentHeader,
): Document<T, A, L> {
    // builds a new document from the initial data
    const document = createDocument<T, A, L>(initialState);

    // removes undone operations from global scope
    const activeOperations = Object.keys(operations).reduce((acc, curr) => {
        const scope = curr as keyof DocumentOperations<A>;
        return {
            ...acc,
            [scope]: operations[scope].slice(0, header?.revision[scope]),
        };
    }, {} as DocumentOperations<A>);

    const activeOperationsMap = Object.keys(activeOperations).reduce(
        (acc, curr) => {
            const scope = curr as keyof DocumentOperations<A>;
            return {
                ...acc,
                [scope]: mapSkippedOperations(activeOperations[scope]),
            };
        },
        {} as DocumentOperationsIgnoreMap<A>,
    );

    // runs all the operations not ignored on the new document
    // and returns the resulting state
    const result = sortMappedOperations(activeOperationsMap).reduce(
        (document, { ignore, operation }) => {
            if (ignore) {
                // ignored operations are replaced by NOOP operations
                return reducer(document, noop(operation.scope), dispatch, {
                    skip: operation.skip,
                });
            }

            return reducer(document, operation, dispatch);
        },
        document,
    );

    const resultOperations: DocumentOperations<A> = Object.keys(
        result.operations,
    ).reduce(
        (acc, key) => {
            const scope = key as keyof DocumentOperations<A>;
            const undoneOperations =
                header && header.revision[scope] < operations[scope].length
                    ? operations[scope].slice(header.revision[scope])
                    : [];
            return {
                ...acc,
                [scope]: [
                    ...result.operations[scope].map((operation, index) => {
                        return {
                            ...operation,
                            timestamp:
                                operations[scope][index]?.timestamp ??
                                operation.timestamp,
                        };
                    }),
                    ...undoneOperations,
                ],
            };
        },
        { global: [], local: [] },
    );

    return { ...result, operations: resultOperations };
}

import {
    BaseAction,
    SET_NAME,
    UNDO,
    UndoAction,
    isBaseAction,
} from './actions';
import { Action, Document, Reducer } from './types';
import { initDocument } from './utils';

function updateHeader<T, A extends Action>(
    state: Document<T, A>
): Document<T, A> {
    return {
        ...state,
        revision: state.operations.length,
        lastModified: new Date().toISOString(),
    };
}

function updateOperations<T, A extends Action>(
    state: Document<T, A>,
    action: A
): Document<T, A> {
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

function updateDocument<T, A extends Action>(
    state: Document<T, A>,
    action: A
): Document<T, A> {
    let newState = updateOperations(state, action);
    newState = updateHeader(newState);
    return newState;
}

export function getActionsToApplyWithUndo<A extends Action>(
    actions: A[],
    undoCount: number
): A[] {
    return actions
        .reduce(
            (acc, curr) =>
                curr.type === UNDO
                    ? acc.slice(0, -(curr as UndoAction).input)
                    : [...acc, curr],
            new Array<A>()
        )
        .slice(0, undoCount > 0 ? -undoCount : undefined);
}

function undoOperations<T, A extends Action>(
    state: Document<T, A>,
    count: number,
    composedReducer: Reducer<Document<T, A>, A>
): Document<T, A> {
    const actions = getActionsToApplyWithUndo(state.operations, count);
    const newState = actions.reduce(
        (acc, curr) => composedReducer(acc, curr),
        initDocument<T, A>({ data: state.initialData })
    );
    return { ...state, data: newState.data };
}

function _baseReducer<T, A extends Action>(
    state: Document<T, A>,
    action: BaseAction,
    composedReducer: Reducer<Document<T, A>, A>
): Document<T, A> {
    switch (action.type) {
        case SET_NAME:
            return {
                ...state,
                name: action.input,
            };
        case UNDO:
            return undoOperations(state, action.input, composedReducer);
        default:
            return state;
    }
}

export function baseReducer<T, A extends Action>(
    state: Document<T, A>,
    action: A,
    composedReducer: Reducer<Document<T, A>, A>
): Document<T, A> {
    let newState = state;

    if (isBaseAction(action)) {
        newState = _baseReducer<T, A>(state, action, composedReducer);
    }

    newState = updateDocument<T, A>(newState, action);
    return newState;
}

import {
    BaseAction,
    isBaseAction,
    loadStateOperation,
    LOAD_STATE,
    PRUNE,
    pruneOperation,
    REDO,
    redoOperation,
    setNameOperation,
    SET_NAME,
    UNDO,
    undoOperation,
} from './actions';
import { Action, Document, ImmutableReducer } from './types';

function getNextRevision(state: Document, action: Action): number {
    // UNDO, REDO and PRUNE alter the revision themselves
    return [UNDO, REDO, PRUNE].includes(action.type)
        ? state.revision
        : state.revision + 1;
}

// updates the document revision number and
// the date of the last modification
function updateHeader<T, A extends Action>(
    state: Document<T, A>,
    action: A
): Document<T, A> {
    return {
        ...state,
        revision: getNextRevision(state, action),
        lastModified: new Date().toISOString(),
    };
}

// updates the operations history according to the
// provided action
function updateOperations<T, A extends Action>(
    state: Document<T, A>,
    action: A
): Document<T, A> {
    // UNDO, REDO and PRUNE are meta operations
    // that alter the operations history themselves
    if ([UNDO, REDO, PRUNE, PRUNE].includes(action.type)) {
        return state;
    }

    // removes undone operations from history if there
    // is a new operation after an UNDO
    const operations = state.operations.slice(0, state.revision);

    // adds the action to the operations history with
    // the latest index
    return {
        ...state,
        operations: [
            ...operations,
            {
                ...action,
                index: operations.length,
            },
        ],
    };
}

function updateDocument<T, A extends Action>(
    state: Document<T, A>,
    action: A | BaseAction
): Document<T, A> {
    let newState = updateOperations(state, action);
    newState = updateHeader(newState, action);
    return newState;
}

// reducer for the base document actions
function _baseReducer<T, A extends Action>(
    state: Document<T, A>,
    action: BaseAction,
    wrappedReducer: ImmutableReducer<T, A>
): Document<T, A> {
    switch (action.type) {
        case SET_NAME:
            return setNameOperation(state, action.input);
        case UNDO:
            return undoOperation(state, action.input, wrappedReducer);
        case REDO:
            return redoOperation(state, action.input, wrappedReducer);
        case PRUNE:
            return pruneOperation(
                state,
                action.input.start,
                action.input.end,
                wrappedReducer
            );
        case LOAD_STATE:
            return loadStateOperation(state, action.input.state);
        default:
            return state;
    }
}

// Base document reducer that wraps a custom document reducer
export function baseReducer<T, A extends Action>(
    state: Document<T, A>,
    action: A | BaseAction,
    customReducer: ImmutableReducer<T, A>
) {
    let newState = state;

    // if the action is one the base document actions (SET_NAME, UNDO, REDO, PRUNE)
    // then runs the base reducer first
    if (isBaseAction(action)) {
        newState = _baseReducer(newState, action, customReducer);
    }

    // updates the document revision number, last modified date
    // and operation history
    newState = updateDocument(newState, action);
    return newState;
}

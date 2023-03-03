import { Action, Document, Reducer } from '../types';
import { createAction, createDocument, createReducer } from '../utils';
import {
    SET_NAME,
    UNDO,
    REDO,
    PRUNE,
    BaseAction,
    UndoAction,
    SetNameAction,
    RedoAction,
    PruneAction,
} from './types';

export const setName = (name: string) =>
    createAction<SetNameAction>(SET_NAME, name);
export const undo = (count = 1) => createAction<UndoAction>(UNDO, count);
export const redo = (count = 1) => createAction<RedoAction>(REDO, count);
export const prune = (count: number) => createAction<PruneAction>(PRUNE, count);

export function isBaseAction(action: Action): action is BaseAction {
    return [SET_NAME, UNDO, REDO, PRUNE].includes(action.type);
}

export function replayOperations<T, A extends Action>(
    state: Document<T, A | BaseAction>,
    actions: Array<A | BaseAction>,
    reducer: Reducer<Document<T, A>, A>
): Document<T, A | BaseAction> {
    const composedReducer = createReducer(reducer);
    return actions.reduce(
        (acc, curr) => composedReducer(acc, curr),
        createDocument({ data: state.initialData })
    );
}

export function setNameOperation<T, A extends Action>(
    state: Document<T, A | BaseAction>,
    name: string
): Document<T, A | BaseAction> {
    return { ...state, name };
}

export function undoOperation<T, A extends Action>(
    state: Document<T, A | BaseAction>,
    count: number,
    composedReducer: Reducer<Document<T, A>, A>
): Document<T, A | BaseAction> {
    // undo can't be higher than the number of operations
    const undoCount = Math.min(count, state.revision);

    // builds the state from the initial data without the
    // undone operations
    const actions = state.operations.slice(0, state.revision - undoCount);
    const newState = replayOperations(state, actions, composedReducer);

    // updates the state and the revision number but
    // keeps the operations history to allow REDO
    return {
        ...newState,
        operations: state.operations,
        revision: state.revision - undoCount,
    };
}

export function redoOperation<T, A extends Action>(
    state: Document<T, A | BaseAction>,
    count: number,
    composedReducer: Reducer<Document<T, A>, A>
): Document<T, A | BaseAction> {
    const undoCount = state.operations.length - state.revision;
    if (!undoCount) {
        throw new Error('There is no UNDO operation to REDO');
    }
    const redoCount = count < undoCount ? count : undoCount;
    const actions = state.operations.slice(0, state.revision + redoCount);
    const newState = replayOperations(state, actions, composedReducer);
    return {
        ...newState,
        operations: state.operations,
        data: newState.data,
        revision: state.revision + redoCount,
    };
}

export function pruneOperation<T, A extends Action>(
    state: Document<T, A | BaseAction>,
    count: number,
    composedReducer: Reducer<Document<T, A>, A>
): Document<T, A | BaseAction> {
    const actionsToPrune = state.operations.slice(0, count);
    const actionsToKeep = state.operations.slice(count);
    const newState = replayOperations(state, actionsToPrune, composedReducer);
    return {
        ...newState,
        initialData: newState.data,
        operations: actionsToKeep.map((action, index) => ({
            ...action,
            index,
        })),
        data: state.data,
    };
}

export * from './types';

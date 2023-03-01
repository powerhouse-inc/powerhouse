import { Action, Document, Reducer } from '../types';
import { createAction, createDocument } from '../utils';
import { SET_NAME, UNDO, REDO, PRUNE, BaseAction, UndoAction } from './types';

export const setName = (name: string) => createAction(SET_NAME, name);
export const undo = (count = 1) => createAction(UNDO, count);
export const redo = (count = 1) => createAction(REDO, count);
export const prune = (count: number) => createAction(PRUNE, count);

export function isBaseAction(action: Action): action is BaseAction {
    return [SET_NAME, UNDO, REDO, PRUNE].includes(action.type);
}

export function _getActionsToApplyWithUndo<A extends Action>(
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

export function _getActionsToApplyWithRedo<A extends Action>(
    actions: A[],
    redoCount: number
): A[] {
    const lastAction = actions.length ? actions[actions.length - 1] : undefined;
    if (lastAction?.type !== UNDO) {
        throw new Error('There is no UNDO operation to REDO');
    }

    let newActions = actions.slice();
    let count = redoCount;
    for (let i = newActions.length - 1; i >= 0; i--) {
        const action = newActions[i];
        if (action.type !== UNDO) {
            break;
        }
        const undoCount = action.input as number;
        action.input = undoCount - count;
        count -= undoCount;
        if (count < 1) {
            break;
        }
    }

    newActions = newActions.filter(
        action => !(action.type === UNDO && (action.input as number) < 1)
    );
    return _getActionsToApplyWithUndo(newActions, 0);
}

export function setNameOperation<T, A extends Action>(
    state: Document<T, A>,
    name: string
): Document<T, A> {
    return { ...state, name };
}

export function undoOperation<T, A extends Action>(
    state: Document<T, A>,
    count: number,
    composedReducer: Reducer<Document<T, A>, A>
): Document<T, A> {
    const actions = _getActionsToApplyWithUndo(state.operations, count);
    const newState = actions.reduce(
        (acc, curr) => composedReducer(acc, curr),
        createDocument<T, A>({ data: state.initialData })
    );
    return { ...state, data: newState.data };
}

export function redoOperation<T, A extends Action>(
    state: Document<T, A>,
    count: number,
    composedReducer: Reducer<Document<T, A>, A>
): Document<T, A> {
    const actions = _getActionsToApplyWithRedo(state.operations, count);
    const newState = actions.reduce(
        (acc, curr) => composedReducer(acc, curr),
        createDocument<T, A>({ data: state.initialData })
    );
    return {
        ...state,
        data: newState.data,
        operations: actions.map((action, index) => ({ ...action, index })),
    };
}

export * from './types';

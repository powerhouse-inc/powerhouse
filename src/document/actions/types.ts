import { Action } from '../types';

export const SET_NAME = 'SET_NAME';
export const UNDO = 'UNDO';
export const REDO = 'REDO';
export const PRUNE = 'PRUNE';

export interface SetNameAction extends Action {
    type: typeof SET_NAME;
    input: string;
}

export interface UndoAction extends Action {
    type: typeof UNDO;
    input: number;
}

export interface RedoAction extends Action {
    type: typeof REDO;
    input: number;
}

export interface PruneAction extends Action {
    type: typeof PRUNE;
    input: number;
}

export type BaseAction = SetNameAction | UndoAction | RedoAction | PruneAction;

export function isBaseAction(action: Action): action is BaseAction {
    return [SET_NAME, UNDO, REDO, PRUNE].includes(action.type);
}

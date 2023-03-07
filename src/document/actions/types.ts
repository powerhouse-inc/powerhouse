import { Action, Document } from '../types';

export const INIT = 'INIT';
export const SET_NAME = 'SET_NAME';
export const UNDO = 'UNDO';
export const REDO = 'REDO';
export const PRUNE = 'PRUNE';

export interface InitAction extends Action {
    type: typeof INIT;
    input: Partial<Document>;
}

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

export type BaseAction =
    | InitAction
    | SetNameAction
    | UndoAction
    | RedoAction
    | PruneAction;

export function isBaseAction(action: Action): action is BaseAction {
    return [INIT, SET_NAME, UNDO, REDO, PRUNE].includes(action.type);
}

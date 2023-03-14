import { Action, Document } from '../types';

export const SET_NAME = 'SET_NAME';
export const UNDO = 'UNDO';
export const REDO = 'REDO';
export const PRUNE = 'PRUNE';
export const LOAD_STATE = 'LOAD_STATE';

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
    input: {
        start?: number | undefined;
        end?: number | undefined;
    };
}

export interface LoadStateAction extends Action {
    type: typeof LOAD_STATE;
    input: {
        state: Pick<Document, 'data' | 'name'>;
        operations: number;
    };
}

export type BaseAction =
    | SetNameAction
    | UndoAction
    | RedoAction
    | PruneAction
    | LoadStateAction;

export function isBaseAction(action: Action): action is BaseAction {
    return [SET_NAME, UNDO, REDO, PRUNE, LOAD_STATE].includes(action.type);
}

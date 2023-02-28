import { Action } from './types';
import { action } from './utils';

export const INIT = 'INIT';
export const SET_NAME = 'SET_NAME';
export const UNDO = 'UNDO';
export const REDO = 'REDO';
export const PRUNE = 'PRUNE';

export interface InitAction extends Action {
    type: typeof INIT;
}

export interface SetNameAction extends Action {
    type: typeof SET_NAME;
    input: string;
}

export interface UndoAction extends Action {
    type: typeof UNDO;
    input: string;
}

export interface RedoAction extends Action {
    type: typeof REDO;
    input: string;
}

export interface PruneAction extends Action {
    type: typeof PRUNE;
    input: string;
}

export type BaseAction = SetNameAction | UndoAction | RedoAction | PruneAction;

export const setName = (name: string) => action(SET_NAME, name);

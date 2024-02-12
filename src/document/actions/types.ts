import { BaseAction } from '../types';

export const SET_NAME = 'SET_NAME';
export const UNDO = 'UNDO';
export const REDO = 'REDO';
export const PRUNE = 'PRUNE';
export const LOAD_STATE = 'LOAD_STATE';
export const NOOP = 'NOOP';

export {
    LoadStateAction,
    PruneAction,
    RedoAction,
    SetNameAction,
    UndoAction,
    NOOPAction,
} from '../types';
export type { BaseAction };

import { BaseAction } from '../types';

export const SET_NAME = 'SET_NAME';
export const UNDO = 'UNDO';
export const REDO = 'REDO';
export const PRUNE = 'PRUNE';
export const LOAD_STATE = 'LOAD_STATE';

export {
    LoadStateAction,
    PruneAction,
    RedoAction,
    SetNameAction,
    UndoAction,
} from '../types';
export type { BaseAction };

import { createAction, Document } from '..';
import {
    SET_NAME,
    UNDO,
    REDO,
    PRUNE,
    UndoAction,
    SetNameAction,
    RedoAction,
    PruneAction,
    INIT,
    InitAction,
} from './types';

export const init = (input: Partial<Document>) =>
    createAction<InitAction>(INIT, input);
export const setName = (name: string) =>
    createAction<SetNameAction>(SET_NAME, name);
export const undo = (count = 1) => createAction<UndoAction>(UNDO, count);
export const redo = (count = 1) => createAction<RedoAction>(REDO, count);
export const prune = (count: number) => createAction<PruneAction>(PRUNE, count);

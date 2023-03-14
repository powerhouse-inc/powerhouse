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
    LoadStateAction,
    LOAD_STATE,
} from './types';

export const setName = (name: string) =>
    createAction<SetNameAction>(SET_NAME, name);

export const undo = (count = 1) => createAction<UndoAction>(UNDO, count);

export const redo = (count = 1) => createAction<RedoAction>(REDO, count);

export const prune = (start?: number | undefined, end?: number | undefined) =>
    createAction<PruneAction>(PRUNE, { start, end });

export const loadState = (
    state: Pick<Document, 'data' | 'name'>,
    operations: number
) => createAction<LoadStateAction>(LOAD_STATE, { state, operations });

import type { BaseAction } from '@acaldas/document-model-graphql/document';
import { Action } from '../types';

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
} from '@acaldas/document-model-graphql/document';
export { BaseAction };

export function isBaseAction(action: Action): action is BaseAction {
    return [SET_NAME, UNDO, REDO, PRUNE, LOAD_STATE].includes(action.type);
}

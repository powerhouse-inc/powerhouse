import { z } from '@acaldas/document-model-graphql/document';
import { ExtendedState } from '../types';
import { createAction } from '../utils';
import {
    LoadStateAction,
    PruneAction,
    RedoAction,
    SetNameAction,
    UndoAction,
} from './types';

/**
 * Changes the name of the document.
 *
 * @param name - The name to be set in the document.
 * @category Actions
 */
export const setName = (name: string) =>
    createAction<SetNameAction>('SET_NAME', name, z.SetNameActionSchema);

/**
 * Cancels the last `count` operations.
 *
 * @param count - Number of operations to cancel
 * @category Actions
 */
export const undo = (count = 1) =>
    createAction<UndoAction>('UNDO', count, z.UndoActionSchema);

/**
 * Cancels the last `count` {@link undo | UNDO} operations.
 *
 * @param count - Number of UNDO operations to cancel
 * @category Actions
 */
export const redo = (count = 1) =>
    createAction<RedoAction>('REDO', count, z.RedoActionSchema);

/**
 * Joins multiple operations into a single {@link loadState | LOAD_STATE} operation.
 *
 * @remarks
 * Useful to keep operations history smaller. Operations to prune are selected by index,
 * similar to the {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice | slice} method in Arrays.
 *
 * @param start - Index of the first operation to prune
 * @param end - Index of the last operation to prune
 * @category Actions
 */
export const prune = (start?: number | undefined, end?: number | undefined) =>
    createAction<PruneAction>('PRUNE', { start, end }, z.PruneActionSchema);

/**
 * Replaces the state of the document.
 *
 * @remarks
 * This action shouldn't be used directly. It is dispatched by the {@link prune} action.
 *
 * @param state - State to be set in the document.
 * @param operations - Number of operations that were removed from the previous state.
 * @category Actions
 */
export const loadState = (
    state: Pick<ExtendedState, 'state' | 'name'>,
    operations: number
) =>
    createAction<LoadStateAction>(
        'LOAD_STATE',
        { state, operations },
        z.LoadStateActionSchema
    );

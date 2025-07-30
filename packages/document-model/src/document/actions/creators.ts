import {
  LoadStateActionInputSchema,
  PruneActionInputSchema,
  RedoActionInputSchema,
  SetNameActionInputSchema,
  UndoActionInputSchema,
} from "../schema/zod.js";
import { type DefaultAction, type ExtendedState } from "../types.js";
import { createAction } from "../utils/base.js";
import {
  type LoadStateAction,
  type NOOPAction,
  type PruneAction,
  type RedoAction,
  type SetNameAction,
  type UndoAction,
} from "./types.js";

/**
 * Changes the name of the document.
 *
 * @param name - The name to be set in the document.
 * @category Actions
 */
export const setName = (name: string) =>
  createAction<SetNameAction>(
    "SET_NAME",
    name,
    undefined,
    SetNameActionInputSchema,
    undefined,
  );

/**
 * Cancels the last `count` operations.
 *
 * @param count - Number of operations to cancel
 * @category Actions
 */
export const undo = (skip = 1, scope: string = "global") =>
  createAction<UndoAction>(
    "UNDO",
    skip,
    undefined,
    UndoActionInputSchema,
    scope,
  );

/**
 * Cancels the last `count` {@link undo | UNDO} operations.
 *
 * @param count - Number of UNDO operations to cancel
 * @category Actions
 */
export const redo = (count = 1, scope: string = "global") =>
  createAction<RedoAction>(
    "REDO",
    count,
    undefined,
    RedoActionInputSchema,
    scope,
  );

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
export const prune = (
  start?: number | undefined,
  end?: number | undefined,
  scope: string = "global",
) =>
  createAction<PruneAction>(
    "PRUNE",
    { start, end },
    undefined,
    PruneActionInputSchema,
    scope,
  );

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
export const loadState = <S, T>(
  state: Pick<ExtendedState<S, T>, "state"> & { name: string },
  operations: number,
) =>
  createAction<LoadStateAction>(
    "LOAD_STATE",
    { state: { name: state.name, ...state.state }, operations },
    undefined,
    LoadStateActionInputSchema,
  );

export const noop = (scope: string = "global") =>
  createAction<NOOPAction>("NOOP", undefined, undefined, undefined, scope);

export const actions = {
  setName,
  undo,
  redo,
  prune,
  loadState,
  noop,
} as unknown as Record<string, (input: any) => DefaultAction>;
// TODO improve base actions type

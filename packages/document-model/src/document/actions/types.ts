import type {
  LoadStateActionInput,
  PruneActionInput,
  RedoAction as _RedoAction,
  SetNameAction as _SetNameAction,
  UndoAction as _UndoAction,
  NOOPAction as _NOOPAction,
} from "../schema/types.js";
import type { Action } from "../types.js";

export const SET_NAME = "SET_NAME";
export const UNDO = "UNDO";
export const REDO = "REDO";
export const PRUNE = "PRUNE";
export const LOAD_STATE = "LOAD_STATE";
export const NOOP = "NOOP";

export type LoadStateAction = Action & {
  type: "LOAD_STATE";
  input: LoadStateActionInput;
};
export type PruneAction = Action & { type: "PRUNE"; input: PruneActionInput };
export type RedoAction = Action & { type: "REDO"; input: _RedoAction["input"] };
export type SetNameAction = Action & {
  type: "SET_NAME";
  input: _SetNameAction["input"];
};
export type UndoAction = Action & { type: "UNDO"; input: _UndoAction["input"] };
export type NOOPAction = Action & { type: "NOOP"; input: _NOOPAction["input"] };

export type DocumentAction =
  | LoadStateAction
  | PruneAction
  | RedoAction
  | SetNameAction
  | UndoAction
  | NOOPAction;

import type { Action } from "../types";
import type {
  LoadStateActionInput,
  PruneActionInput,
  RedoAction as _RedoAction,
  SetNameAction as _SetNameAction,
  UndoAction as _UndoAction,
} from "../schema/types";

export const SET_NAME = "SET_NAME";
export const UNDO = "UNDO";
export const REDO = "REDO";
export const PRUNE = "PRUNE";
export const LOAD_STATE = "LOAD_STATE";
export const NOOP = "NOOP";

export type LoadStateAction = Action<"LOAD_STATE", LoadStateActionInput>;
export type PruneAction = Action<"PRUNE", PruneActionInput>;
export type RedoAction = Action<"REDO", _RedoAction["input"]>;
export type SetNameAction = Action<"SET_NAME", _SetNameAction["input"]>;
export type UndoAction = Action<"UNDO", _UndoAction["input"]>;
export type NOOPAction = Action<"NOOP">;

export type BaseAction =
  | LoadStateAction
  | PruneAction
  | RedoAction
  | SetNameAction
  | UndoAction
  | NOOPAction;

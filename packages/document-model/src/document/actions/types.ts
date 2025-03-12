import type {
  LoadStateActionInput,
  PruneActionInput,
  RedoAction as _RedoAction,
  SetNameAction as _SetNameAction,
  UndoAction as _UndoAction,
  NOOPAction as _NOOPAction,
} from "../schema/types.js";
import type { BaseAction } from "../types.js";

export const SET_NAME = "SET_NAME";
export const UNDO = "UNDO";
export const REDO = "REDO";
export const PRUNE = "PRUNE";
export const LOAD_STATE = "LOAD_STATE";
export const NOOP = "NOOP";

export type LoadStateAction = BaseAction<"LOAD_STATE", LoadStateActionInput>;
export type PruneAction = BaseAction<"PRUNE", PruneActionInput>;
export type RedoAction = BaseAction<"REDO", _RedoAction["input"]>;
export type SetNameAction = BaseAction<"SET_NAME", _SetNameAction["input"]>;
export type UndoAction = BaseAction<"UNDO", _UndoAction["input"]>;
export type NOOPAction = BaseAction<"NOOP", _NOOPAction["input"]>;

export type DocumentAction =
  | LoadStateAction
  | PruneAction
  | RedoAction
  | SetNameAction
  | UndoAction
  | NOOPAction;

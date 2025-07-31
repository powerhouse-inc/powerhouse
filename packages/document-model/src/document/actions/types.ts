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

export type LoadStateAction = BaseAction<LoadStateActionInput> & { type: "LOAD_STATE" };
export type PruneAction = BaseAction<PruneActionInput> & { type: "PRUNE" };
export type RedoAction = BaseAction<_RedoAction["input"]> & { type: "REDO" };
export type SetNameAction = BaseAction<_SetNameAction["input"]> & { type: "SET_NAME" };
export type UndoAction = BaseAction<_UndoAction["input"]> & { type: "UNDO" };
export type NOOPAction = BaseAction<_NOOPAction["input"]> & { type: "NOOP" };

export type DocumentAction =
  | LoadStateAction
  | PruneAction
  | RedoAction
  | SetNameAction
  | UndoAction
  | NOOPAction;

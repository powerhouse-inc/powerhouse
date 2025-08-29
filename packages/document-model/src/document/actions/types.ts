import type {
  Action,
  LoadStateActionInput,
  PruneActionInput,
  SchemaNOOPAction as _NOOPAction,
  SchemaRedoAction as _RedoAction,
  SchemaSetNameAction as _SetNameAction,
  SchemaUndoAction as _UndoAction,
} from "document-model";

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

/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  AddItemInput,
  CheckItemInput,
  SetPriorityInput,
  SetStatusInput,
} from "../types.js";

export type AddItemAction = Action & { type: "ADD_ITEM"; input: AddItemInput };
export type CheckItemAction = Action & {
  type: "CHECK_ITEM";
  input: CheckItemInput;
};
export type SetStatusAction = Action & {
  type: "SET_STATUS";
  input: SetStatusInput;
};
export type SetPriorityAction = Action & {
  type: "SET_PRIORITY";
  input: SetPriorityInput;
};

export type TodoTodoAction =
  | AddItemAction
  | CheckItemAction
  | SetStatusAction
  | SetPriorityAction;

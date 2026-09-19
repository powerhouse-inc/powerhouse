/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { TodoGlobalState } from "../types.js";
import type {
  AddItemAction,
  CheckItemAction,
  SetPriorityAction,
  SetStatusAction,
} from "./actions.js";

export interface TodoTodoOperations {
  addItemOperation: (
    state: TodoGlobalState,
    action: AddItemAction,
    dispatch?: SignalDispatch,
  ) => void;
  checkItemOperation: (
    state: TodoGlobalState,
    action: CheckItemAction,
    dispatch?: SignalDispatch,
  ) => void;
  setStatusOperation: (
    state: TodoGlobalState,
    action: SetStatusAction,
    dispatch?: SignalDispatch,
  ) => void;
  setPriorityOperation: (
    state: TodoGlobalState,
    action: SetPriorityAction,
    dispatch?: SignalDispatch,
  ) => void;
}

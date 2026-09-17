/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { TodoGlobalState } from "../types.js";
import type { AddItemAction, CheckItemAction } from "./actions.js";

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
}

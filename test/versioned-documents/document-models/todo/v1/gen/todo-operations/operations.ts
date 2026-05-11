/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { TodoGlobalState } from "../types.js";
import type {
  AddTodoAction,
  RemoveTodoAction,
  UpdateTodoAction,
} from "./actions.js";

export interface TodoTodoOperationsOperations {
  addTodoOperation: (
    state: TodoGlobalState,
    action: AddTodoAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeTodoOperation: (
    state: TodoGlobalState,
    action: RemoveTodoAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateTodoOperation: (
    state: TodoGlobalState,
    action: UpdateTodoAction,
    dispatch?: SignalDispatch,
  ) => void;
}

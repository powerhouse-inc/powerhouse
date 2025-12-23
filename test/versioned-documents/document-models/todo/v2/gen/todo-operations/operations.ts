import { type SignalDispatch } from "document-model";
import type {
  AddTodoAction,
  RemoveTodoAction,
  UpdateTodoAction,
  EditTitleAction,
} from "./actions.js";
import type { TodoState } from "../types.js";

export interface TodoTodoOperationsOperations {
  addTodoOperation: (
    state: TodoState,
    action: AddTodoAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeTodoOperation: (
    state: TodoState,
    action: RemoveTodoAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateTodoOperation: (
    state: TodoState,
    action: UpdateTodoAction,
    dispatch?: SignalDispatch,
  ) => void;
  editTitleOperation: (
    state: TodoState,
    action: EditTitleAction,
    dispatch?: SignalDispatch,
  ) => void;
}

import { type SignalDispatch } from "document-model";
import type {
  AddTodoItemAction,
  UpdateTodoItemAction,
  DeleteTodoItemAction,
} from "./actions.js";
import type { TodoListState } from "../types.js";

export interface TodoListTodosOperations {
  addTodoItemOperation: (
    state: TodoListState,
    action: AddTodoItemAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateTodoItemOperation: (
    state: TodoListState,
    action: UpdateTodoItemAction,
    dispatch?: SignalDispatch,
  ) => void;
  deleteTodoItemOperation: (
    state: TodoListState,
    action: DeleteTodoItemAction,
    dispatch?: SignalDispatch,
  ) => void;
}

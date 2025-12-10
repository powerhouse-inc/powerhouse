import { type SignalDispatch } from "document-model";
import {
  type AddTodoItemInputAction,
  type UpdateTodoItemInputAction,
  type DeleteTodoItemInputAction,
} from "./actions.js";
import { type ToDoDocumentState } from "../types.js";

export interface ToDoDocumentBaseOperationsOperations {
  addTodoItemInputOperation: (
    state: ToDoDocumentState,
    action: AddTodoItemInputAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateTodoItemInputOperation: (
    state: ToDoDocumentState,
    action: UpdateTodoItemInputAction,
    dispatch?: SignalDispatch,
  ) => void;
  deleteTodoItemInputOperation: (
    state: ToDoDocumentState,
    action: DeleteTodoItemInputAction,
    dispatch?: SignalDispatch,
  ) => void;
}

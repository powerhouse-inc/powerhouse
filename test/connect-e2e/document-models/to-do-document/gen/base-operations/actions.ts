import { type Action } from "document-model";
import type {
  AddTodoItemInputInput,
  UpdateTodoItemInputInput,
  DeleteTodoItemInputInput,
} from "../types.js";

export type AddTodoItemInputAction = Action & {
  type: "ADD_TODO_ITEM_INPUT";
  input: AddTodoItemInputInput;
};
export type UpdateTodoItemInputAction = Action & {
  type: "UPDATE_TODO_ITEM_INPUT";
  input: UpdateTodoItemInputInput;
};
export type DeleteTodoItemInputAction = Action & {
  type: "DELETE_TODO_ITEM_INPUT";
  input: DeleteTodoItemInputInput;
};

export type ToDoDocumentBaseOperationsAction =
  | AddTodoItemInputAction
  | UpdateTodoItemInputAction
  | DeleteTodoItemInputAction;

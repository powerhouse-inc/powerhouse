import type { Action } from "document-model";
import type {
  AddTodoItemInput,
  UpdateTodoItemInput,
  DeleteTodoItemInput,
} from "../types.js";

export type AddTodoItemAction = Action & {
  type: "ADD_TODO_ITEM";
  input: AddTodoItemInput;
};
export type UpdateTodoItemAction = Action & {
  type: "UPDATE_TODO_ITEM";
  input: UpdateTodoItemInput;
};
export type DeleteTodoItemAction = Action & {
  type: "DELETE_TODO_ITEM";
  input: DeleteTodoItemInput;
};

export type TodoListTodosAction =
  | AddTodoItemAction
  | UpdateTodoItemAction
  | DeleteTodoItemAction;

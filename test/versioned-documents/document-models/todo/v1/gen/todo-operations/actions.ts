import type { Action } from "document-model";
import type {
  AddTodoInput,
  RemoveTodoInput,
  UpdateTodoInput,
} from "../types.js";

export type AddTodoAction = Action & { type: "ADD_TODO"; input: AddTodoInput };
export type RemoveTodoAction = Action & {
  type: "REMOVE_TODO";
  input: RemoveTodoInput;
};
export type UpdateTodoAction = Action & {
  type: "UPDATE_TODO";
  input: UpdateTodoInput;
};

export type TodoTodoOperationsAction =
  | AddTodoAction
  | RemoveTodoAction
  | UpdateTodoAction;

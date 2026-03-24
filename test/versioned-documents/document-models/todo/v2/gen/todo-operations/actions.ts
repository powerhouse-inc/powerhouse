import type { Action } from "document-model";
import type {
    AddTodoInput,
    EditTitleInput,
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
export type EditTitleAction = Action & {
  type: "EDIT_TITLE";
  input: EditTitleInput;
};

export type TodoTodoOperationsAction =
  | AddTodoAction
  | RemoveTodoAction
  | UpdateTodoAction
  | EditTitleAction;

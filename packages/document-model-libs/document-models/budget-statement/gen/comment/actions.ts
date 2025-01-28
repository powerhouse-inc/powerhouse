import { Action } from "document-model/document";
import {
  AddCommentInput,
  UpdateCommentInput,
  DeleteCommentInput,
} from "../types";

export type AddCommentAction = Action<"ADD_COMMENT", AddCommentInput, "global">;
export type UpdateCommentAction = Action<
  "UPDATE_COMMENT",
  UpdateCommentInput,
  "global"
>;
export type DeleteCommentAction = Action<
  "DELETE_COMMENT",
  DeleteCommentInput,
  "global"
>;

export type BudgetStatementCommentAction =
  | AddCommentAction
  | UpdateCommentAction
  | DeleteCommentAction;

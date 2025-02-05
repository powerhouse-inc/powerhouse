import { BaseAction } from "document-model";
import {
  AddCommentInput,
  UpdateCommentInput,
  DeleteCommentInput,
} from "../schema/types.js";

export type AddCommentAction = BaseAction<"ADD_COMMENT", AddCommentInput, "global">;
export type UpdateCommentAction = BaseAction<
  "UPDATE_COMMENT",
  UpdateCommentInput,
  "global"
>;
export type DeleteCommentAction = BaseAction<
  "DELETE_COMMENT",
  DeleteCommentInput,
  "global"
>;

export type BudgetStatementCommentAction =
  | AddCommentAction
  | UpdateCommentAction
  | DeleteCommentAction;

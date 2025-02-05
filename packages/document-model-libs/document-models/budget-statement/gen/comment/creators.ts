import { createAction } from "document-model";
import { AddCommentInput, UpdateCommentInput, DeleteCommentInput } from "../schema/types.js";
import { AddCommentInputSchema, UpdateCommentInputSchema, DeleteCommentInputSchema } from "../schema/zod.js";
import { AddCommentAction, UpdateCommentAction, DeleteCommentAction } from "./actions.js";


export const addComment = (input: AddCommentInput) =>
  createAction<AddCommentAction>(
    "ADD_COMMENT",
    { ...input },
    undefined,
    AddCommentInputSchema,
    "global",
  );

export const updateComment = (input: UpdateCommentInput) =>
  createAction<UpdateCommentAction>(
    "UPDATE_COMMENT",
    { ...input },
    undefined,
    UpdateCommentInputSchema,
    "global",
  );

export const deleteComment = (input: DeleteCommentInput) =>
  createAction<DeleteCommentAction>(
    "DELETE_COMMENT",
    { ...input },
    undefined,
    DeleteCommentInputSchema,
    "global",
  );

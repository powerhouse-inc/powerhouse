import { utils } from "document-model/document";
import {
  z,
  AddCommentInput,
  UpdateCommentInput,
  DeleteCommentInput,
} from "../types";
import {
  AddCommentAction,
  UpdateCommentAction,
  DeleteCommentAction,
} from "./actions";

const { createAction } = utils;

export const addComment = (input: AddCommentInput) =>
  createAction<AddCommentAction>(
    "ADD_COMMENT",
    { ...input },
    undefined,
    z.AddCommentInputSchema,
    "global",
  );

export const updateComment = (input: UpdateCommentInput) =>
  createAction<UpdateCommentAction>(
    "UPDATE_COMMENT",
    { ...input },
    undefined,
    z.UpdateCommentInputSchema,
    "global",
  );

export const deleteComment = (input: DeleteCommentInput) =>
  createAction<DeleteCommentAction>(
    "DELETE_COMMENT",
    { ...input },
    undefined,
    z.DeleteCommentInputSchema,
    "global",
  );

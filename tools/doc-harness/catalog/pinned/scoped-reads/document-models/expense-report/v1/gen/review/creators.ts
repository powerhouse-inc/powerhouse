/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import { AddReviewNoteInputSchema } from "../schema/zod.js";
import type { AddReviewNoteInput } from "../types.js";
import type { AddReviewNoteAction } from "./actions.js";

export const addReviewNote = (input: AddReviewNoteInput) =>
  createAction<AddReviewNoteAction>(
    "ADD_REVIEW_NOTE",
    { ...input },
    undefined,
    AddReviewNoteInputSchema,
    "local",
  );

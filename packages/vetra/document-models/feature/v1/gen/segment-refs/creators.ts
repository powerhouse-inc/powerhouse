/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddSegmentRefInputSchema,
  RemoveSegmentRefInputSchema,
  ReorderSegmentRefsInputSchema,
  UpdateSegmentRefSnippetInputSchema,
} from "../schema/zod.js";
import type {
  AddSegmentRefInput,
  RemoveSegmentRefInput,
  ReorderSegmentRefsInput,
  UpdateSegmentRefSnippetInput,
} from "../types.js";
import type {
  AddSegmentRefAction,
  RemoveSegmentRefAction,
  ReorderSegmentRefsAction,
  UpdateSegmentRefSnippetAction,
} from "./actions.js";

export const addSegmentRef = (input: AddSegmentRefInput) =>
  createAction<AddSegmentRefAction>(
    "ADD_SEGMENT_REF",
    { ...input },
    undefined,
    AddSegmentRefInputSchema,
    "global",
  );

export const updateSegmentRefSnippet = (input: UpdateSegmentRefSnippetInput) =>
  createAction<UpdateSegmentRefSnippetAction>(
    "UPDATE_SEGMENT_REF_SNIPPET",
    { ...input },
    undefined,
    UpdateSegmentRefSnippetInputSchema,
    "global",
  );

export const removeSegmentRef = (input: RemoveSegmentRefInput) =>
  createAction<RemoveSegmentRefAction>(
    "REMOVE_SEGMENT_REF",
    { ...input },
    undefined,
    RemoveSegmentRefInputSchema,
    "global",
  );

export const reorderSegmentRefs = (input: ReorderSegmentRefsInput) =>
  createAction<ReorderSegmentRefsAction>(
    "REORDER_SEGMENT_REFS",
    { ...input },
    undefined,
    ReorderSegmentRefsInputSchema,
    "global",
  );

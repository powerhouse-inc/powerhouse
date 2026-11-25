/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddTypefaceInputSchema,
  RemoveTypefaceInputSchema,
  ReorderTypefacesInputSchema,
  UpdateTypefaceInputSchema,
} from "../schema/zod.js";
import type {
  AddTypefaceInput,
  RemoveTypefaceInput,
  ReorderTypefacesInput,
  UpdateTypefaceInput,
} from "../types.js";
import type {
  AddTypefaceAction,
  RemoveTypefaceAction,
  ReorderTypefacesAction,
  UpdateTypefaceAction,
} from "./actions.js";

export const addTypeface = (input: AddTypefaceInput) =>
  createAction<AddTypefaceAction>(
    "ADD_TYPEFACE",
    { ...input },
    undefined,
    AddTypefaceInputSchema,
    "global",
  );

export const updateTypeface = (input: UpdateTypefaceInput) =>
  createAction<UpdateTypefaceAction>(
    "UPDATE_TYPEFACE",
    { ...input },
    undefined,
    UpdateTypefaceInputSchema,
    "global",
  );

export const removeTypeface = (input: RemoveTypefaceInput) =>
  createAction<RemoveTypefaceAction>(
    "REMOVE_TYPEFACE",
    { ...input },
    undefined,
    RemoveTypefaceInputSchema,
    "global",
  );

export const reorderTypefaces = (input: ReorderTypefacesInput) =>
  createAction<ReorderTypefacesAction>(
    "REORDER_TYPEFACES",
    { ...input },
    undefined,
    ReorderTypefacesInputSchema,
    "global",
  );

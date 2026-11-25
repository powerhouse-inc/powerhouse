/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddImageryReferenceInputSchema,
  ClearImageryDirectionInputSchema,
  RemoveImageryReferenceInputSchema,
  ReorderImageryReferencesInputSchema,
  SetImageryDirectionInputSchema,
  SetImageryGuidanceInputSchema,
} from "../schema/zod.js";
import type {
  AddImageryReferenceInput,
  ClearImageryDirectionInput,
  RemoveImageryReferenceInput,
  ReorderImageryReferencesInput,
  SetImageryDirectionInput,
  SetImageryGuidanceInput,
} from "../types.js";
import type {
  AddImageryReferenceAction,
  ClearImageryDirectionAction,
  RemoveImageryReferenceAction,
  ReorderImageryReferencesAction,
  SetImageryDirectionAction,
  SetImageryGuidanceAction,
} from "./actions.js";

export const setImageryDirection = (input: SetImageryDirectionInput) =>
  createAction<SetImageryDirectionAction>(
    "SET_IMAGERY_DIRECTION",
    { ...input },
    undefined,
    SetImageryDirectionInputSchema,
    "global",
  );

export const clearImageryDirection = (input: ClearImageryDirectionInput) =>
  createAction<ClearImageryDirectionAction>(
    "CLEAR_IMAGERY_DIRECTION",
    { ...input },
    undefined,
    ClearImageryDirectionInputSchema,
    "global",
  );

export const setImageryGuidance = (input: SetImageryGuidanceInput) =>
  createAction<SetImageryGuidanceAction>(
    "SET_IMAGERY_GUIDANCE",
    { ...input },
    undefined,
    SetImageryGuidanceInputSchema,
    "global",
  );

export const addImageryReference = (input: AddImageryReferenceInput) =>
  createAction<AddImageryReferenceAction>(
    "ADD_IMAGERY_REFERENCE",
    { ...input },
    undefined,
    AddImageryReferenceInputSchema,
    "global",
  );

export const removeImageryReference = (input: RemoveImageryReferenceInput) =>
  createAction<RemoveImageryReferenceAction>(
    "REMOVE_IMAGERY_REFERENCE",
    { ...input },
    undefined,
    RemoveImageryReferenceInputSchema,
    "global",
  );

export const reorderImageryReferences = (
  input: ReorderImageryReferencesInput,
) =>
  createAction<ReorderImageryReferencesAction>(
    "REORDER_IMAGERY_REFERENCES",
    { ...input },
    undefined,
    ReorderImageryReferencesInputSchema,
    "global",
  );

/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  ClearFeatureInputSchema,
  ClearWbsDescriptionInputSchema,
  ClearWbsNameInputSchema,
  SetFeatureInputSchema,
  SetWbsDescriptionInputSchema,
  SetWbsNameInputSchema,
  UpdateFeatureSnippetInputSchema,
} from "../schema/zod.js";
import type {
  ClearFeatureInput,
  ClearWbsDescriptionInput,
  ClearWbsNameInput,
  SetFeatureInput,
  SetWbsDescriptionInput,
  SetWbsNameInput,
  UpdateFeatureSnippetInput,
} from "../types.js";
import type {
  ClearFeatureAction,
  ClearWbsDescriptionAction,
  ClearWbsNameAction,
  SetFeatureAction,
  SetWbsDescriptionAction,
  SetWbsNameAction,
  UpdateFeatureSnippetAction,
} from "./actions.js";

export const setWbsName = (input: SetWbsNameInput) =>
  createAction<SetWbsNameAction>(
    "SET_WBS_NAME",
    { ...input },
    undefined,
    SetWbsNameInputSchema,
    "global",
  );

export const clearWbsName = (input: ClearWbsNameInput) =>
  createAction<ClearWbsNameAction>(
    "CLEAR_WBS_NAME",
    { ...input },
    undefined,
    ClearWbsNameInputSchema,
    "global",
  );

export const setWbsDescription = (input: SetWbsDescriptionInput) =>
  createAction<SetWbsDescriptionAction>(
    "SET_WBS_DESCRIPTION",
    { ...input },
    undefined,
    SetWbsDescriptionInputSchema,
    "global",
  );

export const clearWbsDescription = (input: ClearWbsDescriptionInput) =>
  createAction<ClearWbsDescriptionAction>(
    "CLEAR_WBS_DESCRIPTION",
    { ...input },
    undefined,
    ClearWbsDescriptionInputSchema,
    "global",
  );

export const setFeature = (input: SetFeatureInput) =>
  createAction<SetFeatureAction>(
    "SET_FEATURE",
    { ...input },
    undefined,
    SetFeatureInputSchema,
    "global",
  );

export const updateFeatureSnippet = (input: UpdateFeatureSnippetInput) =>
  createAction<UpdateFeatureSnippetAction>(
    "UPDATE_FEATURE_SNIPPET",
    { ...input },
    undefined,
    UpdateFeatureSnippetInputSchema,
    "global",
  );

export const clearFeature = (input: ClearFeatureInput) =>
  createAction<ClearFeatureAction>(
    "CLEAR_FEATURE",
    { ...input },
    undefined,
    ClearFeatureInputSchema,
    "global",
  );

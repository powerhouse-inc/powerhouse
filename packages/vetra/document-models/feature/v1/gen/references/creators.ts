/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  ClearParentFeatureInputSchema,
  ClearRelatedStepInputSchema,
  ClearRoleInputSchema,
  ClearWbsInputSchema,
  SetParentFeatureInputSchema,
  SetRelatedStepInputSchema,
  SetRoleInputSchema,
  SetWbsInputSchema,
  UpdateParentFeatureSnippetInputSchema,
  UpdateRelatedStepSnippetInputSchema,
  UpdateRoleSnippetInputSchema,
  UpdateWbsSnippetInputSchema,
} from "../schema/zod.js";
import type {
  ClearParentFeatureInput,
  ClearRelatedStepInput,
  ClearRoleInput,
  ClearWbsInput,
  SetParentFeatureInput,
  SetRelatedStepInput,
  SetRoleInput,
  SetWbsInput,
  UpdateParentFeatureSnippetInput,
  UpdateRelatedStepSnippetInput,
  UpdateRoleSnippetInput,
  UpdateWbsSnippetInput,
} from "../types.js";
import type {
  ClearParentFeatureAction,
  ClearRelatedStepAction,
  ClearRoleAction,
  ClearWbsAction,
  SetParentFeatureAction,
  SetRelatedStepAction,
  SetRoleAction,
  SetWbsAction,
  UpdateParentFeatureSnippetAction,
  UpdateRelatedStepSnippetAction,
  UpdateRoleSnippetAction,
  UpdateWbsSnippetAction,
} from "./actions.js";

export const setRole = (input: SetRoleInput) =>
  createAction<SetRoleAction>(
    "SET_ROLE",
    { ...input },
    undefined,
    SetRoleInputSchema,
    "global",
  );

export const updateRoleSnippet = (input: UpdateRoleSnippetInput) =>
  createAction<UpdateRoleSnippetAction>(
    "UPDATE_ROLE_SNIPPET",
    { ...input },
    undefined,
    UpdateRoleSnippetInputSchema,
    "global",
  );

export const clearRole = (input: ClearRoleInput) =>
  createAction<ClearRoleAction>(
    "CLEAR_ROLE",
    { ...input },
    undefined,
    ClearRoleInputSchema,
    "global",
  );

export const setRelatedStep = (input: SetRelatedStepInput) =>
  createAction<SetRelatedStepAction>(
    "SET_RELATED_STEP",
    { ...input },
    undefined,
    SetRelatedStepInputSchema,
    "global",
  );

export const updateRelatedStepSnippet = (
  input: UpdateRelatedStepSnippetInput,
) =>
  createAction<UpdateRelatedStepSnippetAction>(
    "UPDATE_RELATED_STEP_SNIPPET",
    { ...input },
    undefined,
    UpdateRelatedStepSnippetInputSchema,
    "global",
  );

export const clearRelatedStep = (input: ClearRelatedStepInput) =>
  createAction<ClearRelatedStepAction>(
    "CLEAR_RELATED_STEP",
    { ...input },
    undefined,
    ClearRelatedStepInputSchema,
    "global",
  );

export const setParentFeature = (input: SetParentFeatureInput) =>
  createAction<SetParentFeatureAction>(
    "SET_PARENT_FEATURE",
    { ...input },
    undefined,
    SetParentFeatureInputSchema,
    "global",
  );

export const updateParentFeatureSnippet = (
  input: UpdateParentFeatureSnippetInput,
) =>
  createAction<UpdateParentFeatureSnippetAction>(
    "UPDATE_PARENT_FEATURE_SNIPPET",
    { ...input },
    undefined,
    UpdateParentFeatureSnippetInputSchema,
    "global",
  );

export const clearParentFeature = (input: ClearParentFeatureInput) =>
  createAction<ClearParentFeatureAction>(
    "CLEAR_PARENT_FEATURE",
    { ...input },
    undefined,
    ClearParentFeatureInputSchema,
    "global",
  );

export const setWbs = (input: SetWbsInput) =>
  createAction<SetWbsAction>(
    "SET_WBS",
    { ...input },
    undefined,
    SetWbsInputSchema,
    "global",
  );

export const updateWbsSnippet = (input: UpdateWbsSnippetInput) =>
  createAction<UpdateWbsSnippetAction>(
    "UPDATE_WBS_SNIPPET",
    { ...input },
    undefined,
    UpdateWbsSnippetInputSchema,
    "global",
  );

export const clearWbs = (input: ClearWbsInput) =>
  createAction<ClearWbsAction>(
    "CLEAR_WBS",
    { ...input },
    undefined,
    ClearWbsInputSchema,
    "global",
  );

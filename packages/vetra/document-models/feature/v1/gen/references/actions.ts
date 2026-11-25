/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
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

export type SetRoleAction = Action & { type: "SET_ROLE"; input: SetRoleInput };
export type UpdateRoleSnippetAction = Action & {
  type: "UPDATE_ROLE_SNIPPET";
  input: UpdateRoleSnippetInput;
};
export type ClearRoleAction = Action & {
  type: "CLEAR_ROLE";
  input: ClearRoleInput;
};
export type SetRelatedStepAction = Action & {
  type: "SET_RELATED_STEP";
  input: SetRelatedStepInput;
};
export type UpdateRelatedStepSnippetAction = Action & {
  type: "UPDATE_RELATED_STEP_SNIPPET";
  input: UpdateRelatedStepSnippetInput;
};
export type ClearRelatedStepAction = Action & {
  type: "CLEAR_RELATED_STEP";
  input: ClearRelatedStepInput;
};
export type SetParentFeatureAction = Action & {
  type: "SET_PARENT_FEATURE";
  input: SetParentFeatureInput;
};
export type UpdateParentFeatureSnippetAction = Action & {
  type: "UPDATE_PARENT_FEATURE_SNIPPET";
  input: UpdateParentFeatureSnippetInput;
};
export type ClearParentFeatureAction = Action & {
  type: "CLEAR_PARENT_FEATURE";
  input: ClearParentFeatureInput;
};
export type SetWbsAction = Action & { type: "SET_WBS"; input: SetWbsInput };
export type UpdateWbsSnippetAction = Action & {
  type: "UPDATE_WBS_SNIPPET";
  input: UpdateWbsSnippetInput;
};
export type ClearWbsAction = Action & {
  type: "CLEAR_WBS";
  input: ClearWbsInput;
};

export type FeatureReferencesAction =
  | SetRoleAction
  | UpdateRoleSnippetAction
  | ClearRoleAction
  | SetRelatedStepAction
  | UpdateRelatedStepSnippetAction
  | ClearRelatedStepAction
  | SetParentFeatureAction
  | UpdateParentFeatureSnippetAction
  | ClearParentFeatureAction
  | SetWbsAction
  | UpdateWbsSnippetAction
  | ClearWbsAction;

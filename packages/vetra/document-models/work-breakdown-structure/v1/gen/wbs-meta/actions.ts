/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  ClearFeatureInput,
  ClearWbsDescriptionInput,
  ClearWbsNameInput,
  SetFeatureInput,
  SetWbsDescriptionInput,
  SetWbsNameInput,
  UpdateFeatureSnippetInput,
} from "../types.js";

export type SetWbsNameAction = Action & {
  type: "SET_WBS_NAME";
  input: SetWbsNameInput;
};
export type ClearWbsNameAction = Action & {
  type: "CLEAR_WBS_NAME";
  input: ClearWbsNameInput;
};
export type SetWbsDescriptionAction = Action & {
  type: "SET_WBS_DESCRIPTION";
  input: SetWbsDescriptionInput;
};
export type ClearWbsDescriptionAction = Action & {
  type: "CLEAR_WBS_DESCRIPTION";
  input: ClearWbsDescriptionInput;
};
export type SetFeatureAction = Action & {
  type: "SET_FEATURE";
  input: SetFeatureInput;
};
export type UpdateFeatureSnippetAction = Action & {
  type: "UPDATE_FEATURE_SNIPPET";
  input: UpdateFeatureSnippetInput;
};
export type ClearFeatureAction = Action & {
  type: "CLEAR_FEATURE";
  input: ClearFeatureInput;
};

export type WorkBreakdownStructureWbsMetaAction =
  | SetWbsNameAction
  | ClearWbsNameAction
  | SetWbsDescriptionAction
  | ClearWbsDescriptionAction
  | SetFeatureAction
  | UpdateFeatureSnippetAction
  | ClearFeatureAction;

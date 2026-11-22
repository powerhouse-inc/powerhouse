/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  AddImageryReferenceInput,
  ClearImageryDirectionInput,
  RemoveImageryReferenceInput,
  ReorderImageryReferencesInput,
  SetImageryDirectionInput,
  SetImageryGuidanceInput,
} from "../types.js";

export type SetImageryDirectionAction = Action & {
  type: "SET_IMAGERY_DIRECTION";
  input: SetImageryDirectionInput;
};
export type ClearImageryDirectionAction = Action & {
  type: "CLEAR_IMAGERY_DIRECTION";
  input: ClearImageryDirectionInput;
};
export type SetImageryGuidanceAction = Action & {
  type: "SET_IMAGERY_GUIDANCE";
  input: SetImageryGuidanceInput;
};
export type AddImageryReferenceAction = Action & {
  type: "ADD_IMAGERY_REFERENCE";
  input: AddImageryReferenceInput;
};
export type RemoveImageryReferenceAction = Action & {
  type: "REMOVE_IMAGERY_REFERENCE";
  input: RemoveImageryReferenceInput;
};
export type ReorderImageryReferencesAction = Action & {
  type: "REORDER_IMAGERY_REFERENCES";
  input: ReorderImageryReferencesInput;
};

export type BrandSheetImageryAction =
  | SetImageryDirectionAction
  | ClearImageryDirectionAction
  | SetImageryGuidanceAction
  | AddImageryReferenceAction
  | RemoveImageryReferenceAction
  | ReorderImageryReferencesAction;

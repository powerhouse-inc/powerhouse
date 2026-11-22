/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  AddTypefaceInput,
  RemoveTypefaceInput,
  ReorderTypefacesInput,
  UpdateTypefaceInput,
} from "../types.js";

export type AddTypefaceAction = Action & {
  type: "ADD_TYPEFACE";
  input: AddTypefaceInput;
};
export type UpdateTypefaceAction = Action & {
  type: "UPDATE_TYPEFACE";
  input: UpdateTypefaceInput;
};
export type RemoveTypefaceAction = Action & {
  type: "REMOVE_TYPEFACE";
  input: RemoveTypefaceInput;
};
export type ReorderTypefacesAction = Action & {
  type: "REORDER_TYPEFACES";
  input: ReorderTypefacesInput;
};

export type BrandSheetTypographyAction =
  | AddTypefaceAction
  | UpdateTypefaceAction
  | RemoveTypefaceAction
  | ReorderTypefacesAction;

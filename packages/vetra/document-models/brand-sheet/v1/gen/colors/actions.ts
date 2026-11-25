/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  AddColorInput,
  RemoveColorInput,
  ReorderColorsInput,
  UpdateColorInput,
} from "../types.js";

export type AddColorAction = Action & {
  type: "ADD_COLOR";
  input: AddColorInput;
};
export type UpdateColorAction = Action & {
  type: "UPDATE_COLOR";
  input: UpdateColorInput;
};
export type RemoveColorAction = Action & {
  type: "REMOVE_COLOR";
  input: RemoveColorInput;
};
export type ReorderColorsAction = Action & {
  type: "REORDER_COLORS";
  input: ReorderColorsInput;
};

export type BrandSheetColorsAction =
  | AddColorAction
  | UpdateColorAction
  | RemoveColorAction
  | ReorderColorsAction;

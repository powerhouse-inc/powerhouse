/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  AddLogoInput,
  ClearLogoAssetInput,
  RemoveLogoInput,
  ReorderLogosInput,
  SetLogoAssetInput,
  UpdateLogoInput,
} from "../types.js";

export type AddLogoAction = Action & { type: "ADD_LOGO"; input: AddLogoInput };
export type UpdateLogoAction = Action & {
  type: "UPDATE_LOGO";
  input: UpdateLogoInput;
};
export type SetLogoAssetAction = Action & {
  type: "SET_LOGO_ASSET";
  input: SetLogoAssetInput;
};
export type ClearLogoAssetAction = Action & {
  type: "CLEAR_LOGO_ASSET";
  input: ClearLogoAssetInput;
};
export type RemoveLogoAction = Action & {
  type: "REMOVE_LOGO";
  input: RemoveLogoInput;
};
export type ReorderLogosAction = Action & {
  type: "REORDER_LOGOS";
  input: ReorderLogosInput;
};

export type BrandSheetLogosAction =
  | AddLogoAction
  | UpdateLogoAction
  | SetLogoAssetAction
  | ClearLogoAssetAction
  | RemoveLogoAction
  | ReorderLogosAction;

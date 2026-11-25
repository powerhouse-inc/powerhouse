/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  ClearConceptInput,
  ClearMaximInput,
  ClearProductNameInput,
  SetConceptInput,
  SetMaximInput,
  SetProductNameInput,
} from "../types.js";

export type SetProductNameAction = Action & {
  type: "SET_PRODUCT_NAME";
  input: SetProductNameInput;
};
export type ClearProductNameAction = Action & {
  type: "CLEAR_PRODUCT_NAME";
  input: ClearProductNameInput;
};
export type SetMaximAction = Action & {
  type: "SET_MAXIM";
  input: SetMaximInput;
};
export type ClearMaximAction = Action & {
  type: "CLEAR_MAXIM";
  input: ClearMaximInput;
};
export type SetConceptAction = Action & {
  type: "SET_CONCEPT";
  input: SetConceptInput;
};
export type ClearConceptAction = Action & {
  type: "CLEAR_CONCEPT";
  input: ClearConceptInput;
};

export type BrandSheetIdentityAction =
  | SetProductNameAction
  | ClearProductNameAction
  | SetMaximAction
  | ClearMaximAction
  | SetConceptAction
  | ClearConceptAction;

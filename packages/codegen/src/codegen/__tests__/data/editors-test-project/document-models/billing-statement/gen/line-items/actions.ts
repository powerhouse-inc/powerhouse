import { type Action } from "document-model";
import type { AddLineItemInput, EditLineItemInput } from "../types.js";

export type AddLineItemAction = Action & {
  type: "ADD_LINE_ITEM";
  input: AddLineItemInput;
};
export type EditLineItemAction = Action & {
  type: "EDIT_LINE_ITEM";
  input: EditLineItemInput;
};

export type BillingStatementLineItemsAction =
  | AddLineItemAction
  | EditLineItemAction;

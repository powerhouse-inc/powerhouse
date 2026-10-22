/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  AddStockInput,
  AdjustQuantityInput,
  MoveItemInput,
  SetItemDetailsInput,
} from "../types.js";

export type SetItemDetailsAction = Action & {
  type: "SET_ITEM_DETAILS";
  input: SetItemDetailsInput;
};
export type AddStockAction = Action & {
  type: "ADD_STOCK";
  input: AddStockInput;
};
export type AdjustQuantityAction = Action & {
  type: "ADJUST_QUANTITY";
  input: AdjustQuantityInput;
};
export type MoveItemAction = Action & {
  type: "MOVE_ITEM";
  input: MoveItemInput;
};

export type InventoryItemStockAction =
  | SetItemDetailsAction
  | AddStockAction
  | AdjustQuantityAction
  | MoveItemAction;

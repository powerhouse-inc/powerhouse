/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { Action } from "document-model";
import type {
  AddItemInput,
  AdjustQuantityInput,
  MoveItemInput,
} from "../types.js";

export type AddItemAction = Action & { type: "ADD_ITEM"; input: AddItemInput };
export type AdjustQuantityAction = Action & {
  type: "ADJUST_QUANTITY";
  input: AdjustQuantityInput;
};
export type MoveItemAction = Action & {
  type: "MOVE_ITEM";
  input: MoveItemInput;
};

export type InventoryItemInventoryAction =
  | AddItemAction
  | AdjustQuantityAction
  | MoveItemAction;

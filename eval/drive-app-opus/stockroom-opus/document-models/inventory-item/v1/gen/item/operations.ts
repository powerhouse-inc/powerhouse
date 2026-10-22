/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { InventoryItemGlobalState } from "../types.js";
import type {
  AddItemAction,
  AdjustQuantityAction,
  MoveItemAction,
} from "./actions.js";

export interface InventoryItemItemOperations {
  addItemOperation: (
    state: InventoryItemGlobalState,
    action: AddItemAction,
    dispatch?: SignalDispatch,
  ) => void;
  adjustQuantityOperation: (
    state: InventoryItemGlobalState,
    action: AdjustQuantityAction,
    dispatch?: SignalDispatch,
  ) => void;
  moveItemOperation: (
    state: InventoryItemGlobalState,
    action: MoveItemAction,
    dispatch?: SignalDispatch,
  ) => void;
}

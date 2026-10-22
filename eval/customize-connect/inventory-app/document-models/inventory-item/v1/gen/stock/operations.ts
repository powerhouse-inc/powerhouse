/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { InventoryItemGlobalState } from "../types.js";
import type {
  AddStockAction,
  AdjustQuantityAction,
  MoveItemAction,
  SetItemDetailsAction,
} from "./actions.js";

export interface InventoryItemStockOperations {
  setItemDetailsOperation: (
    state: InventoryItemGlobalState,
    action: SetItemDetailsAction,
    dispatch?: SignalDispatch,
  ) => void;
  addStockOperation: (
    state: InventoryItemGlobalState,
    action: AddStockAction,
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

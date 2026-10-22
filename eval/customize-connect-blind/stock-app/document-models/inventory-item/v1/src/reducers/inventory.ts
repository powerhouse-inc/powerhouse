import type { InventoryItemInventoryOperations } from "document-models/inventory-item/v1";
import {
  AdjustBeforeAddError,
  EmptyItemNameError,
  EmptyLocationError,
  InsufficientStockError,
  ItemAlreadyAddedError,
  MoveBeforeAddError,
  NegativeStartingQuantityError,
  SameLocationError,
  ZeroAdjustmentError,
} from "../../gen/inventory/error.js";

export const inventoryItemInventoryOperations: InventoryItemInventoryOperations =
  {
    addItemOperation(state, action) {
      if (state.name) {
        throw new ItemAlreadyAddedError("The item has already been added");
      }
      if (!action.input.name.trim()) {
        throw new EmptyItemNameError("The item name must not be empty");
      }
      if (action.input.quantity < 0) {
        throw new NegativeStartingQuantityError(
          "The starting quantity must not be negative",
        );
      }
      state.name = action.input.name.trim();
      state.sku = action.input.sku || null;
      state.quantity = action.input.quantity;
      state.location = action.input.location || null;
    },
    adjustQuantityOperation(state, action) {
      if (!state.name) {
        throw new AdjustBeforeAddError(
          "Add the item before adjusting its quantity",
        );
      }
      if (action.input.delta === 0) {
        throw new ZeroAdjustmentError("The adjustment must not be zero");
      }
      const next = state.quantity + action.input.delta;
      if (next < 0) {
        throw new InsufficientStockError(`Only ${state.quantity} in stock`);
      }
      state.quantity = next;
    },
    moveItemOperation(state, action) {
      if (!state.name) {
        throw new MoveBeforeAddError("Add the item before moving it");
      }
      const location = action.input.location.trim();
      if (!location) {
        throw new EmptyLocationError("The location must not be empty");
      }
      if (location === state.location) {
        throw new SameLocationError(`The item is already at ${location}`);
      }
      state.location = location;
    },
  };

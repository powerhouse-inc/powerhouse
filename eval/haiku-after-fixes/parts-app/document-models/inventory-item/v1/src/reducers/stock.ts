import type { InventoryItemStockOperations } from "document-models/inventory-item/v1";
import {
  EmptyLocationError,
  EmptyMoveLocationError,
  EmptyNameError,
  InsufficientStockError,
  InvalidQuantityError,
  ItemAlreadyAddedError,
  ItemNotAddedError,
  MoveBeforeAddError,
  SameLocationError,
  ZeroAdjustmentError,
} from "../../gen/stock/error.js";

export const inventoryItemStockOperations: InventoryItemStockOperations = {
  addItemOperation(state, action) {
    if (state.name) {
      throw new ItemAlreadyAddedError("The item has already been added");
    }
    if (!action.input.name) {
      throw new EmptyNameError("Item name is required");
    }
    if (action.input.quantity < 0) {
      throw new InvalidQuantityError("Quantity cannot be negative");
    }
    if (!action.input.location) {
      throw new EmptyLocationError("Location is required");
    }
    state.name = action.input.name;
    state.quantity = action.input.quantity;
    state.location = action.input.location;
  },
  adjustQuantityOperation(state, action) {
    if (!state.name) {
      throw new ItemNotAddedError("Add the item before adjusting its quantity");
    }
    if (action.input.delta === 0) {
      throw new ZeroAdjustmentError("Adjustment must be non-zero");
    }
    const quantity = state.quantity + action.input.delta;
    if (quantity < 0) {
      throw new InsufficientStockError(
        `Cannot remove more than the ${state.quantity} units in stock`,
      );
    }
    state.quantity = quantity;
  },
  moveItemOperation(state, action) {
    if (!state.name) {
      throw new MoveBeforeAddError("Add the item before moving it");
    }
    if (!action.input.location) {
      throw new EmptyMoveLocationError("Location is required");
    }
    if (action.input.location === state.location) {
      throw new SameLocationError("Item is already in this location");
    }
    state.location = action.input.location;
  },
};

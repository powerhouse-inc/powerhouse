import type { InventoryItemInventoryOperations } from "document-models/inventory-item/v1";
import {
  AdjustItemNotAddedError,
  ItemAlreadyAddedError,
  MoveItemNotAddedError,
  NegativeQuantityError,
} from "../../gen/inventory/error.js";

export const inventoryItemInventoryOperations: InventoryItemInventoryOperations =
  {
    addItemOperation(state, action) {
      if (state.name) {
        throw new ItemAlreadyAddedError("Item has already been added");
      }
      state.name = action.input.name;
      state.quantity = action.input.quantity;
      state.location = action.input.location;
    },
    adjustQuantityOperation(state, action) {
      if (!state.name) {
        throw new AdjustItemNotAddedError("Item has not been added");
      }
      const next = state.quantity + action.input.delta;
      if (next < 0) {
        throw new NegativeQuantityError("Quantity cannot go below zero");
      }
      state.quantity = next;
    },
    moveItemOperation(state, action) {
      if (!state.name) {
        throw new MoveItemNotAddedError("Item has not been added");
      }
      state.location = action.input.location;
    },
  };

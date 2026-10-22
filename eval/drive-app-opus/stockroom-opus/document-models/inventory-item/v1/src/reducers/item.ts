import type { InventoryItemItemOperations } from "document-models/inventory-item/v1";
import {
  EmptyLocationError,
  InsufficientStockError,
  InvalidQuantityError,
} from "../../gen/item/error.js";

export const inventoryItemItemOperations: InventoryItemItemOperations = {
  addItemOperation(state, action) {
    if (action.input.quantity < 0) {
      throw new InvalidQuantityError("Quantity cannot be negative");
    }
    state.name = action.input.name;
    state.quantity = action.input.quantity;
    state.location = action.input.location;
  },
  adjustQuantityOperation(state, action) {
    const next = state.quantity + action.input.delta;
    if (next < 0) {
      throw new InsufficientStockError(
        `Cannot remove ${-action.input.delta}; only ${state.quantity} on hand`,
      );
    }
    state.quantity = next;
  },
  moveItemOperation(state, action) {
    if (!action.input.location.trim()) {
      throw new EmptyLocationError("Location cannot be empty");
    }
    state.location = action.input.location;
  },
};

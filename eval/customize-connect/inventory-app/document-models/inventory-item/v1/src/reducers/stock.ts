import type { InventoryItemStockOperations } from "document-models/inventory-item/v1";
import {
  InvalidAmountError,
  NegativeQuantityError,
  SameLocationError,
} from "../../gen/stock/error.js";

export const inventoryItemStockOperations: InventoryItemStockOperations = {
  setItemDetailsOperation(state, action) {
    if (action.input.name !== undefined) state.name = action.input.name ?? null;
    if (action.input.sku !== undefined) state.sku = action.input.sku ?? null;
  },
  addStockOperation(state, action) {
    if (action.input.amount <= 0)
      throw new InvalidAmountError("Amount must be positive");
    state.quantity += action.input.amount;
    state.history.push({
      id: action.input.id,
      kind: "ADD",
      delta: action.input.amount,
      location: state.location ?? null,
      reason: null,
      at: action.input.at,
    });
  },
  adjustQuantityOperation(state, action) {
    if (state.quantity + action.input.delta < 0)
      throw new NegativeQuantityError("Quantity cannot go below zero");
    state.quantity += action.input.delta;
    state.history.push({
      id: action.input.id,
      kind: "ADJUST",
      delta: action.input.delta,
      location: state.location ?? null,
      reason: action.input.reason ?? null,
      at: action.input.at,
    });
  },
  moveItemOperation(state, action) {
    if (state.location === action.input.location)
      throw new SameLocationError("The item is already there");
    state.location = action.input.location;
    state.history.push({
      id: action.input.id,
      kind: "MOVE",
      delta: 0,
      location: action.input.location,
      reason: null,
      at: action.input.at,
    });
  },
};

// Document model actions for parts/inventory-item (InventoryItem)
const G = "global";
const schemaAdd = `input AddItemInput {
    name: String!
    quantity: Int!
    location: String!
}`;
const schemaAdjust = `input AdjustQuantityInput {
    delta: Int!
}`;
const schemaMove = `input MoveItemInput {
    location: String!
}`;
const reducerAdd = `if (state.name) {
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
state.location = action.input.location;`;
const reducerAdjust = `if (!state.name) {
  throw new ItemNotAddedError("Add the item before adjusting its quantity");
}
if (action.input.delta === 0) {
  throw new ZeroAdjustmentError("Adjustment must be non-zero");
}
const quantity = state.quantity + action.input.delta;
if (quantity < 0) {
  throw new InsufficientStockError(\`Cannot remove more than the \${state.quantity} units in stock\`);
}
state.quantity = quantity;`;
const reducerMove = `if (!state.name) {
  throw new MoveBeforeAddError("Add the item before moving it");
}
if (!action.input.location) {
  throw new EmptyMoveLocationError("Location is required");
}
if (action.input.location === state.location) {
  throw new SameLocationError("Item is already in this location");
}
state.location = action.input.location;`;
const errs = [
  ["op-add-item", "ITEM_ALREADY_ADDED", "ItemAlreadyAddedError", "The item has already been added"],
  ["op-add-item", "EMPTY_NAME", "EmptyNameError", "The item name is empty"],
  ["op-add-item", "INVALID_QUANTITY", "InvalidQuantityError", "The quantity is negative"],
  ["op-add-item", "EMPTY_LOCATION", "EmptyLocationError", "The location is empty"],
  ["op-adjust-quantity", "ITEM_NOT_ADDED", "ItemNotAddedError", "The item has not been added yet"],
  ["op-adjust-quantity", "ZERO_ADJUSTMENT", "ZeroAdjustmentError", "The adjustment delta is zero"],
  ["op-adjust-quantity", "INSUFFICIENT_STOCK", "InsufficientStockError", "The adjustment would make stock negative"],
  ["op-move-item", "MOVE_BEFORE_ADD", "MoveBeforeAddError", "The item has not been added yet"],
  ["op-move-item", "EMPTY_MOVE_LOCATION", "EmptyMoveLocationError", "The target location is empty"],
  ["op-move-item", "SAME_LOCATION", "SameLocationError", "The item is already in this location"],
];
export const actions = [
  { type: "SET_MODEL_NAME", input: { name: "InventoryItem" }, scope: G },
  { type: "SET_MODEL_ID", input: { id: "parts/inventory-item" }, scope: G },
  { type: "SET_MODEL_EXTENSION", input: { extension: ".inv" }, scope: G },
  { type: "SET_MODEL_DESCRIPTION", input: { description: "An inventory item with a name, quantity and location" }, scope: G },
  { type: "SET_AUTHOR_NAME", input: { authorName: "Parts App" }, scope: G },
  { type: "ADD_MODULE", input: { id: "stock", name: "Stock", description: "Add, adjust and move stock" }, scope: G },
  { type: "ADD_OPERATION", input: { moduleId: "stock", id: "op-add-item", name: "ADD_ITEM", schema: schemaAdd, description: "Create the item with its first quantity and location", scope: G }, scope: G },
  { type: "ADD_OPERATION", input: { moduleId: "stock", id: "op-adjust-quantity", name: "ADJUST_QUANTITY", schema: schemaAdjust, description: "Add or remove units", scope: G }, scope: G },
  { type: "ADD_OPERATION", input: { moduleId: "stock", id: "op-move-item", name: "MOVE_ITEM", schema: schemaMove, description: "Move the item to another location", scope: G }, scope: G },
  ...errs.map(([operationId, code, name, desc], i) => ({ type: "ADD_OPERATION_ERROR", input: { operationId, id: `err-${i + 1}`, errorCode: code, errorName: name, errorDescription: desc }, scope: G })),
  { type: "SET_OPERATION_REDUCER", input: { id: "op-add-item", reducer: reducerAdd }, scope: G },
  { type: "SET_OPERATION_REDUCER", input: { id: "op-adjust-quantity", reducer: reducerAdjust }, scope: G },
  { type: "SET_OPERATION_REDUCER", input: { id: "op-move-item", reducer: reducerMove }, scope: G },
  { type: "SET_STATE_SCHEMA", input: { scope: G, schema: `type InventoryItemState {\n    name: String\n    quantity: Int!\n    location: String\n}` }, scope: G },
  { type: "SET_INITIAL_STATE", input: { scope: G, initialValue: JSON.stringify({ name: null, quantity: 0, location: null }) }, scope: G },
];

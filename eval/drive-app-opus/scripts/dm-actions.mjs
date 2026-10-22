const g = (type, input) => ({ type, input, scope: "global" });
const stateSchema = `type InventoryItemState {
  name: String
  quantity: Int!
  location: String
}`;
const actions = [
  g("SET_MODEL_NAME", { name: "Inventory Item" }),
  g("SET_MODEL_ID", { id: "stockroom/inventory-item" }),
  g("SET_MODEL_EXTENSION", { extension: ".inv" }),
  g("SET_MODEL_DESCRIPTION", { description: "One stock-keeping item: its name, quantity on hand and storage location." }),
  g("SET_AUTHOR_NAME", { authorName: "Stockroom" }),
  g("SET_AUTHOR_WEBSITE", { authorWebsite: "https://example.com" }),
  g("SET_STATE_SCHEMA", { scope: "global", schema: stateSchema }),
  g("SET_INITIAL_STATE", { scope: "global", initialValue: JSON.stringify({ name: null, quantity: 0, location: null }) }),
  g("ADD_MODULE", { id: "mod-item", name: "item", description: "Item operations" }),
  g("ADD_OPERATION", {
    moduleId: "mod-item", id: "op-add", name: "ADD_ITEM", scope: "global",
    description: "Registers the item with its name, starting quantity and location",
    schema: `input AddItemInput {\n  name: String!\n  quantity: Int!\n  location: String!\n}`,
    reducer: `if (action.input.quantity < 0) {\n  throw new InvalidQuantityError("Quantity cannot be negative");\n}\nstate.name = action.input.name;\nstate.quantity = action.input.quantity;\nstate.location = action.input.location;`,
  }),
  g("ADD_OPERATION_ERROR", { operationId: "op-add", id: "err-add-qty", errorCode: "INVALID_QUANTITY", errorName: "InvalidQuantityError", errorDescription: "The starting quantity is negative" }),
  g("ADD_OPERATION", {
    moduleId: "mod-item", id: "op-adjust", name: "ADJUST_QUANTITY", scope: "global",
    description: "Adds (positive delta) or removes (negative delta) stock",
    schema: `input AdjustQuantityInput {\n  delta: Int!\n}`,
    reducer: `const next = state.quantity + action.input.delta;\nif (next < 0) {\n  throw new InsufficientStockError(\`Cannot remove \${-action.input.delta}; only \${state.quantity} on hand\`);\n}\nstate.quantity = next;`,
  }),
  g("ADD_OPERATION_ERROR", { operationId: "op-adjust", id: "err-adj-stock", errorCode: "INSUFFICIENT_STOCK", errorName: "InsufficientStockError", errorDescription: "The adjustment would make the quantity negative" }),
  g("ADD_OPERATION", {
    moduleId: "mod-item", id: "op-move", name: "MOVE_ITEM", scope: "global",
    description: "Moves the item to a new storage location",
    schema: `input MoveItemInput {\n  location: String!\n}`,
    reducer: `if (!action.input.location.trim()) {\n  throw new EmptyLocationError("Location cannot be empty");\n}\nstate.location = action.input.location;`,
  }),
  g("ADD_OPERATION_ERROR", { operationId: "op-move", id: "err-move-empty", errorCode: "EMPTY_LOCATION", errorName: "EmptyLocationError", errorDescription: "The new location is blank" }),
];
console.log(JSON.stringify({ documentId: process.argv[2], actions }));

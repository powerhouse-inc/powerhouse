import fs from "node:fs";
const g = (type, input) => ({ type, input, scope: "global" });
const stateSchema = `type InventoryItemState {
  name: String
  sku: String
  quantity: Int!
  location: String
}`;
const ops = [
  {
    id: "op-add-item", name: "ADD_ITEM",
    description: "Registers the item with its name, starting quantity and location.",
    schema: `input AddItemInput {
  name: String!
  sku: String
  quantity: Int!
  location: String
}`,
    reducer: `if (state.name) {
  throw new ItemAlreadyAddedError("The item has already been added");
}
if (!action.input.name.trim()) {
  throw new EmptyItemNameError("The item name must not be empty");
}
if (action.input.quantity < 0) {
  throw new NegativeStartingQuantityError("The starting quantity must not be negative");
}
state.name = action.input.name.trim();
state.sku = action.input.sku || null;
state.quantity = action.input.quantity;
state.location = action.input.location || null;`,
    errors: [
      ["ITEM_ALREADY_ADDED", "ItemAlreadyAddedError", "The item was already added; ADD_ITEM can only run once."],
      ["EMPTY_ITEM_NAME", "EmptyItemNameError", "The item name is empty or whitespace."],
      ["NEGATIVE_STARTING_QUANTITY", "NegativeStartingQuantityError", "The starting quantity is below zero."],
    ],
    example: { name: "Steel bolt M8", sku: "BOLT-M8", quantity: 100, location: "Aisle 3" },
  },
  {
    id: "op-adjust-quantity", name: "ADJUST_QUANTITY",
    description: "Changes the quantity on hand by a positive or negative delta.",
    schema: `input AdjustQuantityInput {
  delta: Int!
  reason: String
}`,
    reducer: `if (!state.name) {
  throw new AdjustBeforeAddError("Add the item before adjusting its quantity");
}
if (action.input.delta === 0) {
  throw new ZeroAdjustmentError("The adjustment must not be zero");
}
const next = state.quantity + action.input.delta;
if (next < 0) {
  throw new InsufficientStockError(\`Only \${state.quantity} in stock\`);
}
state.quantity = next;`,
    errors: [
      ["ADJUST_BEFORE_ADD", "AdjustBeforeAddError", "The item has not been added yet."],
      ["ZERO_ADJUSTMENT", "ZeroAdjustmentError", "The delta is zero."],
      ["INSUFFICIENT_STOCK", "InsufficientStockError", "The adjustment would take the quantity below zero."],
    ],
    example: { delta: -5, reason: "Shipped order #42" },
  },
  {
    id: "op-move-item", name: "MOVE_ITEM",
    description: "Moves the item to another location.",
    schema: `input MoveItemInput {
  location: String!
}`,
    reducer: `if (!state.name) {
  throw new MoveBeforeAddError("Add the item before moving it");
}
const location = action.input.location.trim();
if (!location) {
  throw new EmptyLocationError("The location must not be empty");
}
if (location === state.location) {
  throw new SameLocationError(\`The item is already at \${location}\`);
}
state.location = location;`,
    errors: [
      ["MOVE_BEFORE_ADD", "MoveBeforeAddError", "The item has not been added yet."],
      ["EMPTY_LOCATION", "EmptyLocationError", "The new location is empty or whitespace."],
      ["SAME_LOCATION", "SameLocationError", "The item is already at that location."],
    ],
    example: { location: "Aisle 7" },
  },
];
const actions = [
  g("SET_MODEL_NAME", { name: "InventoryItem" }),
  g("SET_MODEL_ID", { id: "stock-app/inventory-item" }),
  g("SET_MODEL_EXTENSION", { extension: ".inv" }),
  g("SET_MODEL_DESCRIPTION", { description: "One stock-keeping item: its name, quantity on hand and storage location." }),
  g("SET_AUTHOR_NAME", { authorName: "Stock App" }),
  g("SET_AUTHOR_WEBSITE", { authorWebsite: "https://example.com" }),
  g("SET_STATE_SCHEMA", { scope: "global", schema: stateSchema }),
  g("SET_INITIAL_STATE", { scope: "global", initialValue: JSON.stringify({ name: null, sku: null, quantity: 0, location: null }) }),
  g("ADD_MODULE", { id: "mod-inventory", name: "inventory", description: "Stock operations" }),
];
for (const op of ops) {
  actions.push(g("ADD_OPERATION", { moduleId: "mod-inventory", id: op.id, name: op.name, schema: op.schema, description: op.description, reducer: op.reducer, scope: "global" }));
  op.errors.forEach(([code, name, desc], i) => actions.push(g("ADD_OPERATION_ERROR", { operationId: op.id, id: `${op.id}-err-${i}`, errorCode: code, errorName: name, errorDescription: desc })));
  actions.push(g("ADD_OPERATION_EXAMPLE", { operationId: op.id, id: `${op.id}-ex`, example: JSON.stringify(op.example) }));
}
fs.writeFileSync(process.argv[2], JSON.stringify({ documentId: process.argv[3], actions }));
console.log(actions.length, "actions");

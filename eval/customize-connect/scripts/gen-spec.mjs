const op = (id, name, description, schema, reducer, errors = []) => ({
  id, name, description, schema, reducer, template: description, scope: "global", examples: [],
  errors: errors.map(([eid, code, ename, desc]) => ({ id: eid, code, name: ename, description: desc, template: "" })),
});
const spec = {
  id: "acme/inventory-item",
  name: "InventoryItem",
  extension: "inv",
  description: "A stock-keeping item: its name, how many are on hand and where they are.",
  author: { name: "Acme", website: "https://acme.example" },
  specifications: [{
    version: 1,
    changeLog: [],
    state: {
      global: {
        schema: `type InventoryItemState {
  name: String
  sku: String
  quantity: Int!
  location: String
  history: [StockMovement!]!
}

type StockMovement {
  id: OID!
  kind: StockMovementKind!
  delta: Int!
  location: String
  reason: String
  at: DateTime!
}

enum StockMovementKind {
  ADD
  ADJUST
  MOVE
}`,
        initialValue: JSON.stringify({ name: null, sku: null, quantity: 0, location: null, history: [] }),
        examples: [],
      },
      local: { schema: "", initialValue: "", examples: [] },
    },
    modules: [{
      id: "mod-stock", name: "stock", description: "Stock operations",
      operations: [
        op("op-set-details", "SET_ITEM_DETAILS", "Set the item's name and SKU",
          `input SetItemDetailsInput {\n  name: String\n  sku: String\n}`,
          `if (action.input.name !== undefined) state.name = action.input.name ?? null;\nif (action.input.sku !== undefined) state.sku = action.input.sku ?? null;`),
        op("op-add-stock", "ADD_STOCK", "Receive stock",
          `input AddStockInput {\n  id: OID!\n  amount: Int!\n  at: DateTime!\n}`,
          `if (action.input.amount <= 0) throw new InvalidAmountError("Amount must be positive");\nstate.quantity += action.input.amount;\nstate.history.push({ id: action.input.id, kind: "ADD", delta: action.input.amount, location: state.location ?? null, reason: null, at: action.input.at });`,
          [["err-invalid-amount", "INVALID_AMOUNT", "InvalidAmountError", "The amount is zero or negative"]]),
        op("op-adjust", "ADJUST_QUANTITY", "Correct the quantity on hand, e.g. after a count",
          `input AdjustQuantityInput {\n  id: OID!\n  delta: Int!\n  reason: String\n  at: DateTime!\n}`,
          `if (state.quantity + action.input.delta < 0) throw new NegativeQuantityError("Quantity cannot go below zero");\nstate.quantity += action.input.delta;\nstate.history.push({ id: action.input.id, kind: "ADJUST", delta: action.input.delta, location: state.location ?? null, reason: action.input.reason ?? null, at: action.input.at });`,
          [["err-negative", "NEGATIVE_QUANTITY", "NegativeQuantityError", "The adjustment would leave a negative quantity"]]),
        op("op-move", "MOVE_ITEM", "Move the item to another location",
          `input MoveItemInput {\n  id: OID!\n  location: String!\n  at: DateTime!\n}`,
          `if (state.location === action.input.location) throw new SameLocationError("The item is already there");\nstate.location = action.input.location;\nstate.history.push({ id: action.input.id, kind: "MOVE", delta: 0, location: action.input.location, reason: null, at: action.input.at });`,
          [["err-same-location", "SAME_LOCATION", "SameLocationError", "The item is already at that location"]]),
      ],
    }],
  }],
};
process.stdout.write(JSON.stringify(spec, null, 2));

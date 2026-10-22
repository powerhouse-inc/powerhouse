import type { DocumentModelGlobalState } from "document-model";

export const documentModel: DocumentModelGlobalState = {
  id: "acme/inventory-item",
  name: "InventoryItem",
  extension: "inv",
  description:
    "A stock-keeping item: its name, how many are on hand and where they are.",
  author: {
    name: "Acme",
    website: "https://acme.example",
  },
  specifications: [
    {
      version: 1,
      changeLog: [],
      state: {
        global: {
          schema:
            "type InventoryItemState {\n  name: String\n  sku: String\n  quantity: Int!\n  location: String\n  history: [StockMovement!]!\n}\n\ntype StockMovement {\n  id: OID!\n  kind: StockMovementKind!\n  delta: Int!\n  location: String\n  reason: String\n  at: DateTime!\n}\n\nenum StockMovementKind {\n  ADD\n  ADJUST\n  MOVE\n}",
          initialValue:
            '{"name":null,"sku":null,"quantity":0,"location":null,"history":[]}',
          examples: [],
        },
        local: {
          schema: "",
          initialValue: "",
          examples: [],
        },
      },
      modules: [
        {
          id: "mod-stock",
          name: "stock",
          description: "Stock operations",
          operations: [
            {
              id: "op-set-details",
              name: "SET_ITEM_DETAILS",
              description: "Set the item's name and SKU",
              schema:
                "input SetItemDetailsInput {\n  name: String\n  sku: String\n}",
              reducer:
                "if (action.input.name !== undefined) state.name = action.input.name ?? null;\nif (action.input.sku !== undefined) state.sku = action.input.sku ?? null;",
              template: "Set the item's name and SKU",
              scope: "global",
              examples: [],
              errors: [],
            },
            {
              id: "op-add-stock",
              name: "ADD_STOCK",
              description: "Receive stock",
              schema:
                "input AddStockInput {\n  id: OID!\n  amount: Int!\n  at: DateTime!\n}",
              reducer:
                'if (action.input.amount <= 0) throw new InvalidAmountError("Amount must be positive");\nstate.quantity += action.input.amount;\nstate.history.push({ id: action.input.id, kind: "ADD", delta: action.input.amount, location: state.location ?? null, reason: null, at: action.input.at });',
              template: "Receive stock",
              scope: "global",
              examples: [],
              errors: [
                {
                  id: "err-invalid-amount",
                  code: "INVALID_AMOUNT",
                  name: "InvalidAmountError",
                  description: "The amount is zero or negative",
                  template: "",
                },
              ],
            },
            {
              id: "op-adjust",
              name: "ADJUST_QUANTITY",
              description: "Correct the quantity on hand, e.g. after a count",
              schema:
                "input AdjustQuantityInput {\n  id: OID!\n  delta: Int!\n  reason: String\n  at: DateTime!\n}",
              reducer:
                'if (state.quantity + action.input.delta < 0) throw new NegativeQuantityError("Quantity cannot go below zero");\nstate.quantity += action.input.delta;\nstate.history.push({ id: action.input.id, kind: "ADJUST", delta: action.input.delta, location: state.location ?? null, reason: action.input.reason ?? null, at: action.input.at });',
              template: "Correct the quantity on hand, e.g. after a count",
              scope: "global",
              examples: [],
              errors: [
                {
                  id: "err-negative",
                  code: "NEGATIVE_QUANTITY",
                  name: "NegativeQuantityError",
                  description: "The adjustment would leave a negative quantity",
                  template: "",
                },
              ],
            },
            {
              id: "op-move",
              name: "MOVE_ITEM",
              description: "Move the item to another location",
              schema:
                "input MoveItemInput {\n  id: OID!\n  location: String!\n  at: DateTime!\n}",
              reducer:
                'if (state.location === action.input.location) throw new SameLocationError("The item is already there");\nstate.location = action.input.location;\nstate.history.push({ id: action.input.id, kind: "MOVE", delta: 0, location: action.input.location, reason: null, at: action.input.at });',
              template: "Move the item to another location",
              scope: "global",
              examples: [],
              errors: [
                {
                  id: "err-same-location",
                  code: "SAME_LOCATION",
                  name: "SameLocationError",
                  description: "The item is already at that location",
                  template: "",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

import type { DocumentModelGlobalState } from "document-model";

export const documentModel: DocumentModelGlobalState = {
  id: "stock-app/inventory-item",
  name: "InventoryItem",
  author: {
    name: "Stock App",
    website: "https://example.com",
  },
  extension: ".inv",
  description:
    "One stock-keeping item: its name, quantity on hand and storage location.",
  specifications: [
    {
      state: {
        local: {
          schema: "",
          examples: [],
          initialValue: "",
        },
        global: {
          schema:
            "type InventoryItemState {\n  name: String\n  sku: String\n  quantity: Int!\n  location: String\n}",
          examples: [],
          initialValue: '{"name":null,"sku":null,"quantity":0,"location":null}',
        },
      },
      modules: [
        {
          id: "mod-inventory",
          name: "inventory",
          description: "Stock operations",
          operations: [
            {
              id: "op-add-item",
              name: "ADD_ITEM",
              description:
                "Registers the item with its name, starting quantity and location.",
              schema:
                "input AddItemInput {\n  name: String!\n  sku: String\n  quantity: Int!\n  location: String\n}",
              template:
                "Registers the item with its name, starting quantity and location.",
              reducer:
                'if (state.name) {\n  throw new ItemAlreadyAddedError("The item has already been added");\n}\nif (!action.input.name.trim()) {\n  throw new EmptyItemNameError("The item name must not be empty");\n}\nif (action.input.quantity < 0) {\n  throw new NegativeStartingQuantityError("The starting quantity must not be negative");\n}\nstate.name = action.input.name.trim();\nstate.sku = action.input.sku || null;\nstate.quantity = action.input.quantity;\nstate.location = action.input.location || null;',
              errors: [
                {
                  id: "op-add-item-err-0",
                  name: "ItemAlreadyAddedError",
                  code: "ITEM_ALREADY_ADDED",
                  description:
                    "The item was already added; ADD_ITEM can only run once.",
                  template: "",
                },
                {
                  id: "op-add-item-err-1",
                  name: "EmptyItemNameError",
                  code: "EMPTY_ITEM_NAME",
                  description: "The item name is empty or whitespace.",
                  template: "",
                },
                {
                  id: "op-add-item-err-2",
                  name: "NegativeStartingQuantityError",
                  code: "NEGATIVE_STARTING_QUANTITY",
                  description: "The starting quantity is below zero.",
                  template: "",
                },
              ],
              examples: [
                {
                  id: "op-add-item-ex",
                  value:
                    '{"name":"Steel bolt M8","sku":"BOLT-M8","quantity":100,"location":"Aisle 3"}',
                },
              ],
              scope: "global",
            },
            {
              id: "op-adjust-quantity",
              name: "ADJUST_QUANTITY",
              description:
                "Changes the quantity on hand by a positive or negative delta.",
              schema:
                "input AdjustQuantityInput {\n  delta: Int!\n  reason: String\n}",
              template:
                "Changes the quantity on hand by a positive or negative delta.",
              reducer:
                'if (!state.name) {\n  throw new AdjustBeforeAddError("Add the item before adjusting its quantity");\n}\nif (action.input.delta === 0) {\n  throw new ZeroAdjustmentError("The adjustment must not be zero");\n}\nconst next = state.quantity + action.input.delta;\nif (next < 0) {\n  throw new InsufficientStockError(`Only ${state.quantity} in stock`);\n}\nstate.quantity = next;',
              errors: [
                {
                  id: "op-adjust-quantity-err-0",
                  name: "AdjustBeforeAddError",
                  code: "ADJUST_BEFORE_ADD",
                  description: "The item has not been added yet.",
                  template: "",
                },
                {
                  id: "op-adjust-quantity-err-1",
                  name: "ZeroAdjustmentError",
                  code: "ZERO_ADJUSTMENT",
                  description: "The delta is zero.",
                  template: "",
                },
                {
                  id: "op-adjust-quantity-err-2",
                  name: "InsufficientStockError",
                  code: "INSUFFICIENT_STOCK",
                  description:
                    "The adjustment would take the quantity below zero.",
                  template: "",
                },
              ],
              examples: [
                {
                  id: "op-adjust-quantity-ex",
                  value: '{"delta":-5,"reason":"Shipped order #42"}',
                },
              ],
              scope: "global",
            },
            {
              id: "op-move-item",
              name: "MOVE_ITEM",
              description: "Moves the item to another location.",
              schema: "input MoveItemInput {\n  location: String!\n}",
              template: "Moves the item to another location.",
              reducer:
                'if (!state.name) {\n  throw new MoveBeforeAddError("Add the item before moving it");\n}\nconst location = action.input.location.trim();\nif (!location) {\n  throw new EmptyLocationError("The location must not be empty");\n}\nif (location === state.location) {\n  throw new SameLocationError(`The item is already at ${location}`);\n}\nstate.location = location;',
              errors: [
                {
                  id: "op-move-item-err-0",
                  name: "MoveBeforeAddError",
                  code: "MOVE_BEFORE_ADD",
                  description: "The item has not been added yet.",
                  template: "",
                },
                {
                  id: "op-move-item-err-1",
                  name: "EmptyLocationError",
                  code: "EMPTY_LOCATION",
                  description: "The new location is empty or whitespace.",
                  template: "",
                },
                {
                  id: "op-move-item-err-2",
                  name: "SameLocationError",
                  code: "SAME_LOCATION",
                  description: "The item is already at that location.",
                  template: "",
                },
              ],
              examples: [
                {
                  id: "op-move-item-ex",
                  value: '{"location":"Aisle 7"}',
                },
              ],
              scope: "global",
            },
          ],
        },
      ],
      version: 1,
      changeLog: [],
    },
  ],
};

import type { DocumentModelGlobalState } from "document-model";

export const documentModel: DocumentModelGlobalState = {
  id: "parts/inventory-item",
  name: "InventoryItem",
  author: {
    name: "Parts App",
    website: "",
  },
  extension: ".inv",
  description: "An inventory item with a name, quantity and location",
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
            "type InventoryItemState {\n    name: String\n    quantity: Int!\n    location: String\n}",
          examples: [],
          initialValue: '{"name":null,"quantity":0,"location":null}',
        },
      },
      modules: [
        {
          id: "stock",
          name: "Stock",
          description: "Add, adjust and move stock",
          operations: [
            {
              id: "op-add-item",
              name: "ADD_ITEM",
              description:
                "Create the item with its first quantity and location",
              schema:
                "input AddItemInput {\n    name: String!\n    quantity: Int!\n    location: String!\n}",
              template: "Create the item with its first quantity and location",
              reducer:
                'if (state.name) {\n  throw new ItemAlreadyAddedError("The item has already been added");\n}\nif (!action.input.name) {\n  throw new EmptyNameError("Item name is required");\n}\nif (action.input.quantity < 0) {\n  throw new InvalidQuantityError("Quantity cannot be negative");\n}\nif (!action.input.location) {\n  throw new EmptyLocationError("Location is required");\n}\nstate.name = action.input.name;\nstate.quantity = action.input.quantity;\nstate.location = action.input.location;',
              errors: [
                {
                  id: "err-1",
                  name: "ItemAlreadyAddedError",
                  code: "ITEM_ALREADY_ADDED",
                  description: "The item has already been added",
                  template: "",
                },
                {
                  id: "err-2",
                  name: "EmptyNameError",
                  code: "EMPTY_NAME",
                  description: "The item name is empty",
                  template: "",
                },
                {
                  id: "err-3",
                  name: "InvalidQuantityError",
                  code: "INVALID_QUANTITY",
                  description: "The quantity is negative",
                  template: "",
                },
                {
                  id: "err-4",
                  name: "EmptyLocationError",
                  code: "EMPTY_LOCATION",
                  description: "The location is empty",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-adjust-quantity",
              name: "ADJUST_QUANTITY",
              description: "Add or remove units",
              schema: "input AdjustQuantityInput {\n    delta: Int!\n}",
              template: "Add or remove units",
              reducer:
                'if (!state.name) {\n  throw new ItemNotAddedError("Add the item before adjusting its quantity");\n}\nif (action.input.delta === 0) {\n  throw new ZeroAdjustmentError("Adjustment must be non-zero");\n}\nconst quantity = state.quantity + action.input.delta;\nif (quantity < 0) {\n  throw new InsufficientStockError(`Cannot remove more than the ${state.quantity} units in stock`);\n}\nstate.quantity = quantity;',
              errors: [
                {
                  id: "err-5",
                  name: "ItemNotAddedError",
                  code: "ITEM_NOT_ADDED",
                  description: "The item has not been added yet",
                  template: "",
                },
                {
                  id: "err-6",
                  name: "ZeroAdjustmentError",
                  code: "ZERO_ADJUSTMENT",
                  description: "The adjustment delta is zero",
                  template: "",
                },
                {
                  id: "err-7",
                  name: "InsufficientStockError",
                  code: "INSUFFICIENT_STOCK",
                  description: "The adjustment would make stock negative",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-move-item",
              name: "MOVE_ITEM",
              description: "Move the item to another location",
              schema: "input MoveItemInput {\n    location: String!\n}",
              template: "Move the item to another location",
              reducer:
                'if (!state.name) {\n  throw new MoveBeforeAddError("Add the item before moving it");\n}\nif (!action.input.location) {\n  throw new EmptyMoveLocationError("Location is required");\n}\nif (action.input.location === state.location) {\n  throw new SameLocationError("Item is already in this location");\n}\nstate.location = action.input.location;',
              errors: [
                {
                  id: "err-8",
                  name: "MoveBeforeAddError",
                  code: "MOVE_BEFORE_ADD",
                  description: "The item has not been added yet",
                  template: "",
                },
                {
                  id: "err-9",
                  name: "EmptyMoveLocationError",
                  code: "EMPTY_MOVE_LOCATION",
                  description: "The target location is empty",
                  template: "",
                },
                {
                  id: "err-10",
                  name: "SameLocationError",
                  code: "SAME_LOCATION",
                  description: "The item is already in this location",
                  template: "",
                },
              ],
              examples: [],
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

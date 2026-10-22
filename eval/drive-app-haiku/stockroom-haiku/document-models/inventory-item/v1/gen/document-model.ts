import type { DocumentModelGlobalState } from "document-model";

export const documentModel: DocumentModelGlobalState = {
  id: "stockroom/inventory-item",
  name: "Inventory Item",
  author: {
    name: "Stockroom",
    website: "",
  },
  extension: ".inv",
  description: "An inventory item with a name, quantity and location.",
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
          initialValue: '{"name": null, "quantity": 0, "location": null}',
        },
      },
      modules: [
        {
          id: "inventory-module",
          name: "Inventory",
          description: "Add, adjust and move inventory items.",
          operations: [
            {
              id: "op-add-item",
              name: "ADD_ITEM",
              description:
                "Stock a new item with a name, quantity and location.",
              schema:
                "input AddItemInput {\n    name: String!\n    quantity: Int!\n    location: String!\n}",
              template: "Stock a new item with a name, quantity and location.",
              reducer:
                'if (state.name) {\n  throw new ItemAlreadyAddedError("Item has already been added");\n}\nstate.name = action.input.name;\nstate.quantity = action.input.quantity;\nstate.location = action.input.location;',
              errors: [
                {
                  id: "err-item-already-added",
                  name: "ItemAlreadyAddedError",
                  code: "ITEM_ALREADY_ADDED",
                  description: "The item has already been added.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-adjust-quantity",
              name: "ADJUST_QUANTITY",
              description:
                "Change the quantity by a positive or negative delta.",
              schema: "input AdjustQuantityInput {\n    delta: Int!\n}",
              template: "Change the quantity by a positive or negative delta.",
              reducer:
                'if (!state.name) {\n  throw new AdjustItemNotAddedError("Item has not been added");\n}\nconst next = state.quantity + action.input.delta;\nif (next < 0) {\n  throw new NegativeQuantityError("Quantity cannot go below zero");\n}\nstate.quantity = next;',
              errors: [
                {
                  id: "err-adjust-not-added",
                  name: "AdjustItemNotAddedError",
                  code: "ADJUST_ITEM_NOT_ADDED",
                  description: "The item has not been added yet.",
                  template: "",
                },
                {
                  id: "err-negative-quantity",
                  name: "NegativeQuantityError",
                  code: "NEGATIVE_QUANTITY",
                  description: "The quantity would fall below zero.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-move-item",
              name: "MOVE_ITEM",
              description: "Set the location of the item.",
              schema: "input MoveItemInput {\n    location: String!\n}",
              template: "Set the location of the item.",
              reducer:
                'if (!state.name) {\n  throw new MoveItemNotAddedError("Item has not been added");\n}\nstate.location = action.input.location;',
              errors: [
                {
                  id: "err-move-not-added",
                  name: "MoveItemNotAddedError",
                  code: "MOVE_ITEM_NOT_ADDED",
                  description: "The item has not been added yet.",
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

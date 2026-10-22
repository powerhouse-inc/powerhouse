/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { InventoryItemPHState } from "document-models/inventory-item/v1";

import { inventoryItemStockOperations } from "../src/reducers/stock.js";

import {
  AddItemInputSchema,
  AdjustQuantityInputSchema,
  MoveItemInputSchema,
} from "./schema/zod.js";

const schemaMemo = new Map<() => unknown, unknown>();

function memoizedSchema<T>(makeSchema: () => T): T {
  let schema = schemaMemo.get(makeSchema) as T | undefined;
  if (schema === undefined) {
    schema = makeSchema();
    schemaMemo.set(makeSchema, schema);
  }
  return schema;
}

const stateReducer: StateReducer<InventoryItemPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "ADD_ITEM": {
      memoizedSchema(AddItemInputSchema).parse(action.input);

      inventoryItemStockOperations.addItemOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "ADJUST_QUANTITY": {
      memoizedSchema(AdjustQuantityInputSchema).parse(action.input);

      inventoryItemStockOperations.adjustQuantityOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "MOVE_ITEM": {
      memoizedSchema(MoveItemInputSchema).parse(action.input);

      inventoryItemStockOperations.moveItemOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    default:
      return state;
  }
};

export const reducer: Reducer<InventoryItemPHState> =
  createReducer(stateReducer);

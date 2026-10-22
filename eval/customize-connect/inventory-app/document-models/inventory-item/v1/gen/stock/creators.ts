/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddStockInputSchema,
  AdjustQuantityInputSchema,
  MoveItemInputSchema,
  SetItemDetailsInputSchema,
} from "../schema/zod.js";
import type {
  AddStockInput,
  AdjustQuantityInput,
  MoveItemInput,
  SetItemDetailsInput,
} from "../types.js";
import type {
  AddStockAction,
  AdjustQuantityAction,
  MoveItemAction,
  SetItemDetailsAction,
} from "./actions.js";

export const setItemDetails = (input: SetItemDetailsInput) =>
  createAction<SetItemDetailsAction>(
    "SET_ITEM_DETAILS",
    { ...input },
    undefined,
    SetItemDetailsInputSchema,
    "global",
  );

export const addStock = (input: AddStockInput) =>
  createAction<AddStockAction>(
    "ADD_STOCK",
    { ...input },
    undefined,
    AddStockInputSchema,
    "global",
  );

export const adjustQuantity = (input: AdjustQuantityInput) =>
  createAction<AdjustQuantityAction>(
    "ADJUST_QUANTITY",
    { ...input },
    undefined,
    AdjustQuantityInputSchema,
    "global",
  );

export const moveItem = (input: MoveItemInput) =>
  createAction<MoveItemAction>(
    "MOVE_ITEM",
    { ...input },
    undefined,
    MoveItemInputSchema,
    "global",
  );

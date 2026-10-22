/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddItemInputSchema,
  AdjustQuantityInputSchema,
  MoveItemInputSchema,
} from "../schema/zod.js";
import type {
  AddItemInput,
  AdjustQuantityInput,
  MoveItemInput,
} from "../types.js";
import type {
  AddItemAction,
  AdjustQuantityAction,
  MoveItemAction,
} from "./actions.js";

export const addItem = (input: AddItemInput) =>
  createAction<AddItemAction>(
    "ADD_ITEM",
    { ...input },
    undefined,
    AddItemInputSchema,
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

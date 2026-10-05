/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import { AddItemInputSchema, CheckItemInputSchema } from "../schema/zod.js";
import type { AddItemInput, CheckItemInput } from "../types.js";
import type { AddItemAction, CheckItemAction } from "./actions.js";

export const addItem = (input: AddItemInput) =>
  createAction<AddItemAction>(
    "ADD_ITEM",
    { ...input },
    undefined,
    AddItemInputSchema,
    "global",
  );

export const checkItem = (input: CheckItemInput) =>
  createAction<CheckItemAction>(
    "CHECK_ITEM",
    { ...input },
    undefined,
    CheckItemInputSchema,
    "global",
  );

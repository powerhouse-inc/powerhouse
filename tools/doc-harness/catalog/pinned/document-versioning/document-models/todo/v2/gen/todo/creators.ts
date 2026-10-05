/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddItemInputSchema,
  CheckItemInputSchema,
  SetPriorityInputSchema,
  SetStatusInputSchema,
} from "../schema/zod.js";
import type {
  AddItemInput,
  CheckItemInput,
  SetPriorityInput,
  SetStatusInput,
} from "../types.js";
import type {
  AddItemAction,
  CheckItemAction,
  SetPriorityAction,
  SetStatusAction,
} from "./actions.js";

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

export const setStatus = (input: SetStatusInput) =>
  createAction<SetStatusAction>(
    "SET_STATUS",
    { ...input },
    undefined,
    SetStatusInputSchema,
    "global",
  );

export const setPriority = (input: SetPriorityInput) =>
  createAction<SetPriorityAction>(
    "SET_PRIORITY",
    { ...input },
    undefined,
    SetPriorityInputSchema,
    "global",
  );

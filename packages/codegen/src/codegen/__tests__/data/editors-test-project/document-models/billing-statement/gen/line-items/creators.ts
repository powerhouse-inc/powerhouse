import { createAction } from "document-model/core";
import {
  AddLineItemInputSchema,
  EditLineItemInputSchema,
} from "../schema/zod.js";
import type { AddLineItemInput, EditLineItemInput } from "../types.js";
import type { AddLineItemAction, EditLineItemAction } from "./actions.js";

export const addLineItem = (input: AddLineItemInput) =>
  createAction<AddLineItemAction>(
    "ADD_LINE_ITEM",
    { ...input },
    undefined,
    AddLineItemInputSchema,
    "global",
  );

export const editLineItem = (input: EditLineItemInput) =>
  createAction<EditLineItemAction>(
    "EDIT_LINE_ITEM",
    { ...input },
    undefined,
    EditLineItemInputSchema,
    "global",
  );

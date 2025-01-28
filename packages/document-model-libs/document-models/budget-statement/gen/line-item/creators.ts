import { utils } from "document-model/document";
import {
  z,
  AddLineItemInput,
  UpdateLineItemInput,
  DeleteLineItemInput,
  SortLineItemsInput,
} from "../types";
import {
  AddLineItemAction,
  UpdateLineItemAction,
  DeleteLineItemAction,
  SortLineItemsAction,
} from "./actions";

const { createAction } = utils;

export const addLineItem = (input: AddLineItemInput) =>
  createAction<AddLineItemAction>(
    "ADD_LINE_ITEM",
    { ...input },
    undefined,
    z.AddLineItemInputSchema,
    "global",
  );

export const updateLineItem = (input: UpdateLineItemInput) =>
  createAction<UpdateLineItemAction>(
    "UPDATE_LINE_ITEM",
    { ...input },
    undefined,
    z.UpdateLineItemInputSchema,
    "global",
  );

export const deleteLineItem = (input: DeleteLineItemInput) =>
  createAction<DeleteLineItemAction>(
    "DELETE_LINE_ITEM",
    { ...input },
    undefined,
    z.DeleteLineItemInputSchema,
    "global",
  );

export const sortLineItems = (input: SortLineItemsInput) =>
  createAction<SortLineItemsAction>(
    "SORT_LINE_ITEMS",
    { ...input },
    undefined,
    z.SortLineItemsInputSchema,
    "global",
  );

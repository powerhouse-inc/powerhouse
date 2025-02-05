import {
    AddLineItemInput,
    UpdateLineItemInput,
    DeleteLineItemInput,
    SortLineItemsInput
} from "../types.js";
import {
    AddLineItemAction,
    UpdateLineItemAction,
    DeleteLineItemAction,
    SortLineItemsAction,
} from "./actions.js";



export const addLineItem = (input: AddLineItemInput) =>
  createAction<AddLineItemAction>(
    "ADD_LINE_ITEM",
    { ...input },
    undefined,
    AddLineItemInputSchema,
    "global",
  );

export const updateLineItem = (input: UpdateLineItemInput) =>
  createAction<UpdateLineItemAction>(
    "UPDATE_LINE_ITEM",
    { ...input },
    undefined,
    UpdateLineItemInputSchema,
    "global",
  );

export const deleteLineItem = (input: DeleteLineItemInput) =>
  createAction<DeleteLineItemAction>(
    "DELETE_LINE_ITEM",
    { ...input },
    undefined,
    DeleteLineItemInputSchema,
    "global",
  );

export const sortLineItems = (input: SortLineItemsInput) =>
  createAction<SortLineItemsAction>(
    "SORT_LINE_ITEMS",
    { ...input },
    undefined,
    SortLineItemsInputSchema,
    "global",
  );

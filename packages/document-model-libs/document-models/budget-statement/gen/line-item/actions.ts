import { Action } from "document-model/document";
import {
  AddLineItemInput,
  UpdateLineItemInput,
  DeleteLineItemInput,
  SortLineItemsInput,
} from "../types";

export type AddLineItemAction = Action<
  "ADD_LINE_ITEM",
  AddLineItemInput,
  "global"
>;
export type UpdateLineItemAction = Action<
  "UPDATE_LINE_ITEM",
  UpdateLineItemInput,
  "global"
>;
export type DeleteLineItemAction = Action<
  "DELETE_LINE_ITEM",
  DeleteLineItemInput,
  "global"
>;
export type SortLineItemsAction = Action<
  "SORT_LINE_ITEMS",
  SortLineItemsInput,
  "global"
>;

export type BudgetStatementLineItemAction =
  | AddLineItemAction
  | UpdateLineItemAction
  | DeleteLineItemAction
  | SortLineItemsAction;

import {
    AddLineItemInput,
    UpdateLineItemInput,
    DeleteLineItemInput,
    SortLineItemsInput,
} from "../types.js";

export type AddLineItemAction = BaseAction<
  "ADD_LINE_ITEM",
  AddLineItemInput,
  "global"
>;
export type UpdateLineItemAction = BaseAction<
  "UPDATE_LINE_ITEM",
  UpdateLineItemInput,
  "global"
>;
export type DeleteLineItemAction = BaseAction<
  "DELETE_LINE_ITEM",
  DeleteLineItemInput,
  "global"
>;
export type SortLineItemsAction = BaseAction<
  "SORT_LINE_ITEMS",
  SortLineItemsInput,
  "global"
>;

export type BudgetStatementLineItemAction =
  | AddLineItemAction
  | UpdateLineItemAction
  | DeleteLineItemAction
  | SortLineItemsAction;

import type {
    AddLineItemAction,
    DeleteLineItemAction,
    SortLineItemsAction,
    UpdateLineItemAction,
} from '@acaldas/document-model-graphql/budget-statement';

export const ADD_LINE_ITEM = 'ADD_LINE_ITEM';
export const UPDATE_LINE_ITEM = 'UPDATE_LINE_ITEM';
export const DELETE_LINE_ITEM = 'DELETE_LINE_ITEM';
export const SORT_LINE_ITEMS = 'SORT_LINE_ITEMS';

export {
    AddLineItemAction,
    DeleteLineItemAction,
    UpdateLineItemAction,
    SortLineItemsAction,
};

export type BudgetStatementLineItemAction =
    | AddLineItemAction
    | UpdateLineItemAction
    | DeleteLineItemAction
    | SortLineItemsAction;

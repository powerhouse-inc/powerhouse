import {
    AddLineItemAction,
    DeleteLineItemAction,
    UpdateLineItemAction,
} from 'document-model-graphql/budget-statement';

export const ADD_LINE_ITEM = 'ADD_LINE_ITEM';
export const UPDATE_LINE_ITEM = 'UPDATE_LINE_ITEM';
export const DELETE_LINE_ITEM = 'DELETE_LINE_ITEM';

export { AddLineItemAction, DeleteLineItemAction, UpdateLineItemAction };

export type BudgetStatementLineItemAction =
    | AddLineItemAction
    | UpdateLineItemAction
    | DeleteLineItemAction;

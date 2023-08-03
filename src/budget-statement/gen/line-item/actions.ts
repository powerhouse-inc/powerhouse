import { Action } from '../../../document';

import {
    AddLineItemInput,
    UpdateLineItemInput,
    DeleteLineItemInput,
    SortLineItemsInput,
} from '@acaldas/document-model-graphql/budget-statement';

export type AddLineItemAction = Action<'ADD_LINE_ITEM', AddLineItemInput>;
export type UpdateLineItemAction = Action<'UPDATE_LINE_ITEM', UpdateLineItemInput>;
export type DeleteLineItemAction = Action<'DELETE_LINE_ITEM', DeleteLineItemInput>;
export type SortLineItemsAction = Action<'SORT_LINE_ITEMS', SortLineItemsInput>;

export type BudgetStatementLineItemAction = 
    | AddLineItemAction
    | UpdateLineItemAction
    | DeleteLineItemAction
    | SortLineItemsAction
;
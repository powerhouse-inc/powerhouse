import { Action } from '../../../document';
import { Account, LineItem, LineItemInput } from '../../custom';

export const ADD_LINE_ITEM = 'ADD_LINE_ITEM';
export const UPDATE_LINE_ITEM = 'UPDATE_LINE_ITEM';
export const DELETE_LINE_ITEM = 'DELETE_LINE_ITEM';

export interface AddLineItemAction extends Action {
    type: typeof ADD_LINE_ITEM;
    input: {
        account: Account['address'];
        lineItems: (Partial<LineItem> & Pick<LineItem, 'category' | 'group'>)[];
    };
}

export interface UpdateLineItemAction extends Action {
    type: typeof UPDATE_LINE_ITEM;
    input: { account: Account['address']; lineItems: LineItemInput[] };
}

export interface DeleteLineItemAction extends Action {
    type: typeof DELETE_LINE_ITEM;
    input: {
        account: Account['address'];
        lineItems: { category: string; group: string }[];
    };
}

export type BudgetStatementLineItemAction =
    | AddLineItemAction
    | UpdateLineItemAction
    | DeleteLineItemAction;

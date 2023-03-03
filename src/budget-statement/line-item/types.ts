import { Action } from '../../document';
import { LineItemInput, LineItem } from '../types';

export const ADD_LINE_ITEM = 'ADD_LINE_ITEM';
export const UPDATE_LINE_ITEM = 'UPDATE_LINE_ITEM';
export const DELETE_LINE_ITEM = 'DELETE_LINE_ITEM';

export interface AddLineItemAction extends Action {
    type: typeof ADD_LINE_ITEM;
    input: { lineItems: LineItemInput[] };
}

export interface UpdateLineItemAction extends Action {
    type: typeof UPDATE_LINE_ITEM;
    input: { lineItems: LineItemInput[] };
}

export interface DeleteLineItemAction extends Action {
    type: typeof DELETE_LINE_ITEM;
    input: { lineItems: Pick<LineItem, 'category' | 'group'>[] };
}

export type BudgetStatementLineItemAction =
    | AddLineItemAction
    | UpdateLineItemAction
    | DeleteLineItemAction;

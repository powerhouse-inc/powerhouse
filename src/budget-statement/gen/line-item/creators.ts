import { createAction } from '../../../document';
import { LineItemInput, LineItem, Account, createLineItem } from '../../custom';

import {
    ADD_LINE_ITEM,
    AddLineItemAction,
    DELETE_LINE_ITEM,
    DeleteLineItemAction,
    UPDATE_LINE_ITEM,
    UpdateLineItemAction,
} from './types';

export const addLineItem = (
    account: Account['address'],
    lineItems: Partial<LineItem> & Pick<LineItem, 'category' | 'group'>[]
) =>
    createAction<AddLineItemAction>(ADD_LINE_ITEM, {
        account,
        lineItems: lineItems.map(createLineItem),
    });

export const updateLineItem = (
    account: Account['address'],
    lineItems: LineItemInput[]
) =>
    createAction<UpdateLineItemAction>(UPDATE_LINE_ITEM, {
        account,
        lineItems,
    });

export const deleteLineItem = (
    account: Account['address'],
    lineItems: { category: string; group: string }[]
) =>
    createAction<DeleteLineItemAction>(DELETE_LINE_ITEM, {
        account,
        lineItems,
    });

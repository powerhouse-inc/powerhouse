import { createAction } from '../../../document/utils';
import { Account, LineItem, LineItemInput } from '../../custom';
import { createLineItem } from '../../custom/utils';

import {
    AddLineItemAction,
    ADD_LINE_ITEM,
    DeleteLineItemAction,
    DELETE_LINE_ITEM,
    UpdateLineItemAction,
    UPDATE_LINE_ITEM,
} from './types';

/**
 * Creates an action to add one or more line items to an account.
 *
 * @param account - The account to add line items to.
 * @param lineItems - An array of line items to add to the account.
 * @group Line Item
 */
export const addLineItem = (
    account: Account['address'],
    lineItems: (Partial<LineItem> & Pick<LineItem, 'category' | 'group'>)[]
) =>
    createAction<AddLineItemAction>(ADD_LINE_ITEM, {
        account,
        lineItems: lineItems.map(createLineItem),
    });

/**
 * Creates an action to update one or more line items in an account.
 *
 * @param account - The account containing the line items to update.
 * @param lineItems - An array of line items to update in the account.
 * @group Line Item
 */
export const updateLineItem = (
    account: Account['address'],
    lineItems: LineItemInput[]
) =>
    createAction<UpdateLineItemAction>(UPDATE_LINE_ITEM, {
        account,
        lineItems,
    });

/**
 * Creates an action to delete one or more line items from an account.
 *
 * @param account - The account containing the line items to delete.
 * @param lineItems - An array of line items to delete from the account.
 * @group Line Item
 */
export const deleteLineItem = (
    account: Account['address'],
    lineItems: { category: string; group: string }[]
) =>
    createAction<DeleteLineItemAction>(DELETE_LINE_ITEM, {
        account,
        lineItems,
    });

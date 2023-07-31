import {
    LineItemDeleteInput,
    LineItemsSortInput,
    LineItemUpdateInput,
    z,
} from '@acaldas/document-model-graphql/budget-statement';
import { createAction } from '../../../document/utils';
import { Account, LineItem } from '../../custom';
import { createLineItem } from '../../custom/utils';

import {
    AddLineItemAction,
    ADD_LINE_ITEM,
    DeleteLineItemAction,
    DELETE_LINE_ITEM,
    SortLineItemsAction,
    SORT_LINE_ITEMS,
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
    createAction<AddLineItemAction>(
        ADD_LINE_ITEM,
        {
            account,
            lineItems: lineItems.map(createLineItem),
        },
        undefined,
        z.AddLineItemActionSchema
    );

/**
 * Creates an action to update one or more line items in an account.
 *
 * @param account - The account containing the line items to update.
 * @param lineItems - An array of line items to update in the account.
 * @group Line Item
 */
export const updateLineItem = (
    account: Account['address'],
    lineItems: LineItemUpdateInput[]
) =>
    createAction<UpdateLineItemAction>(
        UPDATE_LINE_ITEM,
        {
            account,
            lineItems,
        },
        undefined,
        z.UpdateLineItemActionSchema
    );

/**
 * Creates an action to delete one or more line items from an account.
 *
 * @param account - The account containing the line items to delete.
 * @param lineItems - An array of line items to delete from the account.
 * @group Line Item
 */
export const deleteLineItem = (
    account: Account['address'],
    lineItems: LineItemDeleteInput[]
) =>
    createAction<DeleteLineItemAction>(
        DELETE_LINE_ITEM,
        {
            account,
            lineItems,
        },
        undefined,
        z.DeleteLineItemActionSchema
    );

/**
 * Creates an action to sort the line items of an account.
 *
 * @param account - The account containing the line items to sort.
 * @param lineItems - An array of line items to sort.
 * @group Line Item
 */
export const sortLineItems = (
    account: Account['address'],
    lineItems: LineItemsSortInput[]
) =>
    createAction<SortLineItemsAction>(
        SORT_LINE_ITEMS,
        {
            account,
            lineItems,
        },
        undefined,
        z.SortLineItemsActionSchema
    );

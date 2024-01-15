/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import {
    DeleteLineItemInput,
    LineItem,
    LineItemsSortInput,
    UpdateLineItemInput,
} from '../../gen';
import { BudgetStatementLineItemOperations } from '../../gen/line-item/operations';
import { createLineItem } from '../utils';

function isEqual(
    lineItemInput:
        | UpdateLineItemInput
        | DeleteLineItemInput
        | LineItemsSortInput,
    lineItem: LineItem
) {
    return (
        lineItemInput.category === lineItem.category &&
        lineItemInput.group === lineItem.group
    );
}

export const reducer: BudgetStatementLineItemOperations = {
    addLineItemOperation(state, action) {
        const { accountId, ...input } = action.input;

        const account = state.accounts.find(a => a.address === accountId);
        if (!account) {
            throw new Error(`Account with address ${accountId} not found`);
        }

        if (
            account.lineItems.find(
                item =>
                    input.category?.id === item.category?.id &&
                    input.group?.id === item.group?.id
            )
        ) {
            throw new Error(
                `Line item with category '${
                    input.category?.id ?? 'null'
                }' and group '${input.group?.id ?? 'null'}' already exists`
            );
        }

        account.lineItems.push(createLineItem(input));
    },
    updateLineItemOperation(state, action) {
        const { accountId, ...lineItemInput } = action.input;
        const account = state.accounts.find(a => a.address === accountId);
        if (!account) {
            throw new Error(`Account with address ${accountId} not found`);
        }

        const index = account.lineItems.findIndex(lineItem =>
            isEqual(lineItemInput, lineItem)
        );
        if (index === -1) {
            throw new Error('Line item not found');
        }
        const lineItem = account.lineItems[index];
        account.lineItems[index] = {
            ...lineItem,
            ...lineItemInput,
            category: lineItem.category,
            headcountExpense: lineItemInput.headcountExpense ?? false,
            group: lineItem.group,
            forecast: (lineItemInput.forecast ?? lineItem.forecast)
                // sort forecasts by month
                .sort((f1, f2) => f1.month.localeCompare(f2.month)),
        };
    },
    deleteLineItemOperation(state, action) {
        const { accountId, ...lineItemDelete } = action.input;
        const account = state.accounts.find(a => a.address === accountId);
        if (!account) {
            throw new Error(`Account with address ${accountId} not found`);
        }

        account.lineItems = account.lineItems.filter(
            lineItem => !isEqual(lineItemDelete, lineItem)
        );
    },
    sortLineItemsOperation(state, action) {
        const { accountId, lineItems } = action.input;
        const account = state.accounts.find(a => a.address === accountId);
        if (!account) {
            throw new Error(`Account with address ${accountId} not found`);
        }
        account.lineItems.sort((a, b) => {
            const index1 = lineItems.findIndex(l => isEqual(l, a));
            const index2 = lineItems.findIndex(l => isEqual(l, b));
            return (
                (index1 > -1 ? index1 : Infinity) -
                (index2 > -1 ? index2 : Infinity)
            );
        });
    },
};

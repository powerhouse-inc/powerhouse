import {
    LineItemDeleteInput,
    LineItemsSortInput,
    LineItemUpdateInput,
    SortLineItemsAction,
} from '@acaldas/document-model-graphql/budget-statement';
import {
    AddLineItemAction,
    DeleteLineItemAction,
    UpdateLineItemAction,
} from '../../gen/line-item/types';
import { BudgetStatementState, LineItem } from '../types';
import { createLineItem } from '../utils';

function isEqual(
    lineItemInput:
        | LineItemUpdateInput
        | LineItemDeleteInput
        | LineItemsSortInput,
    lineItem: LineItem
) {
    return (
        lineItemInput.category === lineItem.category?.id &&
        lineItemInput.group === lineItem.group?.id
    );
}

export const addLineItemOperation = (
    state: BudgetStatementState,
    action: AddLineItemAction
) => {
    const account = state.accounts.find(
        a => a.address === action.input.account
    );
    if (!account) {
        throw new Error(
            `Account with address ${action.input.account} not found`
        );
    }

    action.input.lineItems.forEach(input => {
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
    });
};

export const updateLineItemOperation = (
    state: BudgetStatementState,
    action: UpdateLineItemAction
) => {
    const account = state.accounts.find(
        a => a.address === action.input.account
    );
    if (!account) {
        throw new Error(
            `Account with address ${action.input.account} not found`
        );
    }

    account.lineItems = account.lineItems.map(lineItem => {
        const input = action.input.lineItems.find(l => isEqual(l, lineItem));
        if (!input) {
            return lineItem;
        } else {
            return {
                ...lineItem,
                ...input,
                category: lineItem.category,
                headcountExpense: input.headcountExpense ?? false,
                group: lineItem.group,
                forecast: (input.forecast ?? lineItem.forecast)
                    // sort forecasts by month
                    .sort((f1, f2) => f1.month.localeCompare(f2.month)),
            };
        }
    });
};

export const deleteLineItemOperation = (
    state: BudgetStatementState,
    action: DeleteLineItemAction
) => {
    const account = state.accounts.find(
        a => a.address === action.input.account
    );
    if (!account) {
        throw new Error(
            `Account with address ${action.input.account} not found`
        );
    }

    account.lineItems = account.lineItems.filter(
        lineItem => !action.input.lineItems.find(l => isEqual(l, lineItem))
    );
};

export const sortLineItemsOperation = (
    state: BudgetStatementState,
    action: SortLineItemsAction
) => {
    const account = state.accounts.find(
        a => a.address === action.input.account
    );
    if (!account) {
        throw new Error(
            `Account with address ${action.input.account} not found`
        );
    }
    account.lineItems.sort((a, b) => {
        const index1 = action.input.lineItems.findIndex(l => isEqual(l, a));
        const index2 = action.input.lineItems.findIndex(l => isEqual(l, b));
        return (
            (index1 > -1 ? index1 : Infinity) -
            (index2 > -1 ? index2 : Infinity)
        );
    });
};

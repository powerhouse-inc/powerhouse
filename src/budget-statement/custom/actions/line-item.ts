import {
    AddLineItemAction,
    DeleteLineItemAction,
    UpdateLineItemAction,
} from '../../gen/line-item/types';
import { BudgetStatementDocument, LineItem, LineItemInput } from '../types';
import { createLineItem } from '../utils';

function isEqual(lineItemInput: LineItemInput, lineItem: LineItem) {
    return (
        lineItemInput.category === lineItem.category.id &&
        lineItemInput.group === lineItem.group.id
    );
}

export const addLineItemOperation = (
    state: BudgetStatementDocument,
    action: AddLineItemAction
): BudgetStatementDocument => {
    const newAccounts = state.data.accounts.slice();
    const accountIndex = newAccounts.findIndex(
        a => a.address === action.input.account
    );
    if (accountIndex === -1) {
        throw new Error(
            `Account with address ${action.input.account} not found`
        );
    }

    const newAccount = Object.assign({}, newAccounts[accountIndex]);
    newAccount.lineItems = [
        ...newAccount.lineItems,
        ...action.input.lineItems.map(createLineItem),
    ];
    newAccounts[accountIndex] = newAccount;

    return {
        ...state,
        data: {
            ...state.data,
            accounts: newAccounts,
        },
    };
};

export const updateLineItemOperation = (
    state: BudgetStatementDocument,
    action: UpdateLineItemAction
): BudgetStatementDocument => {
    const newAccounts = state.data.accounts.slice();
    const accountIndex = newAccounts.findIndex(
        a => a.address === action.input.account
    );
    if (accountIndex === -1) {
        throw new Error(
            `Account with address ${action.input.account} not found`
        );
    }

    const newAccount = Object.assign({}, newAccounts[accountIndex]);
    newAccount.lineItems = newAccount.lineItems.map(lineItem => {
        const input = action.input.lineItems.find(l => isEqual(l, lineItem));
        if (!input) {
            return lineItem;
        } else {
            return {
                ...lineItem,
                ...input,
                category: lineItem.category,
                group: lineItem.group,
                forecast: [
                    // replace old forecasts with new forecasts
                    ...(input.forecast ?? []),
                    ...lineItem.forecast.filter(
                        oldForecast =>
                            !input.forecast?.find(
                                newForecast =>
                                    newForecast.month === oldForecast.month
                            )
                    ),
                ]
                    // remove forecasts with null value
                    .filter(forecast => forecast.value !== null)
                    // sort forecasts by month
                    .sort((f1, f2) => f1.month.localeCompare(f2.month)),
            };
        }
    });
    newAccounts[accountIndex] = newAccount;

    return {
        ...state,
        data: {
            ...state.data,
            accounts: newAccounts,
        },
    };
};

export const deleteLineItemOperation = (
    state: BudgetStatementDocument,
    action: DeleteLineItemAction
): BudgetStatementDocument => {
    const newAccounts = state.data.accounts.slice();
    const accountIndex = newAccounts.findIndex(
        a => a.address === action.input.account
    );
    if (accountIndex === -1) {
        throw new Error(
            `Account with address ${action.input.account} not found`
        );
    }

    const newAccount = Object.assign({}, newAccounts[accountIndex]);
    newAccount.lineItems = newAccount.lineItems.filter(
        lineItem => !action.input.lineItems.find(l => isEqual(l, lineItem))
    );
    newAccounts[accountIndex] = newAccount;

    return {
        ...state,
        data: {
            ...state.data,
            accounts: newAccounts,
        },
    };
};

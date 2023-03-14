import {
    AddLineItemAction,
    DeleteLineItemAction,
    UpdateLineItemAction,
} from '../../gen';
import { BudgetStatement, LineItem, LineItemInput } from '../types';
import { createLineItem } from '../utils';

function isEqual(lineItemInput: LineItemInput, lineItem: LineItem) {
    return (
        lineItemInput.category === lineItem.category.id &&
        lineItemInput.group === lineItem.group.id
    );
}

export const addLineItemOperation = (
    state: BudgetStatement,
    action: AddLineItemAction
): BudgetStatement => {
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
    state: BudgetStatement,
    action: UpdateLineItemAction
): BudgetStatement => {
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
    state: BudgetStatement,
    action: DeleteLineItemAction
): BudgetStatement => {
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

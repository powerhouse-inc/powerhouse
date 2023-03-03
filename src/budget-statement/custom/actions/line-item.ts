import {
    AddLineItemAction,
    UpdateLineItemAction,
    DeleteLineItemAction,
} from '../../gen';
import { LineItemInput, BudgetStatement } from '../types';
import { createLineItem } from '../utils';

function isEqual(lineItemA: LineItemInput, lineItemB: LineItemInput) {
    return (
        lineItemA.category.id === lineItemB.category.id &&
        lineItemA.group.id === lineItemB.group.id
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
    newAccount.lineItems = newAccount.lineItems.map(lineItem => ({
        ...lineItem,
        ...action.input.lineItems.find(l => isEqual(l, lineItem)),
    }));
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

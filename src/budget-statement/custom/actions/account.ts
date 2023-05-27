import {
    AddAccountAction,
    DeleteAccountAction,
    SortAccountsAction,
    UpdateAccountAction,
} from '../../gen/account/types';
import { BudgetStatementDocument } from '../types';
import { createAccount } from '../utils';

export const addAccountOperation = (
    state: BudgetStatementDocument,
    action: AddAccountAction
) => {
    action.input.accounts.forEach(input => {
        if (
            state.data.accounts.find(
                account => account.address === input.address
            )
        ) {
            throw new Error(
                `Account with address ${input.address} already exists!`
            );
        }
        state.data.accounts.push(createAccount(input));
    });
};

export const updateAccountOperation = (
    state: BudgetStatementDocument,
    action: UpdateAccountAction
) => {
    state.data.accounts = state.data.accounts.map(account => {
        const accountUpdate = action.input.accounts.find(
            a => a.address === account.address
        );
        return {
            ...account,
            lineItems: accountUpdate?.lineItems ?? account.lineItems,
            name: accountUpdate?.name ?? account.name,
        };
    });
};

export const deleteAccountOperation = (
    state: BudgetStatementDocument,
    action: DeleteAccountAction
) => {
    state.data.accounts = state.data.accounts.filter(
        account =>
            !action.input.accounts.find(address => address === account.address)
    );
};

export const sortAccountsOperation = (
    state: BudgetStatementDocument,
    action: SortAccountsAction
) => {
    state.data.accounts.sort((a, b) => {
        const index1 = action.input.accounts.indexOf(a.address);
        const index2 = action.input.accounts.indexOf(b.address);
        return (
            (index1 > -1 ? index1 : Infinity) -
            (index2 > -1 ? index2 : Infinity)
        );
    });
};

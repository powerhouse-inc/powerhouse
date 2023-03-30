import { RequestTopupAction, TransferTopupAction } from '../../gen/topup/types';
import { BudgetStatementDocument } from '../types';

export const requestTopupOperation = (
    state: BudgetStatementDocument,
    action: RequestTopupAction
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
    newAccount.topupTransaction = {
        id: null,
        requestedValue: action.input.value,
        value: null,
    };
    newAccounts[accountIndex] = newAccount;

    return {
        ...state,
        data: {
            ...state.data,
            accounts: newAccounts,
        },
    };
};

export const transferTopupOperation = (
    state: BudgetStatementDocument,
    action: TransferTopupAction
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
    newAccount.topupTransaction = {
        ...newAccount.topupTransaction,
        id: action.input.transaction,
        value: action.input.value,
    };
    newAccounts[accountIndex] = newAccount;

    return {
        ...state,
        data: {
            ...state.data,
            accounts: newAccounts,
        },
    };
};

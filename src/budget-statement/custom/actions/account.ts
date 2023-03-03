import {
    AddAccountAction,
    DeleteAccountAction,
    UpdateAccountAction,
} from '../..';
import { BudgetStatement } from '../types';
import { createAccount } from '../utils';

export const addAccountOperation = (
    state: BudgetStatement,
    action: AddAccountAction
): BudgetStatement => {
    return {
        ...state,
        data: {
            ...state.data,
            accounts: [
                ...(state.data.accounts ?? []),
                ...action.input.accounts.map(createAccount),
            ],
        },
    };
};

export const updateAccountOperation = (
    state: BudgetStatement,
    action: UpdateAccountAction
): BudgetStatement => {
    return {
        ...state,
        data: {
            ...state.data,
            accounts: state.data.accounts.map(account => ({
                ...account,
                ...action.input.accounts.find(
                    a => a.address === account.address
                ),
            })),
        },
    };
};

export const deleteAccountOperation = (
    state: BudgetStatement,
    action: DeleteAccountAction
): BudgetStatement => {
    return {
        ...state,
        data: {
            ...state.data,
            accounts: state.data.accounts.filter(
                account =>
                    !action.input.accounts.find(
                        address => address === account.address
                    )
            ),
        },
    };
};

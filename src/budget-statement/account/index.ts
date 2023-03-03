import { createAction } from '../../document';
import { AccountInput, Account, BudgetStatement } from '../types';
import { createAccount } from '../utils';
import {
    ADD_ACCOUNT,
    AddAccountAction,
    DELETE_ACCOUNT,
    DeleteAccountAction,
    UPDATE_ACCOUNT,
    UpdateAccountAction,
} from './types';

/*
 *   Account action creators
 */
export const addAccount = (accounts: AccountInput[]) =>
    createAction<AddAccountAction>(ADD_ACCOUNT, {
        accounts: accounts.map(createAccount),
    });

export const updateAccount = (accounts: AccountInput[]) =>
    createAction<UpdateAccountAction>(UPDATE_ACCOUNT, { accounts });

export const deleteAccount = (accounts: Account['address'][]) =>
    createAction<DeleteAccountAction>(DELETE_ACCOUNT, { accounts });

/*
 *   Account operations
 */
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

export * from './types';

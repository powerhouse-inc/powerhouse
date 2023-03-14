import { Action } from '../../../document';
import { Account, AccountInput } from '../../custom';

export const ADD_ACCOUNT = 'ADD_ACCOUNT';
export const UPDATE_ACCOUNT = 'UPDATE_ACCOUNT';
export const DELETE_ACCOUNT = 'DELETE_ACCOUNT';

export interface AddAccountAction extends Action {
    type: typeof ADD_ACCOUNT;
    input: { accounts: AccountInput[] };
}

export interface UpdateAccountAction extends Action {
    type: typeof UPDATE_ACCOUNT;
    input: { accounts: AccountInput[] };
}

export interface DeleteAccountAction extends Action {
    type: typeof DELETE_ACCOUNT;
    input: { accounts: Account['address'][] };
}

export type BudgetStatementAccountAction =
    | AddAccountAction
    | UpdateAccountAction
    | DeleteAccountAction;

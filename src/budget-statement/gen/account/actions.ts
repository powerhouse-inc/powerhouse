import { Action } from '../../../document';
import {
    AddAccountInput,
    UpdateAccountInput,
    DeleteAccountInput,
    SortAccountsInput,
} from '../types';

export type AddAccountAction = Action<'ADD_ACCOUNT', AddAccountInput>;
export type UpdateAccountAction = Action<'UPDATE_ACCOUNT', UpdateAccountInput>;
export type DeleteAccountAction = Action<'DELETE_ACCOUNT', DeleteAccountInput>;
export type SortAccountsAction = Action<'SORT_ACCOUNTS', SortAccountsInput>;

export type BudgetStatementAccountAction = 
    | AddAccountAction
    | UpdateAccountAction
    | DeleteAccountAction
    | SortAccountsAction
;